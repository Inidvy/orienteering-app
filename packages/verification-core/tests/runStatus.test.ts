import { describe, expect, it } from "vitest";
import { runStatus } from "../src/runStatus";
import { DEFAULT_TUNING, type LegResult } from "../src/types";

const cfg = DEFAULT_TUNING;

const leg = (
  status: LegResult["status"],
  legTimeMs?: number,
): LegResult => ({ status, reasons: [], legTimeMs, configVersion: cfg.version });

describe("runStatus — min over legs", () => {
  it("all verified => verified with summed total", () => {
    const r = runStatus([leg("verified", 60_000), leg("verified", 90_000)], cfg);
    expect(r.status).toBe("verified");
    expect(r.totalTimeMs).toBe(150_000);
  });

  it("one partial leg drags the run to partial", () => {
    const r = runStatus([leg("verified", 1), leg("partial", 1)], cfg);
    expect(r.status).toBe("partial");
  });

  it("one unverified leg drags the run to unverified even among verified legs", () => {
    const r = runStatus(
      [leg("verified", 1), leg("unverified", 1), leg("partial", 1)],
      cfg,
    );
    expect(r.status).toBe("unverified");
  });

  it("zero legs => unverified (nothing proven)", () => {
    expect(runStatus([], cfg).status).toBe("unverified");
  });

  it("an untimed leg leaves totalTimeMs undefined", () => {
    const r = runStatus([leg("verified", 60_000), leg("unverified")], cfg);
    expect(r.totalTimeMs).toBeUndefined();
  });
});
