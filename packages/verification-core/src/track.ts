import { distanceM } from "./geo";
import type { LatLon, TrackPoint, TuningConfig } from "./types";

/**
 * Largest gap (seconds) between consecutive track samples within [fromMs, toMs].
 * A leg with no samples in range at all is treated as one gap spanning the leg.
 */
export function maxGapS(
  track: TrackPoint[],
  fromMs: number,
  toMs: number,
): number {
  const pts = track
    .filter((p) => p.tMonotonicMs >= fromMs && p.tMonotonicMs <= toMs)
    .sort((a, b) => a.tMonotonicMs - b.tMonotonicMs);
  if (pts.length === 0) return (toMs - fromMs) / 1000;
  let max = (pts[0]!.tMonotonicMs - fromMs) / 1000;
  for (let i = 1; i < pts.length; i++) {
    max = Math.max(max, (pts[i]!.tMonotonicMs - pts[i - 1]!.tMonotonicMs) / 1000);
  }
  max = Math.max(max, (toMs - pts[pts.length - 1]!.tMonotonicMs) / 1000);
  return max;
}

/**
 * Median-filtered speed check (never raw instantaneous speeds — canopy
 * multipath produces fake >30 km/h spikes). Windows of `speedWindowS` are
 * slid over the samples; a window's speed is the median of its
 * point-to-point speeds. Fails if any window median exceeds the ceiling.
 */
export function speedCheckPasses(
  track: TrackPoint[],
  cfg: TuningConfig,
): boolean {
  const pts = [...track].sort((a, b) => a.tMonotonicMs - b.tMonotonicMs);
  if (pts.length < 3) return true; // not enough data to judge
  const speeds: { v: number; tMs: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dtS = (pts[i]!.tMonotonicMs - pts[i - 1]!.tMonotonicMs) / 1000;
    if (dtS <= 0) continue;
    speeds.push({ v: distanceM(pts[i - 1]!, pts[i]!) / dtS, tMs: pts[i]!.tMonotonicMs });
  }
  const windowMs = cfg.speedWindowS * 1000;
  for (const s of speeds) {
    const inWindow = speeds
      .filter((x) => x.tMs >= s.tMs - windowMs && x.tMs <= s.tMs)
      .map((x) => x.v)
      .sort((a, b) => a - b);
    if (inWindow.length < 3) continue;
    const median = inWindow[Math.floor(inWindow.length / 2)]!;
    if (median > cfg.speedCeilingMps) return false;
  }
  return true;
}

/**
 * The track must pass within proximityToleranceM of the flag at a time
 * consistent with the punch (±punchTrackToleranceS).
 */
export function passesNearFlagAtPunchTime(
  track: TrackPoint[],
  flagPos: LatLon,
  punchTMs: number,
  cfg: TuningConfig,
): boolean {
  const tolMs = cfg.punchTrackToleranceS * 1000;
  return track.some(
    (p) =>
      Math.abs(p.tMonotonicMs - punchTMs) <= tolMs &&
      distanceM(p, flagPos) <= cfg.proximityToleranceM,
  );
}
