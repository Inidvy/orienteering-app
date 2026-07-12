-- Let the app (and website) browse courses/flags WITHOUT logging in. Only the
-- public, non-sensitive tables. Writing runs still requires auth; write
-- authority (verification) is unchanged.

create policy anon_read_flags on flags for select to anon using (true);
create policy anon_read_courses on courses for select to anon using (true);
create policy anon_read_course_flags on course_flags for select to anon using (true);
create policy anon_read_configs on tuning_configs for select to anon using (true);
create policy anon_read_leg_splits on leg_splits for select to anon using (true);
create policy anon_read_runs on runs for select to anon using (true);
create policy anon_read_profiles on profiles for select to anon using (true);

grant select on flag_coords to anon;
grant select on track_coords to anon;
