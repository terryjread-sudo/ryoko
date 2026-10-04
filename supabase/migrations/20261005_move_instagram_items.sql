-- Move saved Instagram items between itinerary days without deleting and recreating them.
create or replace function public.ryoko_move_item(
  p_code text, p_trip uuid, p_item uuid, p_from_day uuid, p_to_day uuid
)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_trips t
    where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all
    select 1 from public.ryoko_trip_members m
    where m.trip_id = p_trip and m.revoked_at is null
      and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  if not exists (select 1 from public.ryoko_trip_days where id = p_to_day and trip_id = p_trip) then
    raise exception 'Destination day not found';
  end if;
  update public.ryoko_day_items
  set day_id = p_to_day
  where id = p_item and day_id = p_from_day and kind = 'instagram';
end; $$;

create or replace function public.ryoko_move_account_item(
  p_trip uuid, p_item uuid, p_from_day uuid, p_to_day uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then
    raise exception 'Journey not linked to account';
  end if;
  if not exists (select 1 from public.ryoko_trip_days where id = p_to_day and trip_id = p_trip) then
    raise exception 'Destination day not found';
  end if;
  update public.ryoko_day_items i
  set day_id = p_to_day
  where i.id = p_item and i.day_id = p_from_day and i.kind = 'instagram'
    and exists (select 1 from public.ryoko_trip_days d where d.id = p_from_day and d.trip_id = p_trip);
end; $$;

revoke all on function public.ryoko_move_item(text, uuid, uuid, uuid, uuid) from public;
revoke all on function public.ryoko_move_account_item(uuid, uuid, uuid, uuid) from public;
grant execute on function public.ryoko_move_item(text, uuid, uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.ryoko_move_account_item(uuid, uuid, uuid, uuid) to authenticated;
