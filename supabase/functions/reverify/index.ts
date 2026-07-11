// reverify: recompute statuses over stored raw data (decision D22-A).
// Statuses are derived data — a pure function of raw punches/tracks plus the
// versioned tuning config. Call this after changing tuning_configs (field
// tuning) to re-judge affected runs fairly. Re-judged leaderboard entries
// show "re-verified under updated rules" in the app (config_version changes).
//
// Body: { runId?: string }  — one run, or every run when omitted (admin use).

import { serviceClient, verifyStoredRun } from "../_shared/verify.ts";

Deno.serve(async (req) => {
  try {
    const { runId } = await req.json().catch(() => ({}));
    const db = serviceClient();

    if (typeof runId === "string") {
      const out = await verifyStoredRun(db, runId);
      return Response.json({ reverified: 1, status: out.status });
    }

    const { data: runs, error } = await db
      .from("runs")
      .select("id")
      .not("sync_anchor", "is", null);
    if (error) throw error;

    let count = 0;
    for (const r of runs ?? []) {
      await verifyStoredRun(db, r.id);
      count++;
    }
    return Response.json({ reverified: count });
  } catch (e) {
    console.error("reverify failed", e);
    return Response.json({ error: "reverify_failed" }, { status: 500 });
  }
});
