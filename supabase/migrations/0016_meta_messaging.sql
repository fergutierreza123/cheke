-- Instagram DMs + Facebook Messenger ("Conectar Instagram y Facebook" in
-- Canales). Each connected Facebook Page is one channel (type 'facebook',
-- external_id = Page id) and its linked Instagram professional account is
-- another (type 'instagram', external_id = Instagram account id). Both send
-- and receive through the Page, with the Page's token (encrypted in
-- access_token_encrypted, like WhatsApp's). Safe to run more than once.

-- Channels: the Facebook Page a channel goes through (for 'facebook' it's
-- the same as external_id; for 'instagram' it's the linked Page). The
-- Page name / "@instagram_user" is shown from verified_name.
alter table channels
  add column if not exists page_id text;

-- Contacts: how Meta identifies the customer to this business. These are
-- not the handle a person types in Contactos (ig_handle / fb_id stay for
-- that): Meta gives each customer a numeric id that only works with this
-- business's Page (Messenger) or Instagram account. The webhook uses them to
-- find the right contact, and the Chat uses them to send replies.
alter table contacts
  add column if not exists fb_psid text,
  add column if not exists ig_id text;

create unique index if not exists contacts_business_fb_psid_key
  on contacts (business_id, fb_psid) where fb_psid is not null;
create unique index if not exists contacts_business_ig_id_key
  on contacts (business_id, ig_id) where ig_id is not null;

-- Messages: 'meta_app' = a reply the business wrote outside cheke, in the
-- Instagram app or Meta Business Suite / the Page inbox (Meta "echoes" it to
-- us). Like 'phone' for WhatsApp, it pauses chekelin for that chat.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'messages_source_check') then
    alter table messages drop constraint messages_source_check;
  end if;
  alter table messages
    add constraint messages_source_check check (source in ('cheke', 'phone', 'history', 'meta_app'));
end $$;
