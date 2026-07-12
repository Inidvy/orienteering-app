-- Runners provide an email at onboarding — UNVERIFIED by design (user
-- decision 2026-07-12: the zero-friction anonymous login stays; the address
-- is contact/recovery info, not an auth factor).
--
-- profiles is world-readable (leaderboard names), so the email column must
-- NOT be: replace the table-wide SELECT grant with an explicit column list.
-- Emails are then readable only via service role (dashboard/SQL).
-- (is_admin stays in the list — the is_admin() RLS helper runs as the
-- calling role and reads it.)
alter table profiles add column if not exists email text;

grant insert (email), update (email) on public.profiles to authenticated;

revoke select on table public.profiles from anon, authenticated;
grant select (id, display_name, birth_year, gender, is_admin, created_at)
  on public.profiles to anon, authenticated;
