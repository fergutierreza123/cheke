-- Per-business WhatsApp connection (Embedded Signup): which WhatsApp
-- Business Account and number a channel points at, shown in the Canales
-- screen. The access token itself stays in `access_token_encrypted`
-- (AES-256-GCM, see src/lib/crypto.ts), and `registration_pin_encrypted`
-- keeps the 6-digit pin chosen when the number was registered, in case it
-- ever has to be registered again. Safe to run more than once.

alter table channels
  add column if not exists waba_id text,
  add column if not exists display_phone text,
  add column if not exists verified_name text,
  add column if not exists registration_pin_encrypted text,
  add column if not exists connected_at timestamptz;
