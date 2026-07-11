import {
  DEFAULT_TUNING,
  legStatus,
  type LegResult,
  type PunchMethod,
  type TrackPoint,
  type TuningConfig,
} from "@orienteering/verification-core";
import type {
  CourseSpec,
  PunchOutcome,
  RunEvent,
  RunPhase,
  SyncPayload,
} from "./types";

export interface SessionDeps {
  /** client-generated UUIDs — stable in the log so sync stays idempotent (2A) */
  uuid: () => string;
}

export class RunSession {
  readonly runId: string;
  private log: RunEvent[] = [];
  private phase_: RunPhase = "pre-start";
  /** next course position expected to be punched */
  private expected = 0;
  /** punch event per closed course position */
  private assigned: Extract<RunEvent, { kind: "punch" }>[] = [];
  private track_: TrackPoint[] = [];
  private clockBasisLost_ = false;

  constructor(
    readonly course: CourseSpec,
    private deps: SessionDeps,
    runId?: string,
  ) {
    this.runId = runId ?? deps.uuid();
  }

  get phase(): RunPhase {
    return this.phase_;
  }

  get events(): readonly RunEvent[] {
    return this.log;
  }

  get startTimeMs(): number | undefined {
    return this.assigned[0]?.tMs;
  }

  elapsedMs(nowMs: number): number | undefined {
    const start = this.startTimeMs;
    if (start === undefined || this.phase_ === "pre-start") return undefined;
    const last = this.assigned[this.assigned.length - 1]!;
    if (this.phase_ === "finished") return last.tMs - start;
    return nowMs - start;
  }

  /** Expected flag's plate number, for the punch button label ("PUNCH — flag #4"). */
  get expectedShortCode(): string | undefined {
    const flagId = this.course.flagOrder[this.expected];
    return flagId ? this.course.shortCodes[flagId] : undefined;
  }

  gps(lat: number, lon: number, tMs: number): void {
    if (this.phase_ === "finished" || this.phase_ === "abandoned") return;
    this.append({ kind: "gps", lat, lon, tMs });
  }

  markClockBasisLost(tMs: number): void {
    this.append({ kind: "clock_basis_lost", tMs });
  }

  abandon(tMs: number): void {
    if (this.phase_ === "finished" || this.phase_ === "abandoned") return;
    this.append({ kind: "abandon", tMs });
  }

  /**
   * A tag read / QR scan / manual entry, already resolved to a flagId by the
   * caller (registry cache). The leg clock stops HERE — at tag read, never at
   * UI confirmation (decision P2-5A).
   */
  punch(flagId: string, method: PunchMethod, tMs: number): PunchOutcome {
    if (this.phase_ === "finished" || this.phase_ === "abandoned") {
      return { result: "ignored_phase" };
    }

    const expectedFlag = this.course.flagOrder[this.expected];

    // duplicate tap on the last-punched flag: earliest punch counts
    const last = this.assigned[this.assigned.length - 1];
    if (last && last.flagId === flagId) {
      this.append({ kind: "punch", uuid: this.deps.uuid(), flagId, method, tMs });
      return { result: "duplicate" };
    }

    if (flagId !== expectedFlag) {
      // recorded + flagged, run continues (UI: "That's flag 7 — next is #4")
      this.append({ kind: "punch", uuid: this.deps.uuid(), flagId, method, tMs });
      return {
        result: "wrong_flag",
        expectedShortCode: this.course.shortCodes[expectedFlag ?? ""] ?? "?",
        punchedShortCode: this.course.shortCodes[flagId] ?? "?",
      };
    }

    // capture pre-punch state — apply() advances it
    const wasPreStart = this.phase_ === "pre-start";
    const positionClosed = this.expected;

    const ev: Extract<RunEvent, { kind: "punch" }> = {
      kind: "punch",
      uuid: this.deps.uuid(),
      flagId,
      method,
      tMs,
    };
    this.append(ev);

    if (wasPreStart) {
      return { result: "started" };
    }

    const legIndex = positionClosed - 1; // leg from position-1 to position
    const legTimeMs = tMs - this.assigned[positionClosed - 1]!.tMs;

    // append() may have advanced phase_ to "finished"; assert past TS's
    // control-flow narrowing (it can't see the mutation inside append)
    if ((this.phase_ as RunPhase) === "finished") {
      // finish flag: run ends instantly, no confirmation (P7-D13)
      const totalTimeMs = tMs - this.startTimeMs!;
      return { result: "finished", legIndex, legTimeMs, totalTimeMs };
    }

    const ref = this.course.referenceLegTimesMs?.[legIndex];
    return {
      result: "leg_closed",
      legIndex,
      legTimeMs,
      deltaToReferenceMs: ref != null ? legTimeMs - ref : undefined,
      referenceLabel: ref != null ? this.course.referenceLabel : undefined,
    };
  }

