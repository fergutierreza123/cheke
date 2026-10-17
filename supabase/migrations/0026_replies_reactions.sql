-- Replies, reactions, read receipts and edited/deleted messages in Chat, so
-- it feels like the WhatsApp app. Built in issue #51.
--
-- What this adds to messages:
--   reply_to_id   the message this one answers (customer or agent "Responder").
--   reaction_in   the customer's emoji on this message (null = none).
--   reaction_out  the business's emoji on this message (null = none).
--   edited_at     when the text was changed (customer, or the phone under
--                 Coexistence). Chat shows "Editado".
--   deleted_at    when it was deleted for everyone. Chat shows
--                 "Mensaje eliminado"; the text is cleared.
--
-- Inbound messages also use status = 'read' from now on: set when someone
-- on the team opens the chat (the customer sees the blue ticks).
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today keeps working with it.

alter table messages add column if not exists reply_to_id uuid references messages(id) on delete set null;
alter table messages add column if not exists reaction_in text;
alter table messages add column if not exists reaction_out text;
alter table messages add column if not exists edited_at timestamptz;
alter table messages add column if not exists deleted_at timestamptz;

comment on column messages.reply_to_id is 'The message this one quotes (WhatsApp context / Instagram & Messenger reply_to).';
comment on column messages.reaction_in is 'The customer''s reaction emoji on this message; null when none.';
comment on column messages.reaction_out is 'The business''s reaction emoji on this message; null when none.';
comment on column messages.edited_at is 'When the text was edited after sending (Chat shows "Editado").';
comment on column messages.deleted_at is 'When it was deleted for everyone (Chat shows "Mensaje eliminado").';

-- A quote must point at a message in the same conversation. Otherwise a
-- webhook lookup or a hand-made request could link a message to one from
-- another chat (or another Negocio) and Chat would show its text. Such a
-- quote is dropped (set to null) rather than rejected, so the message
-- itself is never lost.
create or replace function keep_reply_in_conversation() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from messages q
    where q.id = new.reply_to_id and q.conversation_id = new.conversation_id
  ) then
    new.reply_to_id := null;
  end if;
  return new;
end $$;

drop trigger if exists messages_reply_same_conversation on messages;
create trigger messages_reply_same_conversation
  before insert or update of reply_to_id, conversation_id on messages
  for each row execute function keep_reply_in_conversation();
