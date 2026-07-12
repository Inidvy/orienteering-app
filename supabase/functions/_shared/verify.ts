// Shared verification I/O used by sync-run and reverify.
// All trust logic lives in @orienteering/verification-core (decision 3A);
// this module only fetches rows, calls verifyRun, and writes results with
// the service role (write-authority decision 1A).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
// bundled from packages/verification-core by `npm run bundle:functions` —
// a build artifact, not a second implementation (decision 3A still holds)
// @ts-ignore bundled JS module
import { verifyRun } from "./verification-core.mjs";

type RawPunch = {
  uuid: string;
  tagUid?: string;
  flagId?: string;
  method: "nfc" | "qr" | "manual";
  tMonotonicMs: number;
};
type TagRecord = { uid: string; flagId: string; retiredAtMs?: number };
type TrackPoint = { lat: number; lon: number; tMonotonicMs: number };
type TuningConfig = {
  version: number;
  proximityToleranceM: number;
  speedCeilingMps: number;
  maxTrackGapS: number;
  speedWindowS: number;
  punchTrackToleranceS: number;
};
type VerifyRunOutput = {
  status: "verified" | "partial" | "unverified";
  runReasons: string[];
  totalTimeMs?: number;
  configVersion: number;
  legs: {
    status: "verified" | "partial" | "unverified";
    reasons: string[];
    legTimeMs?: number;
    configVersion: number;
  }[];
};

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function loadTuning(db: SupabaseClient): Promise<TuningConfig> {
  const { data, error } = await db
    .from("tuning_configs")
    .select("*")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return {
    version: data.version,
    proximityToleranceM: Number(data.proximity_tolerance_m),
    speedCeilingMps: Number(data.speed_ceiling_mps),
    maxTrackGapS: Number(data.max_track_gap_s),
    speedWindowS: Number(data.speed_window_s),
    punchTrackToleranceS: Number(data.punch_track_tolerance_s),
  };
}

/** Verify one run from stored raw data and persist statuses + leg_splits. */
export async function verifyStoredRun(
  db: SupabaseClient,
  runId: string,
): Promise<VerifyRunOutput> {
  const { data: run, error: runErr } = await db
    .from("runs")
    .select("id, course_id, clock_basis_lost, pre_run_anchor, sync_anchor")
    .eq("id", runId)
    .single();
  if (runErr) throw runErr;

  const [{ data: courseFlags }, { data: punches }, { data: trackPts }, tags, cfg] =
    await Promise.all([
      db
        .from("course_flags")
        .select("flag_id, position")
        .eq("course_id", run.course_id)
        .order("position"),
      db.from("punches").select("*").eq("run_id", runId),
      db.from("track_coords").select("lat, lon, m").eq("run_id", runId),
      db.from("tags").select("uid, flag_id, retired_at"),
      loadTuning(db),
    ]);

  const courseFlagOrder = (courseFlags ?? []).map((cf: any) => cf.flag_id);
  // geography comes back as WKB hex via PostgREST — read plain numbers from
  // the flag_coords view instead
  const { data: flagRows, error: flagErr } = await db
    .from("flag_coords")
    .select("flag_id, lat, lon")
    .in("flag_id", courseFlagOrder);
  if (flagErr) throw flagErr;
  const flagPositions: Record<string, { lat: number; lon: number }> = {};
  for (const f of flagRows ?? []) {
    flagPositions[f.flag_id] = { lat: Number(f.lat), lon: Number(f.lon) };
  }

  const rawPunches: RawPunch[] = (punches ?? []).map((p: any) => ({
    uuid: p.id,
    tagUid: p.tag_uid ?? undefined,
    flagId: p.flag_id ?? undefined,
    method: p.method,
    tMonotonicMs: Number(p.t_monotonic_ms),
  }));

  const registry: TagRecord[] = (tags.data ?? []).map((t: any) => ({
    uid: t.uid,
    flagId: t.flag_id,
    retiredAtMs: t.retired_at ? Date.parse(t.retired_at) : undefined,
  }));

  const track: TrackPoint[] = (trackPts ?? []).map((p: any) => ({
    lon: Number(p.lon),
    lat: Number(p.lat),
    tMonotonicMs: Number(p.m),
  }));

  const out = verifyRun({
    courseFlagOrder,
    flagPositions,
    punches: rawPunches,
    tagRegistry: registry,
    track,
    clockBasisLost: run.clock_basis_lost,
    anchors: {
      preRunAnchorWallMs: run.pre_run_anchor
        ? Date.parse(run.pre_run_anchor)
        : undefined,
      syncAnchorWallMs: run.sync_anchor
        ? Date.parse(run.sync_anchor)
        : Date.now(),
    },
    cfg,
  });

  const { error: updErr } = await db
    .from("runs")
    .update({
      status: out.status,
      status_reasons: out.runReasons,
      total_time_ms: out.totalTimeMs ?? null,
      config_version: cfg.version,
    })
    .eq("id", runId);
  if (updErr) throw updErr;

  const splitRows = out.legs.map((leg, i) => ({
    run_id: runId,
    leg_index: i,
    leg_time_ms: leg.legTimeMs ?? null,
    status: leg.status,
    status_reasons: leg.reasons,
    config_version: cfg.version,
  }));
  const { error: splitErr } = await db
    .from("leg_splits")
    .upsert(splitRows, { onConflict: "run_id,leg_index" });
  if (splitErr) throw splitErr;

  return out;
}
