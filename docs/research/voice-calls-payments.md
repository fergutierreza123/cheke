# Voice notes, calls, payment links and gaps vs the WhatsApp Business app

Research for cheke ventas ahead of the December 2026 launch. Done 2026-10-16 against primary sources where they could be reached (developers.facebook.com, platform.claude.com, provider docs and pricing pages). Each claim has a confidence level:

- **H (high):** read on the owner's own page during this research.
- **M (medium):** primary source read in part, or consistent first-party signals.
- **L (low):** secondary source, or inferred from my knowledge. Check it before building.

What cheke has today (read in the repo):

- `src/lib/whatsappMessages.ts`: inbound media is **not downloaded**. Audio shows as "🎤 Nota de voz", photos and videos show only their caption, and imported history media shows as "📎 Archivo del historial".
- `src/app/api/whatsapp/webhook/route.ts`: saves inbound messages, Coexistence `message_echoes`, `history` chunks, contacts and statuses. Reactions are dropped (`describeMessage` returns `null`).
- `src/lib/orders.ts`, `src/app/(app)/chat/actions.ts` (`sendPaymentRequest`) and migration `0022`: "Cobrar" sends a message with the payment link and/or transfer instructions, then records an `orders` row (`awaiting_payment`, `payment_link`). A person taps "Confirmar pago", which sets `paid_at`/`paid_by`. `store_chekelin_info.payment_methods` is free text that chekelin sends when it closes an order.
- Migration `0013`: Coexistence flags, and `messages.source` set to `cheke`, `phone` or `history`.

---

## Executive summary

1. **Voice notes in are cheap and should ship first.** The WhatsApp webhook already carries a media `id` (and, since late 2025, a `url`) for audio with `mime_type: audio/ogg; codecs=opus` and `voice: true`. Download it with the channel's token, store it in a private Supabase Storage bucket, and transcode a copy to AAC/M4A for Safari. Instagram and Messenger send a CDN `payload.url` instead. Effort is about 2 to 3 days.
2. **Claude cannot hear audio.** The Claude API takes text, images and PDFs, not audio. chekelin needs a speech-to-text step first. **Recommendation: OpenAI `gpt-4o-transcribe`** ($0.006/min), with a vocabulary prompt built from the Tienda's product names. Run a bake-off against ElevenLabs Scribe v2 on 50 real Honduran voice notes before committing. At 200 voice notes of 20 s each (about 67 minutes), the cost is about **US$0.40 per business per month**, or $0.20 with `gpt-4o-mini-transcribe`. Cost doesn't decide this; accuracy does.
3. **Voice notes out are feasible on WhatsApp.** Record in the browser, convert to OGG/Opus mono on the server, upload to `/media`, and send `type: audio` with `"voice": true`. Keep each note at 512 KB or less so WhatsApp shows the play button. Instagram takes aac/m4a/wav/mp4 as a plain audio attachment, with no voice-note flag. Replies from chekelin in a synthetic voice are allowed for a business-specific assistant, but aren't worth it at launch.
4. **WhatsApp calls: skip them for launch.** The Calling API works (user-initiated calls are free and can be answered through WebRTC, including in a browser). But Meta lists voice and video calls as **not supported on Coexistence numbers**, and most cheke shops will be on Coexistence. Their phone app keeps ringing as it does today, and **cheke gets no webhook for those calls**, so it can't even show a missed call. Calls are only possible for shops on an API-only number. Instagram and Messenger have no business calling API.
5. **Payment links: PixelPay is the one integrated path available now.** PixelPay is Honduran, and its Hosted Payment API returns a checkout `url` for an exact amount in HNL, with an `_callback` webhook on payment. That allows auto-confirmation, so nobody has to tap "Confirmar pago". Tilopay also creates links with a `webhook_url`, but its Honduras coverage and contract need checking. BAC Compra Click, Ficohsa, Banpaís and Atlántida have **no public API**: shops make links in the bank's portal, so cheke stores and sends them (the manual path). Stripe doesn't serve Honduras. dLocal covers Honduras only for enterprise merchants.
6. **The biggest gap vs the WhatsApp Business app is media.** Seeing and sending photos, voice notes and documents matters most for adoption. Next come replies/quotes and reactions, quick replies, and catalog. All are in the Cloud API. Status/stories, broadcast lists (disabled under Coexistence), group sync and presence ("online") are not available, and cheke should say so plainly.

