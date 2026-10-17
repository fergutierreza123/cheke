-- Voice notes in words (issue #49). Claude can't hear audio, so the voice
-- notes and audios a customer sends are transcribed (OpenAI
-- gpt-4o-transcribe) right after their file is saved
-- (src/lib/voiceTranscription.ts). Chat shows the text under the audio
-- ("Transcripción") and chekelin reads it as the customer's message.
--
-- What this adds, on messages:
--   transcription         the text (null until transcribed, or when it was
--                         silence)
--   transcription_status  'done' | 'failed'; null = not transcribed yet, or
--                         OPENAI_API_KEY isn't set. chekelin waits a few
--                         seconds for a voice note whose status is null.
--
-- RLS: nothing new; these are columns of `messages`, already protected.
-- Safe to run more than once. Run it in Supabase BEFORE merging the code
-- that uses it; the code live today keeps working with it.

alter table messages add column if not exists transcription text;
alter table messages add column if not exists transcription_status text;

alter table messages drop constraint if exists messages_transcription_status_check;
alter table messages add constraint messages_transcription_status_check check (
  transcription_status is null or transcription_status in ('done', 'failed')
);

comment on column messages.transcription is
  'A customer voice note in words (gpt-4o-transcribe). Shown under the audio in Chat and read by chekelin.';
comment on column messages.transcription_status is
  'done | failed. Null = not transcribed yet (or OPENAI_API_KEY not set).';
