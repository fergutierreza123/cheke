-- Respuestas rápidas (issue #52): saved replies per Negocio, inserted in the
-- Chat composer by typing "/" and a shortcut (e.g. /horario, /envios).
-- An optional {nombre} in the text becomes the Contacto's name when used.
--
-- Everyone in the Negocio uses them; Dueños and Gerentes create, edit and
-- delete them (can_manage_templates(), from 0021).
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today doesn't touch this table.

create table if not exists quick_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  -- What follows the "/": lowercase letters without accents, numbers, "-" and "_"
  -- (the app normalizes what people type: "Envíos" → "envios").
  shortcut text not null check (shortcut ~ '^[a-z0-9_-]{1,30}$'),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (business_id, shortcut)
);

create or replace function quick_replies_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

drop trigger if exists quick_replies_touch on quick_replies;
create trigger quick_replies_touch
  before insert or update on quick_replies
  for each row execute function quick_replies_touch();

alter table quick_replies enable row level security;

drop policy if exists "tenant read" on quick_replies;
create policy "tenant read" on quick_replies for select using (is_member_of(business_id));
drop policy if exists "managers write" on quick_replies;
create policy "managers write" on quick_replies for insert with check (can_manage_templates(business_id));
drop policy if exists "managers update" on quick_replies;
create policy "managers update" on quick_replies for update
  using (can_manage_templates(business_id)) with check (can_manage_templates(business_id));
drop policy if exists "managers delete" on quick_replies;
create policy "managers delete" on quick_replies for delete using (can_manage_templates(business_id));
