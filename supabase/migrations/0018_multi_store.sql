-- Multi-store: a Negocio (businesses) has one or more Tiendas (stores).
-- Design: GitHub issue #8 (closing comment). Glossary: GLOSSARY.md.
--
-- What this does, in order:
--   1. `stores` table; every existing Negocio gets one Tienda with its name,
--      and every new Negocio gets one automatically.
--   2. Roles: Dueño (owner), Gerente (manager), Agente (agent), plus
--      `store_members` (which Tiendas a Gerente/Agente belongs to).
--   3. store_id on channels, conversations, messages, products, catalogs and
--      orders, backfilled to the Negocio's Tienda, then required.
--   4. Triggers that fill store_id when the app doesn't send it (from the
--      channel / conversation, or the Negocio's only Tienda), so older code
--      and the webhooks keep working.
--   5. Row Level Security: Dueños see every Tienda of their Negocio;
--      Gerentes/Agentes only their Tiendas. Contacts and templates stay
--      shared across the Negocio.
--   6. Invitations: single-use links, 7 days, with a role and Tiendas.
--      The old shared invite code (join_business_by_code) is removed.
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; it is written so the code currently live keeps working.

-- ---------------------------------------------------------------------------
-- 1. Tiendas
-- ---------------------------------------------------------------------------

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Set = Tienda archivada (closed): hidden, channels disconnected, history
  -- kept for Dueños. Null again when reopened.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists stores_business_idx on stores (business_id);

alter table stores enable row level security;

-- Every Negocio that has no Tienda yet gets one, named like the Negocio.
insert into stores (business_id, name, created_at)
select b.id, coalesce(nullif(btrim(b.name), ''), 'Tienda'), b.created_at
from businesses b
where not exists (select 1 from stores s where s.business_id = b.id);

-- New Negocios (create_business, the reviewer demo...) get their first
-- Tienda automatically.
create or replace function create_first_store()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into stores (business_id, name) values (new.id, coalesce(nullif(btrim(new.name), ''), 'Tienda'));
  return new;
end;
$$;

drop trigger if exists businesses_first_store on businesses;
create trigger businesses_first_store
  after insert on businesses
  for each row execute function create_first_store();

-- The Negocio's Tienda when it has exactly one open Tienda, else null. Used
-- to fill store_id for rows written without one.
create or replace function only_store_of(target_business_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select case when count(*) = 1 then (array_agg(id))[1] end
  from stores
  where business_id = target_business_id and archived_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 2. Roles and store membership
-- ---------------------------------------------------------------------------

alter table members drop constraint if exists members_role_check;
alter table members
  add constraint members_role_check check (role in ('owner', 'manager', 'agent'));

create table if not exists store_members (
  store_id uuid not null references stores(id) on delete cascade,
  -- Filled from the store by a trigger; lets the foreign key below remove
  -- the row when the person leaves the Negocio.
  business_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id),
  foreign key (business_id, user_id) references members (business_id, user_id) on delete cascade
);

create index if not exists store_members_user_idx on store_members (user_id);
create index if not exists store_members_business_idx on store_members (business_id);

alter table store_members enable row level security;

create or replace function store_members_set_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select business_id into new.business_id from stores where id = new.store_id;
  return new;
end;
$$;

drop trigger if exists store_members_business on store_members;
create trigger store_members_business
  before insert or update of store_id on store_members
  for each row execute function store_members_set_business();

-- Existing Agentes join their Negocio's Tienda. Only for Negocios that still
-- have a single Tienda, so running this again never re-adds someone a Dueño
-- took out of a Tienda later.
insert into store_members (store_id, business_id, user_id)
select s.id, m.business_id, m.user_id
from members m
join stores s on s.business_id = m.business_id
where m.role <> 'owner'
  and (select count(*) from stores s2 where s2.business_id = m.business_id) = 1
on conflict do nothing;

-- A Negocio always keeps at least one Dueño while it has other people.
-- (Someone alone in their Negocio can still delete their account, and
-- deleting a whole Negocio still works.)
create or replace function keep_one_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from members
       where business_id = old.business_id and role = 'owner' and user_id <> old.user_id
     )
     and (
       tg_op = 'UPDATE'
       or exists (select 1 from members where business_id = old.business_id and user_id <> old.user_id)
     )
     -- The whole Negocio being deleted takes its Dueños with it.
     and exists (select 1 from businesses where id = old.business_id)
  then
    raise exception 'El negocio debe tener al menos un dueño.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists members_keep_one_owner on members;
