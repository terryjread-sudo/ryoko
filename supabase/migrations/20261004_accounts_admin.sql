-- Account identities remain optional: access codes continue to work for guests.
create extension if not exists pgcrypto;
create table if not exists public.ryoko_account_trips (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  linked_at timestamptz not null default now(),
  access_code text,
  primary key (user_id, trip_id)
);

create table if not exists public.ryoko_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.ryoko_account_trips add column if not exists access_code text;

alter table public.ryoko_trips add column if not exists archived_at timestamptz;
alter table public.ryoko_trips add column if not exists archived_by uuid references auth.users(id) on delete set null;

create table if not exists public.ryoko_account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_color text not null default '#735fa6',
  updated_at timestamptz not null default now()
);
create table if not exists public.ryoko_account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.ryoko_account_trips enable row level security;
alter table public.ryoko_admins enable row level security;
alter table public.ryoko_account_profiles enable row level security;
alter table public.ryoko_account_deletion_requests enable row level security;
drop policy if exists ryoko_account_trips_owner on public.ryoko_account_trips;
create policy ryoko_account_trips_owner on public.ryoko_account_trips for select using (auth.uid() = user_id);
drop policy if exists ryoko_admins_self on public.ryoko_admins;
create policy ryoko_admins_self on public.ryoko_admins for select using (auth.uid() = user_id);
drop policy if exists ryoko_account_profile_owner on public.ryoko_account_profiles;
create policy ryoko_account_profile_owner on public.ryoko_account_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists ryoko_account_deletion_owner on public.ryoko_account_deletion_requests;
create policy ryoko_account_deletion_owner on public.ryoko_account_deletion_requests for insert with check (auth.uid() = user_id);

create or replace function public.ryoko_link_account_trip(p_trip uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all
    select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  insert into public.ryoko_account_trips(user_id, trip_id, access_code) values (auth.uid(), p_trip, lower(trim(p_code))) on conflict (user_id, trip_id) do update set access_code = excluded.access_code;
end; $$;

create or replace function public.ryoko_list_account_trips()
returns table(trip_id uuid, name text, start_date date, end_date date, linked_at timestamptz)
language sql security invoker set search_path = public as $$
  select t.id, t.name, t.start_date, t.end_date, a.linked_at
  from public.ryoko_account_trips a join public.ryoko_trips t on t.id = a.trip_id
  where a.user_id = auth.uid() and t.archived_at is null order by a.linked_at desc;
$$;

create or replace function public.ryoko_reveal_account_trip_code(p_trip uuid)
returns text language plpgsql security definer set search_path = public as $$
declare result text;
begin
  select access_code into result from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid();
  if result is null then raise exception 'No access code stored for this journey'; end if;
  return result;
end; $$;

create or replace function public.ryoko_unlink_account_trip(p_trip uuid)
returns void language sql security invoker set search_path = public as $$
  delete from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid();
$$;

create or replace function public.ryoko_export_account_data()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('plans', coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'start_date', t.start_date, 'end_date', t.end_date)), '[]'::jsonb))
  from public.ryoko_account_trips a join public.ryoko_trips t on t.id = a.trip_id where a.user_id = auth.uid();
$$;

create or replace function public.ryoko_request_account_deletion()
returns void language sql security invoker set search_path = public as $$
  insert into public.ryoko_account_deletion_requests(user_id) values (auth.uid()) on conflict (user_id) do update set requested_at = now();
$$;

create or replace function public.ryoko_is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.ryoko_admins where user_id = auth.uid());
$$;

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

create or replace function public.ryoko_list_account_days(p_trip uuid)
returns setof public.ryoko_trip_days language sql security definer set search_path = public as $$
  select d.* from public.ryoko_trip_days d
  where d.trip_id = p_trip and exists (select 1 from public.ryoko_account_trips a where a.trip_id = p_trip and a.user_id = auth.uid())
  order by d.sort_order, d.day_date;
$$;

create or replace function public.ryoko_save_account_day(p_trip uuid, p_day uuid, p_date date, p_city text, p_title text, p_notes text default null)
returns public.ryoko_trip_days language plpgsql security definer set search_path = public as $$
declare result public.ryoko_trip_days;
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then raise exception 'Journey not linked to account'; end if;
  if p_day is null then
    insert into public.ryoko_trip_days(trip_id, day_date, city, title, notes, sort_order) values (p_trip, p_date, p_city, p_title, p_notes, (select coalesce(max(sort_order), -1) + 1 from public.ryoko_trip_days where trip_id = p_trip)) returning * into result;
  else
    update public.ryoko_trip_days set day_date = p_date, city = p_city, title = p_title, notes = p_notes where id = p_day and trip_id = p_trip returning * into result;
  end if;
  return result;
end; $$;

create or replace function public.ryoko_save_account_item(p_trip uuid, p_item uuid, p_day uuid, p_kind text, p_content text, p_completed boolean)
returns public.ryoko_day_items language plpgsql security definer set search_path = public as $$
declare result public.ryoko_day_items;
begin
  if not exists (select 1 from public.ryoko_account_trips where trip_id = p_trip and user_id = auth.uid()) then raise exception 'Journey not linked to account'; end if;
  if p_item is null then
    insert into public.ryoko_day_items(day_id, kind, content, completed) values (p_day, p_kind, p_content, p_completed) returning * into result;
  else
    update public.ryoko_day_items set kind = p_kind, content = p_content, completed = p_completed where id = p_item and day_id = p_day returning * into result;
  end if;
  return result;
end; $$;

drop function if exists public.ryoko_admin_list_trips();
create or replace function public.ryoko_admin_list_trips()
returns table(trip_id uuid, name text, start_date date, end_date date, linked_at timestamptz, archived_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.start_date, t.end_date, t.created_at, t.archived_at from public.ryoko_trips t
  where exists (select 1 from public.ryoko_admins a where a.user_id = auth.uid()) order by t.created_at desc;
$$;

create or replace function public.ryoko_admin_archive_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ryoko_is_admin() then raise exception 'Admin access required'; end if;
  update public.ryoko_trips set archived_at = now(), archived_by = auth.uid() where id = p_trip;
end; $$;

create or replace function public.ryoko_admin_restore_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ryoko_is_admin() then raise exception 'Admin access required'; end if;
  update public.ryoko_trips set archived_at = null, archived_by = null where id = p_trip;
end; $$;

create or replace function public.ryoko_admin_delete_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ryoko_is_admin() then raise exception 'Admin access required'; end if;
  delete from public.ryoko_trips where id = p_trip;
end; $$;
