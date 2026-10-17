# Meta token lifetime: non-expiring access to client WhatsApp, Instagram and Messenger

Research for [#56](https://github.com/fergutierreza123/cheke/issues/56). Read on 2026-10-16/17 from Meta's own docs (developers.facebook.com, including the `.md` versions under `/documentation/...`). Nothing in Meta, Vercel or Supabase was changed.

**Confidence levels:** **High** means a Meta doc says it outright. **Medium** means it follows from what Meta's docs say but no doc states it word for word. **Low** means it is an inference or a third-party report, so test it before you rely on it.

## Context

- Meta app `2972924036384741` is in the business portfolio of Inversiones y Representaciones Arguz. The app is Unpublished and business verification is pending.
- In **Facebook Login for Business → Configurations**, the only WhatsApp template is "WhatsApp Embedded Signup Configuration With 60 Expiration Token". Config `1765933844658967` is in use. "Create configuration" only offers the **General** login variation, and on the access-token step it offers User vs System-user token.
- **WhatsApp:** `src/app/(app)/channels/actions.ts` trades the Embedded Signup code for a business token and stores it per channel in `channels.access_token_encrypted`. The token is read back in `src/lib/whatsapp.ts:58`, which feeds send, media and coexistence calls, and in `channelHelpers.ts`.
- **Instagram/Facebook:** `src/app/(app)/channels/metaActions.ts` goes from code → user token → long-lived user token (`fb_exchange_token`) → `GET /me/accounts`. The Page token it gets is stored encrypted and read in `src/lib/metaMessaging.ts:29`.
- The app has no Messenger/Instagram use case yet, and `NEXT_PUBLIC_META_MESSAGING_CONFIG_ID` is not set.

---

## 1. Does becoming a Tech Provider unlock non-expiring tokens?

### What Meta says

- **Business Integration System User (BISU) tokens do not expire by default, and only Tech Providers get them.** The Facebook Login for Business comparison table says, under "Expiration and refresh": *"Defaults to **never expire** for the common offline server-to-server communication."* Under "Access designations" it says *"Tech Providers only."* **High.** Source: [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business).
- **The Embedded Signup guide assumes you are already a partner.** Before you start, *"You must already be a Solution Partner or Tech Provider."* The Coexistence guide has the same prerequisite. **High.** Sources: [ES Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation), [Onboard Business app users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).
- **There are two ways to create the config.** Step 2 of the Implementation guide offers:
  - "Create from template" with the **"WhatsApp Embedded Signup Configuration With 60 Expiration Token"** template.
  - *"Alternatively… click the Create configuration button… be sure to select the **WhatsApp Embedded Signup** login variation."*

  Only the custom route lets you choose the token expiration. The template's name says 60 days. **High.**
- **The app is missing the "WhatsApp Embedded Signup" login variation.** Our app only offers "General", so it does not have the variation the docs tell partners to pick. Meta does not document what unlocks it. The likeliest cause is that the app hasn't finished Tech Provider onboarding: business verification is still pending and App Review hasn't been passed. **Medium-Low.** Check this right after verification clears.
- **A BISU token can probably be re-minted without the 60-day limit.** The BISU Token Management API is `POST /<CLIENT_BUSINESS_ID>/system_user_access_tokens`. Its parameter `set_token_expires_in_60_days` is *optional*: *"When you generate a new token, set to `true` so that the token expires in 60 days."* That implies a token minted without the flag does not expire. The call needs `business_management` plus `appsecret_proof`, and you get the client business ID from `GET /me?fields=client_business_id`. If this works, the token from our current 60-day config could be swapped server-side for a non-expiring one. **Low-Medium.** Meta doesn't say whether the original token's expiry carries over, so test it with `debug_token` on a test client.
- **Tech Partner (the tier above Tech Provider) is not needed.** It requires at least 10 active clients and an average of 2,500 or more messages a day, and it adds no token option. **High.** Source: [Upgrade to Tech Partner](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/upgrade-to-tech-partner).
- **Solution Partner is not worth it for a solo founder.** It requires a line of credit and takes on billing for clients. **High** for the requirements; the recommendation is a judgement call. Source: [Access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens).

### Steps to become a Tech Provider

Source: [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers). **High** unless marked otherwise.

1. **Where:** App Dashboard → **Use cases → Customize** (pencil) on the WhatsApp use case → **Tech Provider onboarding**. The Messenger use-case doc also has a **Become a Tech Provider → "Yes, I'm a Tech Provider"** button, followed by Business verification.
2. **Business verification:** submit legal name, address, phone, email and website, plus documents if Meta can't find the business. Verification must be done before App Review can start. Timing: no Meta figure. Third parties report 2–5 business days (Infobip). **Low.**
3. **App Review for Advanced access** to `whatsapp_business_messaging` and `whatsapp_business_management`. Without it, calls on WABAs you don't own return error code `200`. You need:
   - Basic settings: app icon, privacy policy and app category.
   - **Two separate screen recordings**: one of a message sent from cheke and received in WhatsApp, and one of a template being created. Meta also accepts recordings of the API Setup cURL and of WhatsApp Manager.
   - A written explanation for each permission.

   Meta says *"The average turnaround time for App Review is about 24 hours."* and that you don't need to wait for Embedded Signup to be finished before starting. Source: [App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review).
4. **Access verification is no longer required.** The changelog for 2025-10-03 says: *"Access verification is no longer required to become a Tech Provider."* Source: [WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog).
5. **Embedded Signup versions:** v2 and v3 were deprecated on **2026-10-15**. cheke already uses v4 (`extras: { setup: {} }` plus products set in the login config), so nothing to do. **High.** Source: [ES Versions](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions).

---

## 2. Using Arguz's own permanent System User token on client WABAs

- **An admin system user can reach every client WABA shared with Arguz.** *"By default, admin system users have full access to all WhatsApp Business Accounts (WABAs) and their assets owned by or shared with you or your business portfolio."* When you generate its token you *"choose a token expiration preference"*; the dashboard shows this as Never or 60 days. Give it the permissions `business_management`, `whatsapp_business_management` and `whatsapp_business_messaging`. **High.** Source: [Access tokens → System user access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens).
- **Embedded Signup shares the client's WABA with the partner portfolio.** Meta documents an API that lists *"all the WABAs assigned to or shared with your business portfolio"*. The partner's permissions in a shared WABA include adding phone numbers, creating templates, sending messages and accessing metrics. **High.** Source: [Manage accounts](https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts/).
- **Meta's recommendation differs from this pattern.** Meta tells Tech Providers to *"use a Business Integration System User access token"*. Solution Partners use system tokens only to share their credit line. The partner system token is a widely used fallback, not Meta's primary recommendation. **High** that this is what Meta recommends.
- **Coexistence numbers.** *"App-Only Install can't be used to onboard WhatsApp Business app users."* App-Only Install is the mode where *only* business tokens work and system tokens do not. So Coexistence onboarding goes through the normal sharing path, and the partner system user does get access. No doc carves out an exception for Coexistence. **Medium.** Source: [App-only install](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/app-only-install).
- **Each operation:**
  - **Sending, `POST /<PHONE_ID>/messages`:** needs `whatsapp_business_messaging` and access to the WABA. **High.**
  - **Templates:** need `whatsapp_business_management`. **High.**
  - **`POST /<WABA_ID>/subscribed_apps`:** subscribes *the app that owns the token*. The system user is assigned to our app, so this works. **Medium.**
  - **Media download, `GET /<MEDIA_ID>` then the URL:** any token with `whatsapp_business_messaging` on the number's WABA works. URLs expire in 5 minutes, and webhook media IDs last 7 days. **High** for the expiry figures. Source: [Media](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media).
  - **`smb_app_data` (Coexistence history sync):** same WABA access rules. **Medium.**
- **Limits and risks:**
  1. **Advanced access is still required for WABAs Arguz doesn't own.** Without it you get error `200`. So this pattern still needs App Review, and it does not avoid becoming a Tech Provider. **High.**
  2. **One leaked token exposes every client.** Meta gives that as the reason for BISU and granular tokens. Mitigations: keep it server-only, encrypt it at rest, and always check that a `phone_number_id` belongs to the channel's business. The webhook routing already does that check. **High.**
  3. **The client can unshare the WABA or remove the app,** and then calls return `200` or `190`. cheke has to show a "Reconectar" state anyway. **High.**
  4. **The token belongs to Arguz's portfolio.** If someone deletes the system user or rotates the token, every channel breaks at once. Keep the token in a single env var so rotating it means changing one secret. **High.**

---

## 3. Instagram and Messenger through Facebook Login for Business

- **Page tokens from a long-lived user token have no expiry date.** *"Long-lived Page access token do not have an expiration date and only expire or are invalidated under certain conditions."* To get one, call `/{user-id}/accounts`, or `/me/accounts`, with a **long-lived** user token, and the person must have a role on the Page. **High.** Source: [Get long-lived tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived).
  - **They can still be invalidated.** Causes include the user changing their password, losing the Page role, or removing the app. Data-access expiration also applies: *"The expiration period for data access is 90 days, based on when the user was last active"* ([Data access expiration](https://developers.facebook.com/docs/facebook-login/auth-vs-data)). The 90-day rule clearly applies to user tokens. For Page tokens, `debug_token` reports `expires_at: 0`, and whether `data_access_expires_at` matters for Messenger/IG sends is not documented. **Medium.**
- **The current code path does give non-expiring Page tokens,** as long as the config issues a *User* token, because it calls `fb_exchange_token` before `me/accounts`. **High.**
- **The more robust option is a System-user config with expiration "Never".** Meta's Messenger Marketing Messages onboarding doc lists these exact clicks for a non-expiring token: **Create configuration → Choose login variation: General → Choose access token: System-business access token → Choose token expiration: Never → Choose assets: Pages (Asset Required) → permissions…** It calls the result a *"non-expiring system-business access token"*. **High.** Source: [Onboard Businesses (Marketing Messages on Messenger)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/onboard-businesses).
  - This token is tied to the client's **business portfolio**, not to one person. It survives that person's password change or departure, and is revoked only when the client removes the app under *Business Settings → Integrations → Connected apps*. **High.** Source: [FLB comparison table](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business).
  - The General variation is the one our dashboard already offers, so **this config can be built today**. It is a Tech Provider feature, so testing works only with people who have a role on the app until App Review passes.
- **Permissions to request** ([Messenger Platform overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)). **High.**
  - Messenger: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `business_management`.
  - Instagram: also `instagram_basic`, `instagram_manage_messages`.
  - `business_management` is a dependency of the others, so mention that in App Review. The user needs the MESSAGING and MODERATE Page tasks.
- **Use cases to add in the app.** Dashboard → **Add use case**:
  - **"Engage with customers on Messenger from Meta"**. Required permissions: `business_management`, `pages_manage_metadata`, `pages_messaging`, `pages_show_list`, `public_profile`. Add `instagram_basic`, `instagram_manage_messages` and `pages_read_engagement`.
  - Then **Customize → Configure webhooks** with the same callback URL and verify token as `/api/meta/webhook`. Subscribe the Page fields.
  - For Instagram DMs through Facebook Login, the Messenger use case can hold the Instagram permissions (`instagram_manage_messages` is listed as optional there). The separate "Manage messaging & content on Instagram" use case belongs to the Instagram-Login API, which cheke does not use. **Medium.** Source: [Customize the Messenger use case](https://developers.facebook.com/documentation/business-messaging/messenger-platform/create-an-app).
- **How the code changes with a System-user config:**
  - The code exchange returns a BISU token, and `fb_exchange_token` is rejected. The code already tolerates that.
  - Then `GET /me/accounts`, or `GET /<PAGE_ID>?fields=access_token` with the BISU token, returns Page tokens derived from a non-expiring system-user token. Those Page tokens are also non-expiring. **Medium.** Confirm with `debug_token` (`expires_at` should be `0`).
  - Fallback: store the BISU token itself and fetch the Page token from it whenever a send fails with `190`.

---

## 4. Recommendation

**The best single path for a solo founder:** become a Tech Provider; Meta's docs assume it and the dashboard features depend on it. Until the never-expiring Embedded Signup option is confirmed, send WhatsApp traffic with **one Arguz admin System User token (Never)**. For Instagram and Messenger, use a **General + System-user + Never** Login for Business config. Show a "Reconectar" state whenever Meta returns `190`/`200`.

Why the partner token for WhatsApp:

- It works the same for Cloud API and Coexistence numbers.
- It doesn't depend on which configuration templates Meta shows the app.
- Clients never have to re-authorize.

The per-channel BISU token is still used during onboarding, for code exchange, `register` and `subscribed_apps`.

**Revisit after approval.** If the "WhatsApp Embedded Signup" login variation then offers "Never", or minting a token through `system_user_access_tokens` without `set_token_expires_in_60_days` produces a non-expiring token, switch WhatsApp to per-client BISU tokens. That is Meta's recommended model and limits the damage if a token leaks.

### Founder steps (exact clicks)

1. **Business verification (critical path).** In [App Dashboard](https://developers.facebook.com/apps) → cheke app → **Use cases** → WhatsApp **Customize** → **Tech Provider onboarding** → **Start verification**, or check the status in Business Settings → **Security Center**. Upload documents for Inversiones y Representaciones Arguz. The legal name, address and website must match the documents.
2. **Basic settings.** **App settings → Basic**: app icon (512–1024 px), privacy policy URL, terms URL, category, and a Data deletion URL.
3. **Permanent partner token.** In [Business Settings](https://business.facebook.com/settings/) → **Users → System users** → **Add** → name `cheke-server`, role **Admin**.
   - **Assign assets** → Apps → cheke → **Manage app (Full control)** → reload.
   - **Generate token** → app cheke → expiration **Never** → permissions `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`. Also add the Page/IG permissions listed in step 4 if you want one token for everything.
   - Copy the token into Vercel as `META_SYSTEM_USER_TOKEN`, for Production and Preview. Do this only when the code PR is ready.
4. **Messenger/Instagram use case.** App Dashboard → **Add use case → "Engage with customers on Messenger from Meta"** → Customize.
   - Add `instagram_basic`, `instagram_manage_messages`, `pages_read_engagement`.
   - Configure webhooks: callback `https://<prod-domain>/api/meta/webhook` with the same verify token.
5. **Messaging config.** **Facebook Login for Business → Configurations → Create configuration**:
   - Name "cheke IG+FB", login variation **General**.
   - Access token **System-user access token**, expiration **Never**.
   - Assets **Pages** and **Instagram accounts**.
   - Permissions `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `business_management`, `instagram_basic`, `instagram_manage_messages`.
   - **Create**, copy the Configuration ID, and set Vercel `NEXT_PUBLIC_META_MESSAGING_CONFIG_ID`.
6. **Test** with your own client portfolio (a role on the app is required). Then run `debug_token` on the stored tokens and check `expires_at` = 0 (never) for the System User token and the Page tokens.
7. **App Review** (after verification): **Review → App Review → Edit**. Request Advanced access with one video and one written explanation per permission:
   - `whatsapp_business_messaging`: message sent from cheke and received in WhatsApp.
   - `whatsapp_business_management`: template created in cheke or WhatsApp Manager.
   - `pages_messaging`: reply to a Messenger DM from cheke.
   - `instagram_manage_messages`: reply to an IG DM from cheke.
   - `pages_show_list`, `pages_manage_metadata`, `business_management`.

   Include reviewer instructions and a test login. Submit; don't leave the submission in draft.
8. **After approval:** publish the app (switch it to Live). Open **Configurations → Create configuration** and check whether the "WhatsApp Embedded Signup" variation with expiration **Never** now appears. If it does, create it and replace config `1765933844658967`.

### Code changes (one issue/PR)

1. **WhatsApp token resolver.** In `src/lib/whatsapp.ts:58`, which feeds `messageMedia.ts`, `coexistence.ts`, `channelSend.ts` and `channelHelpers.ts`, return `process.env.META_SYSTEM_USER_TOKEN` when it is set. Fall back to `decryptSecret(channel.access_token_encrypted)`. Keep using the per-channel token in `channels/actions.ts` during onboarding (`phone_numbers`, `subscribed_apps`, `register`), because the partner system user may not see the WABA for a few seconds after it is shared.
2. **Expiry tracking.** After every code exchange, call `GET /debug_token?input_token=…` with the app token `APP_ID|APP_SECRET`. Store `expires_at` and `data_access_expires_at` in new columns on `channels`, via a migration.
3. **Reauth state.** On Graph error `190` (or `200` on a WABA or Page), set `channels.status = 'needs_reauth'` and show **"Reconectar WhatsApp/Instagram/Facebook"** in Canales and in the inbox banner.
4. **IG/FB.** No change is needed for a User-token config. For the System-user config:
   - Keep `me/accounts`, and fall back to `GET /<PAGE_ID>?fields=access_token,instagram_business_account` if `me/accounts` comes back empty.
   - Store the BISU token encrypted in a `credential_token_encrypted` column so the Page token can be regenerated.
5. **Optional experiment, behind a script and not in the product.** Call `POST /<client_business_id>/system_user_access_tokens` with `appsecret_proof` and without `set_token_expires_in_60_days`, then `debug_token` the result. If `expires_at` is `0`, do this re-mint during onboarding and drop the dependence on the partner token.

### Before App Review

- Business verification is approved. This blocks App Review. Access verification is no longer needed.
- Basic settings, privacy and data-deletion URLs, and the app icon are done.
- Production domain is in **FLB → Settings → Allowed domains / Valid OAuth redirect URIs**, with the Client OAuth, Web OAuth, JS SDK login and Enforce HTTPS toggles on.
- The Messenger use case is added, webhooks are verified, and the Messaging config exists.
- cheke can demonstrate:
  - sending a WhatsApp message;
  - creating a template, or showing it in WhatsApp Manager;
  - replying to a Messenger DM and an IG DM.

  Record each one as its own video.
- Only request permissions cheke uses. Asking for unneeded permissions is a common reason for rejection ([App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review)).

## Open questions (test, not documented)

- Does the "WhatsApp Embedded Signup" login variation, and with it a "Never" expiration, appear once the app is a verified Tech Provider? (Medium-Low)
- Does a BISU token re-minted through `system_user_access_tokens` without the 60-day flag come back non-expiring? (Low-Medium)
- How does `data_access_expires_at` on Page tokens derived from user tokens affect Messenger/IG sends after 90 days without login? (Undocumented. The System-user config avoids the question.)

## Sources

- [Access tokens (WhatsApp)](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens)
- [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)
- [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers) · [App Review (WhatsApp)](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review) · [Upgrade to Tech Partner](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/upgrade-to-tech-partner)
- [ES Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation) · [Onboarding as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider) · [ES Versions](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions) · [App-only install](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/app-only-install) · [Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Manage accounts](https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts/) · [Media](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media) · [WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)
- [Get long-lived tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived) · [Access tokens (Facebook Login)](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens) · [Data access expiration](https://developers.facebook.com/docs/facebook-login/auth-vs-data)
- [Messenger Platform overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview) · [Customize the Messenger use case](https://developers.facebook.com/documentation/business-messaging/messenger-platform/create-an-app) · [Onboard Businesses (Marketing Messages on Messenger)](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/onboard-businesses)
