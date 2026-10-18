-- WhatsApp templates approved by Meta (issue: chat-feature-parity P0 #6).
--
-- After 24 h without a message from the customer, WhatsApp only lets a
-- business write with a message template that Meta approved. This table keeps
-- each connected number's templates, read from its WhatsApp Business Account
-- (GET /{waba_id}/message_templates, permission whatsapp_business_management):
--   - refreshed when someone taps "Actualizar" (Chat / Plantillas) and once a
--     day by /api/cron/channel-health;
--   - Chat sends an APPROVED one when the 24 h window is closed;
--   - Plantillas can send a saved reply to Meta for approval
--     (POST /{waba_id}/message_templates): the row starts as PENDING and
--     source_template_id points at that saved reply.
--
-- Not the same as `templates` (cheke's own saved replies, 0006): those are
-- plain text a person edits before sending inside the window.
--
-- Read: the Canal's Tienda people and the Dueños (like channels, 0018). Every
-- write goes through the server (sync, cron, or a server action after it
-- checked the person's access), so there are no write policies.
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today doesn't touch this table.

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  -- The WhatsApp Business Account it was read from.
  waba_id text not null,
  -- Meta's id for the template (missing only on very old rows).
  meta_template_id text,
  -- Meta's template name (lowercase, numbers and "_") and language ("es").
  name text not null,
  language text not null,
  -- APPROVED, PENDING, REJECTED, PAUSED, DISABLED, IN_APPEAL, ...
  status text not null,
  -- MARKETING, UTILITY or AUTHENTICATION.
  category text not null,
  -- Meta's components array as returned (HEADER, BODY, FOOTER, BUTTONS).
  components jsonb not null default '[]'::jsonb,
  -- Why Meta rejected it (e.g. INVALID_FORMAT, PROMOTIONAL), when it did.
  rejected_reason text,
  -- The saved reply (Plantilla) it was created from in cheke, if any.
  source_template_id uuid references templates(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (channel_id, name, language)
);

create index if not exists whatsapp_templates_store_idx on whatsapp_templates (store_id);
create index if not exists whatsapp_templates_source_idx on whatsapp_templates (source_template_id)
  where source_template_id is not null;

-- The row's Negocio and Tienda must be its Canal's.
create or replace function whatsapp_templates_check_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from channels
    where id = new.channel_id and business_id = new.business_id and store_id = new.store_id
  ) then
    raise exception 'La plantilla no pertenece a ese canal.';
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_templates_check_channel on whatsapp_templates;
create trigger whatsapp_templates_check_channel
  before insert or update of channel_id, business_id, store_id on whatsapp_templates
  for each row execute function whatsapp_templates_check_channel();

alter table whatsapp_templates enable row level security;

drop policy if exists "store read" on whatsapp_templates;
create policy "store read" on whatsapp_templates for select using (store_id in (select my_store_ids()));