---

## 1. Voice notes in

### WhatsApp (Cloud API)

- **Webhook payload (H):** `messages[].audio` has `id`, `mime_type` (for example `audio/ogg; codecs=opus`), `sha256`, `voice` (true when recorded with WhatsApp's mic) and `url`. Meta says `url` "is being released to developers gradually" from 2025-11-12, so don't rely on it alone. [audio webhook ref]
- **Flow (H):**
  1. `GET https://graph.facebook.com/<v>/<MEDIA_ID>` with `Authorization: Bearer <token>` returns the URL. `phone_number_id` is optional.
  2. `GET <url>` with the same Bearer token returns the binary, with the MIME type in `Content-Type`.

  Media URLs **expire after 5 minutes**. Media IDs from webhooks can be downloaded **for 7 days**. A 404 means you should fetch a fresh URL and retry. Inbound media over 100 MB produces error 131052. [media ref]
- **Formats (H):** audio can be AAC, AMR, MP3, M4A or OGG, and OGG must be **Opus, mono**. The limit is 16 MB. Real WhatsApp voice notes are OGG/Opus.
- **cheke specifics:** use `credentialsForChannel(channel)` (already in `channelSend.ts`) for the token, since each Tienda's channel has its own. Download inside the webhook request or in a job queued right after it, never later than 7 days.

### Coexistence

- **Echoes (M):** Meta's `smb_message_echoes` reference lists the echo types as text, image, video, document, revoke and edit. **Audio isn't listed.** Its image example carries `id` and `url` the same way inbound media does. Voice notes the shop sends from the phone may therefore not reach cheke at all. Test with a real Coexistence number. If they don't arrive, show "Nota de voz enviada desde el teléfono" when a placeholder arrives, or nothing at all. [echoes ref]
- **History (H):** history messages "will not include media asset IDs". Separate webhooks deliver them, "but only for media messages sent within 14 days of onboarding". Older media stays a `media_placeholder`, which matches the current "📎 Archivo del historial". [coexistence onboarding]

### Instagram and Messenger

- **Instagram (H/M):** audio arrives as a `messages` attachment with `type: audio` and `payload.url` (H). The docs say nothing about URL lifetime or auth. In practice these are signed `lookaside`/CDN URLs that expire, so download them when the webhook arrives (L). Ephemeral (view-once) media comes with no URL (H). [IG webhook]
- **Messenger (M):** same shape, `attachments[].type = "audio"` with `payload.url` (L for expiry). Download right away.

### Storage and playback

- **Bucket:** a private Supabase Storage bucket named `message-media`, with paths `business_id/conversation_id/message_id.ogg`. Give it an RLS policy on `storage.objects` scoped by `my_store_ids()`, like the other tables, and serve audio to the browser through short-lived signed URLs. Save the path in `messages.media_url`, or better in new columns `media_path`, `media_mime`, `media_duration_s` and `transcript`.
- **Safari (M):** caniuse lists Opus as "partial" in Safari. Safari 18.4 added Ogg/Opus playback on macOS 15.4+ and iOS 18.4+, but independent testing reports it buggy. Older iPhones can't play it at all. **Store a transcoded `.m4a` (AAC) copy next to the original** and play that on every browser. It's the simplest path. [caniuse opus]
- **Transcoding on Vercel (M):** run `ffmpeg-static` in a Node.js function: `ffmpeg -i in.ogg -c:a aac -b:a 48k out.m4a`. The binary fits within Vercel's function size limit, and a 20 s note converts in well under a second. Alternatives:
  - decode Opus in the browser with WASM (ogv.js, opus-decoder), so the server stores nothing extra;
  - use a media service (Cloudinary, Mux), which costs extra and isn't needed at this volume.

---

## 2. Transcription for chekelin

### Does Claude accept audio? **No (H).**

The Claude API's features overview lists input modalities as text, images and PDFs. The Files API "Supports PDFs, images, and text files". There is no audio content block, and an open feature request (Feb 2026) confirms it. chekelin (Sonnet 5.5) needs speech-to-text first. Its prompt then receives `[Nota de voz, 18 s]: "<transcript>"`. [Claude features overview]

### Comparison

No independent 2026 benchmark covers Honduran or Central American Spanish specifically (searched; vendor-run WER claims only). All of these handle Latin American Spanish well. The real differences are slang ("pisto", "maje", "cipote", "va pues") and product names, so **use vocabulary prompting** and run a bake-off on cheke's own audio.

| Provider / model | Price (pre-recorded) | 200 × 20 s ≈ 66.7 min/month | Vocabulary bias | Latency for a 20 s clip | Notes | Conf. |
|---|---|---|---|---|---|---|
| OpenAI `gpt-4o-transcribe` | $0.006/min | **$0.40** | `prompt` param | ~1–3 s (L) | Accepts ogg directly. Strong on noisy phone audio. | H price |
| OpenAI `gpt-4o-mini-transcribe` | $0.003/min | $0.20 | `prompt` | ~1–2 s (L) | Cheapest good option | H price |
| OpenAI `gpt-transcribe` | $0.0045/min | $0.30 | — | (L) | Newer model listed on the pricing page; test it | H price |
| ElevenLabs Scribe v2 | $0.22/h ≈ $0.0037/min | $0.24 | keyterms (L) | ~1–3 s (L) | Vendor claims 3.1% WER on Spanish FLEURS | H price |
| Deepgram Nova-3 (mono / multi) | $0.0043 / $0.0052/min | $0.29 / $0.35 | keyterm prompting | fastest (<1 s, L) | $200 free credit | H price |
| AssemblyAI Universal-3.5 Pro | $0.0035/min ($0.21/h) | $0.23 | keyterms (L) | ~2–5 s async (L) | $50 free credit | H price |
| Google Chirp (STT V2) | $0.016/min standard; $0.003/min dynamic batch (up to 24 h) | $1.07 | adaptation | batch too slow for chat | Batch tier unusable for live chat | M |

**Recommendation:** OpenAI `gpt-4o-transcribe`, with `language: "es"` and a `prompt` holding the Tienda's product names plus common Honduran words. It's about $0.40/business/month, negligible against any plan price. Run a one-day bake-off first: 50 real voice notes from 3 to 5 pilot shops through gpt-4o-transcribe, gpt-4o-mini-transcribe and Scribe v2, scored by a Honduran reader on getting product, quantity, size and address right. Pick the winner on that score. Wire it behind a `transcribe(audio, hints)` function so the provider can change.

Show the transcript under the audio player in Chat too. Agents read faster than they listen.

---

## 3. Voice notes out

### WhatsApp PTT (H)

- Send `{"type":"audio","audio":{"id":"<MEDIA_ID>","voice":true}}`. "Voice messages require .ogg files encoded with the OPUS codec". Mono only, 16 MB max.
- **The play icon appears only for files ≤ 512 KB.** Larger files show a download icon. At 24 to 32 kbps mono that allows about 2 to 2.5 minutes, so cap recordings at 2 minutes.
- A voice note shows the business's profile photo with a mic icon and auto-downloads. The recipient may get an automatic transcript, depending on their own setting. [audio messages]
- Upload with `POST /<PHONE_NUMBER_ID>/media` (multipart, `messaging_product=whatsapp`). Uploaded IDs live 30 days.
- The 24 h customer-service window applies as it does for text.

### Recording in the browser (M)

`MediaRecorder` output differs by browser. Always check `MediaRecorder.isTypeSupported()`:

- Chrome/Edge: `audio/webm;codecs=opus`
- Firefox: `audio/ogg;codecs=opus`
- Safari (macOS/iOS): `audio/mp4` (AAC). Ogg recording in Safari is reported unreliable.

**Do the conversion on the server, not the client.** Upload whatever the browser produced, then run `ffmpeg -i in -ac 1 -c:a libopus -b:a 24k -application voip -f ogg out.ogg` in a Node function. Upload the result to Meta and also keep an `.m4a` for cheke's own player. The alternative is client-side encoding to Ogg/Opus with a WASM encoder (`opus-recorder`), which works in every browser but adds about 1 MB of JS. The native app (`nativeApp.ts`) can use the same upload endpoint.

### Instagram and Messenger

- **Instagram (H):** send an attachment with `type: "audio"` by URL. The formats are **aac, m4a, wav or mp4**, up to 25 MB. There is no voice-note flag, so it shows as an audio clip. Send the `.m4a` from a signed Supabase URL. [IG messaging API]
- **Messenger (M):** same `attachment.type: "audio"` with `payload.url`, or upload with the Attachment Upload API. Send `.m4a`/`.mp3` (L for the exact format list).

### Optional: chekelin replying with voice (TTS)

- **Allowed? (M):** Meta's WhatsApp Business Solution terms from 2026-01-15 ban general-purpose AI assistants as the main product. Meta says businesses using AI to serve their own customers are not affected, so chekelin (a store's seller) is fine. Voice output isn't treated differently from text. Being transparent ("soy chekelin, el asistente de la tienda") remains good practice.
- **Options (M):**
  - ElevenLabs Flash/Turbo, $0.04 per 1K characters. A 200-character reply costs ≈ $0.008.
  - ElevenLabs Multilingual v2/v3, $0.08 per 1K characters. Voice library or cloning can get a Central American Spanish voice.
  - OpenAI `gpt-4o-mini-tts`, steerable through instructions such as "acento hondureño, cálido", with Opus output (L).
