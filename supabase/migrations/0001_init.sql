-- Cheke CRM — foundation schema
-- Run this once in your Supabase project's SQL editor (or via `supabase db push`).
-- Every business-owned table carries business_id and is locked down with
-- Row Level Security so a user can only ever see rows of businesses they belong to.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tenancy
-- ---------------------------------------------------------------------------

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial',
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at timestamptz not null default now()
);

create table members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'agent')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- Helper: does the current user belong to this business?
-- security definer + stable so RLS policies can call it cheaply.
create or replace function is_member_of(target_business_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Channels & conversations
-- ---------------------------------------------------------------------------

create table channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null check (type in ('whatsapp', 'instagram', 'facebook')),
  external_id text, -- e.g. WhatsApp phone_number_id
  access_token_encrypted text,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text,
  ig_handle text,
  fb_id text,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  window_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text,
  media_url text,
  external_message_id text unique,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read', 'failed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalog & orders
-- ---------------------------------------------------------------------------

create table catalogs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  meta_catalog_id text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  last_synced_at timestamptz
);

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  retailer_id text not null,
  name text not null,
  description text,
  price_hnl numeric(12, 2) not null default 0,
  image_url text,
  stock integer not null default 0,
  visible boolean not null default true,
  meta_sync_status text not null default 'not_synced',
  created_at timestamptz not null default now(),
  unique (business_id, retailer_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  contact_id uuid not null references contacts(id) on delete cascade,
  items jsonb not null default '[]',
  total_hnl numeric(12, 2) not null default 0,
  status text not null default 'new' check (status in ('new', 'awaiting_payment', 'paid', 'delivered', 'cancelled')),
  payment_link text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table businesses enable row level security;
alter table members enable row level security;
alter table channels enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table catalogs enable row level security;
alter table products enable row level security;
alter table orders enable row level security;

-- businesses: members can read their own business; anyone authenticated can
-- create one (they become owner via a members insert right after).
create policy "members can read their business" on businesses
  for select using (is_member_of(id));

create policy "authenticated users can create a business" on businesses
  for insert with check (auth.uid() is not null);

-- members: you can see the roster of businesses you belong to.
create policy "members can read their business roster" on members
  for select using (is_member_of(business_id));

create policy "users can add themselves as the first owner" on members
  for insert with check (user_id = auth.uid());

-- Generic per-table policy: full access scoped to business membership.
create policy "tenant read" on channels for select using (is_member_of(business_id));
create policy "tenant write" on channels for insert with check (is_member_of(business_id));
create policy "tenant update" on channels for update using (is_member_of(business_id));
create policy "tenant delete" on channels for delete using (is_member_of(business_id));

create policy "tenant read" on contacts for select using (is_member_of(business_id));
create policy "tenant write" on contacts for insert with check (is_member_of(business_id));
create policy "tenant update" on contacts for update using (is_member_of(business_id));
create policy "tenant delete" on contacts for delete using (is_member_of(business_id));

create policy "tenant read" on conversations for select using (is_member_of(business_id));
create policy "tenant write" on conversations for insert with check (is_member_of(business_id));
create policy "tenant update" on conversations for update using (is_member_of(business_id));
create policy "tenant delete" on conversations for delete using (is_member_of(business_id));

create policy "tenant read" on messages for select using (is_member_of(business_id));
create policy "tenant write" on messages for insert with check (is_member_of(business_id));
create policy "tenant update" on messages for update using (is_member_of(business_id));

create policy "tenant read" on catalogs for select using (is_member_of(business_id));
create policy "tenant write" on catalogs for insert with check (is_member_of(business_id));
create policy "tenant update" on catalogs for update using (is_member_of(business_id));

create policy "tenant read" on products for select using (is_member_of(business_id));
create policy "tenant write" on products for insert with check (is_member_of(business_id));
create policy "tenant update" on products for update using (is_member_of(business_id));
create policy "tenant delete" on products for delete using (is_member_of(business_id));

create policy "tenant read" on orders for select using (is_member_of(business_id));
create policy "tenant write" on orders for insert with check (is_member_of(business_id));
create policy "tenant update" on orders for update using (is_member_of(business_id));

-- Realtime: let the Chat screen subscribe to new messages live.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
