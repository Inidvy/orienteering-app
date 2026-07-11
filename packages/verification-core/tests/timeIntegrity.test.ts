import { describe, expect, it } from "vitest";
import { checkElapsedBound } from "../src/timeIntegrity";

describe("checkElapsedBound (D19 time-integrity)", () => {
  it("elapsed inside the anchored window => ok", () => {
    const v = checkElapsedBound(45 * 60_000, {
      preRunAnchorWallMs: 1_000_000,
      syncAnchorWallMs: 1_000_000 + 2 * 60 * 60_000, // 2h window
    });
    expect(v).toEqual({ ok: true });
  });

  it("claimed elapsed longer than the physically possible window => unverified cap", () => {
    const v = checkElapsedBound(3 * 60 * 60_000, {
      preRunAnchorWallMs: 1_000_000,
      syncAnchorWallMs: 1_000_000 + 2 * 60 * 60_000,
    });
    expect(v).toEqual({
      ok: false,
      capAt: "unverified",
      reason: "elapsed_exceeds_window",
    });
  });

  it("fresh install, no pre-run anchor => capped at partial", () => {
    const v = checkElapsedBound(45 * 60_000, {
      syncAnchorWallMs: 9_999_999,
    });
    expect(v).toEqual({
      ok: false,
      capAt: "partial",
      reason: "no_pre_run_anchor",
    });
  });

  it("elapsed exactly equal to the window => ok (boundary)", () => {
    const v = checkElapsedBound(60_000, {
      preRunAnchorWallMs: 0,
      syncAnchorWallMs: 60_000,
    });
    expect(v).toEqual({ ok: true });
  });
});
