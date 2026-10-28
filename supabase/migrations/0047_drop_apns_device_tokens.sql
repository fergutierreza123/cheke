-- Phone alerts on iPhone (PR #91): before it, the iPhone app saved Apple's
-- own token (APNs: 64 hex digits) instead of the Firebase (FCM) token the
-- server sends with (src/lib/push.ts). Firebase rejects those with
-- "invalid-argument", which isn't a safe sign of a dead token, so they were
-- never cleaned and every alert tried them again. The app now registers its
-- FCM token, so the old rows can go. FCM tokens contain ":" and never match.
--
-- Safe to run more than once.

delete from device_tokens
where platform = 'ios'
  and token ~ '^[0-9A-Fa-f]{64}$';
