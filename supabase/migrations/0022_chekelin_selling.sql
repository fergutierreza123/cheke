-- chekelin sells on its own: what it knows about each Tienda, orders it
-- takes, payment confirmation, and complaints (Quejas).
-- Design: GitHub issue #40 (closing comment), built in issue #42.
-- Glossary: GLOSSARY.md (Queja, Lo que chekelin sabe).
--
-- What this adds:
--   1. store_chekelin_info: "Lo que chekelin sabe de tu negocio", one row per
--      Tienda (payment methods, shipping, delivery hours, returns, FAQ and
--      tú / vos / usted). Dueños and the Tienda's Gerentes edit it; everyone
--      in the Tienda reads it.
--   2. Conversations: an open Queja (chekelin silent until a person marks it
--      resolved) and when chekelin reached an order (stops the 15-message cap).
--   3. Orders: who created it (a person or chekelin), the delivery details
--      chekelin collected, when the customer sent the receipt and who
--      confirmed the payment. Orders also go live to Chat (Realtime).
--   4. conversation_notes: two new kinds, 'complaint' and 'payment'.
--   5. The timers never answer "simple facts" in a chat with an open Queja.
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today keeps working with it.

-- ---------------------------------------------------------------------------
-- 1. Lo que chekelin sabe de tu negocio (per Tienda)
-- ---------------------------------------------------------------------------

create table if not exists store_chekelin_info (
  store_id uuid primary key references stores(id) on delete cascade,
  -- Filled from the Tienda by the trigger below; never trusted from the app.
  business_id uuid not null references businesses(id) on delete cascade,
  -- Formas de pago (bank accounts, payment link…). Sent as the payment
  -- details when chekelin closes an order.
  payment_methods text not null default '' check (char_length(payment_methods) <= 2000),
  -- Envíos (zones, carriers, costs, times).
  shipping text not null default '' check (char_length(shipping) <= 2000),
  -- Horario de entregas.
  delivery_hours text not null default '' check (char_length(delivery_hours) <= 2000),
  -- Cambios y devoluciones.
  returns_policy text not null default '' check (char_length(returns_policy) <= 2000),
  -- Otras preguntas frecuentes.
  faq text not null default '' check (char_length(faq) <= 4000),
  -- How chekelin addresses customers: 'mirror' = the way the customer writes.
  address_form text not null default 'mirror' check (address_form in ('mirror', 'tu', 'vos', 'usted')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function store_chekelin_info_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select business_id into new.business_id from stores where id = new.store_id;
  if new.business_id is null then
    raise exception 'Tienda no encontrada';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

revoke all on function store_chekelin_info_fill() from public, anon, authenticated;

drop trigger if exists store_chekelin_info_fill on store_chekelin_info;
create trigger store_chekelin_info_fill
  before insert or update on store_chekelin_info
  for each row execute function store_chekelin_info_fill();

alter table store_chekelin_info enable row level security;

-- Read: the Tienda's people (and Dueños). Write: Dueños and the Tienda's
-- Gerentes, like the Tienda's channels (0018). Never deleted from the app.
drop policy if exists "store read" on store_chekelin_info;
create policy "store read" on store_chekelin_info for select using (store_id in (select my_store_ids()));
drop policy if exists "store managers write" on store_chekelin_info;
create policy "store managers write" on store_chekelin_info for insert with check (can_manage_store(store_id));
drop policy if exists "store managers update" on store_chekelin_info;
create policy "store managers update" on store_chekelin_info for update
  using (can_manage_store(store_id)) with check (can_manage_store(store_id));

-- ---------------------------------------------------------------------------
-- 2. Conversations: Queja and orders reached by chekelin
-- ---------------------------------------------------------------------------

alter table conversations
  -- Set = an open Queja: red tag in Chat, chekelin silent until a person
  -- marks it resolved ("Marcar queja resuelta").
  add column if not exists complaint_open_at timestamptz,
  add column if not exists complaint_resolved_at timestamptz,
  -- chekelin sent payment details for an order in this chat. While set, the
  -- "about 15 messages without an order" handoff doesn't apply. Cleared when
  -- the payment is confirmed (a new sale starts the count again).
  add column if not exists chekelin_order_at timestamptz;

create index if not exists conversations_complaint_idx
  on conversations (business_id) where complaint_open_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Orders taken by chekelin and payment confirmation
-- ---------------------------------------------------------------------------

alter table orders
  -- 'cheke' = a person used "Cobrar"; 'chekelin' = chekelin closed the order.
  add column if not exists source text not null default 'cheke',
  -- What chekelin collected: customer name, city, address, delivery method,
  -- shipping cost.
  add column if not exists details jsonb not null default '{}'::jsonb,
  -- The customer sent a receipt or said they paid: waiting for "Confirmar pago".
  add column if not exists receipt_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id) on delete set null;

create index if not exists orders_conversation_status_idx on orders (conversation_id, status);

-- Chat shows "Comprobante recibido · Confirmar pago" live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
     ) then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Team-only notes: complaint and payment notes
-- ---------------------------------------------------------------------------

alter table conversation_notes drop constraint if exists conversation_notes_kind_check;
alter table conversation_notes
  add constraint conversation_notes_kind_check check (kind in ('handoff', 'complaint', 'payment'));

-- ---------------------------------------------------------------------------
-- 5. Timers: no "simple facts" while a Queja is open
-- ---------------------------------------------------------------------------

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
             and c.complaint_open_at is null
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

revoke all on function chekelin_due_conversations(integer) from public, anon, authenticated;
