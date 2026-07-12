-- Punch sync failed with "new row violates row-level security" (2026-07-12):
-- Postgres evaluates SELECT policies during INSERT ... ON CONFLICT DO NOTHING
-- (the idempotent re-send path), and punches had NO client SELECT policy at
-- all. Allow reading punches of the runner's OWN runs — mirrors
-- read_own_tracks (0013); other runners' raw punches stay private.
create policy read_own_punches on punches for select to authenticated
  using (exists (select 1 from runs r where r.id = run_id and r.runner = auth.uid()));
