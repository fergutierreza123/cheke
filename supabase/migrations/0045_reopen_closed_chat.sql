-- «Listo» in Chat (docs/research/respond-io-ui-baseline.md, item 7): a
-- person closes a chat (conversations.status = 'closed') and it leaves the
-- list until the customer writes again. This reopens it on every inbound
-- path at once (WhatsApp, Instagram, Facebook webhooks, modo prueba).
-- Imported history never reopens anything. Re-runnable and additive.

create or replace function reopen_closed_conversation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.direction = 'in' and new.source is distinct from 'history' then
    update conversations set status = 'open'
    where id = new.conversation_id and status = 'closed';
  end if;
  return null;
end;
$$;

drop trigger if exists messages_reopen_conversation on messages;
create trigger messages_reopen_conversation
  after insert on messages
  for each row execute function reopen_closed_conversation();
