-- Difusión follow-ups (after 0042_broadcasts.sql):
--
--   - Cancelar: a Dueño or the Gerente of that Tienda stops a Difusión that
--     is still going out (cancel_broadcast). Customers not sent yet become
--     'cancelled'; the ones already sent stay as they are.
--   - messages.source 'broadcast': a Difusión message in Chat shows
--     "Difusión" instead of chekelin. It stays is_bot, so chekelin still
--     answers the customer's reply.
--   - Stuck sends: a cron run that dies mid-send leaves a customer
--     'sending'. claimed_at says since when; after 15 min /api/cron/broadcasts
--     marks it 'failed' with error_reason (never resent: it may have gone out).
--
-- Additive and safe to run more than once.

alter table broadcasts drop constraint if exists broadcasts_status_check;
alter table broadcasts add constraint broadcasts_status_check
  check (status in ('draft', 'sending', 'done', 'cancelled'));

alter table broadcast_recipients drop constraint if exists broadcast_recipients_status_check;
alter table broadcast_recipients add constraint broadcast_recipients_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled'));

alter table broadcast_recipients add column if not exists claimed_at timestamptz;
alter table broadcast_recipients add column if not exists error_reason text;
-- Rows already 'sending' before this migration: their 15 min start now.
update broadcast_recipients set claimed_at = now() where status = 'sending' and claimed_at is null;

alter table messages drop constraint if exists messages_source_check;
alter table messages add constraint messages_source_check
  check (source in ('cheke', 'phone', 'history', 'meta_app', 'broadcast'));

-- Cancelar. Returns false when it wasn't sending (already done/cancelled) or
-- the person can't manage that Tienda.
create or replace function cancel_broadcast(target_broadcast_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update broadcasts set status = 'cancelled', finished_at = now()
  where id = target_broadcast_id and status = 'sending' and can_manage_store(store_id);
  if not found then
    return false;
  end if;
  update broadcast_recipients set status = 'cancelled'
  where broadcast_id = target_broadcast_id and status in ('pending', 'sending');
  return true;
end;
$$;

revoke all on function cancel_broadcast(uuid) from public, anon;
grant execute on function cancel_broadcast(uuid) to authenticated;
