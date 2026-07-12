-- Tuning v2 (user decision 2026-07-12): the track must pass within 10 m of
-- the flag at punch time (was 35 m) so a punch can't verify from a distance —
-- fewer false positives. Tradeoff accepted: under canopy GPS drifts
-- ±10-20 m, so some honest runs will demote to partial; the app now records
-- at 1 Hz to give the check a dense track. Statuses are re-runnable (D22-A):
-- existing runs keep config_version 1 until reverified.
insert into tuning_configs
  (version, proximity_tolerance_m, speed_ceiling_mps, max_track_gap_s,
   speed_window_s, punch_track_tolerance_s)
values (2, 10, 8, 30, 10, 60);
