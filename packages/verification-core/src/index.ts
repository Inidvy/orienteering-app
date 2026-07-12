export * from "./types";
export { distanceM } from "./geo";
export { maxGapS, speedCheckPasses, passesNearFlagAtPunchTime } from "./track";
export { legStatus } from "./legStatus";
export { runStatus } from "./runStatus";
export { ageBand, classOf } from "./classes";
export { checkElapsedBound, type TimeBoundVerdict } from "./timeIntegrity";
export {
  buildLeaderboard,
  findOwnRank,
  CLASS_CHIPS,
  RERUN_COOLDOWN_MS,
  type ClassChip,
  type Leaderboard,
  type LeaderboardRun,
  type RankedEntry,
} from "./leaderboard";
export {
  resolvePunches,
  verifyRun,
  type RawPunch,
  type ResolvedPunch,
  type TagRecord,
  type VerifyRunInput,
  type VerifyRunOutput,
} from "./verifyRun";
