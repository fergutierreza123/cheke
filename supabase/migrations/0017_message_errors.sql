-- Why a WhatsApp message wasn't delivered, and what Meta charged for it.
-- Since October 1, 2026 Meta bills normal replies, and a business without a
-- payment method in Meta's Billing Hub stops getting replies delivered after
-- its 1,000 free ones each month. These columns let Chat show the reason for
-- each failed message and Canales warn about billing problems.
-- Safe to run more than once.

alter table messages
  -- Meta's error code (e.g. 131042 = payment problem) and a short Spanish
  -- explanation shown in Chat. error_details keeps Meta's own (English) text.
  add column if not exists error_code integer,
  add column if not exists error_reason text,
  add column if not exists error_details text,
  -- From the `pricing` object on status webhooks, for future cost analytics.
  -- pricing_type: regular (billed) | free_customer_service | free_entry_point | ...
  -- pricing_category: service | utility | marketing | authentication | ...
  add column if not exists pricing_billable boolean,
  add column if not exists pricing_type text,
  add column if not exists pricing_category text;

-- Canales looks up a business's recent failed messages.
create index if not exists messages_failed_idx
  on messages (business_id, created_at desc)
  where status = 'failed';
