-- Photos, videos, voice notes, documents, stickers, locations and contact
-- cards the customer sends (and the business sends from its phone or the
-- Instagram app) show in Chat. Built in issue #48.
--
-- What this adds:
--   1. messages: what kind of media a message carries and where its file is.
--      `body` keeps the old text ("📷 Foto", "🎤 Nota de voz"…): previews,
--      chekelin and the fallback when a download fails still use it.
--   2. A private Storage bucket, `message-media`, with each file at
--      <business_id>/<store_id>/<message_id>.<ext>. Only the server writes
--      (service role); a person can read the files of the Tiendas they see,
--      through short-lived signed links.
--
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today keeps working with it.

-- ---------------------------------------------------------------------------
-- 1. Media on messages
-- ---------------------------------------------------------------------------

alter table messages add column if not exists media_kind text;
alter table messages add column if not exists media_path text;
alter table messages add column if not exists media_m4a_path text;
alter table messages add column if not exists media_info jsonb;

alter table messages drop constraint if exists messages_media_kind_check;
alter table messages add constraint messages_media_kind_check check (
  media_kind is null
  or media_kind in ('image', 'video', 'audio', 'voice', 'document', 'sticker', 'location', 'contacts')
);

comment on column messages.media_kind is
  'image | video | audio | voice | document | sticker | location | contacts';
comment on column messages.media_path is
  'The original file in the private message-media bucket. Null until downloaded (or when the download failed: Chat shows body instead).';
comment on column messages.media_m4a_path is
  'AAC/M4A copy of a voice note or audio, which every browser plays (Safari and iPhone cannot play WhatsApp''s OGG/Opus).';
comment on column messages.media_info is
  'Details shown with the media: caption, file name, size (bytes), mime; latitude, longitude, place name, address; contacts [{name, phones}].';

-- ---------------------------------------------------------------------------
-- 2. Private bucket, readable by the Tienda's people
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('message-media', 'message-media', false)
on conflict (id) do update set public = false;

-- Path = <business_id>/<store_id>/<file>: the second folder is the Tienda.
-- Compared as text so an odd file name can never break the query.
drop policy if exists "store read message media" on storage.objects;
create policy "store read message media"
on storage.objects for select
to authenticated
using (
  bucket_id = 'message-media'
  and (storage.foldername(name))[2] in (select s::text from my_store_ids() as s)
);
