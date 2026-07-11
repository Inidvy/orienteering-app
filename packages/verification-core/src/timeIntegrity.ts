/*
 * Time-integrity bounds (decision D19): punch *presence* is proven by the tap,
 * punch *time* is client-asserted. The server bounds every run's elapsed time
 * inside the wall-clock window it can establish from sync anchors.
 *
 *   preAnchor ──── run happens somewhere in here ──── syncAnchor
 *        └──────────── windowMs (server-observed) ────────┘
 *
 * A claimed elapsed time LONGER than the window is physically impossible.
 * No pre-run anchor (fresh install straight to the forest) caps the run at
 * `partial` with reason "no_pre_run_anchor" — one online app-open clears
 * this forever, and onboarding step 2 explains it ("you're anchored").
 */

export type TimeBoundVerdict =
  | { ok: true }
  | { ok: false; capAt: "partial"; reason: "no_pre_run_anchor" }
  | { ok: false; capAt: "unverified"; reason: "elapsed_exceeds_window" };

export function checkElapsedBound(
  elapsedMs: number,
  anchors: { preRunAnchorWallMs?: number; syncAnchorWallMs: number },
): TimeBoundVerdict {
  if (anchors.preRunAnchorWallMs === undefined) {
    return { ok: false, capAt: "partial", reason: "no_pre_run_anchor" };
  }
  const windowMs = anchors.syncAnchorWallMs - anchors.preRunAnchorWallMs;
  if (elapsedMs > windowMs) {
    return { ok: false, capAt: "unverified", reason: "elapsed_exceeds_window" };
  }
  return { ok: true };
}
