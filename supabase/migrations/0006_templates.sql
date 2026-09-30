-- Plantillas (message templates) — not in CLAUDE.md's original core data
-- model, but it's an approved screen (design/Templates.html) and doesn't
-- depend on WhatsApp being connected, so building it now.

create table templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  category text not null check (category in ('precios', 'pagos', 'envios', 'bienvenida', 'seguimiento')),
  body text not null,
  created_at timestamptz not null default now()
);

alter table templates enable row level security;

create policy "tenant read" on templates for select using (is_member_of(business_id));
create policy "tenant write" on templates for insert with check (is_member_of(business_id));
create policy "tenant update" on templates for update using (is_member_of(business_id));
create policy "tenant delete" on templates for delete using (is_member_of(business_id));
