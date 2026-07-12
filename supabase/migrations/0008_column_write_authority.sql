-- Column-level write authority (anonymous-sign-in RLS review, 2026-07-12).
--
-- RLS row policies alone let a client set ANY column on rows it may insert or
-- update. Two real holes followed:
--   1. profiles: update_own_profile allowed `set is_admin = true` on your own
--      row -> full admin write access (privilege escalation).
--   2. runs: insert_own_runs allowed inserting status='verified' +
--      total_time_ms directly -> fake verified leaderboard entries without
--      ever passing verification.
-- Postgres column grants close both: write access only to raw-payload columns;
-- status/admin columns stay service-role only (write-authority decision 1A).

-- profiles: is_admin is service-role only. (id stays in the UPDATE grant:
-- PostgREST upserts SET every sent column incl. the pk; RLS with_check keeps
-- it pinned to auth.uid().)
revoke insert, update, delete on table public.profiles from anon, authenticated;
grant insert (id, display_name, birth_year, gender) on public.profiles to authenticated;
grant update (id, display_name, birth_year, gender) on public.profiles to authenticated;

-- runs: status, status_reasons, total_time_ms, config_version, sync_anchor
-- are service-role only. Client re-sends use ON CONFLICT DO NOTHING, so no
-- UPDATE grant is needed.
revoke insert, update, delete on table public.runs from anon, authenticated;
grant insert (id, runner, course_id, started_wall_guess, pre_run_anchor,
  clock_basis_lost, dnf) on public.runs to authenticated;

-- punches: validated is service-role only. flag_id stays client-writable —
-- it is the qr/manual punch claim; the manual rule demotes those legs anyway.
revoke insert, update, delete on table public.punches from anon, authenticated;
grant insert (id, run_id, tag_uid, method, t_monotonic_ms, validation_payload,
  flag_id) on public.punches to authenticated;

-- tracks: geom only; leg_splits + tuning_configs: clients never write at all.
-- Dropping the default write grants is defense in depth under a future policy
-- mistake (RLS already default-denies these).
revoke insert, update, delete on table public.tracks from anon, authenticated;
grant insert (run_id, geom) on public.tracks to authenticated;
revoke insert, update, delete on table public.leg_splits from anon, authenticated;
revoke insert, update, delete on table public.tuning_configs from anon, authenticated;

-- PostGIS system table: extension-owned, RLS cannot be enabled (advisor 0013);
-- removing the write grants is the available mitigation.
revoke insert, update, delete on table public.spatial_ref_sys from anon, authenticated;

-- Advisor 0011: pin search_path on our functions (is_admin runs inside RLS).
alter function public.is_admin() set search_path = public;
alter function public.gen_ufid() set search_path = public;
alter function public.flags_defaults() set search_path = public;

-- Advisors 0028/0029: attempted revoke on PostGIS' st_estimatedextent.
-- INEFFECTIVE in practice (verified post-apply): the grants belong to
-- supabase_admin, so postgres cannot revoke them. Finding ACCEPTED — the
-- function only estimates a geometry column's bounding box, and flag
-- positions are public reads in this app anyway.
revoke execute on function public.st_estimatedextent(text, text) from anon, authenticated;
revoke execute on function public.st_estimatedextent(text, text, text) from anon, authenticated;
revoke execute on function public.st_estimatedextent(text, text, text, boolean) from anon, authenticated;
