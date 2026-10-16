-- chekelin as first responder, Traspaso (handoff) and routing to people.
-- Design: GitHub issue #28 (closing comment), built in issue #30.
-- Glossary: GLOSSARY.md (Traspaso, Asignación, Ausente, Sugerencia de chekelin).
--
-- What this adds:
--   1. People: "Ausente" switch, "avisarme de todo" (Dueños) and when each
--      person last got a chat (to break ties when routing).
--   2. Tiendas: chekelin's off switch with an end time.
--   3. Conversations: the handoff state and the 5 / 10 minute timers.
--   4. Messages: who in the team sent each reply (first reply claims a chat).
--   5. A trigger that keeps the conversation's state up to date on every
--      message (customer wrote, a person replied — in cheke, on the phone or
--      in the Instagram/Meta app — and chekelin coming back).
--   6. route_conversation(): who gets a chat (same person as last time →
--      least busy available Agente → Gerente → Dueño).
--   7. conversation_notes: team-only notes (chekelin's handoff summary).
--      Never sent to the customer.
--   8. template_suggestions: "Sugerencias de chekelin" for Plantillas.
--   9. Small functions the app calls (Ausente, avisarme de todo, chekelin
--      off switch) and the list of conversations the timers must look at.
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today keeps working with it.

-- ---------------------------------------------------------------------------
-- 1. People
-- ---------------------------------------------------------------------------

alter table members
  -- Ausente: keeps their open chats, gets no new ones. Available by default.
  add column if not exists away boolean not null default false,
  -- Dueños only: be notified of every chat, not just their own.
  add column if not exists notify_all boolean not null default false,
  add column if not exists last_assigned_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Tiendas: chekelin off switch
-- ---------------------------------------------------------------------------

-- Null or in the past = chekelin on. A date = off until then. "Hasta que lo
-- active" is stored as year 9999.
alter table stores add column if not exists chekelin_off_until timestamptz;

-- When chekelin last looked for Sugerencias in this Negocio (weekly job).
alter table businesses add column if not exists suggestions_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Conversations: handoff state and timers
-- ---------------------------------------------------------------------------

alter table conversations
  -- Set = chekelin handed the chat to a person (or a person took it). Null
  -- again when chekelin comes back (closed, or 7 days without messages).
  add column if not exists handed_off_at timestamptz,
  -- chekelin's replies since it last started as first responder.
  add column if not exists chekelin_replies integer not null default 0,
  add column if not exists assigned_at timestamptz,
  -- The person who had it last time, kept after chekelin comes back, so the
  -- customer gets the same person again when available.
  add column if not exists last_assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_human_reply_at timestamptz,
  -- The customer's first message still without a reply from a person.
  add column if not exists awaiting_since timestamptz,
  -- 5 minutes: "Ya le avisamos a …" + second alert sent.
  add column if not exists wait_notice_sent_at timestamptz,
  -- 10 minutes: Gerente / Dueño alerted.
  add column if not exists escalated_at timestamptz,
  -- The customer message chekelin last checked for a simple fact.
  add column if not exists simple_fact_checked_at timestamptz,
  -- Last time the conversation was won, lost or closed.
  add column if not exists closed_at timestamptz;

create index if not exists conversations_awaiting_idx
  on conversations (awaiting_since) where awaiting_since is not null;
create index if not exists conversations_assigned_idx
  on conversations (business_id, assigned_to) where assigned_to is not null;

-- Won, lost or closed: remember when, so chekelin can come back next time
-- the customer writes.
create or replace function conversations_track_close()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.stage in ('ganado', 'perdido') and new.stage is distinct from old.stage)
     or (new.status = 'closed' and old.status is distinct from 'closed') then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_close on conversations;
create trigger conversations_close
  before update of stage, status on conversations
  for each row execute function conversations_track_close();

-- ---------------------------------------------------------------------------
-- 4. Messages: who sent each reply
-- ---------------------------------------------------------------------------

