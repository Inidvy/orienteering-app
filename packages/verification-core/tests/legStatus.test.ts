import { describe, expect, it } from "vitest";
import { legStatus } from "../src/legStatus";
import { DEFAULT_TUNING } from "../src/types";
import { FLAG_A, FLAG_B, healthyLeg, punch, straightTrack } from "./helpers";

const cfg = DEFAULT_TUNING;

describe("legStatus — verified", () => {
  it("NFC both ends + covering track + sane speed => verified", () => {
    const r = legStatus(healthyLeg(), cfg);
    expect(r.status).toBe("verified");
    expect(r.reasons).toEqual([]);
    expect(r.legTimeMs).toBe(60_000);
    expect(r.configVersion).toBe(cfg.version);
  });
});

describe("legStatus — partial (honest but weaker evidence)", () => {
  it("QR start punch demotes to partial", () => {
    const leg = healthyLeg();
    leg.startPunch = punch("A", 0, "qr");
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("partial");
    expect(r.reasons).toContain("start_punch_qr");
  });

  it("manual end punch demotes to partial", () => {
    const leg = healthyLeg();
    leg.endPunch = punch("B", 60_000, "manual");
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("partial");
    expect(r.reasons).toContain("end_punch_manual");
  });

  it("track gap over maxTrackGapS demotes to partial", () => {
    const leg = healthyLeg();
    // remove all points between 10s and 50s => 40s gap
    leg.track = leg.track.filter(
      (p) => p.tMonotonicMs <= 10_000 || p.tMonotonicMs >= 50_000,
    );
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("partial");
    expect(r.reasons.some((x) => x.startsWith("track_gap_"))).toBe(true);
  });

  it("track gap exactly at maxTrackGapS boundary still verifies", () => {
    const leg = healthyLeg();
    // keep a point every 30s exactly: 0, 30s, 60s
    leg.track = leg.track.filter((p) =>
      [0, 30_000, 60_000].includes(p.tMonotonicMs),
    );
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("verified");
  });

  it("clock basis lost demotes to partial", () => {
    const r = legStatus(healthyLeg({ clockBasisLost: true }), cfg);
    expect(r.status).toBe("partial");
    expect(r.reasons).toContain("clock_basis_lost");
  });
});

describe("legStatus — unverified (missing or spoof-shaped evidence)", () => {
  it("missing start punch => unverified", () => {
    const r = legStatus(healthyLeg({ startPunch: undefined }), cfg);
    expect(r.status).toBe("unverified");
    expect(r.reasons).toContain("missing_start_punch");
  });

  it("missing end punch => unverified", () => {
    const r = legStatus(healthyLeg({ endPunch: undefined }), cfg);
    expect(r.status).toBe("unverified");
    expect(r.reasons).toContain("missing_end_punch");
  });

  it("non-positive leg time => unverified", () => {
    const leg = healthyLeg();
    leg.endPunch = punch("B", 0); // same instant as start
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("unverified");
    expect(r.reasons).toContain("non_positive_leg_time");
  });

  it("track never near the start flag => unverified", () => {
    const leg = healthyLeg();
    // whole track shifted ~500 m east
    leg.track = leg.track.map((p) => ({ ...p, lon: p.lon + 0.009 }));
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("unverified");
    expect(r.reasons).toContain("track_not_near_start_flag");
  });

  it("GPX-without-presence spoof: punches present but track absent => unverified", () => {
    const r = legStatus(healthyLeg({ track: [] }), cfg);
    expect(r.status).toBe("unverified");
    expect(r.reasons).toContain("track_not_near_start_flag");
  });

  it("fabricated fast track (10 m/s sustained) => unverified", () => {
    const t1 = 20_000; // 200 m in 20 s
    const leg = healthyLeg({
      endPunch: punch("B", t1),
      track: straightTrack(FLAG_A, FLAG_B, 0, t1, 2000),
    });
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("unverified");
    expect(r.reasons).toContain("speed_ceiling_exceeded");
  });

  it("single multipath spike does NOT fail the median speed filter", () => {
    const leg = healthyLeg({
      track: straightTrack(FLAG_A, FLAG_B, 0, 60_000, 2500),
    });
    // one point jumps ~100 m east and returns (classic canopy multipath)
    const i = Math.floor(leg.track.length / 2);
    leg.track[i] = { ...leg.track[i]!, lon: leg.track[i]!.lon + 0.0018 };
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("verified");
  });

  it("unverified outranks partial when both apply", () => {
    const leg = healthyLeg({ track: [] }); // proximity fail => unverified
    leg.startPunch = punch("A", 0, "qr"); // would be partial alone
    const r = legStatus(leg, cfg);
    expect(r.status).toBe("unverified");
  });
});
