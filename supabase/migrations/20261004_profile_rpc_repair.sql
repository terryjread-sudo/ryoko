-- Apply this repair if the account migration was partially applied.
create table if not exists public.ryoko_account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_color text not null default '#735fa6',
  updated_at timestamptz not null default now()
);

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
