-- The profile settings screen should prefill the user's OWN email, but the
-- email column is deliberately unreadable to clients (0009: profiles is
-- world-readable). SECURITY DEFINER with a hard auth.uid() key returns only
-- the caller's own address — no parameter, nothing to enumerate.
-- Per the SECURITY DEFINER checklist: search_path pinned, EXECUTE revoked
-- from PUBLIC/anon, granted to authenticated only.
create or replace function get_own_email() returns text
language sql
security definer
set search_path = public
as $$
  select email from profiles where id = auth.uid();
$$;

revoke execute on function public.get_own_email() from public, anon;
grant execute on function public.get_own_email() to authenticated;
