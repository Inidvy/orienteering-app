/*
 * Punch-affordance state machine (decision P2-5A) — pure reducer, rendered by
 * the run screen. Android auto-arms (reader mode while foregrounded) by
 * dispatching ARM immediately; iOS arms on the PUNCH button press.
 *
 *   idle ──ARM──▶ scanning ──TAG_READ──▶ success ──(8 s auto)──▶ idle
 *                  │  │ ▲                 (green flash + haptic + split sheet)
 *        TIMEOUT ──┘  │ └── RETRY ─────┐
 *                READ_FAIL ──▶ failed ─┴─(3rd fail)──▶ fallback
 *                                         ("Use QR / enter flag number"
 *                                          sheet with the flag photo)
 */

export interface PunchFlowConfig {
  /** Core NFC session budget (~60 s on iOS) */
  scanTimeoutMs: number;
  /** consecutive read failures before escalating to QR/manual */
  failsBeforeFallback: number;
  /** success sheet auto-dismiss */
  successAutoDismissMs: number;
}

export const DEFAULT_PUNCH_FLOW: PunchFlowConfig = {
  scanTimeoutMs: 60_000,
  failsBeforeFallback: 3,
  successAutoDismissMs: 8_000,
};

export type PunchFlowState =
  | { kind: "idle" }
  | { kind: "scanning"; deadlineMs: number; failCount: number }
  | { kind: "success"; dismissAtMs: number }
  | { kind: "failed"; failCount: number }
  | { kind: "fallback" };

export type PunchFlowEvent =
  | { type: "ARM"; nowMs: number }
  | { type: "TAG_READ"; nowMs: number }
  | { type: "READ_FAIL" }
  | { type: "RETRY"; nowMs: number }
  | { type: "TIMEOUT" }
  | { type: "DISMISS" }
  | { type: "USE_FALLBACK" }
  | { type: "RESET" };

export const punchFlowInitial: PunchFlowState = { kind: "idle" };

export function punchFlowReduce(
  state: PunchFlowState,
  ev: PunchFlowEvent,
  cfg: PunchFlowConfig = DEFAULT_PUNCH_FLOW,
): PunchFlowState {
  switch (ev.type) {
    case "ARM":
      if (state.kind === "idle" || state.kind === "failed") {
        return {
          kind: "scanning",
          deadlineMs: ev.nowMs + cfg.scanTimeoutMs,
          failCount: state.kind === "failed" ? state.failCount : 0,
        };
      }
      return state;

    case "TAG_READ":
      if (state.kind === "scanning") {
        return { kind: "success", dismissAtMs: ev.nowMs + cfg.successAutoDismissMs };
      }
      return state;

    case "READ_FAIL":
      if (state.kind === "scanning") {
        const failCount = state.failCount + 1;
        return failCount >= cfg.failsBeforeFallback
          ? { kind: "fallback" }
          : { kind: "failed", failCount };
      }
      return state;

    case "RETRY":
      if (state.kind === "failed") {
        return {
          kind: "scanning",
          deadlineMs: ev.nowMs + cfg.scanTimeoutMs,
          failCount: state.failCount,
        };
      }
      return state;

    case "TIMEOUT":
      if (state.kind === "scanning") {
        // a timed-out session counts toward escalation like a failed read
        const failCount = state.failCount + 1;
        return failCount >= cfg.failsBeforeFallback
          ? { kind: "fallback" }
          : { kind: "failed", failCount };
      }
      return state;

    case "DISMISS":
      if (state.kind === "success") return { kind: "idle" };
      return state;

    case "USE_FALLBACK":
      return { kind: "fallback" };

    case "RESET":
      return { kind: "idle" };
  }
}
