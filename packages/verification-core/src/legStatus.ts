import { maxGapS, passesNearFlagAtPunchTime, speedCheckPasses } from "./track";
import type { LegInput, LegResult, TrustStatus, TuningConfig } from "./types";

/*
 * Leg trust ladder (worst wins):
 *
 *   missing punch ─────────────┐
 *   proximity check fails ─────┼──▶ unverified   (spoof-shaped)
 *   speed ceiling exceeded ────┘
 *
 *   QR/manual punch ───────────┐
 *   track gap > maxTrackGapS ──┼──▶ partial      (honest but weaker evidence)
 *   clock basis lost ──────────┘
 *
 *   NFC both ends + track covers + checks pass ──▶ verified
 */
export function legStatus(leg: LegInput, cfg: TuningConfig): LegResult {
  const reasons: string[] = [];
  let status: TrustStatus = "verified";

  const demoteTo = (s: TrustStatus, reason: string) => {
    reasons.push(reason);
    if (s === "unverified" || status === "unverified") status = "unverified";
    else status = "partial";
  };

  // --- unverified class: missing evidence or spoof-shaped failures ---
  if (!leg.startPunch) demoteTo("unverified", "missing_start_punch");
  if (!leg.endPunch) demoteTo("unverified", "missing_end_punch");

  let legTimeMs: number | undefined;
  if (leg.startPunch && leg.endPunch) {
    legTimeMs = leg.endPunch.tMonotonicMs - leg.startPunch.tMonotonicMs;
    if (legTimeMs <= 0) {
      demoteTo("unverified", "non_positive_leg_time");
      legTimeMs = undefined;
    }
  }

  if (leg.startPunch && leg.endPunch && legTimeMs !== undefined) {
    if (
      !passesNearFlagAtPunchTime(
        leg.track,
        leg.startFlagPos,
        leg.startPunch.tMonotonicMs,
        cfg,
      )
    ) {
      demoteTo("unverified", "track_not_near_start_flag");
    }
    if (
      !passesNearFlagAtPunchTime(
        leg.track,
        leg.endFlagPos,
        leg.endPunch.tMonotonicMs,
        cfg,
      )
    ) {
      demoteTo("unverified", "track_not_near_end_flag");
    }
    if (!speedCheckPasses(leg.track, cfg)) {
      demoteTo("unverified", "speed_ceiling_exceeded");
    }

    // --- partial class: honest but weaker evidence ---
    if (leg.startPunch.method !== "nfc") {
      demoteTo("partial", `start_punch_${leg.startPunch.method}`);
    }
    if (leg.endPunch.method !== "nfc") {
      demoteTo("partial", `end_punch_${leg.endPunch.method}`);
    }
    const gap = maxGapS(
      leg.track,
      leg.startPunch.tMonotonicMs,
      leg.endPunch.tMonotonicMs,
    );
    if (gap > cfg.maxTrackGapS) {
      demoteTo("partial", `track_gap_${Math.round(gap)}s`);
    }
  }

  if (leg.clockBasisLost) demoteTo("partial", "clock_basis_lost");

  return { status, reasons, legTimeMs, configVersion: cfg.version };
}
