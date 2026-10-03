create extension if not exists pgcrypto;

create type public.ryoko_member_role as enum ('owner', 'editor', 'viewer');

create table public.ryoko_trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  owner_code_hash text not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.ryoko_trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  display_name text not null,
  color text not null,
  role public.ryoko_member_role not null default 'viewer',
  code_hash text not null unique,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ryoko_trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  day_date date not null,
  city text,
  title text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.ryoko_day_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.ryoko_trip_days(id) on delete cascade,
  kind text not null check (kind in ('note', 'link', 'instagram', 'checklist')),
  content text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.ryoko_audit_events (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  member_id uuid references public.ryoko_trip_members(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.ryoko_trips enable row level security;
alter table public.ryoko_trip_members enable row level security;
alter table public.ryoko_trip_days enable row level security;
alter table public.ryoko_day_items enable row level security;
alter table public.ryoko_audit_events enable row level security;

-- Code validation is intentionally handled by server-side RPC/Edge Functions.
-- Do not expose raw access codes or hashes through public policies.
