-- Phone push notifications: one row per installed app (iPhone/Android) that
-- should be alerted when a message comes in. `token` is the address Firebase
-- gives that phone; the server sends a push to every token in a business
-- when a customer writes (see src/lib/push.ts).
--
-- A token belongs to the person signed in on that phone, so it's scoped by
-- user_id as well as business_id: people only ever see/touch their own.

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index device_tokens_business_idx on device_tokens (business_id);

alter table device_tokens enable row level security;

create policy "own tokens read" on device_tokens for select
  using (user_id = auth.uid() and is_member_of(business_id));
create policy "own tokens insert" on device_tokens for insert
  with check (user_id = auth.uid() and is_member_of(business_id));
create policy "own tokens update" on device_tokens for update
  using (user_id = auth.uid());
create policy "own tokens delete" on device_tokens for delete
  using (user_id = auth.uid());
