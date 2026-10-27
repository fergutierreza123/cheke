-- Notas del equipo (docs/research/respond-io-gap.md, item 4).
--
-- A person writes an internal note on a chat ("ya le cobré", "pasa el
-- sábado") and can @mention teammates, who get a push. Same table as
-- chekelin's notes (conversation_notes), new kind 'team', with its author.
-- Never sent to the customer.
--
-- Additive and safe to run more than once. Run it in Supabase BEFORE merging
-- the code that uses it; the code live today keeps working with it.

alter table conversation_notes
  add column if not exists author_id uuid references auth.users(id) on delete set null;

alter table conversation_notes drop constraint if exists conversation_notes_kind_check;
alter table conversation_notes
  add constraint conversation_notes_kind_check check (kind in ('handoff', 'complaint', 'payment', 'team'));

-- A team note is short text with a person behind it (null only if that
-- person's account was later deleted).
alter table conversation_notes drop constraint if exists conversation_notes_team_check;
alter table conversation_notes
  add constraint conversation_notes_team_check
  check (kind <> 'team' or char_length(btrim(summary)) between 1 and 2000);

-- Seen like the conversation (the existing "store read" policy). Written by
-- the Tienda's people only as themselves, only as a team note, and only on a
-- conversation of that same Tienda and Negocio that they can see.
drop policy if exists "team note insert" on conversation_notes;
create policy "team note insert" on conversation_notes for insert with check (
  kind = 'team'
  and author_id = auth.uid()
  and store_id in (select my_store_ids())
  and exists (
    select 1 from conversations c
    where c.id = conversation_id and c.store_id = conversation_notes.store_id and c.business_id = conversation_notes.business_id
  )
);
