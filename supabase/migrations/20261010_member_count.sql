-- Expose only the active member count to collaborators who can already access a journey.
create or replace function public.ryoko_count_trip_members(p_trip uuid, p_code text default null)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_code text := lower(trim(coalesce(p_code, '')));
begin
  if normalized_code <> '' then
    if not exists (
      select 1 from public.ryoko_trips t
      where t.id = p_trip and extensions.crypt(normalized_code, t.owner_code_hash) = t.owner_code_hash
      union all
      select 1 from public.ryoko_trip_members m
      where m.trip_id = p_trip
        and m.revoked_at is null
        and extensions.crypt(normalized_code, m.code_hash) = m.code_hash
    ) then
      raise exception 'Invalid journey code';
    end if;
  elsif auth.uid() is null or not exists (
    select 1 from public.ryoko_account_trips a
    where a.trip_id = p_trip and a.user_id = auth.uid()
  ) then
    raise exception 'Journey access required';
  end if;

  return (
    select count(*)::integer
    from public.ryoko_trip_members m
    where m.trip_id = p_trip and m.revoked_at is null
  );
end;
$$;

revoke all on function public.ryoko_count_trip_members(uuid, text) from public;
grant execute on function public.ryoko_count_trip_members(uuid, text) to anon, authenticated;
