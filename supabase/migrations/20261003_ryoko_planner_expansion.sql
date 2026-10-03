-- Ryōkō planner expansion
-- Safe to run after the existing ryoko_* foundation tables.

create extension if not exists pgcrypto;

create table if not exists public.ryoko_destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  name text not null,
  latitude double precision,
  longitude double precision,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ryoko_activities (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.ryoko_trip_days(id) on delete cascade,
  destination_id uuid references public.ryoko_destinations(id) on delete set null,
  title text not null,
  category text not null default 'custom'
    check (category in ('attraction', 'food', 'shopping', 'transport', 'stay', 'custom')),
  starts_at timestamptz,
  duration_minutes integer,
  notes text,
  booking_url text,
  instagram_url text,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ryoko_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.ryoko_activities(id) on delete cascade,
  member_id uuid references public.ryoko_trip_members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.ryoko_destinations enable row level security;
alter table public.ryoko_activities enable row level security;
alter table public.ryoko_comments enable row level security;

drop policy if exists ryoko_no_direct_destinations on public.ryoko_destinations;
create policy ryoko_no_direct_destinations
  on public.ryoko_destinations for all to anon, authenticated
  using (false) with check (false);

drop policy if exists ryoko_no_direct_activities on public.ryoko_activities;
create policy ryoko_no_direct_activities
  on public.ryoko_activities for all to anon, authenticated
  using (false) with check (false);

drop policy if exists ryoko_no_direct_comments on public.ryoko_comments;
create policy ryoko_no_direct_comments
  on public.ryoko_comments for all to anon, authenticated
  using (false) with check (false);

do $$
begin
  alter publication supabase_realtime add table public.ryoko_destinations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.ryoko_activities;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.ryoko_comments;
exception when duplicate_object then null;
end $$;