- **Worth it? Not for launch.** Text is what customers need for orders (amounts, addresses, links). A synthetic voice that sounds off with Honduran customers hurts trust, and every voice reply adds latency and failure modes. Revisit as an opt-in, "answer voice with voice" per Tienda, after the pilot. Voice notes recorded by the shop's own people get far more value from the same plumbing.

---

## 4. WhatsApp calls

### Calling API status (H unless marked)

- **User-initiated calls** (customer calls the business) are "available in every location Cloud API is available". They are **free**. [calling overview, calling pricing]
- **Business-initiated calls** are available except for business numbers in the US, Canada, Egypt, Vietnam and Nigeria, so **Honduras +504 numbers qualify**.
  - They need the user's call permission. The documented production limits are 1 permission request a day and 2 a week per user. The changelog mentions raising calls per user to 100 a day in Dec 2025, so the limits page and changelog disagree; check before relying on either.
  - Two unanswered calls trigger a warning message, and four revoke the permission.
  - They're billed by destination country in **6-second pulses**, with volume tiers. Permission-request messages bill as messages. The Honduras rate is on Meta's rate cards; I didn't find it in the page text (M).
- **Requirements:** the number must be on Cloud API, not the WhatsApp Business app. The business needs a messaging limit of at least **2,000 unique recipients a day** (not for test numbers), the `calls` webhook field, and calling enabled in the number's call settings.
- **Signaling/media:** Graph API and webhooks carry the SDP offer/answer, and media is WebRTC (ICE/DTLS/SRTP, Opus). SIP is optional and needs enabling.
  - Flow: `connect` webhook with an SDP offer, then `pre_accept` (recommended), then `accept`. Start media only after a 200 OK. Calls end with `terminate`. The business must respond within ~30 to 60 s, or the user sees "Not Answered".
