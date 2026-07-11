import { describe, expect, it } from "vitest";
import {
  memoryCheckpointStore,
  syncRun,
  type ServerVerdict,
  type SyncTransport,
} from "../src/sync";
import type { SyncPayload } from "../src/types";

const VERDICT: ServerVerdict = {
  status: "verified",
  runReasons: [],
  totalTimeMs: 120_000,
  legs: [],
  configVersion: 1,
};

function payload(punchCount = 5, withTrack = true): SyncPayload {
  return {
    run: { id: "run-1", courseId: "course-1", clockBasisLost: false, dnf: false },
    punches: Array.from({ length: punchCount }, (_, i) => ({
      id: `p-${i}`,
      method: "nfc" as const,
      tMonotonicMs: i * 60_000,
      flagId: `F${i}`,
    })),
    track: withTrack
      ? [{ lat: 60, lon: 10, tMonotonicMs: 0 }]
      : [],
  };
}

/** Fake transport: counts calls, fails specific steps a set number of times. */
function fakeTransport(failures: Partial<Record<string, number>> = {}) {
  const calls: string[] = [];
  const remaining = { ...failures };
  const maybeFail = (key: string) => {
    calls.push(key);
    if ((remaining[key] ?? 0) > 0) {
      remaining[key]!--;
      throw new Error(`${key} failed (simulated forest-edge signal drop)`);
    }
  };
  const t: SyncTransport = {
    upsertRun: async () => maybeFail("run"),
    upsertPunches: async (_id, chunk) => maybeFail(`punches:${chunk[0]!.id}`),
    upsertTrack: async () => maybeFail("track"),
    invokeVerify: async () => {
      maybeFail("verify");
      return VERDICT;
    },
  };
  return { t, calls };
}

describe("syncRun — happy path", () => {
  it("uploads run, punch chunks, track, then verifies", async () => {
    const { t, calls } = fakeTransport();
    const res = await syncRun(payload(5), t, memoryCheckpointStore(), {
      punchChunkSize: 2,
    });
    expect(res).toEqual({ ok: true, verdict: VERDICT });
    expect(calls).toEqual([
      "run",
      "punches:p-0",
      "punches:p-2",
      "punches:p-4",
      "track",
      "verify",
    ]);
  });

  it("skips the track step for a run with no GPS points", async () => {
    const { t, calls } = fakeTransport();
    await syncRun(payload(1, false), t);
    expect(calls).not.toContain("track");
  });
});

describe("syncRun — interrupted sync resumes, never duplicates (2A)", () => {
  it("fails mid-punches, retry resumes from the failed chunk only", async () => {
    const { t, calls } = fakeTransport({ "punches:p-2": 1 });
    const store = memoryCheckpointStore();

    const first = await syncRun(payload(5), t, store, { punchChunkSize: 2 });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.failedAt).toBe("punches:1");

    const second = await syncRun(payload(5), t, store, { punchChunkSize: 2 });
    expect(second.ok).toBe(true);

    // run + chunk0 were uploaded exactly once across both attempts
    expect(calls.filter((c) => c === "run")).toHaveLength(1);
    expect(calls.filter((c) => c === "punches:p-0")).toHaveLength(1);
    // the failed chunk was attempted twice (fail + success)
    expect(calls.filter((c) => c === "punches:p-2")).toHaveLength(2);
  });

  it("verify failure retries verification without re-uploading anything", async () => {
    const { t, calls } = fakeTransport({ verify: 1 });
    const store = memoryCheckpointStore();

    const first = await syncRun(payload(2), t, store);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.failedAt).toBe("verify");

    const second = await syncRun(payload(2), t, store);
    expect(second.ok).toBe(true);
    expect(calls.filter((c) => c === "run")).toHaveLength(1);
    expect(calls.filter((c) => c === "verify")).toHaveLength(2);
  });

  it("lost checkpoints (cleared storage) still converge via idempotent upserts", async () => {
    const { t, calls } = fakeTransport({ track: 1 });

    // no shared store between attempts — worst case, everything re-uploads
    const first = await syncRun(payload(2), t);
    expect(first.ok).toBe(false);
    const second = await syncRun(payload(2), t);
    expect(second.ok).toBe(true);

    // duplicated calls are allowed here — server upserts absorb them
    expect(calls.filter((c) => c === "run")).toHaveLength(2);
  });

  it("checkpoints are cleared after success so a later re-sync verifies fresh", async () => {
    const { t, calls } = fakeTransport();
    const store = memoryCheckpointStore();
    await syncRun(payload(1), t, store);
    await syncRun(payload(1), t, store);
    // both attempts re-upload (checkpoints cleared) and both verify
    expect(calls.filter((c) => c === "verify")).toHaveLength(2);
  });
});
