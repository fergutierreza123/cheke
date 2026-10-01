-- Chekelin, the AI first-reply assistant: `bot_enabled` controls whether a
-- conversation gets auto-replies (on by default; turned off automatically
-- once a human agent sends a manual message, or by hand from the Chat UI).
-- `messages.is_bot` lets the UI show which replies came from Chekelin vs a
-- human agent.

alter table conversations
  add column bot_enabled boolean not null default true;

alter table messages
  add column is_bot boolean not null default false;
