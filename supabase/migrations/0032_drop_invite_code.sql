-- Drops businesses.invite_code (issue #35, item 7).
--
-- The shared invite code was replaced by single-use invitation links in
-- 0018, which also removed the only function that read it
-- (join_business_by_code). Nothing in the app or in the database reads the
-- column any more, so this only removes dead data.
--
-- Optional and independent of 0030: run it whenever you like, before or
-- after merging. It can't be undone (the old codes are gone), but nothing
-- uses them.
--
-- Safe to run more than once.

alter table businesses drop column if exists invite_code;
