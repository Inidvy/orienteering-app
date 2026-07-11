// sync-run: called by the app after (or during) connectivity.
// The CLIENT has already inserted its raw rows (runs/punches/tracks) under
// RLS with client-generated UUIDs — re-sends are idempotent upserts on the
// client side (decision 2A). This function:
//   1. stamps the server-side sync anchor (never trusted from the client)
//   2. runs authoritative verification over the stored raw data
//   3. returns statuses + reasons for the app's post-sync feedback slot
//
// Post-sync feedback contract (copy table): the app renders reasons like
// "punch at flag 3 failed verification — run marked unverified".

import { serviceClient, verifyStoredRun } from "../_shared/verify.ts";

Deno.serve(async (req) => {
  try {
    const { runId } = await req.json();
    if (typeof runId !== "string") {
      return Response.json({ error: "runId required" }, { status: 400 });
    }

    const db = serviceClient();

    // 1. server-side sync anchor (D19: wall-clock truth the client can't fake)
    const { error: anchorErr } = await db
      .from("runs")
      .update({ sync_anchor: new Date().toISOString() })
      .eq("id", runId)
      .is("sync_anchor", null); // first sync wins; re-syncs keep the anchor
    if (anchorErr) throw anchorErr;

    // 2 + 3. verify and respond
    const out = await verifyStoredRun(db, runId);
    return Response.json({
      status: out.status,
      runReasons: out.runReasons,
      totalTimeMs: out.totalTimeMs ?? null,
      legs: out.legs.map((l, i) => ({
        legIndex: i,
        status: l.status,
        reasons: l.reasons,
        legTimeMs: l.legTimeMs ?? null,
      })),
      configVersion: out.configVersion,
    });
  } catch (e) {
    console.error("sync-run failed", e);
    return Response.json({ error: "verification_failed" }, { status: 500 });
  }
});
