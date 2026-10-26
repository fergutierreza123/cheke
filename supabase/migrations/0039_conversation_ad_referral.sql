-- Which ad a chat came from (docs/research/respond-io-gap.md, R18).
--
-- Meta adds a `referral` object to the first message a customer sends after
-- tapping a "Enviar mensaje" ad (WhatsApp, Instagram, Messenger). The
-- webhooks save it on the conversation, first ad wins (src/lib/adReferral.ts).
-- Chat shows "Vino de un anuncio: …" and Analítica counts chats per ad.
--
-- Same Row Level Security as the rest of the conversation (each Tienda's
-- people read it). Written only by the server: a trigger stops anyone signed
-- in from changing it, so the per-ad numbers can't be edited by hand.
--
-- Additive and safe to run more than once.

alter table conversations
  -- Meta's referral object, as received.
  add column if not exists referral jsonb,
  add column if not exists referral_source text,
  add column if not exists referral_ad_id text,
  add column if not exists referral_headline text,
  add column if not exists referral_url text,
  add column if not exists referral_at timestamptz;

alter table conversations drop constraint if exists conversations_referral_source_check;
alter table conversations add constraint conversations_referral_source_check
  check (referral_source is null or referral_source in ('anuncio', 'publicación'));

create index if not exists conversations_referral_ad_idx
  on conversations (business_id, referral_at)
  where referral is not null;

create or replace function conversations_referral_server_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role (the webhooks). On insert, old is null.
  if auth.uid() is not null and (
       new.referral is distinct from old.referral
    or new.referral_source is distinct from old.referral_source
    or new.referral_ad_id is distinct from old.referral_ad_id
    or new.referral_headline is distinct from old.referral_headline
    or new.referral_url is distinct from old.referral_url
    or new.referral_at is distinct from old.referral_at
  ) then
    raise exception 'El anuncio de origen no se puede cambiar.';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_referral_server_only on conversations;
create trigger conversations_referral_server_only before insert or update on conversations
  for each row execute function conversations_referral_server_only();
