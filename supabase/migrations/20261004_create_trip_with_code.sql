-- Always create journeys with a recoverable owner access code.
-- This also links the journey to a signed-in account without re-validating the
-- newly-created code through the member-code path.
create extension if not exists pgcrypto schema extensions;

create or replace function public.ryoko_create_trip_with_code(
  p_name text,
  p_start date,
  p_end date,
  p_owner_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  trip_id uuid;
  owner_code text := lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  owner_hash text := extensions.crypt(owner_code, extensions.gen_salt('bf'));
begin
  if nullif(trim(p_name), '') is null or nullif(trim(p_owner_name), '') is null then
    raise exception 'Journey name and owner name are required';
  end if;
  if p_end < p_start then
    raise exception 'Journey end date must be on or after its start date';
  end if;

  insert into public.ryoko_trips(name, start_date, end_date, owner_code_hash)
  values (trim(p_name), p_start, p_end, owner_hash)
  returning id into trip_id;

  insert into public.ryoko_trip_members(trip_id, display_name, color, role, code_hash)
  values (trip_id, trim(p_owner_name), '#735fa6', 'owner', owner_hash);

  if auth.uid() is not null and to_regclass('public.ryoko_account_trips') is not null then
    execute 'insert into public.ryoko_account_trips(user_id, trip_id, access_code)
      values ($1, $2, $3) on conflict (user_id, trip_id) do update set access_code = excluded.access_code'
      using auth.uid(), trip_id, owner_code;
  end if;

  return jsonb_build_object(
    'trip_id', trip_id,
    'code', owner_code,
    'role', 'owner',
    'display_name', trim(p_owner_name),
    'color', '#735fa6',
    'start_date', p_start,
    'end_date', p_end
  );
end;
$$;

revoke all on function public.ryoko_create_trip_with_code(text, date, date, text) from public;
grant execute on function public.ryoko_create_trip_with_code(text, date, date, text) to anon, authenticated;