-- The person signed in when the reply was written in cheke. Null for
-- customer messages, chekelin and replies from the phone / Meta apps.
alter table messages
  add column if not exists sent_by uuid references auth.users(id) on delete set null;

-- A signed-in person can only ever write their own id here.
create or replace function messages_set_sent_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and new.direction = 'out' and not new.is_bot then
    new.sent_by := auth.uid();
  elsif auth.uid() is not null then
    new.sent_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_sent_by on messages;
create trigger messages_sent_by
  before insert on messages
  for each row execute function messages_set_sent_by();

-- ---------------------------------------------------------------------------
-- 5. Keep the conversation's state up to date on every message
-- ---------------------------------------------------------------------------

create or replace function track_conversation_routing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv conversations%rowtype;
  prev_at timestamptz;
  claimer uuid;
begin
  -- Imported chat history is the past: it changes nothing.
  if new.source = 'history' then
    return null;
  end if;

  select * into conv from conversations where id = new.conversation_id;
  if not found then
    return null;
  end if;

  if new.direction = 'in' then
    -- chekelin comes back once the chat was won, lost or closed, or after 7
    -- days without messages.
    if conv.handed_off_at is not null then
      select max(created_at) into prev_at
      from messages
      where conversation_id = new.conversation_id and id <> new.id and created_at <= new.created_at;

      if (conv.closed_at is not null and conv.closed_at > conv.handed_off_at)
         or (prev_at is not null and prev_at < new.created_at - interval '7 days') then
        update conversations
        set handed_off_at = null,
            chekelin_replies = 0,
            last_assigned_to = coalesce(assigned_to, last_assigned_to),
            assigned_to = null,
            awaiting_since = null,
            wait_notice_sent_at = null,
            escalated_at = null
        where id = conv.id;
      end if;
    end if;

    -- Old messages (a late delivery, demo data) never start the timers.
    update conversations
    set last_inbound_at = greatest(coalesce(last_inbound_at, new.created_at), new.created_at),
        awaiting_since = case
          when awaiting_since is null and new.created_at > now() - interval '30 minutes' then new.created_at
          else awaiting_since
        end
    where id = conv.id;

  elsif not new.is_bot then
    -- A person replied: in cheke, on the phone (WhatsApp Business app) or in
    -- the Instagram / Meta app. chekelin goes silent and the timers stop.
    -- An unassigned chat is claimed by whoever replied; a reply from the
    -- phone or a Meta app goes to the Dueño.
    claimer := new.sent_by;
    if conv.assigned_to is null and claimer is null and new.source in ('phone', 'meta_app') then
      select user_id into claimer
      from members
      where business_id = conv.business_id and role = 'owner'
      order by created_at
      limit 1;
    end if;

    update conversations
    set last_human_reply_at = greatest(coalesce(last_human_reply_at, new.created_at), new.created_at),
        awaiting_since = null,
        wait_notice_sent_at = null,
        escalated_at = null,
        handed_off_at = coalesce(handed_off_at, new.created_at),
        assigned_at = case when assigned_to is null and claimer is not null then now() else assigned_at end,
        assigned_to = coalesce(assigned_to, claimer),
        last_assigned_to = coalesce(assigned_to, claimer, last_assigned_to)
    where id = conv.id;
  end if;

  return null;
end;
$$;

drop trigger if exists messages_routing on messages;
create trigger messages_routing
  after insert on messages
  for each row execute function track_conversation_routing();

-- ---------------------------------------------------------------------------
-- 6. Who gets a chat
-- ---------------------------------------------------------------------------

