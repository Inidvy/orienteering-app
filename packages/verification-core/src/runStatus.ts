import type { LegResult, RunResult, TrustStatus, TuningConfig } from "./types";

const RANK: Record<TrustStatus, number> = {
  unverified: 0,
  partial: 1,
  verified: 2,
};

/** Run status = min over its legs (verified > partial > unverified). */
export function runStatus(legs: LegResult[], cfg: TuningConfig): RunResult {
  if (legs.length === 0) {
    return {
      status: "unverified",
      legs,
      configVersion: cfg.version,
    };
  }
  let worst: TrustStatus = "verified";
  for (const leg of legs) {
    if (RANK[leg.status] < RANK[worst]) worst = leg.status;
  }
  const allTimed = legs.every((l) => l.legTimeMs !== undefined);
  const totalTimeMs = allTimed
    ? legs.reduce((sum, l) => sum + l.legTimeMs!, 0)
    : undefined;
  return { status: worst, legs, totalTimeMs, configVersion: cfg.version };
}
