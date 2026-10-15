-- WhatsApp Business app "coexistence": a business connects the number it
-- already uses in the WhatsApp Business app and keeps using the app on its
-- phone. Meta then mirrors everything into cheke: messages the business
-- sends from the phone ("echoes"), up to 6 months of chat history, and the
-- phone's contacts. Safe to run more than once.

-- Channels: whether the number came over from the phone app, and how the
-- one-time history/contacts import is going. Meta allows each import only
-- once, and only within 24 hours of connecting, so we record when each was
-- requested to never ask twice.
alter table channels
  add column if not exists coexistence boolean not null default false,
  add column if not exists contacts_sync_requested_at timestamptz,
  add column if not exists history_sync_requested_at timestamptz,
  add column if not exists history_sync_progress integer,
  add column if not exists history_sync_error text;

-- Messages: where a message came from. 'cheke' = arrived or was sent live
-- through cheke (an agent or chekelin), 'phone' = sent from the WhatsApp
-- Business app on the business's phone, 'history' = imported from the chat
-- history when the number was connected.
alter table messages
  add column if not exists source text not null default 'cheke';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_source_check') then
    alter table messages
      add constraint messages_source_check check (source in ('cheke', 'phone', 'history'));
  end if;
end $$;
