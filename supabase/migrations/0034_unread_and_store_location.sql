-- Chat: "No leídos" and the Tienda's location (chat-feature-parity P0 #5, #7).
--
-- What this adds:
--   1. conversation_unread: a view with how many of the customer's messages
--      nobody on the team has seen in each conversation. Chat's list shows it
--      as a badge (and the "No leídos" filter). Same rule as src/lib/unread.ts:
--      inbound messages not marked 'read' (someone opening the chat marks
--      them, issue #51), newer than the last message a PERSON sent (in cheke
--      or from the phone; chekelin's replies don't count), ignoring chat
--      history imported when the number was connected.
--      security_invoker = the reader's Row Level Security applies, so each
--      person only gets counts of the conversations they can already see.
--   2. A partial index so counting only touches unread inbound messages.
--   3. store_chekelin_info: the Tienda's location for "Ubicación" in Chat
--      (address, a pasted Google Maps link, and the pin). Same RLS as the
--      rest of the row (0022): the Tienda reads, Dueños/Gerentes write.
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it. (The Chat list falls back to counting in the app if the
-- view is missing, but the location fields need it.)

-- ---------------------------------------------------------------------------
-- 1–2. No leídos
-- ---------------------------------------------------------------------------

create index if not exists messages_unread_inbound_idx
  on messages (conversation_id, created_at)
  where direction = 'in' and status <> 'read';

create or replace view conversation_unread
with (security_invoker = true)
as
select m.conversation_id, count(*)::int as unread_count
from messages m
where m.direction = 'in'
  and m.status <> 'read'
  and m.source <> 'history'
  and not exists (
    select 1
    from messages o
    where o.conversation_id = m.conversation_id
      and o.direction = 'out'
      and o.is_bot = false
      and o.created_at > m.created_at
  )
group by m.conversation_id;

revoke all on conversation_unread from anon;
grant select on conversation_unread to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The Tienda's location ("Lo que chekelin sabe")
-- ---------------------------------------------------------------------------

alter table store_chekelin_info
  -- Written for people: "Col. Palmira, frente al parque, Tegucigalpa".
  add column if not exists location_address text not null default '',
  -- The Google Maps link the owner pasted (may be a maps.app.goo.gl link).
  add column if not exists location_maps_url text not null default '',
  -- The pin: from the link, or «Usar mi ubicación actual». Null = no pin
  -- (WhatsApp then gets the address and link as text).
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

alter table store_chekelin_info drop constraint if exists store_chekelin_info_location_check;
alter table store_chekelin_info add constraint store_chekelin_info_location_check check (
  char_length(location_address) <= 300
  and char_length(location_maps_url) <= 2000
  and (location_lat is null or location_lat between -90 and 90)
  and (location_lng is null or location_lng between -180 and 180)
  and ((location_lat is null) = (location_lng is null))
);
