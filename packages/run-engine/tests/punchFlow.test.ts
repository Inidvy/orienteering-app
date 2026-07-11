import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUNCH_FLOW,
  punchFlowInitial,
  punchFlowReduce as reduce,
  type PunchFlowState,
} from "../src/punchFlow";

describe("punch flow state machine (P2-5A)", () => {
  it("arm -> scanning with the 60 s deadline", () => {
    const s = reduce(punchFlowInitial, { type: "ARM", nowMs: 1000 });
    expect(s).toEqual({ kind: "scanning", deadlineMs: 61_000, failCount: 0 });
  });

  it("tag read while scanning -> success with 8 s auto-dismiss", () => {
    let s = reduce(punchFlowInitial, { type: "ARM", nowMs: 0 });
    s = reduce(s, { type: "TAG_READ", nowMs: 5_000 });
    expect(s).toEqual({ kind: "success", dismissAtMs: 13_000 });
    expect(reduce(s, { type: "DISMISS" })).toEqual({ kind: "idle" });
  });

  it("a tag read while NOT scanning is ignored (no phantom punches)", () => {
    expect(reduce(punchFlowInitial, { type: "TAG_READ", nowMs: 0 })).toEqual(
      punchFlowInitial,
    );
  });

  it("read fail -> failed -> retry keeps the fail count", () => {
    let s = reduce(punchFlowInitial, { type: "ARM", nowMs: 0 });
    s = reduce(s, { type: "READ_FAIL" });
    expect(s).toEqual({ kind: "failed", failCount: 1 });
    s = reduce(s, { type: "RETRY", nowMs: 10_000 });
    expect(s).toEqual({ kind: "scanning", deadlineMs: 70_000, failCount: 1 });
  });

  it("third consecutive failure escalates to the QR/manual fallback", () => {
    let s: PunchFlowState = punchFlowInitial;
    for (let i = 0; i < DEFAULT_PUNCH_FLOW.failsBeforeFallback; i++) {
      s = reduce(s, { type: i === 0 ? "ARM" : "RETRY", nowMs: i * 1000 });
      s = reduce(s, { type: "READ_FAIL" });
    }
    expect(s).toEqual({ kind: "fallback" });
  });

  it("scan timeout counts toward escalation like a failed read", () => {
    let s = reduce(punchFlowInitial, { type: "ARM", nowMs: 0 });
    s = reduce(s, { type: "TIMEOUT" });
    expect(s).toEqual({ kind: "failed", failCount: 1 });
  });

  it("user can jump straight to fallback (dead tag, no patience required)", () => {
    let s = reduce(punchFlowInitial, { type: "ARM", nowMs: 0 });
    s = reduce(s, { type: "USE_FALLBACK" });
    expect(s).toEqual({ kind: "fallback" });
  });

  it("RESET returns to idle from any state (next flag)", () => {
    const s = reduce({ kind: "fallback" }, { type: "RESET" });
    expect(s).toEqual({ kind: "idle" });
  });
});
