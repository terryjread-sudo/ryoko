-- Repair account linking on projects where the account migration was already run.
-- Supabase installs pgcrypto in the extensions schema; qualify crypt() everywhere.
create extension if not exists pgcrypto schema extensions;

create or replace function public.ryoko_link_account_trip(p_trip uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_code text := lower(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if normalized_code = '' or not exists (
    select 1
    from public.ryoko_trips t
    where t.id = p_trip
      and extensions.crypt(normalized_code, t.owner_code_hash) = t.owner_code_hash
    union all
    select 1
    from public.ryoko_trip_members m
    where m.trip_id = p_trip
      and m.revoked_at is null
      and extensions.crypt(normalized_code, m.code_hash) = m.code_hash
  ) then
    raise exception 'Invalid journey code';
  end if;

  insert into public.ryoko_account_trips(user_id, trip_id, access_code)
  values (auth.uid(), p_trip, normalized_code)
  on conflict (user_id, trip_id)
  do update set access_code = excluded.access_code;
end;
$$;

revoke all on function public.ryoko_link_account_trip(uuid, text) from public;
grant execute on function public.ryoko_link_account_trip(uuid, text) to authenticated;
