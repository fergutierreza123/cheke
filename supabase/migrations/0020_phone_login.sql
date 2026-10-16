-- Login by SMS code (+504) with an email-code fallback. Design: GitHub
-- issue #12 (closing comment); built in issue #31.
--
-- What this does:
--   1. The database itself refuses phone numbers outside Honduras (+504)
--      for sign-ups and for "Agregar/Cambiar mi celular". The login screen
--      already checks this, but the screen runs on the person's phone and
--      can be bypassed; this stops anyone from making cheKe send SMS codes
--      to other countries (SMS-pumping fraud). Existing rows are never
--      checked, only a phone being set or changed.
--   2. Equipo and Analítica list teammates by email. People who signed in
--      with only a phone have no email, so they now show as
--      "+504 9999-9999" instead of a blank.
--
-- Safe to run more than once. Run it in Supabase (SQL Editor) BEFORE
-- merging the code.

-- ---------------------------------------------------------------------------
-- 1. Only +504 phones
-- ---------------------------------------------------------------------------

-- Supabase keeps phones without the "+": "50499999999".
create or replace function public.enforce_honduras_phone()
returns trigger
language plpgsql
-- Runs inside Supabase Auth's own writes (role supabase_auth_admin):
-- security definer so a missing grant can never break sign-ins, the
-- pattern Supabase recommends for triggers on auth.users.
security definer
set search_path = ''
as $$
begin
  if coalesce(new.phone, '') <> ''
     and (tg_op = 'INSERT' or new.phone is distinct from old.phone)
     and new.phone !~ '^\+?504[0-9]{8}$' then
    raise exception 'Solo se aceptan celulares de Honduras (+504).';
  end if;
  if coalesce(new.phone_change, '') <> ''
     and (tg_op = 'INSERT' or new.phone_change is distinct from old.phone_change)
     and new.phone_change !~ '^\+?504[0-9]{8}$' then
    raise exception 'Solo se aceptan celulares de Honduras (+504).';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_honduras_phone() from public, anon, authenticated;

drop trigger if exists honduras_phone_only on auth.users;
create trigger honduras_phone_only
  before insert or update of phone, phone_change on auth.users
  for each row execute function public.enforce_honduras_phone();

-- ---------------------------------------------------------------------------
-- 2. Teammates without an email show their number
-- ---------------------------------------------------------------------------

-- Same columns as in 0007 (so the app's code doesn't change), with the
-- formatted phone when there's no email.
create or replace function business_members(target_business_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.user_id,
    coalesce(
      nullif(u.email, ''),
      case
        when u.phone ~ '^504[0-9]{8}$' then '+504 ' || substr(u.phone, 4, 4) || '-' || substr(u.phone, 8, 4)
        when coalesce(u.phone, '') <> '' then '+' || u.phone
      end,
      ''
    ),
    m.role,
    m.created_at
  from members m
  join auth.users u on u.id = m.user_id
  where m.business_id = target_business_id
    and is_member_of(target_business_id)
  order by m.created_at asc;
$$;

revoke all on function business_members(uuid) from public;
grant execute on function business_members(uuid) to authenticated;
