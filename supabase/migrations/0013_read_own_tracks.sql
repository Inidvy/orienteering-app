-- Run history shows each own run's ROUTE (user request 2026-07-12). Tracks
-- had no client SELECT policy at all; open exactly the runner's own tracks —
-- other people's movement data stays private (public replay is a post-v1
-- opt-in decision).
create policy read_own_tracks on tracks for select to authenticated
  using (exists (select 1 from runs r where r.id = run_id and r.runner = auth.uid()));
