-- Journey-level Instagram inspiration, separate from dated itinerary items.
create table if not exists public.ryoko_trip_instagram_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  canonical_url text not null,
  content text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (trip_id, canonical_url)
);

alter table public.ryoko_trip_instagram_items enable row level security;

create or replace function public.ryoko_list_trip_instagram(p_code text, p_trip uuid)
returns setof public.ryoko_trip_instagram_items
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  return query select i.* from public.ryoko_trip_instagram_items i where i.trip_id = p_trip order by i.sort_order, i.created_at;
end; $$;

create or replace function public.ryoko_list_account_instagram(p_trip uuid)
returns setof public.ryoko_trip_instagram_items
language sql security definer set search_path = public as $$
  select i.* from public.ryoko_trip_instagram_items i
  where i.trip_id = p_trip and exists (select 1 from public.ryoko_account_trips a where a.trip_id = p_trip and a.user_id = auth.uid())
  order by i.sort_order, i.created_at;
$$;

create or replace function public.ryoko_save_trip_instagram(p_code text, p_trip uuid, p_content text, p_canonical_url text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare result uuid;
begin
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  insert into public.ryoko_trip_instagram_items(trip_id, canonical_url, content)
  values (p_trip, p_canonical_url, p_content)
  on conflict (trip_id, canonical_url) do update set content = excluded.content
  returning id into result;
  return result;
end; $$;

create or replace function public.ryoko_save_account_instagram(p_trip uuid, p_content text, p_canonical_url text)
returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid;
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then raise exception 'Journey not linked to account'; end if;
  insert into public.ryoko_trip_instagram_items(trip_id, canonical_url, content)
  values (p_trip, p_canonical_url, p_content)
  on conflict (trip_id, canonical_url) do update set content = excluded.content
  returning id into result;
  return result;
end; $$;

create or replace function public.ryoko_delete_trip_instagram(p_code text, p_trip uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  delete from public.ryoko_trip_instagram_items where id = p_item and trip_id = p_trip;
end; $$;

create or replace function public.ryoko_delete_account_instagram(p_trip uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then raise exception 'Journey not linked to account'; end if;
  delete from public.ryoko_trip_instagram_items where id = p_item and trip_id = p_trip;
end; $$;

create or replace function public.ryoko_move_trip_instagram_to_day(p_code text, p_trip uuid, p_item uuid, p_day uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare library_item public.ryoko_trip_instagram_items; result uuid;
begin
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  if not exists (select 1 from public.ryoko_trip_days where id = p_day and trip_id = p_trip) then raise exception 'Destination day not found'; end if;
  select * into library_item from public.ryoko_trip_instagram_items where id = p_item and trip_id = p_trip;
  if library_item.id is null then raise exception 'Instagram inspiration not found'; end if;
  insert into public.ryoko_day_items(day_id, kind, content) values (p_day, 'instagram', library_item.content) returning id into result;
  delete from public.ryoko_trip_instagram_items where id = p_item;
  return result;
end; $$;

create or replace function public.ryoko_move_account_instagram_to_day(p_trip uuid, p_item uuid, p_day uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare library_item public.ryoko_trip_instagram_items; result uuid;
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then raise exception 'Journey not linked to account'; end if;
  if not exists (select 1 from public.ryoko_trip_days where id = p_day and trip_id = p_trip) then raise exception 'Destination day not found'; end if;
  select * into library_item from public.ryoko_trip_instagram_items where id = p_item and trip_id = p_trip;
  if library_item.id is null then raise exception 'Instagram inspiration not found'; end if;
  insert into public.ryoko_day_items(day_id, kind, content) values (p_day, 'instagram', library_item.content) returning id into result;
  delete from public.ryoko_trip_instagram_items where id = p_item;
  return result;
end; $$;

revoke all on function public.ryoko_list_trip_instagram(text, uuid) from public;
revoke all on function public.ryoko_list_account_instagram(uuid) from public;
revoke all on function public.ryoko_save_trip_instagram(text, uuid, text, text) from public;
revoke all on function public.ryoko_save_account_instagram(uuid, text, text) from public;
revoke all on function public.ryoko_delete_trip_instagram(text, uuid, uuid) from public;
revoke all on function public.ryoko_delete_account_instagram(uuid, uuid) from public;
revoke all on function public.ryoko_move_trip_instagram_to_day(text, uuid, uuid, uuid) from public;
revoke all on function public.ryoko_move_account_instagram_to_day(uuid, uuid, uuid) from public;
grant execute on function public.ryoko_list_trip_instagram(text, uuid) to anon, authenticated;
grant execute on function public.ryoko_list_account_instagram(uuid) to authenticated;
grant execute on function public.ryoko_save_trip_instagram(text, uuid, text, text) to anon, authenticated;
grant execute on function public.ryoko_save_account_instagram(uuid, text, text) to authenticated;
grant execute on function public.ryoko_delete_trip_instagram(text, uuid, uuid) to anon, authenticated;
grant execute on function public.ryoko_delete_account_instagram(uuid, uuid) to authenticated;
grant execute on function public.ryoko_move_trip_instagram_to_day(text, uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.ryoko_move_account_instagram_to_day(uuid, uuid, uuid) to authenticated;
