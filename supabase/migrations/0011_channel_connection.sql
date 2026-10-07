-- Per-business WhatsApp connection (Embedded Signup): which WhatsApp
-- Business Account and number a channel points at, shown in the Canales
-- screen. The access token itself stays in `access_token_encrypted`
-- (AES-256-GCM, see src/lib/crypto.ts), and `registration_pin_encrypted`
-- keeps the 6-digit pin chosen when the number was registered, in case it
-- ever has to be registered again.

alter table channels
  add column waba_id text,
  add column display_phone text,
  add column verified_name text,
  add column registration_pin_encrypted text,
  add column connected_at timestamptz;
