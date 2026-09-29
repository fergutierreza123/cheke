-- Fixes onboarding: a user isn't a member of a business yet at the moment
-- they create or join it, so the plain RLS policies on `businesses` can't
-- let that request read back the row it just touched (PostgREST's
-- insert/select "RETURNING" step is itself subject to RLS). These two
-- security definer functions do the create-then-join and lookup-then-join
-- as a single trusted operation, the same pattern already used by
-- is_member_of() in 0001_init.sql.

create or replace function create_business(business_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_business_id uuid;
begin
  insert into businesses (name) values (business_name) returning id into new_business_id;
  insert into members (business_id, user_id, role) values (new_business_id, auth.uid(), 'owner');
  return new_business_id;
end;
$$;

create or replace function join_business_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid;
begin
  select id into target_business_id from businesses where invite_code = code;
  if target_business_id is null then
    raise exception 'No encontramos un negocio con ese código.';
  end if;
  insert into members (business_id, user_id, role) values (target_business_id, auth.uid(), 'agent');
  return target_business_id;
end;
$$;

revoke all on function create_business(text) from public;
grant execute on function create_business(text) to authenticated;

revoke all on function join_business_by_code(text) from public;
grant execute on function join_business_by_code(text) to authenticated;
