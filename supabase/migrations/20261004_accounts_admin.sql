-- Account identities remain optional: access codes continue to work for guests.
create table if not exists public.ryoko_account_trips (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);

create table if not exists public.ryoko_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ryoko_account_trips enable row level security;
alter table public.ryoko_admins enable row level security;
create policy ryoko_account_trips_owner on public.ryoko_account_trips for select using (auth.uid() = user_id);
create policy ryoko_admins_self on public.ryoko_admins for select using (auth.uid() = user_id);

create or replace function public.ryoko_link_account_trip(p_trip uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.ryoko_trips t where t.id = p_trip and crypt(lower(trim(p_code)), t.owner_code_hash) = t.owner_code_hash
    union all
    select 1 from public.ryoko_trip_members m where m.trip_id = p_trip and m.revoked_at is null and crypt(lower(trim(p_code)), m.code_hash) = m.code_hash
  ) then raise exception 'Invalid journey code'; end if;
  insert into public.ryoko_account_trips(user_id, trip_id) values (auth.uid(), p_trip) on conflict do nothing;
end; $$;

create or replace function public.ryoko_list_account_trips()
returns table(trip_id uuid, name text, start_date date, end_date date, linked_at timestamptz)
language sql security invoker set search_path = public as $$
  select t.id, t.name, t.start_date, t.end_date, a.linked_at
  from public.ryoko_account_trips a join public.ryoko_trips t on t.id = a.trip_id
  where a.user_id = auth.uid() order by a.linked_at desc;
$$;

create or replace function public.ryoko_admin_list_trips()
returns table(trip_id uuid, name text, start_date date, end_date date, linked_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.start_date, t.end_date, t.created_at from public.ryoko_trips t
  where exists (select 1 from public.ryoko_admins a where a.user_id = auth.uid()) order by t.created_at desc;
$$;

create or replace function public.ryoko_admin_delete_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ryoko_admins where user_id = auth.uid()) then raise exception 'Admin access required'; end if;
  delete from public.ryoko_trips where id = p_trip;
end; $$;
