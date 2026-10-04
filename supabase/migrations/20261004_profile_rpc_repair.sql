-- Apply this repair if the account migration was partially applied.
create extension if not exists pgcrypto schema extensions;
create table if not exists public.ryoko_account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_color text not null default '#735fa6',
  updated_at timestamptz not null default now()
);

alter table public.ryoko_trips add column if not exists archived_at timestamptz;
alter table public.ryoko_trips add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.ryoko_account_profiles enable row level security;
drop policy if exists ryoko_account_profile_owner on public.ryoko_account_profiles;
create policy ryoko_account_profile_owner on public.ryoko_account_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.ryoko_save_account_profile(p_display_name text, p_avatar_color text)
returns void language sql security invoker set search_path = public as $$
  insert into public.ryoko_account_profiles(user_id, display_name, avatar_color, updated_at)
  values (auth.uid(), nullif(trim(p_display_name), ''), p_avatar_color, now())
  on conflict (user_id) do update set display_name = excluded.display_name, avatar_color = excluded.avatar_color, updated_at = now();
$$;

create or replace function public.ryoko_get_account_profile()
returns table(display_name text, avatar_color text)
language sql security invoker set search_path = public as $$
  select display_name, avatar_color from public.ryoko_account_profiles where user_id = auth.uid();
$$;

create table if not exists public.ryoko_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ryoko_admins enable row level security;
drop policy if exists ryoko_admins_self on public.ryoko_admins;
create policy ryoko_admins_self on public.ryoko_admins for select using (auth.uid() = user_id);

create or replace function public.ryoko_is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.ryoko_admins where user_id = auth.uid());
$$;

create or replace function public.ryoko_list_account_trips()
returns table(trip_id uuid, name text, start_date date, end_date date, linked_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.start_date, t.end_date, a.linked_at
  from public.ryoko_account_trips a
  join public.ryoko_trips t on t.id = a.trip_id
  where a.user_id = auth.uid() and t.archived_at is null
  order by a.linked_at desc;
$$;

grant execute on function public.ryoko_get_account_profile() to authenticated;
grant execute on function public.ryoko_save_account_profile(text, text) to authenticated;
grant execute on function public.ryoko_is_admin() to authenticated;
grant execute on function public.ryoko_list_account_trips() to authenticated;

-- Reassert SECURITY DEFINER for projects where the earlier account migration
-- created this function as SECURITY INVOKER.
create or replace function public.ryoko_list_account_trips()
returns table(trip_id uuid, name text, start_date date, end_date date, linked_at timestamptz)
language sql security definer set search_path = public, extensions as $$
  select t.id, t.name, t.start_date, t.end_date, a.linked_at
  from public.ryoko_account_trips a
  join public.ryoko_trips t on t.id = a.trip_id
  where a.user_id = auth.uid() and t.archived_at is null
  order by a.linked_at desc;
$$;
grant execute on function public.ryoko_list_account_trips() to authenticated;

create or replace function public.ryoko_link_account_trip(p_trip uuid, p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all
    select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  insert into public.ryoko_account_trips(user_id, trip_id, access_code)
  values (auth.uid(), p_trip, lower(trim(p_code)))
  on conflict (user_id, trip_id) do update set access_code = excluded.access_code;
end; $$;
grant execute on function public.ryoko_link_account_trip(uuid, text) to authenticated;

create or replace function public.ryoko_delete_day(p_code text, p_trip uuid, p_day uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  delete from public.ryoko_trip_days where id = p_day and trip_id = p_trip;
end; $$;

create or replace function public.ryoko_delete_account_day(p_trip uuid, p_day uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then raise exception 'Journey not linked to account'; end if;
  delete from public.ryoko_trip_days where id = p_day and trip_id = p_trip;
end; $$;

grant execute on function public.ryoko_delete_day(text, uuid, uuid) to anon, authenticated;
grant execute on function public.ryoko_delete_account_day(uuid, uuid) to authenticated;

create or replace function public.ryoko_list_day_items(p_code text, p_trip uuid, p_day uuid)
returns setof public.ryoko_day_items language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  return query select i.* from public.ryoko_day_items i where i.day_id = p_day and i.kind = 'instagram' order by i.sort_order, i.created_at;
end; $$;

create or replace function public.ryoko_list_account_day_items(p_trip uuid, p_day uuid)
returns setof public.ryoko_day_items language sql security definer set search_path = public as $$
  select i.* from public.ryoko_day_items i where i.day_id = p_day and i.kind = 'instagram'
  and exists (select 1 from public.ryoko_account_trips a where a.trip_id = p_trip and a.user_id = auth.uid())
  order by i.sort_order, i.created_at;
$$;

create or replace function public.ryoko_delete_item(p_code text, p_trip uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and extensions.crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and extensions.crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  delete from public.ryoko_day_items where id = p_item;
end; $$;

create or replace function public.ryoko_delete_account_item(p_trip uuid, p_day uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then raise exception 'Journey not linked to account'; end if;
  delete from public.ryoko_day_items where id = p_item and day_id = p_day;
end; $$;

grant execute on function public.ryoko_list_day_items(text, uuid, uuid) to anon, authenticated;
grant execute on function public.ryoko_list_account_day_items(uuid, uuid) to authenticated;
grant execute on function public.ryoko_delete_item(text, uuid, uuid) to anon, authenticated;
grant execute on function public.ryoko_delete_account_item(uuid, uuid, uuid) to authenticated;
