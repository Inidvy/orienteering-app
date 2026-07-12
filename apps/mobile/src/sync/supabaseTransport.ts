// Thin Supabase adapter for the tested sync orchestrator in
// @orienteering/run-engine. No logic here beyond row mapping — RLS lets the
// client insert raw payloads into its own rows only (write-authority 1A);
// statuses come back from the sync-run edge function, never from here.
// Re-sends use ON CONFLICT DO NOTHING (ignoreDuplicates): clients hold no
// UPDATE grants, so an upsert's DO UPDATE path would be denied by RLS.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ServerVerdict,
  SyncTransport,
} from "@orienteering/run-engine";
import type { TrackPoint } from "@orienteering/verification-core";
import type { SyncPayload } from "@orienteering/run-engine";

/** WKT LINESTRING M — GeoJSON has no M coordinate, WKT does. */
function trackToWkt(track: TrackPoint[]): string {
  const coords = track
    .map((p) => `${p.lon} ${p.lat} ${p.tMonotonicMs}`)
    .join(", ");
  return `LINESTRING M (${coords})`;
}

export function supabaseTransport(db: SupabaseClient): SyncTransport {
  return {
    async upsertRun(run: SyncPayload["run"], preRunAnchorIso?: string) {
      // RLS insert_own_runs requires runner = auth.uid(); the column is NOT NULL
      const { data: auth } = await db.auth.getUser();
      if (!auth.user) throw new Error("not signed in");
      const { error } = await db.from("runs").upsert(
        {
          id: run.id,
          runner: auth.user.id,
          course_id: run.courseId,
          clock_basis_lost: run.clockBasisLost,
          dnf: run.dnf,
          pre_run_anchor: preRunAnchorIso ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },

    async upsertPunches(runId: string, punches: SyncPayload["punches"]) {
      const { error } = await db.from("punches").upsert(
        punches.map((p) => ({
          id: p.id,
          run_id: runId,
          tag_uid: p.tagUid ?? null,
          flag_id: p.method === "nfc" ? null : p.flagId,
          method: p.method,
          t_monotonic_ms: p.tMonotonicMs,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },

    async upsertTrack(runId: string, track: TrackPoint[]) {
      const { error } = await db
        .from("tracks")
        .upsert(
          { run_id: runId, geom: trackToWkt(track) },
          { onConflict: "run_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },

    async invokeVerify(runId: string): Promise<ServerVerdict> {
      const { data, error } = await db.functions.invoke("sync-run", {
        body: { runId },
      });
      if (error) throw error;
      return data as ServerVerdict;
    },
  };
}
