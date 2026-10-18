# TikTok as a fourth channel in cheke ventas

Research read on 2026-10-17. TikTok's own developer pages (business-api.tiktok.com) render only their titles to a fetcher, so most details below come from inbox platforms that already integrate TikTok (Chatwoot, Infobip, MonoChat, Uchat, respond.io). Nothing in TikTok, Vercel or Supabase was changed.

**Confidence levels:** **High** means TikTok or several integrators say it the same way. **Medium** means one integrator's docs say it. **Low** means it's an inference or a single report, so test it before you rely on it.

## Short answer

Yes, TikTok can join the Chat inbox the same way Instagram and Messenger did. TikTok has an official **Business Messaging API** for direct messages (DMs). Inbox tools like Chatwoot, respond.io and Infobip already use it. It's narrower than WhatsApp, though. The customer always has to write first, the reply window is 48 hours, and only text and single images are supported. TikTok also has to approve cheke as a developer app before anything works.

The big open question is **Honduras**. TikTok blocks the API by the region where the business's TikTok account was registered. We know it's blocked in the EEA, Switzerland and the UK. The US needs an extra security review. One forum user in Mexico got a "not available in your region" error. No source lists Central America either way. **Low** confidence until we test with a real Honduran business account.

## What TikTok allows

| Topic | Rule | Confidence |
|---|---|---|
| Accounts | TikTok **Business** accounts only. Personal and creator accounts switch to Business in the TikTok app settings. | High |
| Who writes first | The customer, always. The business can't start a conversation. | High |
| Reply window | After the customer's first message: up to 10 messages within 48 h. Each new customer message reopens 48 h with no limit. After 48 h of silence, up to 3 more messages until they write again. | Medium (MonoChat; Chatwoot says only "48-hour window") |
| Message types | Text, one image (not in every market), Q&A button cards, link cards, sharing a TikTok post, typing indicator and read receipts. No voice notes, no documents. | Medium |
| Message settings | The business account must accept messages from everyone, or approve each new chat in the TikTok app first. | Medium (Chatwoot) |
| Comments | Integrators reply to comments on the business's videos. Only first-level comments qualify, within 48 h of posting. Third-party apps can't delete a customer's comment. There's no comment-to-DM like Instagram's private replies. | Medium (Uchat, MyAlice) |
| TikTok Shop | Shop chats are a separate system, not part of this API. | Medium |
| Tokens | OAuth per business. The access token lasts about 24 h and the refresh token about 30 days, renewed automatically. If both lapse (for example, the account sits unused for a month), the business must reconnect. That fits the "Reconectar" state from #56. | Medium (Chatwoot) |
| Webhooks | One callback URL for the whole app, set through the API. It sends a signature, and TikTok rejects the request if our server clock is more than 5 s off. | Medium (Chatwoot) |
| Cost | No per-message fee mentioned anywhere, unlike WhatsApp. | Low |

## How cheke would get access

1. Create a developer account and an app at business-api.tiktok.com/portal/apps. The app needs a name, icon, description, terms URL and privacy URL. The cheke.io legal pages already exist.
2. In the app, apply for the **Business Messaging API** product. TikTok asks for the use case, how user data is handled, and the company details (Inversiones y Representaciones Arguz). It also runs a data-security and privacy review. Approval takes days or longer and is manual. US accounts would need an extra US data security review, which doesn't apply to Honduran accounts.
3. Enable the "TikTok Accounts" scope and set the OAuth redirect to `https://ventas.cheke.app/api/tiktok/callback`.
4. Register the webhook callback `https://ventas.cheke.app/api/tiktok/webhook`.

This is the same shape as Meta's App Review, but smaller: one product and no videos per permission.

## How it fits the code

It mirrors the Instagram/Messenger path (`src/lib/metaMessaging.ts`, `src/app/api/meta/webhook/route.ts`, `src/lib/channelSend.ts`):

- `channels.type` gains `tiktok`. A migration adds `contacts.tiktok_id` and the channel color.
- **Conectar TikTok** in Canales: an OAuth redirect stores the encrypted access and refresh tokens per channel, plus a token refresh in the daily `channel-health` cron.
- `POST /api/tiktok/webhook`: verify the signature, save the inbound message, dedupe by message id, then run chekelin.
- `sendOnChannel` gains a `tiktok` branch. `replyWindow()` gets TikTok's rule (48 h, 10 messages, 3 after expiry). Chat hides voice notes, documents and reactions for TikTok, like it hides reactions on Messenger.
- Comments go later, in Comentarios (#43), behind the same 48 h rule.

Rough size for one part-time person: about 1 week of agent work for DMs once the app is approved, plus TikTok's review time. Comments add about 3–4 days.

## Recommendation

- **Don't put it in the December 31 launch.** WhatsApp, Instagram and Facebook live on real numbers is already the goal, and Meta's review (#3) is the long pole.
- **Do start TikTok's app approval now** (30 min for the founder), because the review is slow and costs nothing. In parallel, check with one Honduran client that has a TikTok Business account whether messaging appears for them. If an approved test app connects that account and receives a DM, the region question is answered.
- Build it in January as an add-on for cheke Plus and Pro, if the region test passes.

## Sources

- [TikTok: Access to Business Messaging API](https://business-api.tiktok.com/portal/docs/access-to-business-messaging-api/v1.3)
- [TikTok: Business Messaging API Education Hub](https://business-api.tiktok.com/portal/bm-api/education-hub)
- [TikTok: Messaging Partner Specialty](https://ads.tiktok.com/business/en/blog/introducing-messaging-partner-specialty)
- [Chatwoot: Setting up the TikTok channel](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/tiktok)
- [MonoChat: TikTok Business Messaging](https://monochat.ai/blog/tiktok-business-messaging)
- [Infobip: TikTok](https://www.infobip.com/docs/tiktok)
- [respond.io: TikTok overview](https://respond.io/es/help/tiktok/tiktok-overview)
- [Uchat: TikTok channel](https://uchat.atlassian.net/wiki/spaces/UKB/pages/1248133150/Tiktok+Channel)
- [MyAlice: TikTok channel integration](https://docs.myalice.ai/release-log/tiktok-channel-integration)
- [ManyChat community: region error from Mexico](https://community.manychat.com/general-q-a-43/my-connection-with-tiktok-don-t-work-4573)
- [UnifyPort: why there's no general TikTok DM API](https://www.unifyport.ai/blog/tiktok-no-dm-api-receive-messages/)
