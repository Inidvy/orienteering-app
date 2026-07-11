import { describe, expect, it } from "vitest";
import { RunSession } from "../src/session";
import type { CourseSpec } from "../src/types";

// S -> C1 -> F, ~200 m apart in a line
const COURSE: CourseSpec = {
  id: "course-1",
  flagOrder: ["S", "C1", "F"],
  flagPositions: {
    S: { lat: 60.0, lon: 10.0 },
    C1: { lat: 60.0018, lon: 10.0 },
    F: { lat: 60.0036, lon: 10.0 },
  },
  shortCodes: { S: "1", C1: "4", F: "9" },
  referenceLegTimesMs: [55_000, 58_000],
  referenceLabel: "M-open record pace",
};

function makeDeps() {
  let n = 0;
  return { uuid: () => `u-${++n}` };
}

function runGps(s: RunSession, fromMs: number, toMs: number) {
  // straight-line S->F points every 5 s so provisional checks have a track
  for (let t = fromMs; t <= toMs; t += 5000) {
    const f = t / 120_000;
    s.gps(60.0 + 0.0036 * f, 10.0, t);
  }
}

describe("RunSession — the core loop", () => {
  it("start punch starts the run; clock anchors at tag read", () => {
    const s = new RunSession(COURSE, makeDeps());
    expect(s.phase).toBe("pre-start");
    expect(s.expectedShortCode).toBe("1");
    const out = s.punch("S", "nfc", 1000);
    expect(out).toEqual({ result: "started" });
    expect(s.phase).toBe("running");
    expect(s.startTimeMs).toBe(1000);
    expect(s.expectedShortCode).toBe("4");
  });

  it("closing a leg returns the split and the vs-reference delta", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    const out = s.punch("C1", "nfc", 43_000);
    expect(out).toMatchObject({
      result: "leg_closed",
      legIndex: 0,
      legTimeMs: 43_000,
      deltaToReferenceMs: -12_000, // 12 s faster than the record pace
      referenceLabel: "M-open record pace",
    });
  });

  it("finish flag ends the run instantly — no confirmation (P7-D13)", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    s.punch("C1", "nfc", 60_000);
    const out = s.punch("F", "nfc", 120_000);
    expect(out).toMatchObject({
      result: "finished",
      totalTimeMs: 120_000,
      legTimeMs: 60_000,
    });
    expect(s.phase).toBe("finished");
    expect(s.elapsedMs(999_999)).toBe(120_000); // frozen at finish
  });

  it("wrong flag: recorded, flagged, run continues", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    const out = s.punch("F", "nfc", 30_000); // skipped C1
    expect(out).toEqual({
      result: "wrong_flag",
      expectedShortCode: "4",
      punchedShortCode: "9",
    });
    expect(s.phase).toBe("running");
    // the correct flag still closes the leg afterwards
    expect(s.punch("C1", "nfc", 60_000)).toMatchObject({ result: "leg_closed" });
  });

  it("double-tap on the same flag: earliest punch counts", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    s.punch("C1", "nfc", 60_000);
    expect(s.punch("C1", "nfc", 62_000)).toEqual({ result: "duplicate" });
    const out = s.punch("F", "nfc", 120_000);
    expect(out).toMatchObject({ result: "finished", totalTimeMs: 120_000 });
  });

  it("abandon (long-press timer) => DNF, further punches ignored", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    s.abandon(30_000);
    expect(s.phase).toBe("abandoned");
    expect(s.punch("C1", "nfc", 60_000)).toEqual({ result: "ignored_phase" });
    expect(s.buildSyncPayload().run.dnf).toBe(true);
  });
});

describe("RunSession — crash recovery (failure matrix)", () => {
  it("restore() replays the log to the identical state", () => {
    const deps = makeDeps();
    const s = new RunSession(COURSE, deps);
    s.punch("S", "nfc", 0);
    runGps(s, 0, 55_000);
    s.punch("C1", "nfc", 60_000);

    const restored = RunSession.restore(
      COURSE,
      s.runId,
      [...s.events],
      makeDeps(),
    );
    expect(restored.phase).toBe("running");
    expect(restored.expectedShortCode).toBe("9");
    expect(restored.startTimeMs).toBe(0);
    expect(restored.runId).toBe(s.runId);
  });

  it("punch UUIDs survive restore — sync stays idempotent (2A)", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    s.punch("C1", "nfc", 60_000);
    const before = s.buildSyncPayload().punches.map((p) => p.id);

    const restored = RunSession.restore(COURSE, s.runId, [...s.events], makeDeps());
    const after = restored.buildSyncPayload().punches.map((p) => p.id);
    expect(after).toEqual(before);
  });
});

describe("RunSession — provisional statuses (shared rules, decision 3A)", () => {
  it("healthy tracked run is provisionally verified on both legs", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    runGps(s, 0, 120_000);
    s.punch("C1", "nfc", 60_000);
    s.punch("F", "nfc", 120_000);
    const legs = s.provisionalLegs();
    expect(legs.map((l) => l.status)).toEqual(["verified", "verified"]);
  });

  it("QR punch shows as provisionally partial — the app never over-promises", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    runGps(s, 0, 120_000);
    s.punch("C1", "qr", 60_000);
    s.punch("F", "nfc", 120_000);
    const legs = s.provisionalLegs();
    expect(legs[0]!.status).toBe("partial");
    expect(legs[1]!.status).toBe("partial");
  });

  it("clock basis lost marks legs partial", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    runGps(s, 0, 120_000);
    s.markClockBasisLost(30_000);
    s.punch("C1", "nfc", 60_000);
    s.punch("F", "nfc", 120_000);
    expect(s.provisionalLegs()[0]!.status).toBe("partial");
  });

  it("sync payload carries every punch including wrong-flag ones", () => {
    const s = new RunSession(COURSE, makeDeps());
    s.punch("S", "nfc", 0);
    s.punch("F", "nfc", 30_000); // wrong flag — still evidence, still synced
    s.punch("C1", "nfc", 60_000);
    const payload = s.buildSyncPayload();
    expect(payload.punches).toHaveLength(3);
    expect(payload.run.id).toBe(s.runId);
  });
});
