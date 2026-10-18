-- Comentarios (issue #43, design: issue #40 closing comment): comments on the
-- Tienda's Instagram and Facebook posts, what chekelin did with each one, and
-- the queue of private replies (Meta caps them at 750 per hour per account).
--
-- What this adds:
--   1. post_comments: one row per customer comment, received by the Meta
--      webhook (Instagram field "comments", Facebook Page field "feed").
--      chekelin classifies it (precio/info, queja, otro), answers in public
--      and writes a private reply (a DM); people can answer from the
--      Comentarios screen. Comments are never hidden or deleted.
--   2. comment_private_replies_sent_last_hour(): how many private replies a
--      channel sent in the last hour, for the rate limit.
--
-- Read: the Tienda's people (and Dueños), like conversations (0018). Every
-- write goes through the server (webhook, cron, or a server action after it
-- checked the person's access), so there are no write policies.
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today doesn't touch this table.

create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  -- Meta's ids: the comment, the comment it answers (a reply in a thread)
  -- and the post (Instagram media id / Facebook post id).
  external_comment_id text not null unique,
  parent_external_id text,
  post_external_id text,
  -- The post, fetched once from Meta (best effort): caption, link, picture.
  post_caption text,
  post_permalink text,
  post_image_url text,
  -- Who commented: Meta's id for them, name / username.
  author_external_id text,
  author_name text not null default '',
  author_username text,
  body text not null default '',
  commented_at timestamptz not null default now(),

  -- chekelin's reading: 'price' (precio / info), 'complaint' (negativo),
  -- 'other' (anything else; nobody answers automatically).
  kind text check (kind in ('price', 'complaint', 'other')),
  -- For the team only: what the customer wants / what happened.
  team_summary text,
  -- Claimed by the worker that handles it automatically (never twice).
  handled_at timestamptz,

  -- The public reply under the comment (chekelin's or a person's).
  public_reply_body text,
  public_reply_external_id text,
  public_replied_at timestamptz,
  -- null = chekelin
  public_replied_by uuid references auth.users(id) on delete set null,
  public_reply_error text,

  -- The private reply (one DM per comment, Meta's rule) and its queue:
  -- 'none' (not needed), 'queued', 'sending', 'sent', 'failed', 'expired'
  -- (Meta only allows it within 7 days of the comment).
  private_status text not null default 'none'
    check (private_status in ('none', 'queued', 'sending', 'sent', 'failed', 'expired')),
  private_body text,
  private_media_url text,
  private_attempts integer not null default 0,
  private_claimed_at timestamptz,
  private_sent_at timestamptz,
  private_sent_by uuid references auth.users(id) on delete set null,
  private_error text,
  -- The Chat conversation the private reply opened.
  conversation_id uuid references conversations(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists post_comments_store_idx on post_comments (store_id, commented_at desc);
create index if not exists post_comments_queue_idx
  on post_comments (channel_id, created_at) where private_status in ('queued', 'sending');
create index if not exists post_comments_sent_idx
  on post_comments (channel_id, private_sent_at) where private_sent_at is not null;

alter table post_comments enable row level security;

drop policy if exists "store read" on post_comments;
create policy "store read" on post_comments for select using (store_id in (select my_store_ids()));

-- Private replies a channel sent in the last hour (Meta: 750 per hour).
create or replace function comment_private_replies_sent_last_hour(p_channel_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from post_comments
  where channel_id = p_channel_id and private_sent_at > now() - interval '1 hour';
$$;

revoke all on function comment_private_replies_sent_last_hour(uuid) from public, anon, authenticated;
