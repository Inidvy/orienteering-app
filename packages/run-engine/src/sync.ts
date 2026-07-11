import type { TrackPoint } from "@orienteering/verification-core";
import type { SyncPayload } from "./types";

/*
 * Sync orchestration (decision 2A): forest-edge connectivity means interrupted
 * uploads are the NORMAL case. Every write is an idempotent upsert keyed on
 * client-generated UUIDs, punches go up in chunks, and progress is checkpointed
 * so a retry resumes instead of restarting.
 *
 *   run row ─▶ punches (chunk 1..n) ─▶ track ─▶ sync-run (server verifies)
 *      │            │                    │            │
 *      └────────────┴── checkpoint ──────┴────────────┘
 *
 * Any step may fail; syncRun() is safe to call again forever. When the
 * checkpoint store is empty (fresh install, cleared storage) the steps simply
 * re-run — upserts make that harmless.
 */

export interface ServerLegVerdict {
  legIndex: number;
  status: "verified" | "partial" | "unverified";
  reasons: string[];
  legTimeMs: number | null;
}

export interface ServerVerdict {
  status: "verified" | "partial" | "unverified";
  runReasons: string[];
  totalTimeMs: number | null;
  legs: ServerLegVerdict[];
  configVersion: number;
}

export interface SyncTransport {
  /** upsert the raw run row (client fields only; anchors the server trusts are server-set) */
  upsertRun(run: SyncPayload["run"], preRunAnchorIso?: string): Promise<void>;
  /** idempotent batch upsert keyed on punch UUIDs */
  upsertPunches(runId: string, punches: SyncPayload["punches"]): Promise<void>;
  upsertTrack(runId: string, track: TrackPoint[]): Promise<void>;
  /** invoke the sync-run edge function; server stamps its own sync anchor */
  invokeVerify(runId: string): Promise<ServerVerdict>;
}

export type SyncStep = "run" | `punches:${number}` | "track" | "verify";

export interface SyncCheckpointStore {
  load(runId: string): Promise<SyncStep[]>;
  save(runId: string, done: SyncStep[]): Promise<void>;
  clear(runId: string): Promise<void>;
}

/** In-memory store — tests and last-resort fallback. */
export function memoryCheckpointStore(): SyncCheckpointStore {
  const m = new Map<string, SyncStep[]>();
  return {
    load: async (id) => m.get(id) ?? [],
    save: async (id, done) => void m.set(id, [...done]),
    clear: async (id) => void m.delete(id),
  };
}

export interface SyncOptions {
  punchChunkSize?: number;
  preRunAnchorIso?: string;
}

export type SyncResult =
  | { ok: true; verdict: ServerVerdict }
  | { ok: false; failedAt: SyncStep; error: unknown };

export async function syncRun(
  payload: SyncPayload,
  transport: SyncTransport,
  checkpoints: SyncCheckpointStore = memoryCheckpointStore(),
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const chunkSize = opts.punchChunkSize ?? 50;
  const runId = payload.run.id;
  const done = new Set<SyncStep>(await checkpoints.load(runId));

  const mark = async (step: SyncStep) => {
    done.add(step);
    await checkpoints.save(runId, [...done]);
  };

  const attempt = async (step: SyncStep, fn: () => Promise<void>) => {
    if (done.has(step)) return;
    await fn();
    await mark(step);
  };

  try {
    await attempt("run", () =>
      transport.upsertRun(payload.run, opts.preRunAnchorIso),
    );

    for (let i = 0; i * chunkSize < payload.punches.length; i++) {
      const step: SyncStep = `punches:${i}`;
      await attempt(step, () =>
        transport.upsertPunches(
          runId,
          payload.punches.slice(i * chunkSize, (i + 1) * chunkSize),
        ),
      );
    }

    if (payload.track.length > 0) {
      await attempt("track", () => transport.upsertTrack(runId, payload.track));
    }

    // verify is never checkpointed as done-forever: re-verifying is harmless
    // and a re-sync should always return the CURRENT server verdict.
    const verdict = await transport.invokeVerify(runId);
    await checkpoints.clear(runId);
    return { ok: true, verdict };
  } catch (error) {
    const failedAt =
      ([...allSteps(payload, chunkSize)].find((s) => !done.has(s)) as SyncStep) ??
      "verify";
    return { ok: false, failedAt, error };
  }
}

function* allSteps(payload: SyncPayload, chunkSize: number): Generator<SyncStep> {
  yield "run";
  for (let i = 0; i * chunkSize < payload.punches.length; i++) {
    yield `punches:${i}`;
  }
  if (payload.track.length > 0) yield "track";
  yield "verify";
}
