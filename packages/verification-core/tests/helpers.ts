import type { LatLon, LegInput, Punch, PunchMethod, TrackPoint } from "../src/types";

/** ~1 deg latitude = 111_111 m at any longitude. */
export const FLAG_A: LatLon = { lat: 60.0, lon: 10.0 };
/** ~200 m north of FLAG_A */
export const FLAG_B: LatLon = { lat: 60.0018, lon: 10.0 };

let uuidCounter = 0;
export function punch(
  flagId: string,
  tMonotonicMs: number,
  method: PunchMethod = "nfc",
): Punch {
  return { uuid: `p-${++uuidCounter}`, flagId, method, tMonotonicMs };
}

/**
 * Straight-line track from `from` to `to` between t0..t1 with samples every
 * `stepMs`. First/last points sit exactly on the flags at the punch times.
 */
export function straightTrack(
  from: LatLon,
  to: LatLon,
  t0: number,
  t1: number,
  stepMs = 5000,
): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let t = t0; t <= t1; t += stepMs) {
    const f = (t - t0) / (t1 - t0);
    pts.push({
      lat: from.lat + (to.lat - from.lat) * f,
      lon: from.lon + (to.lon - from.lon) * f,
      tMonotonicMs: t,
    });
  }
  if (pts[pts.length - 1]!.tMonotonicMs !== t1) {
    pts.push({ ...to, tMonotonicMs: t1 });
  }
  return pts;
}

/** A healthy 60-second, ~200 m leg (3.3 m/s) that should verify. */
export function healthyLeg(overrides: Partial<LegInput> = {}): LegInput {
  const t0 = 0;
  const t1 = 60_000;
  return {
    startPunch: punch("A", t0),
    endPunch: punch("B", t1),
    startFlagPos: FLAG_A,
    endFlagPos: FLAG_B,
    track: straightTrack(FLAG_A, FLAG_B, t0, t1),
    ...overrides,
  };
}