create trigger members_keep_one_owner
  before update of role or delete on members
  for each row execute function keep_one_owner();

-- ---------------------------------------------------------------------------
-- 3. store_id on every store-scoped table, backfilled
-- ---------------------------------------------------------------------------

alter table channels add column if not exists store_id uuid references stores(id) on delete cascade;
alter table conversations add column if not exists store_id uuid references stores(id) on delete cascade;
alter table messages add column if not exists store_id uuid references stores(id) on delete cascade;
alter table products add column if not exists store_id uuid references stores(id) on delete cascade;
alter table catalogs add column if not exists store_id uuid references stores(id) on delete cascade;
alter table orders add column if not exists store_id uuid references stores(id) on delete cascade;

-- The Negocio's first Tienda (each has exactly one right after step 1).
create or replace function first_store_of(target_business_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from stores where business_id = target_business_id order by created_at, id limit 1;
$$;

update channels set store_id = first_store_of(business_id) where store_id is null;

update conversations c
set store_id = coalesce(
  (select ch.store_id from channels ch where ch.id = c.channel_id),
  first_store_of(c.business_id)
)
where c.store_id is null;

update messages m
set store_id = c.store_id
from conversations c
where c.id = m.conversation_id and m.store_id is null;

update products set store_id = first_store_of(business_id) where store_id is null;
update catalogs set store_id = first_store_of(business_id) where store_id is null;

update orders o
set store_id = coalesce(
  (select c.store_id from conversations c where c.id = o.conversation_id),
  first_store_of(o.business_id)
)
where o.store_id is null;

alter table channels alter column store_id set not null;
alter table conversations alter column store_id set not null;
alter table messages alter column store_id set not null;
alter table products alter column store_id set not null;
alter table catalogs alter column store_id set not null;
alter table orders alter column store_id set not null;

create index if not exists channels_store_idx on channels (store_id);
create index if not exists conversations_store_idx on conversations (store_id, last_message_at desc);
create index if not exists messages_store_idx on messages (store_id, created_at desc);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at);
create index if not exists products_store_idx on products (store_id);
create index if not exists catalogs_store_idx on catalogs (store_id);
create index if not exists orders_store_idx on orders (store_id);

-- Each Tienda has its own catalog, so a product's retailer id only has to
-- be unique within its Tienda ("Copiar a otra tienda" keeps it).
alter table products drop constraint if exists products_business_id_retailer_id_key;
create unique index if not exists products_store_retailer_key on products (store_id, retailer_id);

-- ---------------------------------------------------------------------------
-- 4. Fill and check store_id on every write
-- ---------------------------------------------------------------------------

-- The Tienda must belong to the row's Negocio.
create or replace function check_store_business(target_store_id uuid, target_business_id uuid)
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if target_store_id is null then
    raise exception 'Falta elegir la tienda.';
  end if;
  if not exists (select 1 from stores where id = target_store_id and business_id = target_business_id) then
    raise exception 'Esa tienda no pertenece a este negocio.';
  end if;
end;
$$;

-- channels, products, catalogs: the Negocio's only Tienda when not given.
create or replace function fill_store_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.store_id is null then
    new.store_id := only_store_of(new.business_id);
  end if;
  perform check_store_business(new.store_id, new.business_id);
  return new;
end;
$$;

-- conversations: always the Tienda of their channel (that's where the
-- customer wrote); without a channel, the given or only Tienda.
create or replace function fill_conversation_store_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  channel_store uuid;
begin
  if new.channel_id is not null then
    select store_id into channel_store from channels where id = new.channel_id;
    if channel_store is not null then
      new.store_id := channel_store;
    end if;
  end if;
  if new.store_id is null then
    new.store_id := only_store_of(new.business_id);
  end if;
  perform check_store_business(new.store_id, new.business_id);
  return new;
end;
$$;

-- messages: always their conversation's Tienda.
create or replace function fill_message_store_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Both the Tienda and the Negocio come from the conversation, so a message
  -- can never carry another Negocio's business_id.
  select store_id, business_id into new.store_id, new.business_id from conversations where id = new.conversation_id;
  return new;
end;
$$;

-- orders: their conversation's Tienda, else the given or only Tienda.
create or replace function fill_order_store_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_store uuid;
begin
  if new.conversation_id is not null then
    select store_id into conversation_store from conversations where id = new.conversation_id;
    if conversation_store is not null then
      new.store_id := conversation_store;
    end if;
  end if;
  if new.store_id is null then
    new.store_id := only_store_of(new.business_id);
  end if;
  perform check_store_business(new.store_id, new.business_id);
  return new;
