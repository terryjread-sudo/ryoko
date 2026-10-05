-- Member invitations and administrator member management.
create or replace function public.ryoko_issue_member(
  p_owner_code text,
  p_trip uuid,
  p_name text,
  p_role public.ryoko_member_role,
  p_color text
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  member_code text := lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  member_hash text := extensions.crypt(member_code, extensions.gen_salt('bf'));
  member_id uuid;
begin
  if nullif(trim(p_name), '') is null then raise exception 'A member name is required'; end if;
  if p_role = 'owner' then raise exception 'Owner role cannot be issued'; end if;
  if not exists (
    select 1 from public.ryoko_trips t
    where t.id = p_trip and extensions.crypt(lower(trim(p_owner_code)), t.owner_code_hash) = t.owner_code_hash
  ) then raise exception 'Owner access required'; end if;
  insert into public.ryoko_trip_members(trip_id, display_name, color, role, code_hash)
  values (p_trip, trim(p_name), coalesce(nullif(trim(p_color), ''), '#df8f9b'), p_role, member_hash)
  returning id into member_id;
  return jsonb_build_object('member_id', member_id, 'name', trim(p_name), 'role', p_role, 'code', member_code);
end; $$;

create or replace function public.ryoko_admin_list_trip_members(p_trip uuid)
returns table(member_id uuid, display_name text, role public.ryoko_member_role, revoked_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.ryoko_is_admin() then raise exception 'Admin access required'; end if;
  return query
    select m.id, m.display_name, m.role, m.revoked_at, m.created_at
    from public.ryoko_trip_members m
    where m.trip_id = p_trip
    order by case when m.role = 'owner' then 0 else 1 end, m.created_at;
end; $$;

create or replace function public.ryoko_admin_revoke_member(p_trip uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ryoko_is_admin() then raise exception 'Admin access required'; end if;
  update public.ryoko_trip_members set revoked_at = now()
  where id = p_member and trip_id = p_trip and role <> 'owner' and revoked_at is null;
end; $$;

create or replace function public.ryoko_admin_restore_member(p_trip uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ryoko_is_admin() then raise exception 'Admin access required'; end if;
  update public.ryoko_trip_members set revoked_at = null
  where id = p_member and trip_id = p_trip and role <> 'owner';
end; $$;

revoke all on function public.ryoko_issue_member(text, uuid, text, public.ryoko_member_role, text) from public;
revoke all on function public.ryoko_admin_list_trip_members(uuid) from public;
revoke all on function public.ryoko_admin_revoke_member(uuid, uuid) from public;
revoke all on function public.ryoko_admin_restore_member(uuid, uuid) from public;
grant execute on function public.ryoko_issue_member(text, uuid, text, public.ryoko_member_role, text) to anon, authenticated;
grant execute on function public.ryoko_admin_list_trip_members(uuid) to authenticated;
grant execute on function public.ryoko_admin_revoke_member(uuid, uuid) to authenticated;
grant execute on function public.ryoko_admin_restore_member(uuid, uuid) to authenticated;
