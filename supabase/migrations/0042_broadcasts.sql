-- Difusión: send one approved WhatsApp template to every Contacto with an
-- Etiqueta (docs/research/difusion-whatsapp.md).
--
--   - contacts.marketing_opt_out: the customer asked for no more offers
--     (replied "BAJA", stopped them in WhatsApp → error 131050 or the
--     user_preferences webhook). Difusiones skip them.
--   - broadcasts: one row per Difusión (which number, which template, which
--     Etiquetas). Dueños and Gerentes of that Tienda read and create them.
--   - broadcast_recipients: one row per customer, with how the send went.
--     Read by the same people; written only by the server (the server action
--     that creates the Difusión, /api/cron/broadcasts and the webhook).
--
-- Additive and safe to run more than once.

alter table contacts add column if not exists marketing_opt_out boolean not null default false;

create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  -- Copy of the template as it was sent: name, language, category, components.
  template jsonb not null,
  -- The values typed for each {{n}}.
  template_values jsonb not null default '{}'::jsonb,
  -- The variable filled with each customer's first name (its typed value is
  -- the fallback for customers without a name), or null.
  name_variable text,
  tags text[] not null default '{}',
  -- draft: its recipients are still being saved; the cron only sends 'sending'.
  status text not null default 'draft' check (status in ('draft', 'sending', 'done')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists broadcasts_store_idx on broadcasts (store_id, created_at desc);
create index if not exists broadcasts_sending_idx on broadcasts (status) where status = 'sending';

create table if not exists broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  -- 131049 (Meta's per-customer marketing limit): wait 24 h before retrying.
  next_attempt_at timestamptz not null default now(),
  error_code int,
  message_id uuid references messages(id) on delete set null,
  external_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (broadcast_id, contact_id)
);

create index if not exists broadcast_recipients_pending_idx
  on broadcast_recipients (broadcast_id, next_attempt_at) where status = 'pending';
-- The 24 h limit counts what the Negocio sent in the last day.
create index if not exists broadcast_recipients_sent_idx
  on broadcast_recipients (business_id, sent_at) where sent_at is not null;
create index if not exists broadcast_recipients_external_idx
  on broadcast_recipients (external_message_id) where external_message_id is not null;

-- A Difusión goes out from a number of its own Tienda and Negocio.
create or replace function broadcasts_check_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from channels
    where id = new.channel_id and business_id = new.business_id and store_id = new.store_id and type = 'whatsapp'
  ) then
    raise exception 'La difusión no pertenece a ese número de WhatsApp.';
  end if;
  return new;
end;
$$;

drop trigger if exists broadcasts_check_channel on broadcasts;
create trigger broadcasts_check_channel
  before insert or update of channel_id, business_id, store_id on broadcasts
  for each row execute function broadcasts_check_channel();

alter table broadcasts enable row level security;
alter table broadcast_recipients enable row level security;

-- Dueños, and Gerentes of that Tienda (can_manage_store, 0018).
drop policy if exists "managers read" on broadcasts;
create policy "managers read" on broadcasts for select using (can_manage_store(store_id));
drop policy if exists "managers create" on broadcasts;
create policy "managers create" on broadcasts for insert
  with check (can_manage_store(store_id) and created_by = auth.uid() and status = 'draft');

drop policy if exists "managers read" on broadcast_recipients;
create policy "managers read" on broadcast_recipients for select
  using (broadcast_id in (select id from broadcasts));