end;
$$;

drop trigger if exists channels_store on channels;
create trigger channels_store before insert or update of store_id, business_id on channels
  for each row execute function fill_store_id();

drop trigger if exists products_store on products;
create trigger products_store before insert or update of store_id, business_id on products
  for each row execute function fill_store_id();

drop trigger if exists catalogs_store on catalogs;
create trigger catalogs_store before insert or update of store_id, business_id on catalogs
  for each row execute function fill_store_id();

drop trigger if exists conversations_store on conversations;
create trigger conversations_store before insert or update of store_id, channel_id, business_id on conversations
  for each row execute function fill_conversation_store_id();

drop trigger if exists messages_store on messages;
create trigger messages_store before insert or update of conversation_id, store_id on messages
  for each row execute function fill_message_store_id();

drop trigger if exists orders_store on orders;
create trigger orders_store before insert or update of store_id, conversation_id, business_id on orders
  for each row execute function fill_order_store_id();

-- An Agente who leaves a Tienda: their open conversations there become
-- unassigned (the first reply claims them). Past sales stay credited.
create or replace function unassign_on_store_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from stores where id = old.store_id) then
    update conversations
    set assigned_to = null
    where store_id = old.store_id and assigned_to = old.user_id and status <> 'closed';
  end if;
  return old;
end;
$$;

drop trigger if exists store_members_unassign on store_members;
create trigger store_members_unassign
  after delete on store_members
  for each row execute function unassign_on_store_leave();

-- ---------------------------------------------------------------------------
-- 5. Access helpers and Row Level Security
-- ---------------------------------------------------------------------------

