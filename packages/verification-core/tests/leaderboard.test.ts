import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  findOwnRank,
  type LeaderboardRun,
} from "../src/leaderboard";

const T2026 = Date.UTC(2026, 6, 11);

function run(over: Partial<LeaderboardRun>): LeaderboardRun {
  return {
    runId: over.runId ?? Math.random().toString(36).slice(2),
    userId: "u1",
    displayName: "Runner",
    birthYear: 1990,
    gender: "M",
    status: "verified",
    totalTimeMs: 40 * 60_000,
    completedAtMs: T2026,
    ...over,
  };
}

describe("buildLeaderboard — ranking rules", () => {
  it("ranks best verified run per user, fastest first", () => {
    const board = buildLeaderboard([
      run({ userId: "a", displayName: "A", totalTimeMs: 40_000 }),
      // A's best, 8 days later (outside the re-run cooldown)
      run({
        userId: "a",
        displayName: "A",
        totalTimeMs: 38_000,
        completedAtMs: T2026 + 8 * 24 * 3600_000,
      }),
      run({ userId: "b", displayName: "B", totalTimeMs: 39_000 }),
    ]);
    expect(board.ranked.map((e) => [e.rank, e.run.userId, e.run.totalTimeMs])).toEqual([
      [1, "a", 38_000],
      [2, "b", 39_000],
    ]);
  });

  it("ties break by earlier completion", () => {
    const board = buildLeaderboard([
      run({ userId: "late", totalTimeMs: 40_000, completedAtMs: T2026 + 1000 }),
      run({ userId: "early", totalTimeMs: 40_000, completedAtMs: T2026 }),
    ]);
    expect(board.ranked[0]!.run.userId).toBe("early");
  });

  it("partial/unverified runs land unranked below, best attempt per user", () => {
    const board = buildLeaderboard([
      run({ userId: "v", status: "verified", totalTimeMs: 40_000 }),
      run({ userId: "p", status: "partial", totalTimeMs: 35_000 }),
      run({ userId: "p", status: "partial", totalTimeMs: 33_000 }),
      run({ userId: "x", status: "unverified", totalTimeMs: 30_000 }),
    ]);
    expect(board.ranked).toHaveLength(1);
    expect(board.unranked.map((r) => [r.userId, r.totalTimeMs])).toEqual([
      ["x", 30_000],
      ["p", 33_000],
    ]);
  });

  it("a user with a verified run never reappears unranked with a weaker attempt", () => {
    const board = buildLeaderboard([
      run({ userId: "a", status: "verified", totalTimeMs: 40_000 }),
      run({ userId: "a", status: "partial", totalTimeMs: 36_000 }),
    ]);
    expect(board.ranked).toHaveLength(1);
    expect(board.unranked).toHaveLength(0);
  });
});

describe("buildLeaderboard — class chips (P7-D13-A, per-gender classes)", () => {
  const mixed = [
    run({ userId: "m-elite", gender: "M", birthYear: 1995, totalTimeMs: 1 }),
    run({ userId: "w-elite", gender: "W", birthYear: 1995, totalTimeMs: 2 }),
    run({ userId: "m-o40", gender: "M", birthYear: 1980, totalTimeMs: 3 }),
    run({ userId: "w-u18", gender: "W", birthYear: 2010, totalTimeMs: 4 }),
  ];

  it("overall includes everyone", () => {
    expect(buildLeaderboard(mixed, "overall").ranked).toHaveLength(4);
  });

  it("gender chips filter by gender across ages", () => {
    expect(
      buildLeaderboard(mixed, "W").ranked.map((e) => e.run.userId),
    ).toEqual(["w-elite", "w-u18"]);
  });

  it("class chips are gender-specific — Elite splits into M and W", () => {
    expect(
      buildLeaderboard(mixed, "M-Elite").ranked.map((e) => e.run.userId),
    ).toEqual(["m-elite"]);
    expect(
      buildLeaderboard(mixed, "W-Elite").ranked.map((e) => e.run.userId),
    ).toEqual(["w-elite"]);
  });

  it("age classes are gender-specific too", () => {
    expect(
      buildLeaderboard(mixed, "M-O40").ranked.map((e) => e.run.userId),
    ).toEqual(["m-o40"]);
    expect(
      buildLeaderboard(mixed, "W-U18").ranked.map((e) => e.run.userId),
    ).toEqual(["w-u18"]);
    expect(buildLeaderboard(mixed, "W-O40").ranked).toHaveLength(0);
  });
});

describe("buildLeaderboard — re-run cooldown (user decision 2026-07-12)", () => {
  const DAY = 24 * 3600_000;

  it("a re-run within 7 days stays unranked; the first run keeps its rank", () => {
    const board = buildLeaderboard([
      run({ runId: "r1", userId: "a", totalTimeMs: 40_000, completedAtMs: T2026 }),
      // faster, but only 3 days later — fresh route knowledge, not ranked
      run({ runId: "r2", userId: "a", totalTimeMs: 30_000, completedAtMs: T2026 + 3 * DAY }),
    ]);
    expect(board.ranked).toHaveLength(1);
    expect(board.ranked[0]!.run.runId).toBe("r1");
  });

  it("a re-run 7+ days later is ranked (best of both counts)", () => {
    const board = buildLeaderboard([
      run({ runId: "r1", userId: "a", totalTimeMs: 40_000, completedAtMs: T2026 }),
      run({ runId: "r2", userId: "a", totalTimeMs: 30_000, completedAtMs: T2026 + 8 * DAY }),
    ]);
    expect(board.ranked).toHaveLength(1);
    expect(board.ranked[0]!.run.runId).toBe("r2");
  });

  it("cooldown counts from the last ELIGIBLE run, not from ineligible re-runs", () => {
    const board = buildLeaderboard([
      run({ runId: "r1", userId: "a", totalTimeMs: 40_000, completedAtMs: T2026 }),
      run({ runId: "r2", userId: "a", totalTimeMs: 20_000, completedAtMs: T2026 + 6 * DAY }), // ineligible
      run({ runId: "r3", userId: "a", totalTimeMs: 30_000, completedAtMs: T2026 + 9 * DAY }), // 9d after r1 -> eligible
    ]);
    expect(board.ranked[0]!.run.runId).toBe("r3");
  });

  it("other runners are unaffected by someone's cooldown", () => {
    const board = buildLeaderboard([
      run({ runId: "a1", userId: "a", totalTimeMs: 40_000, completedAtMs: T2026 }),
      run({ runId: "a2", userId: "a", totalTimeMs: 10_000, completedAtMs: T2026 + DAY }),
      run({ runId: "b1", userId: "b", totalTimeMs: 35_000, completedAtMs: T2026 + DAY }),
    ]);
    expect(board.ranked.map((e) => e.run.runId)).toEqual(["b1", "a1"]);
  });
});

describe("findOwnRank (you-row, P3-8A)", () => {
  it("finds the viewer's ranked entry", () => {
    const board = buildLeaderboard([
      run({ userId: "a", totalTimeMs: 1 }),
      run({ userId: "me", totalTimeMs: 2 }),
    ]);
    expect(findOwnRank(board, "me")).toMatchObject({ rank: 2 });
    expect(findOwnRank(board, "nobody")).toBeUndefined();
  });
});
