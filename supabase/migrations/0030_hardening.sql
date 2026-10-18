-- Hardening before launch (issue #35, items 2 and 3).
--
-- What this does, in order:
--   1. One Negocio per person, enforced by the database: a unique index on
--      members(user_id). Before, two invitations to different Negocios
--      accepted at the same moment could both succeed (the check in
--      accept_invitation / create_business ran before either insert).
--      If someone is ALREADY in two Negocios, this migration stops with a
--      message listing them and changes nothing. It never deletes anyone:
--      the founder decides which Negocio each person keeps, removes the
--      other membership by hand, then runs this again.
--      To check beforehand (SQL editor):
--        select user_id, count(*) from members group by user_id having count(*) > 1;
--   2. accept_invitation and create_business: same bodies as in 0018, plus a
--      friendly message when that index refuses the insert (the race above)
--      instead of a raw "duplicate key" error.
--   3. is_member_of (from 0001) gets `set search_path = public`, like every
--      other security definer function. Same body. (business_members has it
--      since 0021, nothing to do there.)
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that comes with it (the app works the same with or without it).

-- ---------------------------------------------------------------------------
-- 1. One Negocio per person
-- ---------------------------------------------------------------------------

do $$
declare
  dupes text;
begin
  select string_agg(user_id::text, ', ' order by user_id) into dupes
  from (select user_id from members group by user_id having count(*) > 1) d;
  if dupes is not null then
    raise exception using message =
      'No se puede aplicar 0030: estas personas están en más de un negocio: ' || dupes
      || '. Decide en cuál se queda cada una, quítala de los demás y vuelve a correr esta migración. No se borró nada. '
      || '/ Cannot apply 0030: these users belong to more than one business: ' || dupes
      || '. Remove the extra memberships by hand and run it again. Nothing was deleted.';
  end if;
end;
$$;

create unique index if not exists members_one_business_per_user on members (user_id);

-- ---------------------------------------------------------------------------
-- 2. Friendly messages when the index wins a race
-- ---------------------------------------------------------------------------

-- Same as 0018, except the members insert: if another request joined this
-- person to a Negocio in the meantime, say so in plain Spanish.
create or replace function accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations%rowtype;
  current_business uuid;
  creator_role text;
  violated text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para aceptar la invitación.';
  end if;

  select * into inv from invitations where token = p_token for update;
  if not found then
    raise exception 'Esta invitación no existe.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Esta invitación ya se usó. Pide una nueva.';
  end if;
  if inv.expires_at < now() then
    raise exception 'Esta invitación venció. Pide una nueva.';
  end if;

  -- The person who created the link must still be allowed to issue it: a
  -- removed or demoted Dueño/Gerente's pending links stop working.
  select role into creator_role from members where business_id = inv.business_id and user_id = inv.created_by;
  if creator_role is null
     or creator_role = 'agent'
     or (inv.role in ('owner', 'manager') and creator_role <> 'owner')
     or (creator_role = 'manager' and exists (
           select 1 from unnest(inv.store_ids) as sid
           where not exists (
             select 1 from store_members sm where sm.store_id = sid and sm.user_id = inv.created_by
           )
         )) then
    raise exception 'Esta invitación ya no es válida. Pide una nueva.';
  end if;

  select business_id into current_business from members where user_id = auth.uid() limit 1;
  if current_business = inv.business_id then
    raise exception 'Ya eres parte de este negocio.';
  elsif current_business is not null then
    raise exception 'Tu cuenta ya pertenece a otro negocio en cheke.';
  end if;

  begin
    insert into members (business_id, user_id, role) values (inv.business_id, auth.uid(), inv.role);
  exception when unique_violation then
    get stacked diagnostics violated = constraint_name;
    if violated = 'members_pkey' then
      raise exception 'Ya eres parte de este negocio.';
    end if;
    raise exception 'Tu cuenta ya pertenece a otro negocio en cheke.';
  end;

  insert into store_members (store_id, business_id, user_id)
  select s.id, inv.business_id, auth.uid()
  from stores s
  where s.id = any(inv.store_ids) and s.business_id = inv.business_id and s.archived_at is null
  on conflict do nothing;

  update invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  return inv.business_id;
end;
$$;

revoke all on function accept_invitation(text) from public;
grant execute on function accept_invitation(text) to authenticated;

-- Same as 0018, except the members insert (see above). The error undoes the
-- whole call, so no empty Negocio is left behind.
create or replace function create_business(business_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para crear tu negocio.';
  end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'Tu cuenta ya pertenece a un negocio.';
  end if;
  insert into businesses (name) values (btrim(business_name)) returning id into new_business_id;
  begin
    insert into members (business_id, user_id, role) values (new_business_id, auth.uid(), 'owner');
  exception when unique_violation then
    raise exception 'Tu cuenta ya pertenece a un negocio.';
  end;
  return new_business_id;
end;
$$;

revoke all on function create_business(text) from public;
grant execute on function create_business(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. search_path on is_member_of
-- ---------------------------------------------------------------------------

-- Same body as 0001. Pinning search_path stops a security definer function
-- from resolving `members` to a table someone created in another schema.
create or replace function is_member_of(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;
