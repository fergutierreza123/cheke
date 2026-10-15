# WhatsApp pricing change of October 1, 2026: service messages are now billed

Research for issue #6. Researched 2026-10-14 against Meta's developer docs (pages stamped "Updated: Sep 28 / Sep 30 / Oct 15, 2026") and Meta's official rate-card files.

## TL;DR

- **Yes, the change is real.** Meta's own pricing page confirms it. Starting **12:00 am on October 1, 2026, in each Messaging account's timezone**, Meta bills **service messages**, meaning free-form replies sent inside the 24-hour customer service window. It also bills **utility templates sent inside an open customer service window**. Each **business phone number gets 1,000 free service messages per month**.
- **Honduras is in "Rest of Latin America".** USD per delivered message: **marketing $0.074, utility $0.0113, authentication $0.0113, service $0.0113**. Authentication-international is n/a. Service messages have **no volume tiers**.
- **Billing goes to the business, not cheKe.** cheKe is a Tech Provider, so each business pays Meta directly through the payment method on its own Messaging account (the former "WABA"). If a business has no payment method, Meta delivers its first 1,000 service messages each month and then **stops delivering** its service replies.
- **Free entry point (click-to-WhatsApp ad) windows are still free** for marketing, utility, authentication and service messages. The pricing page now says the window "may remain open for up to 7 days".

## 1. Is the change real? Effective date?

Yes. The primary sources say:

- The pricing page, under "Prior updates > Effective October 1, 2026 > 1. Charging for messages that were previously free", lists both service messages ("which became free as of Nov. 1, 2024") and "Utility messages sent in response to users (thus in an open customer service window), which became free as of July 1, 2025." [P1]
- The page also says: "This only applies to service messages, as of 12am by Messaging account timezone on October 1, 2026. As Meta resumes charging for service messages, Meta provides every business phone number with a free tier of 1,000 service messages per month." [P1]
- The non-template messages explainer says: "Effective October 1, 2026 - Meta will charge on a per-message basis for all service messages… These messages have not been charged since November 1, 2024." It adds the same for in-window utility messages ("not been charged since July 1, 2025"). It records that the to-be rates were published on September 1, 2026, "per … the guidance we provided as of our July 1, 2026 announcement." [P2]
- The AI Providers page says: "Meta resumed charging for these messages on a per-message basis as of October 1, 2026 for all businesses using the WhatsApp Business Platform." [P3]
- Every official rate-card file is titled "Cost per message in <currency> on the WhatsApp Business Platform, effective October 1, 2026". Each has a **Service** column next to Marketing, Utility and Authentication, plus a new "Meta Business Agent" column. [P4]

**Why an earlier read said non-template messages were free:** that read was of an older version of the page, from before the July 1, 2026 announcement. During this research, a WebFetch summary of the same URL also returned that old text: it said "All non-template messages are free" and called the Oct 2026 rates "not final". That looks like a stale or cached copy. The live HTML (fetched with curl, stamped "Updated: Sep 30, 2026") says the opposite. Treat any summary that says "non-template messages are free" as out of date.

### Details of the free tier [P1]

- The free tier is 1,000 delivered service messages **per business phone number** per month. It does not roll over and resets at 12 am in the Messaging account's timezone.
- From the 1,001st service message, the status webhook `pricing` object changes from `"billable": false, "type": "free_customer_service"` to `"billable": true, "type": "regular", "category": "service"`. For in-window utility messages, `type` likewise changes from `free_customer_service` to `regular`.
- **No payment method:** "Meta will deliver service messages within the free tier but not deliver them after the free tier has been used."
- Exemptions: eligible governments and non-profits (subtype `paid_exempt`, through Dec 31, 2027). "AI Providers" (general-purpose AI assistant vendors) follow a separate policy. Neither applies to typical cheKe pilot shops. [P1][P3]

## 2. Rates for Honduras (+504), "Rest of Latin America"

The pricing page's country-code table maps Honduras (HN, +504) to **Rest of Latin America**, along with Bolivia, Costa Rica, Dominican Republic, Ecuador, El Salvador, Guatemala, Haiti, Jamaica, Nicaragua, Panama, Paraguay, Puerto Rico, Uruguay and Venezuela. [P1]

The table below is from the USD list-rate file, effective October 1, 2026 [P4]. All rates are per delivered message.