- **Browser answering (M):** the docs only say "your WebRTC stack". A browser `RTCPeerConnection` is a WebRTC stack:
  1. The webhook pushes the offer to the agent's browser over Supabase Realtime.
  2. The browser creates the answer.
  3. cheke's server POSTs `pre_accept`/`accept`.

  This is feasible. The 60 s window and multiple agents ringing at once are the hard parts, and you may need a TURN server.

### Coexistence: the blocker (H)

Meta's Coexistence feature table lists **"Voice and video calls: Not supported"**. Calls to a Coexistence number keep going to the WhatsApp Business app on the phone and its linked companions, as they do today (M: the API simply isn't involved). Meta documents **no webhook** for those calls, so **cheke cannot show a missed call or a call log** for Coexistence shops. [coexistence onboarding]

### What cheke can show

- **API-only numbers:** the `terminate` webhook with `status: FAILED/COMPLETED` and timing fields, which are present only when the call was picked up. "Connect received, no accept, then terminate" is a **missed call**, and cheke can record it as a message in the conversation ("📞 Llamada perdida"). Calls from a call button or deeplink also carry `cta_payload`/`deeplink_payload`.
- **Coexistence numbers:** nothing. The phone rings.

### Instagram and Messenger

There is no calling API for businesses on either (M: none in the Messenger Platform or Instagram Messaging API docs).

### Recommended path

1. **Launch:** no calling in cheke. Tell shops on Coexistence that calls still ring on their phone, as before. In Chat, a "Llamar" action can open `tel:+504…` on mobile, so the agent calls from their own phone.
2. **After launch, if pilots ask for it:** browser calling for API-only numbers. It's a separate project of 2 to 3 weeks (WebRTC, TURN, ringing UX, permissions).
3. **Watch Meta's changelog** for calling on Coexistence. If it arrives, step 2 covers every shop.

