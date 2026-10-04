-- Apply this repair if the account migration was partially applied.
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
