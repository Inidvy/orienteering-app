// Load verified/partial/unverified runs for a course from the live DB.
// Ranking itself happens in @orienteering/verification-core (buildLeaderboard,
// used by LeaderboardScreen) — this is only the row fetch, following the
// query pattern from src/courses.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import {
  buildLeaderboard,
  classOf,
  type Gender,
  type LeaderboardRun,
  type TrustStatus,
} from "@orienteering/verification-core";

export async function loadLeaderboard(courseId: string): Promise<LeaderboardRun[]> {
  const { data, error } = await supabase
    .from("runs")
    .select(
      "id, runner, status, total_time_ms, sync_anchor, created_at, profiles(display_name, birth_year, gender)",
    )
    .eq("course_id", courseId)
    .eq("dnf", false)
    .not("status", "is", null);
  if (error) throw error;
  const rows: LeaderboardRun[] = [];
  for (const r of data ?? []) {
    const p = (r as any).profiles;
    if (!p) continue;
    rows.push({
      runId: (r as any).id,
      userId: (r as any).runner,
      displayName: p.display_name,
      birthYear: p.birth_year,
      gender: p.gender,
      status: (r as any).status,
      totalTimeMs: Number((r as any).total_time_ms ?? 0),
      completedAtMs: Date.parse((r as any).sync_anchor ?? (r as any).created_at),
    });
  }
  return rows;
}

export interface MyRunSplit {
  legIndex: number;
  legTimeMs: number | null;
  status: TrustStatus;
}

export interface MyRun {
  runId: string;
  courseId: string;
  courseName: string;
  /** null until the server verdict arrived (pending sync) */
  status: TrustStatus | null;
  totalTimeMs: number | null;
  dnf: boolean;
  completedAtMs: number;
  splits: MyRunSplit[];
}

/** The viewer's own runs, newest first, with per-leg splits (run history). */
export async function loadMyRuns(): Promise<MyRun[]> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return [];
  const { data: runs, error } = await supabase
    .from("runs")
    .select("id, course_id, status, total_time_ms, dnf, sync_anchor, created_at, courses(name)")
    .eq("runner", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (runs ?? []).map((r: any) => r.id);
  const { data: splits } = ids.length
    ? await supabase
        .from("leg_splits")
        .select("run_id, leg_index, leg_time_ms, status")
        .in("run_id", ids)
        .order("leg_index")
    : { data: [] };
  const byRun = new Map<string, MyRunSplit[]>();
  for (const s of splits ?? []) {
    const list = byRun.get((s as any).run_id) ?? [];
    list.push({
      legIndex: (s as any).leg_index,
      legTimeMs: (s as any).leg_time_ms != null ? Number((s as any).leg_time_ms) : null,
      status: (s as any).status,
    });
    byRun.set((s as any).run_id, list);
  }
  return (runs ?? []).map((r: any) => ({
    runId: r.id,
    courseId: r.course_id,
    courseName: r.courses?.name ?? "course",
    status: r.status ?? null,
    totalTimeMs: r.total_time_ms != null ? Number(r.total_time_ms) : null,
    dnf: !!r.dnf,
    completedAtMs: Date.parse(r.sync_anchor ?? r.created_at),
    splits: byRun.get(r.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Run routes for the history (user decision 2026-07-12): the track is cached
// ON DEVICE at the finish (works offline/pre-sync, newest 20 runs) and falls
// back to the server copy (tracks table, own-runs read policy 0013).
// ---------------------------------------------------------------------------

const trackKey = (runId: string) => `run-track-${runId}`;
const TRACK_INDEX = "run-track-index";
const TRACK_CACHE_MAX = 20;

export async function saveLocalTrack(
  runId: string,
  track: { lat: number; lon: number }[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(trackKey(runId), JSON.stringify(track));
    const idx: string[] = JSON.parse((await AsyncStorage.getItem(TRACK_INDEX)) ?? "[]");
    const next = [runId, ...idx.filter((id) => id !== runId)];
    for (const old of next.slice(TRACK_CACHE_MAX)) {
      await AsyncStorage.removeItem(trackKey(old));
    }
    await AsyncStorage.setItem(TRACK_INDEX, JSON.stringify(next.slice(0, TRACK_CACHE_MAX)));
  } catch {
    // cache only — losing it is fine, the server copy remains
  }
}

/** Route of one own run: local cache first, then the server track. */
export async function loadRunTrack(
  runId: string,
): Promise<{ lat: number; lon: number }[]> {
  try {
    const local = await AsyncStorage.getItem(trackKey(runId));
    if (local) return JSON.parse(local);
  } catch {}
  const { data } = await supabase
    .from("track_coords")
    .select("lat, lon, m")
    .eq("run_id", runId)
    .order("m");
  return (data ?? []).map((p: any) => ({ lat: Number(p.lat), lon: Number(p.lon) }));
}

export interface LegStat {
  bestMs: number;
  avgMs: number;
  /** verified splits that produced the numbers */
  count: number;
}

/**
 * Best + average VERIFIED split per leg of a course, across all runners —
 * the comparison row on the run detail page.
 */
export async function loadCourseSplitStats(
  courseId: string,
): Promise<Record<number, LegStat>> {
  const { data } = await supabase
    .from("leg_splits")
    .select("leg_index, leg_time_ms, status, runs!inner(course_id)")
    .eq("runs.course_id", courseId)
    .eq("status", "verified")
    .not("leg_time_ms", "is", null);
  const byLeg = new Map<number, number[]>();
  for (const r of data ?? []) {
    const leg = (r as any).leg_index as number;
    const list = byLeg.get(leg) ?? [];
    list.push(Number((r as any).leg_time_ms));
    byLeg.set(leg, list);
  }
  const stats: Record<number, LegStat> = {};
  for (const [leg, times] of byLeg) {
    stats[leg] = {
      bestMs: Math.min(...times),
      avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      count: times.length,
    };
  }
  return stats;
}

export interface ClassStats {
  /** e.g. "M Elite" */
  classLabel: string;
  bestMs: number;
  avgMs: number;
  /** ranked (verified) runners in the class; 0 = class is still empty */
  count: number;
}

/**
 * Best + average verified time on a course within the viewer's own class,
 * shown on the course detail screen BEFORE the run. Class rules come from
 * verification-core (classOf/buildLeaderboard) — best per runner, class at
 * run date, verified only.
 */
export async function loadOwnClassStats(courseId: string): Promise<ClassStats | null> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("birth_year, gender")
    .eq("id", uid)
    .maybeSingle();
  if (!prof) return null;

  const cls = classOf(prof.birth_year as number, prof.gender as Gender, new Date());
  const board = buildLeaderboard(await loadLeaderboard(courseId), cls);
  const times = board.ranked.map((e) => e.run.totalTimeMs);
  return {
    classLabel: cls.replace("-", " "),
    bestMs: times.length ? Math.min(...times) : 0,
    avgMs: times.length
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0,
    count: times.length,
  };
}