-- Assigns an unassigned conversation and returns who has it. Order:
--   1. the person who had it last time, if available (not Ausente);
--   2. the available Agente of the Tienda with the fewest open chats
--      (tie: the one who got a chat least recently);
--   3. an available Gerente of the Tienda, then an available Dueño;
--   4. a Gerente or Dueño even if Ausente.
-- In a one-person Negocio that is always the Dueño. Server only.
create or replace function route_conversation(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv record;
  pick uuid;
begin
  select id, business_id, store_id, assigned_to, last_assigned_to
  into conv
  from conversations
  where id = p_conversation_id
  for update;
  if not found then
    return null;
  end if;
  if conv.assigned_to is not null then
    return conv.assigned_to;
  end if;

  select p.user_id into pick
  from (
    select m.user_id,
           m.role,
           m.away,
           m.last_assigned_at,
           (
             select count(*)
             from conversations c
             where c.business_id = conv.business_id
               and c.assigned_to = m.user_id
               and c.status <> 'closed'
               and c.stage not in ('ganado', 'perdido')
           ) as open_count
    from members m
    where m.business_id = conv.business_id
      and (
        m.role = 'owner'
        or exists (select 1 from store_members sm where sm.store_id = conv.store_id and sm.user_id = m.user_id)
      )
  ) p
  order by
    coalesce(p.user_id = conv.last_assigned_to and not p.away, false) desc,
    case
      when not p.away and p.role = 'agent' then 0
      when not p.away and p.role = 'manager' then 1
      when not p.away and p.role = 'owner' then 2
      when p.role = 'manager' then 3
      when p.role = 'owner' then 4
      else 5
    end,
    p.open_count,
    p.last_assigned_at nulls first,
    p.user_id
  limit 1;

  if pick is null then
    return null;
  end if;

  update conversations
  set assigned_to = pick, assigned_at = now(), last_assigned_to = pick
  where id = conv.id;
  update members set last_assigned_at = now() where business_id = conv.business_id and user_id = pick;
  return pick;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Team-only notes (never sent to the customer)
-- ---------------------------------------------------------------------------

create table if not exists conversation_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  -- 'handoff' = chekelin's summary when it passed the chat to a person.
  kind text not null default 'handoff' check (kind in ('handoff')),
  -- What the customer wants.
  summary text not null,
  -- Why chekelin handed it off, in plain Spanish.
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists conversation_notes_conversation_idx on conversation_notes (conversation_id, created_at desc);

alter table conversation_notes enable row level security;

-- Seen by the Tienda's people (and Dueños), like the conversation itself.
-- Written only by the server.
drop policy if exists "store read" on conversation_notes;
create policy "store read" on conversation_notes for select using (store_id in (select my_store_ids()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_notes'
     ) then
    alter publication supabase_realtime add table conversation_notes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Sugerencias de chekelin (Plantillas)
-- ---------------------------------------------------------------------------

create table if not exists template_suggestions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  -- The question the team kept answering.
  question text not null,
  -- How many times it was answered in the week.
  times integer not null default 0,
  -- The proposed Plantilla (the team's best answer).
  name text not null,
  category text not null check (category in ('precios', 'pagos', 'envios', 'bienvenida', 'seguimiento')),
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);

create index if not exists template_suggestions_business_idx on template_suggestions (business_id, status);

alter table template_suggestions enable row level security;

-- Dueños and Gerentes of the Negocio.
create or replace function can_manage_templates(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from members
    where business_id = target_business_id and user_id = auth.uid() and role in ('owner', 'manager')
  );
$$;

revoke all on function can_manage_templates(uuid) from public;
grant execute on function can_manage_templates(uuid) to authenticated;

-- They see, approve (save as Plantilla) or dismiss them. Created only by the
-- weekly job (server).
drop policy if exists "managers read suggestions" on template_suggestions;
create policy "managers read suggestions" on template_suggestions for select using (can_manage_templates(business_id));
drop policy if exists "managers decide suggestions" on template_suggestions;
create policy "managers decide suggestions" on template_suggestions for update
  using (can_manage_templates(business_id)) with check (can_manage_templates(business_id));

-- ---------------------------------------------------------------------------
-- 9. Functions the app calls
-- ---------------------------------------------------------------------------

-- Ausente on/off. Yourself; a Dueño for anyone; a Gerente for the Agentes
-- of their Tiendas.
create or replace function set_member_away(p_business_id uuid, p_user_id uuid, p_away boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_role text;
begin
  select role into caller_role from members where business_id = p_business_id and user_id = auth.uid();
  select role into target_role from members where business_id = p_business_id and user_id = p_user_id;
  if caller_role is null or target_role is null then
    raise exception 'No autorizado';
  end if;
  if not (
    p_user_id = auth.uid()
    or caller_role = 'owner'
    or (
      caller_role = 'manager'
      and target_role = 'agent'
      and exists (
        select 1 from store_members sm
        where sm.user_id = p_user_id and sm.business_id = p_business_id and can_manage_store(sm.store_id)
      )
    )
  ) then
    raise exception 'No puedes cambiar la disponibilidad de esta persona.';
  end if;
  update members set away = coalesce(p_away, false) where business_id = p_business_id and user_id = p_user_id;
end;
$$;

-- "Avisarme de todo": Dueños, for themselves.
create or replace function set_notify_all(p_business_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner_of(p_business_id) then
    raise exception 'Solo los dueños pueden recibir avisos de todo.';
  end if;
  update members set notify_all = coalesce(p_on, false) where business_id = p_business_id and user_id = auth.uid();
end;
$$;

-- chekelin off (until a date) or on (null) in a Tienda: its Dueños and
-- Gerentes.
create or replace function set_chekelin_off(p_store_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_store(p_store_id) then
    raise exception 'Solo el dueño o el gerente de la tienda puede apagar a chekelin.';
  end if;
  update stores set chekelin_off_until = p_until where id = p_store_id;
end;
$$;

revoke all on function set_member_away(uuid, uuid, boolean) from public;
grant execute on function set_member_away(uuid, uuid, boolean) to authenticated;
revoke all on function set_notify_all(uuid, boolean) from public;
grant execute on function set_notify_all(uuid, boolean) to authenticated;
revoke all on function set_chekelin_off(uuid, timestamptz) from public;
grant execute on function set_chekelin_off(uuid, timestamptz) to authenticated;

-- The conversations the timers (cron job, every minute) must look at, and
-- what is due on each. Server only.
create or replace function chekelin_due_conversations(p_limit integer default 50)
returns table (id uuid, facts_due boolean, notice_due boolean, escalation_due boolean)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.facts_due, d.notice_due, d.escalation_due
  from (
    select c.id,
           c.awaiting_since,
           (
             c.handed_off_at is not null
             and c.last_inbound_at <= now() - interval '5 minutes'
             and (c.simple_fact_checked_at is null or c.simple_fact_checked_at < c.last_inbound_at)
           ) as facts_due,
           (c.wait_notice_sent_at is null) as notice_due,
           (
             c.escalated_at is null
             and c.awaiting_since <= now() - interval '10 minutes'
             and (select count(*) from members m where m.business_id = c.business_id) >= 2
           ) as escalation_due
    from conversations c
    where c.awaiting_since is not null
      and c.awaiting_since <= now() - interval '5 minutes'
  ) d
  where d.facts_due or d.notice_due or d.escalation_due
  order by d.awaiting_since
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function route_conversation(uuid) from public, anon, authenticated;
revoke all on function chekelin_due_conversations(integer) from public, anon, authenticated;
revoke all on function track_conversation_routing() from public, anon, authenticated;

-- Equipo / Chat: names (from the sign-in profile), Ausente and "avisarme de
-- todo" for everyone in the Negocio. Same gate as before (members only).
drop function if exists business_members(uuid);
create function business_members(target_business_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz, name text, away boolean, notify_all boolean)
language sql
security definer
stable
set search_path = public
as $$
  select m.user_id,
         u.email::text,
         m.role,
         m.created_at,
         coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
         ),
         m.away,
         m.notify_all
  from members m
  join auth.users u on u.id = m.user_id
  where m.business_id = target_business_id
    and is_member_of(target_business_id)
  order by m.created_at asc;
$$;

revoke all on function business_members(uuid) from public;
grant execute on function business_members(uuid) to authenticated;
