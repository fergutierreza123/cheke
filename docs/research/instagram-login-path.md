# Instagram messaging: Instagram Login or Facebook Login?

Research for issue #5. Sources are Meta's developer docs and changelogs, read on 2026-10-14. Each claim links the page it came from. Anything marked **(unverified)** is my inference and needs checking in the App Dashboard.

## Recommendation (short)

**Use Facebook Login for Business with the Messenger Platform for Instagram, served from the same Meta app and the same Tech Provider setup that WhatsApp already uses.** cheKe also needs Facebook Messenger, and later the Marketing API, and both of those require Facebook Login and a Facebook Page anyway. The Instagram Login path "cannot access ads or tagging" ([IG Login docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)). Choosing it would mean running a second login, a second token type and a second API host for one channel.

Add Instagram Login later, inside the same app, only as a fallback for shops whose Instagram has no linked Page. Existing apps can add the Instagram product at any time ([changelog, 2024-07-23](https://developers.facebook.com/documentation/instagram-platform/changelog)).

## Side-by-side comparison

| | Instagram API with Instagram Login | Messenger Platform for IG (Facebook Login for Business) |
|---|---|---|
| Who logs in | Instagram credentials | Facebook credentials ([overview](https://developers.facebook.com/docs/instagram-platform/overview)) |
| Facebook Page required | No | Yes, linked to the IG professional account ([overview](https://developers.facebook.com/docs/instagram-platform/overview)) |
| Host | `graph.instagram.com` | `graph.facebook.com` |
| Token | Instagram User token | Facebook User, Page or BISU token |
| Messaging | Yes | Yes, via the Messenger Platform Instagram Messaging API |
| Comments, private replies | Yes | Yes |
| Content publishing | Yes | Yes |
| Hashtag search, product tagging, Partnership Ads | No | Yes ([overview](https://developers.facebook.com/docs/instagram-platform/overview)) |
| Ads / Marketing API | **No**: "cannot access ads or tagging" | Yes (same Facebook Login, `ads_management`) |
| Facebook Messenger | Not covered, needs Facebook Login separately | Same login, same Page token |
| WhatsApp | Separate flow | Same Facebook Login for Business product as Embedded Signup |

### Is the Facebook Login path still supported for IG messaging?

Yes. One line in the 2024-07-23 changelog reads "The Messenger API will no longer be used to send Instagram messages". It appears inside the list of features for the *new Instagram Login API* ([changelog](https://developers.facebook.com/documentation/instagram-platform/changelog)), so it describes that API. Later Meta material still treats the Facebook Login path as live:

- The overview lists Facebook Login messaging "via the Messenger Platform Instagram Messaging API".
- The 2025-09-10 changelog added the `message_edit` webhook "for both Business Login for Instagram and Facebook Login for Business".
- The 2025-12-19 changelog added PDF attachments via "the Graph API (Facebook-linked accounts)".
- The webhooks doc has a dedicated "Instagram Messaging via Messenger Platform" column ([IG webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)).
- The Messenger get-started guide is current and does not call this path deprecated ([Messenger IG get started](https://developers.facebook.com/docs/messenger-platform/instagram/get-started)).

One risk: Meta's newer IG messaging guides (quick replies, ice breakers, sender actions) are published under the Instagram Login section ([llms.txt index](https://developers.facebook.com/documentation/instagram-platform/llms.txt)). New features may land there first.

## Onboarding steps for a small shop

**Facebook Login path:**

1. The owner clicks "Conectar Instagram y Facebook", logs in with Facebook, and picks the Page and the linked Instagram account in the Facebook Login for Business dialog.
2. The owner grants the permissions.
3. cheKe exchanges the `code` on the server.
4. cheKe calls `/me/accounts?fields=id,name,access_token,instagram_business_account` to get the Page token and the IG account ID ([FB Login for IG](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram)).
5. cheKe subscribes the Page to webhooks.

Prerequisites for the shop:

- An IG professional account linked to a Page.
- A person who can perform the `MODERATE` task on the Page ([Messenger IG get started](https://developers.facebook.com/docs/messenger-platform/instagram/get-started)).
- The IG account must be public to receive comment and @mention webhooks ([IG webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)).

That same doc says the Facebook Login onboarding window lets a user "convert their account, create a Page, and connect the Page in one window" ([FB Login for IG](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-login-for-instagram)). That softens the "no Page" case.

**Instagram Login path:**

1. The owner opens `instagram.com/oauth/authorize`, using the Embed URL from the dashboard.
2. The owner logs in with Instagram and grants the scopes.
3. cheKe makes a server-side code exchange for a short-lived token, then a long-lived one.
4. cheKe calls `POST /<IG_ID>/subscribed_apps` ([Business Login for IG](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login), [IG webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)).

This flow has fewer clicks for an Instagram-only shop. It still does nothing for Messenger or ads.

## Can one Facebook Login for Business flow connect Page + IG + WhatsApp?

**Partly.** The documented parts:

- A Facebook Login for Business configuration bundles the token type, assets and permissions into one `config_id` ([FB Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business)).
- The Embedded Signup configuration's asset step offers Pages, Ad accounts, Catalogs, Pixels and Instagram accounts next to WhatsApp accounts.
- The completion message event returns `page_ids` and `instagram_account_ids` when the customer selected them ([ES implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/)).
- Embedded Signup v4 (released 2025-10-08) onboards "multiple WhatsApp, Messenger, and Instagram Business Messaging APIs through a single flow" ([v4 blog](https://developers.facebook.com/blog/post/2025/12/03/simplify-business-onboarding-with-embedded-signup-v4)).
- **But** the products v4 lists for Messenger and Instagram are ads and Conversions API products (Click to Messenger, Click to Direct, CAPI). Inbox messaging is not among them ([ES v4](https://developers.facebook.com/docs/whatsapp/embedded-signup/versions/version-4/)).

**(unverified)** Whether `pages_messaging` and `instagram_manage_messages` can be added to the WhatsApp Embedded Signup configuration is not stated anywhere.

**Plan:**

- Ship a second Facebook Login for Business configuration, with the normal login variation, for "Conectar Instagram y Facebook". It reuses the same JS SDK, the same `FB.login({config_id, response_type: "code", override_default_response_type: true})` call and the same server code exchange as `ConnectWhatsAppButton.tsx`.
- Merging both into one combined button is a later experiment in the dashboard.
- Meta also warns that every extra asset in a flow raises abandonment ([ES implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/)). Two short buttons are not worse for a shop owner.

**Embedded Signup v2 deadline (separate from #5).** "Embedded signup v2 will be deprecated on October 15, 2026" ([ES v4](https://developers.facebook.com/docs/whatsapp/embedded-signup/versions/version-4/)), which is tomorrow. The code sends `sessionInfoVersion: "3"`. The version actually comes from the configuration ("Selecting the products will automatically set you to v4"), so check the existing WhatsApp config in the dashboard.

## Tokens and lifetimes

| Token | Lifetime | Source |
|---|---|---|
| IG Login authorization code | 1 hour, single use | [Business Login for IG](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login) |
| IG Login short-lived token | 1 hour | [overview](https://developers.facebook.com/docs/instagram-platform/overview) |
| IG Login long-lived token | 60 days. Refresh with `ig_refresh_token` once it is at least 24 hours old. Not refreshing within 60 days = dead, user must log in again | [Business Login for IG](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login) |
| Facebook Page token from a long-lived User token | "no expiration date" (1 hour if derived from a short-lived token) | [Messenger IG get started](https://developers.facebook.com/docs/messenger-platform/instagram/get-started) |
| Business Integration System User (BISU) token | Never expires by default (optional 60 days). Authorization code grant only, Tech Providers only | [FB Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business) |

Facebook Login wins for an unattended multi-tenant server: there is no refresh cron and no silent 60-day expiry. Use a BISU configuration, as WhatsApp likely already does, then derive the Page token with `GET /{page-id}?fields=access_token`. **(unverified)** Deriving a Page token from a BISU token follows the documented User-token pattern but is not spelled out for BISU.

## Webhooks for a multi-tenant app

- **App level, set once in the dashboard:**
  - Subscribe the `page` object to `messages`, `messaging_postbacks`, `message_echoes`, `feed` and so on. The IG messaging and comment fields go under Instagram settings ([Messenger webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks)).
  - Use one callback URL for all tenants. Route each event by its Page ID or IG account ID.
- **Per tenant, after connect:**
  - Facebook Login: `POST /{page-id}/subscribed_apps?subscribed_fields=messages,...` with the Page token. This needs `pages_messaging` and `pages_manage_metadata` ([Messenger webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks)).
  - Instagram Login: `POST graph.instagram.com/<IG_ID>/subscribed_apps` ([IG webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)).
- **Rules** ([IG webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)):
  - The app must be Live.
  - Business Verification is required.
  - "Advanced Access is required to receive comments and live_comments webhook notifications."
  - "Account level webhooks customization is not supported": every account gets every field the app subscribes to.
  - Batches can hold up to 1000 updates.
  - Failed deliveries are retried for up to 36 hours, so deduplicate events.
  - Verify the `X-Hub-Signature-256` header (HMAC-SHA256 with the App Secret), as the WhatsApp webhook already should.
- **Fields cheKe needs:**
  - IG: `messages`, `messaging_postbacks`, `messaging_seen`, `messaging_referral`, `message_reactions`, `comments`, `live_comments`, plus `mentions` (Facebook Login only).
  - FB Page: `messages`, `messaging_postbacks`, `feed` (for Page comments).

## Private replies (comment-to-DM)

- **Instagram:**
  - Call `POST /<IG_ID>/messages` with `{"recipient":{"comment_id":"..."},"message":{"text":"..."}}`.
  - You can send **one** message per comment, within **7 days** of the comment. For Live, only during the broadcast. Further messages are allowed only after the user replies, inside 24 hours.
  - Works on posts, reels, stories, Live and ad posts. Webhooks: `comments` and `live_comments`.
  - Facebook Login permissions: `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement`, plus `ads_management` and `ads_read` if the user's Page role comes through Business Manager.
  - Source: [IG private replies](https://developers.facebook.com/documentation/instagram-platform/private-replies).
- **Facebook Page:**
  - Call `POST /{page-id}/messages` with `recipient` set to a `comment_id` or `post_id`, under the same 7-day, one-message rule.
  - Needs `pages_messaging` and a Page token with the `MESSAGING` task. Get comment IDs from the `feed` webhook ([FB private replies](https://developers.facebook.com/docs/messenger-platform/discovery/private-replies)).

## Human agent tag

- The standard window is 24 hours.
- The Human Agent feature lets a human reply with the `human_agent` tag "within 7 days of a user's message", for issues that can't be resolved in the standard window.
- It requires App Review and Business Verification ([Human Agent feature](https://developers.facebook.com/docs/features-reference/human-agent)).
- It is listed for both IG configurations ([overview](https://developers.facebook.com/docs/instagram-platform/overview)) and works the same on Messenger.
- cheKe must only attach the tag to messages typed by a person, never to automations.

## Rate limits ([rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting))

| Limit | Instagram | Messenger (FB Page) |
|---|---|---|
| Send API: text, links, reactions, stickers | 100/s per IG account (the "Messenger API for Instagram" section says 300/s) | 300/s |
| Send API: audio, video | 10/s | 10/s |
| Conversations API | 2/s per IG account | 2/s per Page |
| Private replies | 750/hour on posts and reels; 100/s on Live comments | 750/hour per Page for comments on Instagram posts and reels |
| Overall cap | IG Platform BUC: 4800 × impressions per 24h | Messenger API: 200 × engaged users per 24h. Page calls with a Page or system user token: 4800 × engaged users per 24h |

All of these are generous for small shops. The one that could bite is the 750/hour private-reply limit during a viral comment giveaway, so queue private replies.

## Fit with ads and posting later

- **Marketing API:** It sits on Facebook Login only (`ads_management`, `ads_read`, `pages_manage_ads`, `business_management`). The IG Login path "cannot access ads" at all.
- **Content publishing:** Both paths support it. With Facebook Login it is `instagram_content_publish` plus `pages_manage_posts` for FB, both from one Page-linked connection.
- **One connection serves everything:** The Page + IG + ad account picked in one Facebook Login for Business connection covers inbox, posting and ads.
- **Marketing API rate limits:** They start low and grow with active ads, e.g. Ads Management at Standard Access is 300 + 40 × active ads per hour ([rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting)).
- **Embedded Signup v4 later:** v4 can also add Click-to-Messenger, Click-to-Direct and CAPI products later ([ES v4](https://developers.facebook.com/docs/whatsapp/embedded-signup/versions/version-4/)).

## Permissions for the single app review

Dependencies come from the [permissions reference](https://developers.facebook.com/docs/permissions). Every item needs **Advanced Access**, because cheKe serves businesses it does not own. Advanced Access to `public_profile` is also required before a Facebook Login for Business app goes live ([FB Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business)).

### Launch: IG + Messenger messaging + comments + private replies

| Permission / feature | Why |
|---|---|
| `pages_show_list` | List the shop's Pages (base dependency of everything below) |
| `pages_manage_metadata` | Subscribe each Page to webhooks (`subscribed_apps`) |
| `pages_messaging` | Read and send Messenger DMs; FB private replies |
| `pages_read_engagement` | Dependency of the IG permissions; read Page content and posts |
| `pages_read_user_content` | Read user comments on Page posts (Comentarios screen); dependency of `instagram_basic` |
| `pages_manage_engagement` | Reply to, hide or delete FB comments publicly from the Comentarios screen |
| `instagram_basic` | Read the IG profile and media |
| `instagram_manage_messages` | Read and send IG DMs |
| `instagram_manage_comments` | Read, reply to and hide IG comments; IG private replies; `comments` webhooks |
| `business_management` | Read the business portfolio and assets in the Facebook Login for Business / BISU flow (already used by WhatsApp ES) |
| **Human Agent** (feature) | `human_agent` tag, 7-day reply window on IG and Messenger |
| `public_profile` | Required Advanced Access for Facebook Login for Business |
| `whatsapp_business_management`, `whatsapp_business_messaging` | Already part of the WhatsApp integration; keep them in the same submission |

**Ads-account caveat.** If a shop's Page role comes through Business Manager, IG private replies also list `ads_management` and `ads_read` ([IG private replies](https://developers.facebook.com/documentation/instagram-platform/private-replies)). You could request `ads_read` at launch to be safe. Otherwise, test private replies with a Business-Manager-owned Page in development mode first.

### Deferred: post-launch ads + scheduled posting review

| Permission / feature | Why |
|---|---|
| `ads_management` | Create and manage campaigns (Marketing API) |
| `ads_read` | Ads Insights reporting |
| `pages_manage_ads` | Ads tied to the Page (CTM/CTD) |
| Ads Management Standard Access (feature) | Higher Marketing API rate limits |
| `instagram_content_publish` | Publish and schedule IG posts and reels |
| `pages_manage_posts` | Publish and schedule FB Page posts |
| `instagram_manage_insights`, `read_insights` (optional) | Post and account analytics (Analítica screen) |
| `instagram_manage_events`, `page_events` (optional) | Conversions API for Click-to-Direct and Click-to-Messenger ([ES v4](https://developers.facebook.com/docs/whatsapp/embedded-signup/versions/version-4/)) |

The issue says everything goes in ONE review. If so, the deferred rows can simply be added to that submission, but each permission needs its own working demo screencast. Requesting ads and publishing before those screens exist will likely be rejected, so the staged split above is the safer order.

**If the Instagram Login fallback is added later**, request `instagram_business_basic`, `instagram_business_manage_messages` and `instagram_business_manage_comments`. Add `instagram_business_content_publish` for posting ([Business Login for IG](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)).

## Open points to check in the App Dashboard

1. Can `pages_messaging` and `instagram_manage_messages` be added to the existing WhatsApp Embedded Signup configuration, giving one button for all three channels?
2. Does the existing WhatsApp config already use v4 (ES v2 is deprecated 2026-10-15)?
3. Does a Page token derived from a BISU token work for `subscribed_apps` and the Send API? It is expected to, but undocumented.
4. Is `pages_read_user_content` needed alongside `pages_manage_metadata` for `feed` comment webhooks? The permission reference lists it as a dependency of `instagram_basic`, so it is requested regardless.
