-- chekelin's monthly allowance and what it costs (issue #9).
--
-- Each Plan includes a number of conversations chekelin attends per calendar
-- month in Honduras (numbers in src/lib/plan.ts). A conversation counts once
-- a month, the first time chekelin writes to the real customer that month.
-- Every model call records the tokens it used, for
-- `npm run report:chekelin-cost`. Code: src/lib/chekelinAllowance.ts.

-- One row per conversation chekelin attended in a month.
create table if not exists chekelin_monthly_conversations (
  conversation_id uuid not null references conversations(id) on delete cascade,
  -- First day of the month, Honduras time ("2026-10-01").
  month date not null,
  business_id uuid not null references businesses(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, month)
);
create index if not exists chekelin_monthly_conversations_business_month
  on chekelin_monthly_conversations (business_id, month);

alter table chekelin_monthly_conversations enable row level security;
-- The meter in Mi cuenta: Dueños only. Written only by the server.
drop policy if exists "owners read" on chekelin_monthly_conversations;
create policy "owners read" on chekelin_monthly_conversations for select using (is_owner_of(business_id));

-- One row per billed model attempt.
create table if not exists chekelin_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  -- seller | simple_fact | comment | suggestions
  kind text not null,
  -- Chat's modo prueba.
  test boolean not null default false,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chekelin_usage_business_created on chekelin_usage (business_id, created_at);

-- Server only (service role): no policies, nobody signed in reads it.
alter table chekelin_usage enable row level security;

-- An extra pack the founder records by hand for one month, and the month
-- the Dueños were last told chekelin reached the limit (one notice a month).
alter table businesses
  add column if not exists chekelin_extra integer not null default 0,
  add column if not exists chekelin_extra_month date,
  add column if not exists chekelin_limit_notice_month date;
