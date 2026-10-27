-- Analítica: "Tiempo de primera respuesta" per person.
--
-- A wait starts with the customer's first message after a person's last
-- reply. If chekelin answered in between, it starts with the customer's
-- first message after chekelin's last one, or, if they wrote nothing
-- after it, with chekelin's last message (it handed off). It ends with the
-- next reply from a person, counted for whoever sent it from cheke
-- (messages.sent_by). Replies from the phone or a Meta app end the wait but
-- count for nobody. chekelin is never counted.
--
-- One row per period (semana, mes, trimestre: calendar periods in Honduras,
-- like the rest of Analítica) and person. Security invoker: RLS on messages
-- keeps each person to their own Tiendas.

create or replace function first_response_times(p_store_ids uuid[])
returns table (period text, user_id uuid, replies integer, median_seconds integer)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select p.period,
           date_trunc(p.unit, now() at time zone 'America/Tegucigalpa') at time zone 'America/Tegucigalpa' as since
    from (values ('semana', 'week'), ('mes', 'month'), ('trimestre', 'quarter')) as p (period, unit)
  ),
  m as (
    select conversation_id, direction, is_bot, sent_by, created_at,
           direction = 'out' and not is_bot as human,
           -- Which wait the message belongs to: a person's reply closes it.
           count(*) filter (where direction = 'out' and not is_bot) over (
             partition by conversation_id order by created_at, id
             rows between unbounded preceding and 1 preceding
           ) as turn
    from messages
    where store_id = any(p_store_ids)
      and source is distinct from 'history'
      -- shortcut: waits longer than 7 days that began before the period are cut short; fine for a median.
      and created_at >= (select min(since) from bounds) - interval '7 days'
  ),
  t as (
    select *, max(created_at) filter (where direction = 'out' and is_bot) over (partition by conversation_id, turn) as last_bot
    from m
  ),
  waits as (
    select max(created_at) filter (where human) as replied_at,
           (array_agg(sent_by) filter (where human))[1] as user_id,
           coalesce(
             min(created_at) filter (where direction = 'in' and (last_bot is null or created_at > last_bot)),
             max(last_bot)
           ) as started_at,
           bool_or(direction = 'in') as asked
    from t
    group by conversation_id, turn
  )
  select b.period,
         w.user_id,
         count(*)::integer,
         round(percentile_cont(0.5) within group (order by extract(epoch from w.replied_at - w.started_at)))::integer
  from waits w
  join bounds b on w.replied_at >= b.since
  where w.asked and w.user_id is not null
  group by b.period, w.user_id;
$$;

revoke all on function first_response_times(uuid[]) from public, anon;
grant execute on function first_response_times(uuid[]) to authenticated;