| Category | USD per message | Volume tiers? | Free when |
|---|---|---|---|
| Marketing (template) | **$0.0740** | no | in an FEP window |
| Utility (template) | **$0.0113** | yes (Rest of Latin America list rate for the first 100,000 per month, so no discount at pilot scale) | in an FEP window (**no longer free in the customer service window**) |
| Authentication (template) | **$0.0113** | yes (same) | in an FEP window |
| Authentication-international | n/a | n/a | n/a |
| **Service (free-form reply in the window)** | **$0.0113** | **none** | the first 1,000 per number per month, and in an FEP window |
| Meta Business Agent (Meta's own AI agent) | $2.00 per 1M tokens (about 4–5¢ per message) | no | never, not even in an FEP window |

Notes:
- Rest of Latin America is not among the markets whose rates changed on Oct 1, 2026, so the marketing and utility numbers are unchanged. [P1] What changed is that service and in-window utility messages are now billed. The P2 explainer confirms "rates for service messages will be the same as the rates for utility and authentication messages."
- Meta charges by the **recipient's** country code. A message to a US number (+1) is charged at North America rates, not Rest of Latin America rates. [P1]
- The currency is fixed when the Messaging account is created. Other currencies' files give the same Rest of Latin America row, for example MXN 0.208 service and EUR 0.0094 service. [P1][P4]
- Meta can change rates only on Jan 1, Apr 1, Jul 1 or Oct 1, with at least 1 month's notice for a rate change. [P1]

## 3. Did the free windows change?

- **Free entry point (CTWA ads and Facebook Page CTA, from the Android or iOS app only):** still free for marketing, utility, authentication **and service** messages. Meta Business Agent messages are still charged in the window. P2 says: "The free entry point window is unchanged for message delivery." The current pricing page says "The FEP window may remain open for up to 7 days". An earlier (stale) read of the same page said 72 hours. I could not find a dated Meta changelog entry for the 72-hour to 7-day wording, so **verify the duration** before promising pilots more than 72 hours. FEP windows are tracked per business-and-user pair, and every Messaging account on that phone number shares them. [P1][P2]
- **Utility templates inside the customer service window:** **no longer free.** As of Oct 1, 2026 they are billed at the utility rate ($0.0113 in Rest of Latin America). This reverses the July 1, 2025 freebie. [P1][P2]
- **Messages from users to businesses:** still free. [P1]

## 4. Who is billed under Embedded Signup as a Tech Provider?

**The business is billed, on its own Messaging account. cheKe is not.**

- The Embedded Signup overview, under "Billing", says: "Billing lives on the Messaging account, so each partner on a phone number bills separately… **If you are a Tech Provider or Tech Partner, your onboarded business customers must add a payment method to their Messaging account.**" It also says that if you are not a Solution Partner, "the customer must first attach a payment method to their Messaging account before they can begin messaging." [P5]
- The Solution Providers overview says: "Unlike Solution Partners, however, Tech Providers do not have credit lines. Instead, clients onboarded by Tech Providers must provide their own payment method after onboarding is complete. **Meta will then bill these clients for API usage, and the Tech Provider will bill for other services.**" Its comparison table lists "Bills customers directly for API usage": Tech Providers **No**. [P6]
- The Get started for Tech Providers page says: "Billing - Your onboarded clients must add a credit card to your WhatsApp Business Platform Account." [P7]
- Terminology: Meta is splitting the WABA into a "WhatsApp account" (phone numbers and identity) and a "Messaging account" (templates, **billing** and webhooks). Existing `waba_id` values now denote Messaging account IDs. [P5]
- A business can get Meta to bill a partner instead only if a **Solution Partner** shares its credit line, for example through a Multi-Partner Solution. [P6]

**Product implication:** onboarding must make sure each pilot adds a card in Billing Hub. Otherwise, from the 1,001st service message in a month, the business's replies will silently fail to deliver. cheKe should watch the `pricing.billable` and `type` fields on status webhooks, and delivery failures, to catch this.

## 5. What cheKe can tell pilot businesses

> **¿Cuánto cuesta WhatsApp con cheKe?** WhatsApp (Meta) charges your business directly, on the card you add to your own WhatsApp Business account. cheKe never charges you for WhatsApp messages. Since October 1, 2026, Meta charges for each message your business sends, including normal replies to customers. Each WhatsApp number gets its **first 1,000 replies free every month**. After that, each reply to a customer in Honduras or the rest of Latin America costs about **US$0.011** (about 1 cent). Order or appointment confirmations (utility templates) also cost about 1 cent. Promotional messages (marketing templates) cost about **US$0.074** each (7 cents). Messages your customers send you are always free. When a customer reaches you by tapping a Facebook or Instagram "Send message on WhatsApp" ad, every reply in that window is free. **You must add a payment card in Meta Billing Hub.** Without one, your replies stop being delivered once the 1,000 free ones are used up.

### Worked example: a shop with about 40 conversations per day

Assumptions (illustrative, change them for each pilot): 30 days a month, all customers on +504 numbers, the business sends an average of **4 replies per conversation**, **1 in 4** conversations ends with an order-confirmation utility template, no ad traffic, and no marketing broadcasts.

| Item | Count per month | Billable | Rate | Cost |
|---|---|---|---|---|
| Service replies | 40 × 4 × 30 = 4,800 | 4,800 − 1,000 free = 3,800 | $0.0113 | **$42.94** |
| Utility confirmations (sent in the window, now billed) | 40 × ¼ × 30 = 300 | 300 | $0.0113 | **$3.39** |
| **Total** | | | | **≈ $46 USD per month** (about $1.55 per day) |

Variations:
- **Smaller shop (8 conversations/day, 4 replies each):** 960 service replies fit under the 1,000 free tier, so the cost is about **$0** apart from any utility templates.
- **If half the conversations come from click-to-WhatsApp ads:** those replies are free, which roughly halves the service cost to about $20/month (assuming the ad-sourced replies would otherwise have been billable).
- **Adding one marketing broadcast a week to 200 customers:** about 860 marketing templates × $0.074 ≈ **+$64/month**. Marketing is the expensive category.
- Rule of thumb: **monthly cost ≈ (total replies − 1,000) × $0.0113 + confirmations × $0.0113 + promos × $0.074.**

Taxes and FX: Meta bills in the Messaging account's currency (USD unless another was chosen at creation). I did not verify any Honduran tax or card FX fees. Ask pilots to check their card statement.

## 6. Claims found only on non-Meta sources (or unconfirmed)

- **Vendor blogs** (Wati, AiSensy, Courier, edna, Zoho, respond.io, chakrahq, keaz, hello-charles) all report the Oct 1, 2026 change. The core claims (service billed at the utility rate, the 1,000/number/month free tier, in-window utility now billed, payment method required by Sep 30, 2026) **match Meta's docs**. Any vendor rate that differs from the Meta CSV, for example a rate including vendor markup, should be ignored.
- **The FEP duration "up to 7 days" vs 72 hours** is on Meta's page, but I found no dated Meta changelog entry for the change. Unconfirmed.
- **The developer changelog page** (developers.facebook.com/docs/whatsapp/changelog) is rendered in JavaScript and returned no content to a plain fetch, so I could not quote it.
- **The Honduran lempira equivalent, taxes and card fees** are not covered by any Meta source here.

## Sources

Primary (Meta), fetched 2026-10-14:

- [P1] Pricing on the WhatsApp Business Platform (Updated Sep 30, 2026): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing (redirected from https://developers.facebook.com/docs/whatsapp/pricing)
- [P2] Pricing: Non-template messages (Updated Sep 28, 2026): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/
- [P3] Pricing: AI Providers (Updated Oct 15, 2026): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers/
- [P4] Official rate-card files linked from P1 ("USD list rates", "USD volume tiers", and the other currencies), served from Meta's CDN (scontent-*.xx.fbcdn.net; the signed URLs expire). They are XLSX content served with a .csv name. USD row: `Rest of Latin America | USD | 0.074 | 0.0113 | 0.0113 | n/a | 0.0113 | $2.00 USD / 1 M tokens` (columns: Market, Currency, Marketing, Utility, Authentication, Authentication-International, Service, Meta Business Agent). Interactive version: https://business.whatsapp.com/products/platform-pricing#rates
- [P5] Embedded Signup overview: https://developers.facebook.com/docs/whatsapp/embedded-signup/overview
- [P6] Solution Providers overview: https://developers.facebook.com/docs/whatsapp/solution-providers
- [P7] Get started for Tech Providers: https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers

Secondary (corroboration only):
- https://edna.io/resources/whatsapps-new-pricing-structure-what-will-be-charged-starting-october-1-2026/
- https://help.zoho.com/portal/en/community/topic/whatsapp-business-platform-message-pricing-guide
- https://chakrahq.com/article/whatsapp-api-pricing-update-service-messages-october-2026/
