-- Expose creator details to admins and allow only the original owner to archive.
drop function if exists public.ryoko_admin_list_trips();
create or replace function public.ryoko_admin_list_trips()
returns table(
  trip_id uuid, name text, start_date date, end_date date,
  linked_at timestamptz, archived_at timestamptz, created_by text, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.start_date, t.end_date, t.created_at, t.archived_at,
    owner.display_name, owner.created_at
  from public.ryoko_trips t
  left join lateral (
    select m.display_name, m.created_at
    from public.ryoko_trip_members m
    where m.trip_id = t.id and m.role = 'owner' and m.revoked_at is null
    order by m.created_at asc limit 1
  ) owner on true
  where exists (select 1 from public.ryoko_admins a where a.user_id = auth.uid())
  order by t.created_at desc;
$$;

create or replace function public.ryoko_archive_account_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from public.ryoko_account_trips a
    join public.ryoko_trips t on t.id = a.trip_id
    where a.user_id = auth.uid() and a.trip_id = p_trip
      and extensions.crypt(a.access_code, t.owner_code_hash) = t.owner_code_hash
  ) then raise exception 'Only the journey creator can archive this journey'; end if;
  update public.ryoko_trips set archived_at = now(), archived_by = auth.uid() where id = p_trip;
end; $$;
grant execute on function public.ryoko_admin_list_trips() to authenticated;
grant execute on function public.ryoko_archive_account_trip(uuid) to authenticated;