---

## 5. Payment links in Honduras

| Provider | API to create a link for an exact amount | Payment webhook/callback | Fees | Onboarding / sandbox | Docs | Conf. |
|---|---|---|---|---|---|---|
| **PixelPay** (Honduran) | **Yes.** Hosted Payment: `POST https://{endpoint}/api/v2/transaction/hosted/other` with `_key`, `_client_signature`, `_order_id`, `_amount`, `_currency` (HNL/USD/NIO), `_order_content`, `expired_at`, `json=true`, which returns `{"success":true,"url":".../checkout"}`. **Requires** `_first_name`, `_last_name`, `_email` of the customer. | **Yes.** `_callback`: async POST JSON on success (`status:"paid"`, `order`, `amount`, `payment_hash`, `uuid`). Retries every 5 min, 3 attempts max. Also `_complete` redirect with `paymentHash` (md5 of order\|key\|secret). | Not published. Ask PixelPay. | Merchant account with "Configuración API". Sandbox route `hosted/sandbox` with test keys. Settles to the merchant's chosen Honduran bank. Also offers SDKs (JS/TS, PHP, Python…) and an MCP docs server. | docs.pixelpay.com (Hosted Payment, Sandbox) | H |
| **Tilopay** | Yes (M). Payment links exist in the API (Postman collection), and `webhook_url` "is configured when creating the link". | Yes. JSON POST, a 200 means delivered, 1 attempt for purchases. Origin check is `orderHash`, with the algorithm sent on request (sac@tilopay.com). Tilopay advises re-checking status through the API. | Not published. Digital sign-up with no fixed costs (press). | Listed as available in Honduras by Wix. HN payment methods include Cuotas BAC (BigCommerce). Confirm HN merchant support. | tilopay.com/en/developers/api/webhooks; Postman docs | M |
| **BAC Credomatic** (Compra Click) | **No public API.** Links are made in the merchant portal (name, price, stock, language). | None documented | Per-transaction fee lines in the HN Tarifario (June 2026 PDF) | BAC affiliated merchant plus BAC account | baccredomatic.com/es-hn/pymes; HN tarifario PDF | M |
| **Ficohsa** (Adquirencia) | No public API or link product found | — | Not published | Affiliate through the bank | ficohsa.hn/adquirencia | L |
| **Banpaís, Banco Atlántida** | No public developer docs found | — | — | Through the bank. Some bank e-commerce in Honduras runs on white-label gateways (PixelPay sells white-label banking solutions, per CB Insights). | — | L |
| **Pagadito** | Webservice API (redirect checkout: connect, create transaction, redirect URL, status query) | Return URL plus status query. Push notifications not confirmed. | No setup or monthly fee; per-transaction | Lists Honduras. Sandbox available. | dev.pagadito.com | L/M |
| **Cybersource** | **Yes.** Pay by Link REST API (fixed-price and customer-set links) | Yes. Webhook notifications on payment | Acquirer-dependent | Needs an acquiring bank that provisions Cybersource for you. Enterprise-oriented. | developer.cybersource.com …/paybylink | H (API) / L (HN availability) |
| **Stripe** | — | — | — | **Not available in Honduras.** In LatAm only Brazil and Mexico can sign up. | stripe.com/global | H |
| **dLocal** | API covers HN (cards, Tengo cash network) | Yes | Enterprise | Enterprise/cross-border merchants only. **dLocal Go** (the SMB product) doesn't list Honduras. | docs.dlocal.com/docs/honduras; dLocal Go help | M |
| **Bank transfer + receipt** | — | — | free | What most Honduran shops use today (transfer to BAC, Atlántida, Ficohsa or Banpaís accounts, then a screenshot) | — | M (market knowledge) |

**Manual links today:** many shops already keep fixed links, such as one BAC Compra Click per product or price, or a generic PixelPay or Tilopay link where the customer types the amount. cheke's `payment_link` field and `normalizePaymentLink` already handle "paste a link".

### Provider-agnostic design for cheke

**Data model**

A new table `store_payment_setup`, one row per Tienda (RLS like `store_chekelin_info`):

