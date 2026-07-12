// packages/verification-core/src/types.ts
var DEFAULT_TUNING = {
  version: 1,
  proximityToleranceM: 35,
  speedCeilingMps: 8,
  maxTrackGapS: 30,
  speedWindowS: 10,
  punchTrackToleranceS: 60
};

// packages/verification-core/src/geo.ts
var EARTH_RADIUS_M = 6371e3;
function distanceM(a, b) {
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la = toRad(a.lat);
  const lb = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// packages/verification-core/src/track.ts
function maxGapS(track, fromMs, toMs) {
  const pts = track.filter((p) => p.tMonotonicMs >= fromMs && p.tMonotonicMs <= toMs).sort((a, b) => a.tMonotonicMs - b.tMonotonicMs);
  if (pts.length === 0) return (toMs - fromMs) / 1e3;
  let max = (pts[0].tMonotonicMs - fromMs) / 1e3;
  for (let i = 1; i < pts.length; i++) {
    max = Math.max(max, (pts[i].tMonotonicMs - pts[i - 1].tMonotonicMs) / 1e3);
  }
  max = Math.max(max, (toMs - pts[pts.length - 1].tMonotonicMs) / 1e3);
  return max;
}
function speedCheckPasses(track, cfg) {
  const pts = [...track].sort((a, b) => a.tMonotonicMs - b.tMonotonicMs);
  if (pts.length < 3) return true;
  const speeds = [];
  for (let i = 1; i < pts.length; i++) {
    const dtS = (pts[i].tMonotonicMs - pts[i - 1].tMonotonicMs) / 1e3;
    if (dtS <= 0) continue;
    speeds.push({ v: distanceM(pts[i - 1], pts[i]) / dtS, tMs: pts[i].tMonotonicMs });
  }
  const windowMs = cfg.speedWindowS * 1e3;
  for (const s of speeds) {
    const inWindow = speeds.filter((x) => x.tMs >= s.tMs - windowMs && x.tMs <= s.tMs).map((x) => x.v).sort((a, b) => a - b);
    if (inWindow.length < 3) continue;
    const median = inWindow[Math.floor(inWindow.length / 2)];
    if (median > cfg.speedCeilingMps) return false;
  }
  return true;
}
function passesNearFlagAtPunchTime(track, flagPos, punchTMs, cfg) {
  const tolMs = cfg.punchTrackToleranceS * 1e3;
  return track.some(
    (p) => Math.abs(p.tMonotonicMs - punchTMs) <= tolMs && distanceM(p, flagPos) <= cfg.proximityToleranceM
  );
}

// packages/verification-core/src/legStatus.ts
function legStatus(leg, cfg) {
  const reasons = [];
  let status = "verified";
  const demoteTo = (s, reason) => {
    reasons.push(reason);
    if (s === "unverified" || status === "unverified") status = "unverified";
    else status = "partial";
  };
  if (!leg.startPunch) demoteTo("unverified", "missing_start_punch");
  if (!leg.endPunch) demoteTo("unverified", "missing_end_punch");
  let legTimeMs;
  if (leg.startPunch && leg.endPunch) {
    legTimeMs = leg.endPunch.tMonotonicMs - leg.startPunch.tMonotonicMs;
    if (legTimeMs <= 0) {
      demoteTo("unverified", "non_positive_leg_time");
      legTimeMs = void 0;
    }
  }
  if (leg.startPunch && leg.endPunch && legTimeMs !== void 0) {
    if (!passesNearFlagAtPunchTime(
      leg.track,
      leg.startFlagPos,
      leg.startPunch.tMonotonicMs,
      cfg
    )) {
      demoteTo("unverified", "track_not_near_start_flag");
    }
    if (!passesNearFlagAtPunchTime(
      leg.track,
      leg.endFlagPos,
      leg.endPunch.tMonotonicMs,
      cfg
    )) {
      demoteTo("unverified", "track_not_near_end_flag");
    }
    if (!speedCheckPasses(leg.track, cfg)) {
      demoteTo("unverified", "speed_ceiling_exceeded");
    }
    if (leg.startPunch.method !== "nfc") {
      demoteTo("partial", `start_punch_${leg.startPunch.method}`);
    }
    if (leg.endPunch.method !== "nfc") {
      demoteTo("partial", `end_punch_${leg.endPunch.method}`);
    }
    const gap = maxGapS(
      leg.track,
      leg.startPunch.tMonotonicMs,
      leg.endPunch.tMonotonicMs
    );
    if (gap > cfg.maxTrackGapS) {
      demoteTo("partial", `track_gap_${Math.round(gap)}s`);
    }
  }
  if (leg.clockBasisLost) demoteTo("partial", "clock_basis_lost");
  return { status, reasons, legTimeMs, configVersion: cfg.version };
}

// packages/verification-core/src/runStatus.ts
var RANK = {
  unverified: 0,
  partial: 1,
  verified: 2
};
function runStatus(legs, cfg) {
  if (legs.length === 0) {
    return {
      status: "unverified",
      legs,
      configVersion: cfg.version
    };
  }
  let worst = "verified";
  for (const leg of legs) {
    if (RANK[leg.status] < RANK[worst]) worst = leg.status;
  }
  const allTimed = legs.every((l) => l.legTimeMs !== void 0);
  const totalTimeMs = allTimed ? legs.reduce((sum, l) => sum + l.legTimeMs, 0) : void 0;
  return { status: worst, legs, totalTimeMs, configVersion: cfg.version };
}

// packages/verification-core/src/classes.ts
function ageBand(birthYear, runDate) {
  const age = runDate.getUTCFullYear() - birthYear;
  if (age < 14) return "U14";
  if (age < 18) return "U18";
  if (age < 40) return "open";
  if (age < 60) return "O40";
  return "O60";
}
function classOf(birthYear, gender, runDate) {
  return `${gender}-${ageBand(birthYear, runDate)}`;
}

// packages/verification-core/src/timeIntegrity.ts
function checkElapsedBound(elapsedMs, anchors) {
  if (anchors.preRunAnchorWallMs === void 0) {
    return { ok: false, capAt: "partial", reason: "no_pre_run_anchor" };
  }
  const windowMs = anchors.syncAnchorWallMs - anchors.preRunAnchorWallMs;
  if (elapsedMs > windowMs) {
    return { ok: false, capAt: "unverified", reason: "elapsed_exceeds_window" };
  }
  return { ok: true };
}

// packages/verification-core/src/leaderboard.ts
var CLASS_CHIPS = [
  "overall",
  "M",
  "W",
  "U14",
  "U18",
  "O40",
  "O60"
];
function matchesChip(run, chip) {
  if (chip === "overall") return true;
  const cls = classOf(
    run.birthYear,
    run.gender,
    new Date(run.completedAtMs)
  );
  if (chip === "M" || chip === "W") return cls.startsWith(`${chip}-`);
  return cls.endsWith(`-${chip}`);
}
function bestPerUser(runs) {
  const best = /* @__PURE__ */ new Map();
  for (const r of runs) {
    const prev = best.get(r.userId);
    if (!prev || r.totalTimeMs < prev.totalTimeMs || r.totalTimeMs === prev.totalTimeMs && r.completedAtMs < prev.completedAtMs) {
      best.set(r.userId, r);
    }
  }
  return [...best.values()];
}
function buildLeaderboard(runs, chip = "overall") {
  const inClass = runs.filter((r) => matchesChip(r, chip));
  const ranked = bestPerUser(inClass.filter((r) => r.status === "verified")).sort(
    (a, b) => a.totalTimeMs - b.totalTimeMs || a.completedAtMs - b.completedAtMs
  ).map((run, i) => ({ rank: i + 1, run }));
  const rankedUsers = new Set(ranked.map((e) => e.run.userId));
  const unranked = bestPerUser(inClass.filter((r) => r.status !== "verified")).filter((r) => !rankedUsers.has(r.userId)).sort((a, b) => a.totalTimeMs - b.totalTimeMs);
  return { ranked, unranked };
}
function findOwnRank(board, userId) {
  return board.ranked.find((e) => e.run.userId === userId);
}

// packages/verification-core/src/verifyRun.ts
function resolvePunches(raw, registry) {
  const byUid = new Map(registry.map((t) => [t.uid, t]));
  return raw.map((p) => {
    if (p.method === "nfc") {
      const tag = p.tagUid ? byUid.get(p.tagUid) : void 0;
      if (!tag) {
        return {
          uuid: p.uuid,
          flagId: p.flagId ?? "unknown",
          method: p.method,
          tMonotonicMs: p.tMonotonicMs,
          ok: false,
          reason: "unknown_tag"
        };
      }
      return {
        uuid: p.uuid,
        flagId: tag.flagId,
        method: p.method,
        tMonotonicMs: p.tMonotonicMs,
        ok: true
      };
    }
    return {
      uuid: p.uuid,
      flagId: p.flagId ?? "unknown",
      method: p.method,
      tMonotonicMs: p.tMonotonicMs,
      ok: p.flagId !== void 0
    };
  });
}
var RANK2 = {
  unverified: 0,
  partial: 1,
  verified: 2
};
function capStatus(s, cap) {
  return RANK2[s] <= RANK2[cap] ? s : cap;
}
function verifyRun(input) {
  const resolved = resolvePunches(input.punches, input.tagRegistry);
  const runReasons = [];
  const assigned = [];
  let minT = -Infinity;
  for (const flagId of input.courseFlagOrder) {
    const candidate = resolved.filter((p) => p.ok && p.flagId === flagId && p.tMonotonicMs > minT).sort((a, b) => a.tMonotonicMs - b.tMonotonicMs)[0];
    assigned.push(candidate);
    if (candidate) minT = candidate.tMonotonicMs;
  }
  const legs = [];
  for (let i = 1; i < input.courseFlagOrder.length; i++) {
    const startFlag = input.courseFlagOrder[i - 1];
    const endFlag = input.courseFlagOrder[i];
    legs.push(
      legStatus(
        {
          startPunch: assigned[i - 1],
          endPunch: assigned[i],
          startFlagPos: input.flagPositions[startFlag],
          endFlagPos: input.flagPositions[endFlag],
          track: input.track,
          clockBasisLost: input.clockBasisLost
        },
        input.cfg
      )
    );
  }
  let result = runStatus(legs, input.cfg);
  let status = result.status;
  const elapsed = result.totalTimeMs ?? (assigned[0] && assigned[assigned.length - 1] ? assigned[assigned.length - 1].tMonotonicMs - assigned[0].tMonotonicMs : void 0);
  if (elapsed !== void 0) {
    const bound = checkElapsedBound(elapsed, input.anchors);
    if (!bound.ok) {
      runReasons.push(bound.reason);
      status = capStatus(status, bound.capAt);
    }
  }
  return { ...result, status, runReasons };
}
export {
  CLASS_CHIPS,
  DEFAULT_TUNING,
  ageBand,
  buildLeaderboard,
  checkElapsedBound,
  classOf,
  distanceM,
  findOwnRank,
  legStatus,
  maxGapS,
  passesNearFlagAtPunchTime,
  resolvePunches,
  runStatus,
  speedCheckPasses,
  verifyRun
};
