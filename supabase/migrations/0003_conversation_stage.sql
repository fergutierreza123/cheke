-- Adds the Chekeo stage to conversations, matching the approved design
-- (design/Inbox.html, design/Contacts.html) so Chat can tag a conversation's
-- sales stage now, ahead of the full Chekeo kanban board (later phase)
-- reading/writing the same column.

alter table conversations
  add column stage text not null default 'nuevo'
  check (stage in ('nuevo', 'consulta', 'cotizacion', 'negociacion', 'ganado', 'perdido'));