- `mode`: `manual` | `pixelpay` | `tilopay`
- `manual_links`: jsonb `[{label, url, amount_hnl|null}]`
- `credentials_encrypted`, encrypted with the existing `crypto.ts`

New columns on `orders`:

- `provider`, `provider_ref` (the order id sent to the provider)
- `checkout_url`, `expires_at`
- `paid_via`: `person` | `provider_webhook`

**(a) Manual mode** works with any bank or provider.

- The Tienda saves its links in "Formas de pago", or pastes one per order in Cobrar.
- chekelin picks a saved link whose `amount_hnl` matches the order total. Otherwise it sends the generic link plus "el total es L 1,250.00", or the transfer details from `payment_methods`.
- Confirmation stays as today: receipt received, then "Confirmar pago". chekelin can pre-check a receipt photo (amount, date, bank) with Claude vision and flag mismatches, but a person still confirms.

**(b) Integrated mode**

Code shape: `interface PaymentProvider { createCheckout(order): {url, ref, expiresAt}; parseWebhook(req): {ref, status, amount}; fetchStatus(ref) }`.

1. When Cobrar (person) or chekelin closes an order, call `createCheckout(order)` with the exact total and items, and `expired_at` set to 24 to 48 h.
2. Send the `url` in the payment message.
3. `POST /api/payments/[provider]/webhook` receives the payment. Look up `provider_ref`, then **re-verify with `fetchStatus`** or the provider's hash, and check that the amount matches.
4. Set `status=paid`, `paid_at`, `paid_via=provider_webhook`, and call the existing `afterPaymentConfirmed()`, so chekelin thanks the customer and the conversation moves to won.
5. Nobody taps "Confirmar pago". Keep the button as a manual override.

PixelPay requires the customer's name and email. chekelin already collects the name. Ask for an email, or have PixelPay confirm whether a Tienda-level placeholder email is acceptable.

**Which providers support (b) now:** **PixelPay** (documented end to end, Honduran, HNL) and **Tilopay** (links plus webhook; confirm HN merchant support and the hash). Cybersource does technically, but only for larger merchants with an acquirer. The banks (BAC, Ficohsa, Banpaís, Atlántida) support (a) only.

**Order:** ship (a) polish first (saved links, amount matching), since it covers every shop. Then add PixelPay as the first (b) provider, and Tilopay second.

---

## 6. Seamlessness gaps vs the WhatsApp Business app

Ranked by impact on adoption. In this table, "API" means WhatsApp Cloud API support.

