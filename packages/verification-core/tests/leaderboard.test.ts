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
      run({ userId: "a", displayName: "A", totalTimeMs: 38_000 }), // A's best
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

describe("buildLeaderboard — class chips (P7-D13-A)", () => {
  const mixed = [
    run({ userId: "m-open", gender: "M", birthYear: 1995, totalTimeMs: 1 }),
    run({ userId: "w-open", gender: "W", birthYear: 1995, totalTimeMs: 2 }),
    run({ userId: "m-o40", gender: "M", birthYear: 1980, totalTimeMs: 3 }),
    run({ userId: "w-u18", gender: "W", birthYear: 2010, totalTimeMs: 4 }),
  ];

  it("overall includes everyone", () => {
    expect(buildLeaderboard(mixed, "overall").ranked).toHaveLength(4);
  });

  it("gender chips filter by gender across ages", () => {
    expect(
      buildLeaderboard(mixed, "W").ranked.map((e) => e.run.userId),
    ).toEqual(["w-open", "w-u18"]);
  });

  it("age-band chips filter by class at run date", () => {
    expect(
      buildLeaderboard(mixed, "O40").ranked.map((e) => e.run.userId),
    ).toEqual(["m-o40"]);
    expect(
      buildLeaderboard(mixed, "U18").ranked.map((e) => e.run.userId),
    ).toEqual(["w-u18"]);
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
