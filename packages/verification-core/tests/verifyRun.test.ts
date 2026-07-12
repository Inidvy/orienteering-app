import { describe, expect, it } from "vitest";
import { resolvePunches, verifyRun, type VerifyRunInput } from "../src/verifyRun";
import { DEFAULT_TUNING, type LatLon, type TrackPoint } from "../src/types";
import { straightTrack } from "./helpers";

const cfg = DEFAULT_TUNING;

// Three flags in a line, ~200 m apart: S -> C1 -> F
const S: LatLon = { lat: 60.0, lon: 10.0 };
const C1: LatLon = { lat: 60.0018, lon: 10.0 };
const F: LatLon = { lat: 60.0036, lon: 10.0 };

const REGISTRY = [
  { uid: "uid-S", flagId: "S" },
  { uid: "uid-C1", flagId: "C1" },
  { uid: "uid-F", flagId: "F" },
];

const anchorsOk = { preRunAnchorWallMs: 0, syncAnchorWallMs: 24 * 3600_000 };

function healthyRun(): VerifyRunInput {
  const track: TrackPoint[] = [
    ...straightTrack(S, C1, 0, 60_000),
    ...straightTrack(C1, F, 60_000, 120_000),
  ];
  return {
    courseFlagOrder: ["S", "C1", "F"],
    flagPositions: { S, C1, F },
    punches: [
      { uuid: "p1", tagUid: "uid-S", method: "nfc", tMonotonicMs: 0 },
      { uuid: "p2", tagUid: "uid-C1", method: "nfc", tMonotonicMs: 60_000 },
      { uuid: "p3", tagUid: "uid-F", method: "nfc", tMonotonicMs: 120_000 },
    ],
    tagRegistry: REGISTRY,
    track,
    anchors: anchorsOk,
    cfg,
  };
}

describe("resolvePunches", () => {
  it("maps NFC punches to flags via the registry", () => {
    const r = resolvePunches(
      [{ uuid: "p", tagUid: "uid-C1", method: "nfc", tMonotonicMs: 5 }],
      REGISTRY,
    );
    expect(r[0]).toMatchObject({ ok: true, flagId: "C1" });
  });

  it("rejects unknown tag UIDs cleanly", () => {
    const r = resolvePunches(
      [{ uuid: "p", tagUid: "uid-EVIL", method: "nfc", tMonotonicMs: 5 }],
      REGISTRY,
    );
    expect(r[0]).toMatchObject({ ok: false, reason: "unknown_tag" });
  });

  it("QR/manual punches resolve by flag id directly", () => {
    const r = resolvePunches(
      [{ uuid: "p", flagId: "C1", method: "qr", tMonotonicMs: 5 }],
      REGISTRY,
    );
    expect(r[0]).toMatchObject({ ok: true, flagId: "C1" });
  });
});

describe("verifyRun — full pipeline", () => {
  it("healthy anchored run => verified, both legs timed, total summed", () => {
    const out = verifyRun(healthyRun());
    expect(out.status).toBe("verified");
    expect(out.legs).toHaveLength(2);
    expect(out.totalTimeMs).toBe(120_000);
    expect(out.runReasons).toEqual([]);
  });

  it("no pre-run anchor caps a verified run at partial (fresh install)", () => {
    const input = healthyRun();
    input.anchors = { syncAnchorWallMs: 24 * 3600_000 };
    const out = verifyRun(input);
    expect(out.status).toBe("partial");
    expect(out.runReasons).toContain("no_pre_run_anchor");
  });

  it("elapsed exceeding the anchored window caps at unverified (time forgery)", () => {
    const input = healthyRun();
    // server only saw a 1-minute window; the run claims 2 minutes
    input.anchors = { preRunAnchorWallMs: 0, syncAnchorWallMs: 60_000 };
    const out = verifyRun(input);
    expect(out.status).toBe("unverified");
    expect(out.runReasons).toContain("elapsed_exceeds_window");
  });

  it("unknown tag on a control => that leg unverified, run unverified", () => {
    const input = healthyRun();
    input.punches[1] = {
      uuid: "p2",
      tagUid: "uid-CLONE",
      method: "nfc",
      tMonotonicMs: 60_000,
    };
    const out = verifyRun(input);
    expect(out.status).toBe("unverified");
    expect(out.legs[0]!.reasons).toContain("missing_end_punch");
  });

  it("QR punch is as valid as NFC — run stays verified (user decision 2026-07-12)", () => {
    const input = healthyRun();
    input.punches[1] = {
      uuid: "p2",
      flagId: "C1",
      method: "qr",
      tMonotonicMs: 60_000,
    };
    const out = verifyRun(input);
    expect(out.status).toBe("verified");
  });

  it("manual punch on one control drags the run to partial", () => {
    const input = healthyRun();
    input.punches[1] = {
      uuid: "p2",
      flagId: "C1",
      method: "manual",
      tMonotonicMs: 60_000,
    };
    const out = verifyRun(input);
    expect(out.status).toBe("partial");
  });

  it("out-of-order punches: an earlier punch never closes a later leg", () => {
    const input = healthyRun();
    // punch F before C1 — F's punch predates C1's, so leg C1->F has no
    // end punch later than C1's punch time
    input.punches = [
      { uuid: "p1", tagUid: "uid-S", method: "nfc", tMonotonicMs: 0 },
      { uuid: "p3", tagUid: "uid-F", method: "nfc", tMonotonicMs: 30_000 },
      { uuid: "p2", tagUid: "uid-C1", method: "nfc", tMonotonicMs: 60_000 },
    ];
    const out = verifyRun(input);
    expect(out.status).toBe("unverified");
    expect(out.legs[1]!.reasons).toContain("missing_end_punch");
  });

  it("double-tap on the same flag uses the earliest punch and stays verified", () => {
    const input = healthyRun();
    input.punches.push({
      uuid: "p2b",
      tagUid: "uid-C1",
      method: "nfc",
      tMonotonicMs: 62_000,
    });
    const out = verifyRun(input);
    expect(out.status).toBe("verified");
    expect(out.totalTimeMs).toBe(120_000);
  });
});