| # | Feature | API | Instagram / Messenger | cheke today | Effort | Notes |
|---|---|---|---|---|---|---|
| 1 | **Receive photos, videos, documents, voice notes** | Yes (H): same media-id flow as §1 | Yes (attachment `payload.url`) | Placeholder text only | M (2–4 d with §1) | Shops sell from photos ("¿lo tiene en negro?"). This is the #1 reason a shop would go back to the phone. |
| 2 | **Send photos, documents, voice notes** | Yes (H): image, video, document, audio, sticker | Yes: image png/jpeg 8 MB, video, audio, pdf 25 MB | Photo send exists (`mediaUrl`) | S–M | Add documents (PDF quotes, invoices) and voice (§3) |
| 3 | **Replies/quotes** | Yes (M): send `context.message_id`; inbound carries `context` | Messenger `reply_to` (L) | Not shown | S | Customers reply to a specific photo. Without the quote, context is lost. |
| 4 | **Read receipts + typing** | Yes (H): one call marks read and shows "typing…" (clears on reply or ~25 s) | IG `messaging_seen` webhook. Typing via `sender_action` on Messenger (M). | Statuses tracked | S | Mark read when an agent opens the chat. Show typing while chekelin writes. |
| 5 | **Reactions** | Yes (M): receive/send `type: reaction` | IG: `sender_action: react/unreact` (H) | Dropped | S | Shown as a small emoji on the bubble |
| 6 | **Quick replies** (saved replies with `/shortcut`) | n/a (cheke feature). The app's quick replies don't sync (L). | n/a | Not present (L) | S | Big daily-use win. Import from the app isn't possible, so let shops paste theirs. |
| 7 | **Catalog / cart messages** | Yes (M): Commerce catalog, single/multi-product messages, inbound `order` (cart) | IG product share (L) | Products exist in cheke | M–L | Requires a Meta commerce catalog per number. Do it after launch. Inbound carts are worth mapping to `orders`. |
| 8 | **Labels** | No API for app labels (L) | n/a | cheke has stages | S | cheke's stages/tags replace them. Explain this in onboarding. |
| 9 | **Location + contact cards** | Yes (H): `location`, `contacts` in and out; live location disabled under Coexistence (H) | IG/Messenger: location limited (L) | Placeholder | S | Show a map link plus the address. Useful for deliveries, so feed it to chekelin's delivery details. |
| 10 | **Message edit/delete** | Coexistence echoes include `edit` and `revoke` from the app (H). Customer edits/revokes arrive as webhooks (M). No API to edit/delete the business's own sent messages (L). | — | Not handled | S | At minimum, apply edits and revokes to the stored message |
| 11 | **Stickers** | Yes (H): webp in and out | IG `like_heart` only | Placeholder | S | Rendered with media (#1) |
| 12 | **Forwarding** | No forward API; re-send via media id (L) | — | — | S | "Reenviar a otro chat" in cheke = re-send |
| 13 | **Business profile editing** | Yes (M): `/whatsapp_business_profile` (about, address, description, email, websites, photo) | Page/IG settings | — | S | Nice to have in settings |
| 14 | **Broadcast lists** | **Disabled under Coexistence** (H). Use marketing templates instead (paid per message). | — | Templates exist (`templates.ts`) | M | Shops lose broadcast lists. cheke's template campaigns are the replacement, so set expectations about cost. |
| 15 | **Group chats** | Not synced under Coexistence (H). Groups API is OBA-only, max 8 participants (L, vendor sources). | — | — | n/a | Out of scope |
| 16 | **Status / stories** | No API (M) | IG story mentions/replies arrive as webhooks (H) | — | n/a | Shops keep posting from the phone |
| 17 | **"Online / last seen"** | No presence API (M) | — | — | n/a | Not possible |

---

## Recommendation table

| Feature | Feasibility | Effort | Impact on adoption | When |
|---|---|---|---|---|
| Inbound media (photos, voice, docs) download + Storage + Safari-safe playback | High (H) | 3–4 days | **Very high** | Before launch |
| Voice-note transcription for chekelin (gpt-4o-transcribe, after a bake-off) | High | 2 days | **High** (chekelin understands voice orders) | Before launch |
| Send voice notes (WhatsApp PTT; IG/FB audio) | High | 3 days | High | Before launch |
| Replies/quotes, reactions, read + typing | High | 2–3 days | High | Before launch |
| Quick replies (`/atajos`) | High (cheke-side) | 1–2 days | High | Before launch |
| Send documents (PDF) | High | 1 day | Medium | Before launch |
| Location/contact cards rendered + fed to chekelin | High | 1 day | Medium | Before launch |
| Edits/revokes applied to stored messages | High | 1 day | Low–medium | Before launch |
| Payment links (a): saved links per Tienda + amount matching | High | 2 days | **High** (every shop) | Before launch |
| Payment links (b): PixelPay checkout + webhook auto-confirm | High (H docs); contract needed | 4–5 days + onboarding | High for card-taking shops | Pilot, then launch if contract is ready |
| Payment links (b): Tilopay | Medium (confirm HN) | 3–4 days | Medium | After launch |
| Receipt-photo pre-check with Claude vision | High | 2 days | Medium | After launch |
| Catalog/cart messages | Medium (needs Meta catalog) | 1–2 weeks | Medium | After launch |
| Business profile editing | High | 1 day | Low | After launch |
| chekelin voice replies (TTS) | Allowed (M) | 3 days | Low (risky) | Not now |
| WhatsApp calls in browser (API-only numbers) | Medium | 2–3 weeks | Low (most shops are on Coexistence) | Only if pilots ask |
| Calls/missed-call log on Coexistence | **Not possible** (H) | — | — | Watch Meta changelog |
| IG/Messenger calls | Not possible (M) | — | — | — |
| Status, presence, groups | Not possible / out of scope | — | — | — |

---

## Sources (accessed 2026-10-16)

**Meta: WhatsApp**
- Media API (retrieve URL, expiry 5 min, 7-day webhook IDs, formats): https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
- Inbound audio webhook (`id`, `url`, `voice`, `mime_type`): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/audio
- Audio/voice messages (`voice: true`, OGG/Opus, 512 KB play icon, transcripts): https://developers.facebook.com/docs/whatsapp/cloud-api/messages/audio-messages
- Coexistence onboarding (unsupported calls, groups, broadcast, live location; history media; 20 mps; edit/revoke): https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users
- `smb_message_echoes` webhook (types incl. edit/revoke): https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes
- Calling API overview (availability, requirements, limits): https://developers.facebook.com/docs/whatsapp/cloud-api/calling
- User-initiated calls (connect/pre_accept/accept/terminate): https://developers.facebook.com/docs/whatsapp/cloud-api/calling/user-initiated-calls
- Calling pricing (user-initiated free, 6-s pulses): https://developers.facebook.com/docs/whatsapp/cloud-api/calling/pricing
- Typing indicators + mark read: https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators/
- Business Solution Terms AI change (secondary, TechCrunch): https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/

**Meta: Instagram / Messenger**
- Instagram messaging webhook (attachment types, `payload.url`): https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook
- Instagram Messaging API (attachment formats/sizes, reactions): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- Messenger Send API (audio attachments): https://developers.facebook.com/docs/messenger-platform/send-messages/

**Claude**
- Features overview (no audio input; Files API = PDFs, images, text): https://platform.claude.com/docs/en/build-with-claude/overview

**Speech-to-text / TTS pricing**
- OpenAI pricing: https://developers.openai.com/api/docs/pricing
- Deepgram pricing: https://deepgram.com/pricing
- AssemblyAI pricing: https://www.assemblyai.com/pricing
- ElevenLabs API pricing (Scribe, TTS): https://elevenlabs.io/pricing/api
- Google Cloud STT pricing: https://cloud.google.com/speech-to-text/pricing
- ElevenLabs Spanish STT claims: https://elevenlabs.io/speech-to-text/spanish

**Browsers**
- caniuse Opus: https://caniuse.com/opus
- MDN `MediaRecorder.isTypeSupported`: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static
- Safari 18.4 Ogg/Opus testing (secondary): https://frequal.com/java/OggOpusStillNotWorkingInSafari18_4.html

**Payments**
- PixelPay docs (Hosted Payment, read through the docs MCP server at https://docs.pixelpay.com/mcp, page `es/integrations/hosted-payment`): https://docs.pixelpay.com/
- PixelPay Hosted Payment (Zendesk): https://pixelpay.zendesk.com/hc/es-419/articles/360039834392-Hosted-Payment-Gateway
- Tilopay webhooks: https://tilopay.com/en/developers/api/webhooks
- Tilopay API (Postman): https://documenter.getpostman.com/view/12758640/TVKA5KUT
- BAC Honduras PYMES: https://www.baccredomatic.com/es-hn/pymes
- BAC Honduras merchant tariff (June 2026): https://www.baccredomatic.com/sites/default/files/2026-08/HN-Tarifario-Comercios-Afiliados-version-WEB-actualizado-al-01-de-junio-2026-VF-20MB.pdf
- BAC Compra Click manual (CR): https://www.baccredomatic.com/sites/default/files/2025-04/cr_manual_compra_click_esp.pdf
- Ficohsa Adquirencia: https://www.ficohsa.hn/adquirencia
- Pagadito developer docs: https://dev.pagadito.com/index.php?mod=docs&hac=wspg
- Cybersource Pay by Link: https://developer.cybersource.com/docs/cybs/en-us/paybylink/developer/all/rest/paybylink.html
- Stripe global availability: https://stripe.com/global
- dLocal Honduras: https://docs.dlocal.com/docs/honduras
- dLocal Go countries: https://helpcenter.dlocalgo.com/en/articles/7229140-in-which-countries-can-i-sell-with-dlocal-go
- PixelPay company profile (secondary): https://www.cbinsights.com/company/pixelpay

**Groups (secondary)**
- Kapso, state of Groups API 2026: https://kapso.ai/blog/whatsapp-groups-api-state-2026

### Open questions to confirm with a real account

1. Do Coexistence echoes include voice notes the shop sends from the phone, and with a media id?
2. PixelPay merchant fees, and whether a placeholder customer email is accepted.
3. Tilopay: Honduran merchant onboarding, and the `orderHash` algorithm.
4. The Honduras business-initiated call rate (Meta rate card), if calling is ever built.
5. Whether a Honduran bank (BAC, Ficohsa, Atlántida) offers merchant API access privately (ask the account executive).
