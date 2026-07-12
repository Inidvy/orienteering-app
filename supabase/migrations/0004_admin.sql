-- Admin write access. A profile flagged is_admin may create/edit flags, tags,
-- courses and resolve reports; everyone else stays read-only on those tables
-- (write-authority boundary, decision 1A). Flip a user to admin manually:
--   update profiles set is_admin = true where id = '<uuid>';

alter table profiles add column if not exists is_admin boolean not null default false;

create or replace function is_admin() returns boolean
language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin);
$$;

create policy admin_write_flags on flags for all to authenticated
  using (is_admin()) with check (is_admin());
create policy admin_write_tags on tags for all to authenticated
  using (is_admin()) with check (is_admin());
create policy admin_write_courses on courses for all to authenticated
  using (is_admin()) with check (is_admin());
create policy admin_write_course_flags on course_flags for all to authenticated
  using (is_admin()) with check (is_admin());
create policy admin_resolve_reports on flag_reports for update to authenticated
  using (is_admin()) with check (is_admin());
