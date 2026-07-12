import { classOf } from "./classes";
import type { CompetitionClass, Gender, TrustStatus } from "./types";

/*
 * Leaderboard semantics (v1, decisions in docs/design.md):
 *  - RANKS each user's best verified run only; ties broken by earlier completion
 *  - partial/unverified runs appear BELOW the ranked list, visibly unranked
 *    (the trust story made visible)
 *  - class chips (P7-D13-A, revised 2026-07-12): Overall · M · W plus every
 *    class SEPARATELY per gender (M-Elite, W-Elite, M-U14, W-U14, …) — a class
 *    view is the same data filtered by the runner's class at run date
 *  - DNF runs never reach a leaderboard (filtered before this module)
 */

export interface LeaderboardRun {
  runId: string;
  userId: string;
  displayName: string;
  birthYear: number;
  gender: Gender;
  status: TrustStatus;
  totalTimeMs: number;
  /** wall-clock completion (server sync anchor) — used for tie-breaks & class age */
  completedAtMs: number;
}

export type ClassChip = "overall" | Gender | CompetitionClass;

export const CLASS_CHIPS: ClassChip[] = [
  "overall",
  "M",
  "W",
  "M-Elite",
  "W-Elite",
  "M-U14",
  "W-U14",
  "M-U18",
  "W-U18",
  "M-O40",
  "W-O40",
  "M-O60",
  "W-O60",
];

export interface RankedEntry {
  rank: number;
  run: LeaderboardRun;
}

export interface Leaderboard {
  ranked: RankedEntry[];
  /** best non-verified attempt per user, shown unranked below the list */
  unranked: LeaderboardRun[];
}

function matchesChip(run: LeaderboardRun, chip: ClassChip): boolean {
  if (chip === "overall") return true;
  const cls: CompetitionClass = classOf(
    run.birthYear,
    run.gender,
    new Date(run.completedAtMs),
  );
  if (chip === "M" || chip === "W") return cls.startsWith(`${chip}-`);
  return cls === chip; // per-gender class chip, e.g. "W-Elite"
}

/**
 * Re-running a course within this window keeps the new run UNRANKED (user
 * decision 2026-07-12): route knowledge is fresh, so an immediate repeat
 * would be an unfair time. The run itself is stored and shows in history.
 */
export const RERUN_COOLDOWN_MS = 7 * 24 * 3600_000;

/**
 * Per user, chronologically: a run is rank-eligible only when 7+ days have
 * passed since that user's last ELIGIBLE run on this course (ineligible
 * re-runs don't reset the clock). Counts runs of any status — the cooldown
 * is about repeat attempts, not about verification.
 */
function rankEligible(runs: LeaderboardRun[]): Set<string> {
  const byUser = new Map<string, LeaderboardRun[]>();
  for (const r of runs) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const eligible = new Set<string>();
  for (const list of byUser.values()) {
    list.sort((a, b) => a.completedAtMs - b.completedAtMs);
    let lastEligibleMs = -Infinity;
    for (const r of list) {
      if (r.completedAtMs - lastEligibleMs >= RERUN_COOLDOWN_MS) {
        eligible.add(r.runId);
        lastEligibleMs = r.completedAtMs;
      }
    }
  }
  return eligible;
}

function bestPerUser(runs: LeaderboardRun[]): LeaderboardRun[] {
  const best = new Map<string, LeaderboardRun>();
  for (const r of runs) {
    const prev = best.get(r.userId);
    if (
      !prev ||
      r.totalTimeMs < prev.totalTimeMs ||
      (r.totalTimeMs === prev.totalTimeMs && r.completedAtMs < prev.completedAtMs)
    ) {
      best.set(r.userId, r);
    }
  }
  return [...best.values()];
}

export function buildLeaderboard(
  runs: LeaderboardRun[],
  chip: ClassChip = "overall",
): Leaderboard {
  const inClass = runs.filter((r) => matchesChip(r, chip));
  // cooldown is computed over ALL the user's runs (any status), then ranking
  // takes verified + eligible ones
  const eligible = rankEligible(inClass);

  const ranked = bestPerUser(
    inClass.filter((r) => r.status === "verified" && eligible.has(r.runId)),
  )
    .sort(
      (a, b) =>
        a.totalTimeMs - b.totalTimeMs || a.completedAtMs - b.completedAtMs,
    )
    .map((run, i) => ({ rank: i + 1, run }));

  // a user already ranked by a verified run doesn't reappear below with a
  // weaker attempt — the unranked section is for runners with NO verified run
  const rankedUsers = new Set(ranked.map((e) => e.run.userId));
  const unranked = bestPerUser(inClass.filter((r) => r.status !== "verified"))
    .filter((r) => !rankedUsers.has(r.userId))
    .sort((a, b) => a.totalTimeMs - b.totalTimeMs);

  return { ranked, unranked };
}

/** Index of the viewer's row in the ranked list, for the you-row pin (P3-8A). */
export function findOwnRank(
  board: Leaderboard,
  userId: string,
): RankedEntry | undefined {
  return board.ranked.find((e) => e.run.userId === userId);
}
