/*
 * Shared trust-rule types. This package is imported by BOTH the mobile app
 * (live provisional statuses) and the Supabase edge function (authoritative
 * statuses) — design decision 3A: the rules exist exactly once.
 *
 * Trust ladder (worst wins):
 *   unverified < partial < verified
 *
 *   verified   — both bounding punches NFC, track covers the leg, all checks pass
 *   partial    — QR/manual punch, track gap, or lost clock basis
 *   unverified — missing punch, or proximity/speed check failure (spoof-shaped)
 */

export type PunchMethod = "nfc" | "qr" | "manual";

export type TrustStatus = "verified" | "partial" | "unverified";

export interface Punch {
  uuid: string;
  flagId: string;
  method: PunchMethod;
  /** monotonic device time, ms since run-recorder epoch */
  tMonotonicMs: number;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  tMonotonicMs: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Field-tuning constants. Live in a versioned server config table, never in
 * code (decision D22-A: statuses are re-runnable when these change).
 */
export interface TuningConfig {
  version: number;
  /** how close the track must pass to a punched flag (meters) */
  proximityToleranceM: number;
  /** median-filtered speed ceiling (m/s) over speed windows */
  speedCeilingMps: number;
  /** max acceptable gap between track samples (seconds) */
  maxTrackGapS: number;
  /** window for the median speed filter (seconds) */
  speedWindowS: number;
  /** max |punch time - nearest track point| for proximity check (seconds) */
  punchTrackToleranceS: number;
}

export const DEFAULT_TUNING: TuningConfig = {
  version: 1,
  proximityToleranceM: 35,
  speedCeilingMps: 8,
  maxTrackGapS: 30,
  speedWindowS: 10,
  punchTrackToleranceS: 60,
};

export interface LegInput {
  /** punch at the leg's start flag (undefined = missing) */
  startPunch?: Punch;
  /** punch at the leg's end flag (undefined = missing) */
  endPunch?: Punch;
  startFlagPos: LatLon;
  endFlagPos: LatLon;
  /** track points spanning [startPunch.t, endPunch.t] plus a little slack */
  track: TrackPoint[];
  /** monotonic clock basis was lost during this leg (reboot/app kill) */
  clockBasisLost?: boolean;
}

export interface LegResult {
  status: TrustStatus;
  /** machine-readable reasons, worst-first; empty when verified */
  reasons: string[];
  /** leg time in ms, when both punches exist and ordering is sane */
  legTimeMs?: number;
  configVersion: number;
}

export interface RunResult {
  status: TrustStatus;
  legs: LegResult[];
  totalTimeMs?: number;
  configVersion: number;
}

export type Gender = "M" | "W";

export type AgeBand = "U14" | "U18" | "open" | "O40" | "O60";

/** e.g. "M-open", "W-U18" */
export type CompetitionClass = `${Gender}-${AgeBand}`;
