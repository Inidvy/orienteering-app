import { legStatus } from "./legStatus";
import { runStatus } from "./runStatus";
import { checkElapsedBound } from "./timeIntegrity";
import type {
  LatLon,
  LegResult,
  Punch,
  RunResult,
  TrackPoint,
  TrustStatus,
  TuningConfig,
} from "./types";

/*
 * verifyRun — the whole authoritative pipeline as a pure function.
 * The edge function is a thin I/O wrapper around this:
 *
 *   raw punches ──resolve──▶ per-flag punches ──┐
 *   course order + flag positions ──────────────┼─▶ legs ─▶ legStatus() each
 *   track ──────────────────────────────────────┘        │
 *   anchors ──▶ checkElapsedBound() ──▶ cap ─────────────┴─▶ runStatus (min)
 *
 * Order enforcement (course model): a punch only closes the leg to the NEXT
 * expected flag — for each course position we take the earliest valid punch
 * on that flag that is later than the previous leg's punch.
 */

export interface TagRecord {
  uid: string;
  flagId: string;
  /** retired tags (replaced/vandalized) still resolve for historical runs */
  retiredAtMs?: number;
}

export interface RawPunch {
  uuid: string;
  tagUid?: string;
  /** manual/QR punches carry the flag's short code instead of a tag UID */
  flagId?: string;
  method: Punch["method"];
  tMonotonicMs: number;
}

export interface ResolvedPunch extends Punch {
  ok: boolean;
  reason?: "unknown_tag";
}

/** Map raw punches to flags via the tag registry. Unknown UIDs reject cleanly. */
export function resolvePunches(
  raw: RawPunch[],
  registry: TagRecord[],
): ResolvedPunch[] {
  const byUid = new Map(registry.map((t) => [t.uid, t]));
  return raw.map((p) => {
    if (p.method === "nfc") {
      const tag = p.tagUid ? byUid.get(p.tagUid) : undefined;
      if (!tag) {
        return {
          uuid: p.uuid,
          flagId: p.flagId ?? "unknown",
          method: p.method,
          tMonotonicMs: p.tMonotonicMs,
          ok: false,
          reason: "unknown_tag",
        };
      }
      return {
        uuid: p.uuid,
        flagId: tag.flagId,
        method: p.method,
        tMonotonicMs: p.tMonotonicMs,
        ok: true,
      };
    }
    // QR/manual punches name the flag directly
    return {
      uuid: p.uuid,
      flagId: p.flagId ?? "unknown",
      method: p.method,
      tMonotonicMs: p.tMonotonicMs,
      ok: p.flagId !== undefined,
    };
  });
}

export interface VerifyRunInput {
  /** ordered flag ids: [start, control1, ..., finish] */
  courseFlagOrder: string[];
  flagPositions: Record<string, LatLon>;
  punches: RawPunch[];
  tagRegistry: TagRecord[];
  track: TrackPoint[];
  clockBasisLost?: boolean;
  anchors: { preRunAnchorWallMs?: number; syncAnchorWallMs: number };
  cfg: TuningConfig;
}

export interface VerifyRunOutput extends RunResult {
  /** run-level reasons (time-bound caps etc.), in addition to leg reasons */
  runReasons: string[];
}

const RANK: Record<TrustStatus, number> = {
  unverified: 0,
  partial: 1,
  verified: 2,
};

function capStatus(s: TrustStatus, cap: TrustStatus): TrustStatus {
  return RANK[s] <= RANK[cap] ? s : cap;
}

export function verifyRun(input: VerifyRunInput): VerifyRunOutput {
  const resolved = resolvePunches(input.punches, input.tagRegistry);
  const runReasons: string[] = [];

  // Assign punches to course positions in order: earliest valid punch on the
  // expected flag that is later than the previous position's punch.
  const assigned: (ResolvedPunch | undefined)[] = [];
  let minT = -Infinity;
  for (const flagId of input.courseFlagOrder) {
    const candidate = resolved
      .filter((p) => p.ok && p.flagId === flagId && p.tMonotonicMs > minT)
      .sort((a, b) => a.tMonotonicMs - b.tMonotonicMs)[0];
    assigned.push(candidate);
    if (candidate) minT = candidate.tMonotonicMs;
  }

  const legs: LegResult[] = [];
  for (let i = 1; i < input.courseFlagOrder.length; i++) {
    const startFlag = input.courseFlagOrder[i - 1]!;
    const endFlag = input.courseFlagOrder[i]!;
    legs.push(
      legStatus(
        {
          startPunch: assigned[i - 1],
          endPunch: assigned[i],
          startFlagPos: input.flagPositions[startFlag]!,
          endFlagPos: input.flagPositions[endFlag]!,
          track: input.track,
          clockBasisLost: input.clockBasisLost,
        },
        input.cfg,
      ),
    );
  }

  let result = runStatus(legs, input.cfg);
  let status = result.status;

  // D19 time-integrity caps apply at run level.
  const elapsed =
    result.totalTimeMs ??
    (assigned[0] && assigned[assigned.length - 1]
      ? assigned[assigned.length - 1]!.tMonotonicMs - assigned[0]!.tMonotonicMs
      : undefined);
  if (elapsed !== undefined) {
    const bound = checkElapsedBound(elapsed, input.anchors);
    if (!bound.ok) {
      runReasons.push(bound.reason);
      status = capStatus(status, bound.capAt);
    }
  }

  return { ...result, status, runReasons };
}