  /**
   * PROVISIONAL statuses (same rules as the server via verification-core,
   * decision 3A) — shown pre-sync as "provisionally verified", never as a
   * bare verified badge (decision P2-6B).
   */
  provisionalLegs(cfg: TuningConfig = DEFAULT_TUNING): LegResult[] {
    const legs: LegResult[] = [];
    for (let i = 1; i < this.course.flagOrder.length; i++) {
      const startFlag = this.course.flagOrder[i - 1]!;
      const endFlag = this.course.flagOrder[i]!;
      legs.push(
        legStatus(
          {
            startPunch: this.punchForPosition(i - 1),
            endPunch: this.punchForPosition(i),
            startFlagPos: this.course.flagPositions[startFlag]!,
            endFlagPos: this.course.flagPositions[endFlag]!,
            track: this.track_,
            clockBasisLost: this.clockBasisLost_,
          },
          cfg,
        ),
      );
    }
    return legs;
  }

  buildSyncPayload(): SyncPayload {
    return {
      run: {
        id: this.runId,
        courseId: this.course.id,
        clockBasisLost: this.clockBasisLost_,
        dnf: this.phase_ === "abandoned",
      },
      punches: this.log
        .filter((e): e is Extract<RunEvent, { kind: "punch" }> => e.kind === "punch")
        .map((p) => ({
          id: p.uuid,
          method: p.method,
          tMonotonicMs: p.tMs,
          flagId: p.flagId,
        })),
      track: this.track_,
    };
  }

  /** Crash/reboot recovery: replay the persisted log ("Resume run?" flow). */
  static restore(
    course: CourseSpec,
    runId: string,
    log: RunEvent[],
    deps: SessionDeps,
  ): RunSession {
    const s = new RunSession(course, deps, runId);
    for (const ev of log) s.apply(ev, true);
    return s;
  }

  // -- internals ------------------------------------------------------------

  private punchForPosition(pos: number) {
    const p = this.assigned[pos];
    if (!p) return undefined;
    return { uuid: p.uuid, flagId: p.flagId, method: p.method, tMonotonicMs: p.tMs };
  }

  private append(ev: RunEvent): void {
    this.apply(ev, false);
  }

  private apply(ev: RunEvent, replay: boolean): void {
    this.log.push(ev);
    switch (ev.kind) {
      case "gps":
        this.track_.push({ lat: ev.lat, lon: ev.lon, tMonotonicMs: ev.tMs });
        break;
      case "clock_basis_lost":
        this.clockBasisLost_ = true;
        break;
      case "abandon":
        this.phase_ = "abandoned";
        break;
      case "punch": {
        const expectedFlag = this.course.flagOrder[this.expected];
        const last = this.assigned[this.assigned.length - 1];
        const isDuplicate = last?.flagId === ev.flagId;
        if (ev.flagId === expectedFlag && !isDuplicate) {
          this.assigned.push(ev);
          if (this.phase_ === "pre-start") this.phase_ = "running";
          this.expected++;
          if (this.expected === this.course.flagOrder.length) {
            this.phase_ = "finished";
          }
        }
        // wrong-flag & duplicate punches stay in the log only
        break;
      }
      case "gap":
        break;
    }
    void replay;
  }
}
