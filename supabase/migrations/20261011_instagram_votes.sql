-- Per-member votes follow an Instagram URL between the journey library and days.
create table if not exists public.ryoko_instagram_votes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.ryoko_trips(id) on delete cascade,
  canonical_url text not null,
  member_id uuid not null references public.ryoko_trip_members(id) on delete cascade,
  vote smallint not null check (vote in (-1, 0, 1)),
  updated_at timestamptz not null default now(),
  unique (trip_id, canonical_url, member_id)
);

alter table public.ryoko_instagram_votes enable row level security;

create or replace function public.ryoko_vote_member_id(p_trip uuid, p_code text default null)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_code text := lower(trim(coalesce(p_code, '')));
  result uuid;
begin
  if normalized_code <> '' then
    select m.id into result
    from public.ryoko_trip_members m
    where m.trip_id = p_trip
      and m.revoked_at is null
      and extensions.crypt(normalized_code, m.code_hash) = m.code_hash
    limit 1;
  elsif auth.uid() is not null then
    select m.id into result
    from public.ryoko_account_trips a
    join public.ryoko_trip_members m on m.trip_id = a.trip_id and m.revoked_at is null
    where a.user_id = auth.uid()
      and a.trip_id = p_trip
      and a.access_code is not null
      and extensions.crypt(a.access_code, m.code_hash) = m.code_hash
    limit 1;
  end if;
  if result is null then raise exception 'Journey access required'; end if;
  return result;
end;
$$;

create or replace function public.ryoko_list_instagram_votes(p_trip uuid, p_code text default null)
returns table(vote_url text, upvotes integer, middle_votes integer, downvotes integer, my_vote smallint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  member uuid := public.ryoko_vote_member_id(p_trip, p_code);
begin
  return query
    select v.canonical_url,
      count(*) filter (where v.vote = 1)::integer,
      count(*) filter (where v.vote = 0)::integer,
      count(*) filter (where v.vote = -1)::integer,
      max(v.vote) filter (where v.member_id = member)
    from public.ryoko_instagram_votes v
    where v.trip_id = p_trip
    group by v.canonical_url;
end;
$$;

create or replace function public.ryoko_set_instagram_vote(
  p_trip uuid,
  p_code text,
  p_canonical_url text,
  p_vote smallint
)
returns table(vote_url text, upvotes integer, middle_votes integer, downvotes integer, my_vote smallint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  member uuid := public.ryoko_vote_member_id(p_trip, p_code);
begin
  if p_vote not in (-1, 0, 1) then raise exception 'Invalid Instagram vote'; end if;
  insert into public.ryoko_instagram_votes(trip_id, canonical_url, member_id, vote, updated_at)
  values (p_trip, p_canonical_url, member, p_vote, now())
  on conflict (trip_id, canonical_url, member_id)
  do update set vote = excluded.vote, updated_at = now();
  return query
    select v.vote_url, v.upvotes, v.middle_votes, v.downvotes, v.my_vote
    from public.ryoko_list_instagram_votes(p_trip, p_code) v
    where v.vote_url = p_canonical_url;
end;
$$;

-- Revoking a member removes their votes immediately; the FK also cleans up hard deletes.
create or replace function public.ryoko_admin_revoke_member(p_trip uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ryoko_is_admin() then raise exception 'Admin access required'; end if;
  delete from public.ryoko_instagram_votes where trip_id = p_trip and member_id = p_member;
  update public.ryoko_trip_members set revoked_at = now()
  where id = p_member and trip_id = p_trip and role <> 'owner' and revoked_at is null;
end; $$;

revoke all on function public.ryoko_vote_member_id(uuid, text) from public;
revoke all on function public.ryoko_list_instagram_votes(uuid, text) from public;
revoke all on function public.ryoko_set_instagram_vote(uuid, text, text, smallint) from public;
grant execute on function public.ryoko_list_instagram_votes(uuid, text) to anon, authenticated;
grant execute on function public.ryoko_set_instagram_vote(uuid, text, text, smallint) to anon, authenticated;
