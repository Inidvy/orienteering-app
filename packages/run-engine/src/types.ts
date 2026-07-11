import type { LatLon, PunchMethod, TrackPoint } from "@orienteering/verification-core";

/*
 * Client-side run session. Everything the recorder does is an append-only
 * EVENT LOG (survives crash/reboot: replay the log to restore the session —
 * device failure matrix rows "app force-quit" and "phone reboot").
 *
 *  ┌───────────┐ punch(start flag) ┌─────────┐ punch(finish flag,
 *  │ pre-start │ ─────────────────▶│ running │ ── last position) ──▶ finished
 *  └───────────┘                   └────┬────┘
 *        clock starts at tag read       │ abandon() (long-press timer)
 *                                       ▼
 *                                   abandoned (private history only)
 */

export interface CourseSpec {
  id: string;
  /** ordered flag ids: [start, controls..., finish] */
  flagOrder: string[];
  flagPositions: Record<string, LatLon>;
  /** human-readable plate numbers for punch feedback copy */
  shortCodes: Record<string, string>;
  /**
   * cached reference splits (decision P7-D13-A): class record when one
   * exists, else overall course record — fetched at run start, offline-safe.
   */
  referenceLegTimesMs?: (number | null)[];
  referenceLabel?: string; // e.g. "M-O40 record pace"
}

export type RunPhase = "pre-start" | "running" | "finished" | "abandoned";

export type RunEvent =
  | {
      kind: "punch";
      uuid: string;
      flagId: string;
      method: PunchMethod;
      tMs: number;
    }
  | { kind: "gps"; lat: number; lon: number; tMs: number }
  | { kind: "gap"; fromTMs: number; toTMs: number }
  | { kind: "clock_basis_lost"; tMs: number }
  | { kind: "abandon"; tMs: number };

export type PunchOutcome =
  | { result: "started" }
  | {
      result: "leg_closed";
      legIndex: number;
      legTimeMs: number;
      /** negative = faster than the reference */
      deltaToReferenceMs?: number;
      referenceLabel?: string;
    }
  | { result: "finished"; legIndex: number; legTimeMs: number; totalTimeMs: number }
  | { result: "wrong_flag"; expectedShortCode: string; punchedShortCode: string }
  | { result: "duplicate" }
  | { result: "ignored_phase" };

export interface SyncPayload {
  run: {
    id: string;
    courseId: string;
    clockBasisLost: boolean;
    dnf: boolean;
  };
  punches: {
    id: string;
    method: PunchMethod;
    tMonotonicMs: number;
    flagId: string;
  }[];
  track: TrackPoint[];
}
