-- Tipo de negocio (productos o servicios) and Horario de atención per
-- Tienda, and a Servicio's duration. Issue #117. Glossary: GLOSSARY.md
-- (Tipo de negocio, Servicio, Horario de atención).
--
-- What this adds:
--   1. store_chekelin_info.business_kind: 'products' (default: every
--      existing Tienda stays as it is) or 'services' (the Catálogo is called
--      «Servicios» and each one has a duration).
--   2. store_chekelin_info.opening_hours: the weekly Horario de atención,
--      7 days Sunday first, each null (cerrado) or {"open":"HH:MM","close":"HH:MM"}
--      in Honduras time. null = not filled in yet. chekelin reads it.
--   Both live in store_chekelin_info so they keep its rules: everyone in the
--   Tienda reads them, only Dueños and the Tienda's Gerentes change them.
--   3. products.duration_min: how long a Servicio takes (null for products).
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today keeps working with it.

create or replace function valid_opening_hours(h jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select h is null or (
    jsonb_typeof(h) = 'array'
    and jsonb_array_length(h) = 7
    and not exists (
      select 1 from jsonb_array_elements(h) d
      where not (
        jsonb_typeof(d) = 'null'
        or (
          jsonb_typeof(d) = 'object'
          and coalesce(d->>'open', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and coalesce(d->>'close', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and d->>'open' < d->>'close'
        )
      )
    )
  );
$$;

alter table store_chekelin_info
  add column if not exists business_kind text not null default 'products',
  add column if not exists opening_hours jsonb;

alter table store_chekelin_info drop constraint if exists store_chekelin_info_business_kind_check;
alter table store_chekelin_info
  add constraint store_chekelin_info_business_kind_check check (business_kind in ('products', 'services'));
alter table store_chekelin_info drop constraint if exists store_chekelin_info_opening_hours_check;
alter table store_chekelin_info
  add constraint store_chekelin_info_opening_hours_check check (valid_opening_hours(opening_hours));

alter table products add column if not exists duration_min integer;
alter table products drop constraint if exists products_duration_min_check;
alter table products
  add constraint products_duration_min_check check (duration_min is null or duration_min between 5 and 480);