create or replace function is_owner_of(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from members
    where business_id = target_business_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Every Tienda the signed-in person can see: all Tiendas of their Negocio
-- for a Dueño (archived ones too, to read their history); for a Gerente or
-- Agente, the open Tiendas they belong to. Policies use it as
-- `store_id in (select my_store_ids())`, which Postgres runs once per query.
create or replace function my_store_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select s.id
  from stores s
  join members m on m.business_id = s.business_id and m.user_id = auth.uid()
  where m.role = 'owner'
     or (
       s.archived_at is null
       and exists (select 1 from store_members sm where sm.store_id = s.id and sm.user_id = auth.uid())
     );
$$;

create or replace function can_access_store(target_store_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select target_store_id in (select my_store_ids());
$$;

-- Dueños, and Gerentes of that (open) Tienda: channels, team.
create or replace function can_manage_store(target_store_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from stores s
    join members m on m.business_id = s.business_id and m.user_id = auth.uid()
    where s.id = target_store_id
      and (
        m.role = 'owner'
        or (
          m.role = 'manager'
          and s.archived_at is null
          and exists (select 1 from store_members sm where sm.store_id = s.id and sm.user_id = auth.uid())
        )
      )
  );
$$;

-- Internal helpers, only called from the SECURITY DEFINER fill triggers.
-- Supabase grants new functions to anon/authenticated directly, so revoking
-- from public alone isn't enough.
revoke all on function only_store_of(uuid) from public, anon, authenticated;
revoke all on function first_store_of(uuid) from public, anon, authenticated;
revoke all on function check_store_business(uuid, uuid) from public, anon, authenticated;

revoke all on function my_store_ids() from public;
grant execute on function my_store_ids() to authenticated;
revoke all on function can_access_store(uuid) from public;
grant execute on function can_access_store(uuid) to authenticated;
revoke all on function can_manage_store(uuid) from public;
grant execute on function can_manage_store(uuid) to authenticated;
revoke all on function is_owner_of(uuid) from public;
grant execute on function is_owner_of(uuid) to authenticated;

-- stores: everyone in the Negocio can read the names (for store tags);
-- only Dueños create, rename, archive or reopen. Never deleted from the app.
drop policy if exists "members read stores" on stores;
create policy "members read stores" on stores for select using (is_member_of(business_id));
drop policy if exists "owners create stores" on stores;
create policy "owners create stores" on stores for insert with check (is_owner_of(business_id));
drop policy if exists "owners update stores" on stores;
create policy "owners update stores" on stores for update
  using (is_owner_of(business_id)) with check (is_owner_of(business_id));

-- store_members: the Negocio can see who is in which Tienda. Dueños assign
-- anyone; a Gerente only Agentes, only in their own Tiendas.
drop policy if exists "members read store members" on store_members;
create policy "members read store members" on store_members for select using (is_member_of(business_id));

drop policy if exists "assign store members" on store_members;
create policy "assign store members" on store_members for insert with check (
  is_owner_of(business_id)
  or (
    can_manage_store(store_id)
    and exists (
      select 1 from members m
      where m.business_id = store_members.business_id and m.user_id = store_members.user_id and m.role = 'agent'
    )
  )
);

drop policy if exists "remove store members" on store_members;
create policy "remove store members" on store_members for delete using (
  is_owner_of(business_id)
  or (
    can_manage_store(store_id)
    and exists (
      select 1 from members m
      where m.business_id = store_members.business_id and m.user_id = store_members.user_id and m.role = 'agent'
    )
  )
);

-- channels: seen by the Tienda's people; connected/disconnected by its
-- Dueños and Gerentes. (Webhooks use the service key and skip RLS.)
drop policy if exists "tenant read" on channels;
drop policy if exists "tenant write" on channels;
drop policy if exists "tenant update" on channels;
drop policy if exists "tenant delete" on channels;
drop policy if exists "store read" on channels;
drop policy if exists "store write" on channels;
drop policy if exists "store update" on channels;
drop policy if exists "store delete" on channels;
create policy "store read" on channels for select using (store_id in (select my_store_ids()));
create policy "store write" on channels for insert with check (can_manage_store(store_id));
create policy "store update" on channels for update using (can_manage_store(store_id)) with check (can_manage_store(store_id));
create policy "store delete" on channels for delete using (can_manage_store(store_id));

-- conversations, messages, products, catalogs, orders: the Tienda's people.
drop policy if exists "tenant read" on conversations;
drop policy if exists "tenant write" on conversations;
drop policy if exists "tenant update" on conversations;
drop policy if exists "tenant delete" on conversations;
drop policy if exists "store read" on conversations;
drop policy if exists "store write" on conversations;
drop policy if exists "store update" on conversations;
drop policy if exists "store delete" on conversations;
create policy "store read" on conversations for select using (store_id in (select my_store_ids()));
create policy "store write" on conversations for insert with check (store_id in (select my_store_ids()));
create policy "store update" on conversations for update
  using (store_id in (select my_store_ids())) with check (store_id in (select my_store_ids()));
create policy "store delete" on conversations for delete using (store_id in (select my_store_ids()));

drop policy if exists "tenant read" on messages;
drop policy if exists "tenant write" on messages;
drop policy if exists "tenant update" on messages;
drop policy if exists "store read" on messages;
drop policy if exists "store write" on messages;
drop policy if exists "store update" on messages;
create policy "store read" on messages for select using (store_id in (select my_store_ids()));
create policy "store write" on messages for insert with check (store_id in (select my_store_ids()));
create policy "store update" on messages for update
  using (store_id in (select my_store_ids())) with check (store_id in (select my_store_ids()));

drop policy if exists "tenant read" on products;
drop policy if exists "tenant write" on products;
drop policy if exists "tenant update" on products;
drop policy if exists "tenant delete" on products;
drop policy if exists "store read" on products;
drop policy if exists "store write" on products;
drop policy if exists "store update" on products;
drop policy if exists "store delete" on products;
create policy "store read" on products for select using (store_id in (select my_store_ids()));
create policy "store write" on products for insert with check (store_id in (select my_store_ids()));
create policy "store update" on products for update
  using (store_id in (select my_store_ids())) with check (store_id in (select my_store_ids()));
create policy "store delete" on products for delete using (store_id in (select my_store_ids()));

drop policy if exists "tenant read" on catalogs;
drop policy if exists "tenant write" on catalogs;
drop policy if exists "tenant update" on catalogs;
drop policy if exists "store read" on catalogs;
drop policy if exists "store write" on catalogs;
drop policy if exists "store update" on catalogs;
create policy "store read" on catalogs for select using (store_id in (select my_store_ids()));
create policy "store write" on catalogs for insert with check (store_id in (select my_store_ids()));
create policy "store update" on catalogs for update
  using (store_id in (select my_store_ids())) with check (store_id in (select my_store_ids()));

drop policy if exists "tenant read" on orders;
drop policy if exists "tenant write" on orders;
drop policy if exists "tenant update" on orders;
drop policy if exists "store read" on orders;
drop policy if exists "store write" on orders;
drop policy if exists "store update" on orders;
create policy "store read" on orders for select using (store_id in (select my_store_ids()));
create policy "store write" on orders for insert with check (store_id in (select my_store_ids()));
create policy "store update" on orders for update
  using (store_id in (select my_store_ids())) with check (store_id in (select my_store_ids()));

-- ---------------------------------------------------------------------------
-- 6. Invitations (single-use links) and onboarding
-- ---------------------------------------------------------------------------

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  token text not null unique,
  role text not null check (role in ('owner', 'manager', 'agent')),
  -- Tiendas the person joins (empty for a Dueño, who sees them all).
  store_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create index if not exists invitations_business_idx on invitations (business_id);

alter table invitations enable row level security;

-- Dueños see and cancel every invitation of their Negocio; a Gerente the
-- ones they made. Created and accepted only through the functions below.
drop policy if exists "read invitations" on invitations;
create policy "read invitations" on invitations for select using (
  is_owner_of(business_id) or (created_by = auth.uid() and is_member_of(business_id))
);
drop policy if exists "cancel invitations" on invitations;
create policy "cancel invitations" on invitations for delete using (
  accepted_at is null and (is_owner_of(business_id) or (created_by = auth.uid() and is_member_of(business_id)))
);

-- Dueños invite anyone to any open Tiendas; Gerentes only Agentes, only to
-- Tiendas they manage. Returns the secret part of the link.
create or replace function create_invitation(p_business_id uuid, p_role text, p_store_ids uuid[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  requested uuid[];
  valid uuid[];
  new_token text;
begin
  select role into caller_role from members where business_id = p_business_id and user_id = auth.uid();
  if caller_role is null or caller_role = 'agent' then
    raise exception 'Solo los dueños y gerentes pueden invitar personas.';
  end if;
  if p_role not in ('owner', 'manager', 'agent') then
    raise exception 'Rol inválido.';
  end if;
  if caller_role = 'manager' and p_role <> 'agent' then
    raise exception 'Un gerente solo puede invitar agentes.';
  end if;

  if p_role = 'owner' then
    valid := '{}';
  else
    requested := array(select distinct unnest(coalesce(p_store_ids, '{}')));
    valid := array(
      select s.id from stores s
      where s.id = any(requested) and s.business_id = p_business_id and s.archived_at is null
        and (caller_role = 'owner' or can_manage_store(s.id))
    );
    if cardinality(valid) = 0 then
      raise exception 'Elige al menos una tienda.';
    end if;
    if cardinality(valid) <> cardinality(requested) then
      raise exception 'No puedes invitar a esa tienda.';
    end if;
  end if;

  new_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into invitations (business_id, token, role, store_ids, created_by)
  values (p_business_id, new_token, p_role, valid, auth.uid());
  return new_token;
end;
$$;

-- What the invitation page shows before joining. Status: valid | used |
-- expired | invalid.
create or replace function invitation_preview(p_token text)
returns table (business_name text, role text, store_names text[], status text)
language sql
security definer
stable
set search_path = public
as $$
  select b.name,
         i.role,
         array(select s.name from stores s where s.id = any(i.store_ids) and s.archived_at is null order by s.name),
         case
           when i.accepted_at is not null then 'used'
           when i.expires_at < now() then 'expired'
           else 'valid'
         end
  from invitations i
  join businesses b on b.id = i.business_id
  where i.token = p_token;
$$;

-- Joins the signed-in person to the Negocio with the invitation's role and
-- Tiendas, and uses the invitation up. One Negocio per person for now.
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

  insert into members (business_id, user_id, role) values (inv.business_id, auth.uid(), inv.role);
  insert into store_members (store_id, business_id, user_id)
  select s.id, inv.business_id, auth.uid()
  from stores s
  where s.id = any(inv.store_ids) and s.business_id = inv.business_id and s.archived_at is null
  on conflict do nothing;

  update invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  return inv.business_id;
end;
$$;

revoke all on function create_invitation(uuid, text, uuid[]) from public;
grant execute on function create_invitation(uuid, text, uuid[]) to authenticated;
revoke all on function invitation_preview(text) from public;
grant execute on function invitation_preview(text) to authenticated;
revoke all on function accept_invitation(text) from public;
grant execute on function accept_invitation(text) to authenticated;

-- Creating a Negocio: its first Tienda comes from the businesses trigger
-- above, and the creator becomes its Dueño. One Negocio per person.
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
  insert into members (business_id, user_id, role) values (new_business_id, auth.uid(), 'owner');
  return new_business_id;
end;
$$;

revoke all on function create_business(text) from public;
grant execute on function create_business(text) to authenticated;

-- The shared invite code is replaced by invitation links. The column
-- businesses.invite_code stays for now (the code live before this release
-- still reads it); a later migration can drop it.
drop function if exists join_business_by_code(text);
