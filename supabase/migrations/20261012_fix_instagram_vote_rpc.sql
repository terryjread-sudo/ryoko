-- Replace the first vote RPC version, whose canonical_url output name can be
-- ambiguous inside PL/pgSQL. The app normalizes vote_url back to canonical_url.
drop function if exists public.ryoko_set_instagram_vote(uuid, text, text, smallint);
drop function if exists public.ryoko_list_instagram_votes(uuid, text);

create or replace function public.ryoko_list_instagram_votes(p_trip uuid, p_code text default null)
returns table(vote_url text, upvotes integer, middle_votes integer, downvotes integer, my_vote smallint)
language plpgsql security definer set search_path = public, extensions as $$
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
end; $$;

create or replace function public.ryoko_set_instagram_vote(
  p_trip uuid, p_code text, p_canonical_url text, p_vote smallint
)
returns table(vote_url text, upvotes integer, middle_votes integer, downvotes integer, my_vote smallint)
language plpgsql security definer set search_path = public, extensions as $$
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
end; $$;

revoke all on function public.ryoko_list_instagram_votes(uuid, text) from public;
revoke all on function public.ryoko_set_instagram_vote(uuid, text, text, smallint) from public;
grant execute on function public.ryoko_list_instagram_votes(uuid, text) to anon, authenticated;
grant execute on function public.ryoko_set_instagram_vote(uuid, text, text, smallint) to anon, authenticated;
