-- Shared activity history for collaborative journeys.
create or replace function public.ryoko_record_audit_event(
  p_code text, p_trip uuid, p_event_type text, p_payload jsonb
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
  insert into public.ryoko_audit_events(trip_id, event_type, payload)
  values (p_trip, left(p_event_type, 80), coalesce(p_payload, '{}'::jsonb));
end; $$;

create or replace function public.ryoko_record_account_audit_event(
  p_trip uuid, p_event_type text, p_payload jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then
    raise exception 'Journey not linked to account';
  end if;
  insert into public.ryoko_audit_events(trip_id, event_type, payload)
  values (p_trip, left(p_event_type, 80), coalesce(p_payload, '{}'::jsonb));
end; $$;

create or replace function public.ryoko_list_audit_events(p_code text, p_trip uuid)
returns setof public.ryoko_audit_events
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_trips t
    where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all
    select 1 from public.ryoko_trip_members m
    where m.trip_id = p_trip and m.revoked_at is null
      and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  return query select * from public.ryoko_audit_events where trip_id = p_trip order by created_at desc limit 40;
end; $$;

create or replace function public.ryoko_list_account_audit_events(p_trip uuid)
returns setof public.ryoko_audit_events
language sql security definer set search_path = public as $$
  select e.* from public.ryoko_audit_events e
  where e.trip_id = p_trip
    and exists (select 1 from public.ryoko_account_trips a where a.trip_id = p_trip and a.user_id = auth.uid())
  order by e.created_at desc limit 40;
$$;

grant execute on function public.ryoko_record_audit_event(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.ryoko_record_account_audit_event(uuid, text, jsonb) to authenticated;
grant execute on function public.ryoko_list_audit_events(text, uuid) to anon, authenticated;
grant execute on function public.ryoko_list_account_audit_events(uuid) to authenticated;
