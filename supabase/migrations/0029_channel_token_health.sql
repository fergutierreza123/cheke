-- Meta token lifetime (issue #56): clients must never have to reconnect a
-- Canal every 60 days, and when Meta does cut a connection, cheke shows
-- "Reconectar" instead of failing silently. Safe to run more than once.
--
-- - token_expires_at / data_access_expires_at: when the Canal's token ends,
--   from Meta's debug_token right after connecting. null = never.
-- - credential_token_encrypted: Instagram/Facebook only. The client's own
--   token (long-lived user or System-user token), AES-256-GCM like
--   access_token_encrypted, so a Page token Meta stops accepting can be
--   regenerated (GET /<PAGE_ID>?fields=access_token) without the client.
-- - reauth_required_at / reauth_reason: Meta refused the token (code 190, or
--   a permission error on the client's WhatsApp account / Page). The Canal
--   stays 'connected' so customers' messages keep arriving; Canales shows
--   "Reconectar". Cleared when it's connected again.
-- - reauth_notified_at / expiry_warned_at: the Dueños and Gerentes were told
--   (once) that it needs reconnecting / that it ends within 7 days.

alter table channels
  add column if not exists token_expires_at timestamptz,
  add column if not exists data_access_expires_at timestamptz,
  add column if not exists credential_token_encrypted text,
  add column if not exists reauth_required_at timestamptz,
  add column if not exists reauth_reason text,
  add column if not exists reauth_notified_at timestamptz,
  add column if not exists expiry_warned_at timestamptz;

-- The daily check (/api/cron/channel-health) looks for connected Canales
-- whose token ends soon.
create index if not exists channels_token_expires_at_idx
  on channels (token_expires_at)
  where status = 'connected' and token_expires_at is not null;
