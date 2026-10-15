# Store review rules for the cheKe phone app (Apple App Store + Google Play)

Research for issue #4. Checked 2026-10-14 against Apple's and Google's own pages (links next to each claim). Neither the Apple guidelines page nor the Google policy pages show a "last updated" date, so "current" means "what the live page said on 2026-10-14".

**How cheKe looks to a reviewer today** (from the repo):

- `capacitor.config.ts`: a Capacitor 8 shell whose `server.url` loads `https://cheke-eight.vercel.app`. The only native plugins are `@capacitor/push-notifications` and `@capacitor/app`. Push is registered in `src/components/PushRegistrar.tsx`.
- `src/app/login/page.tsx`: login by Supabase `signInWithOtp` (an email magic link back to `/auth/callback`) or by `signInWithOAuth` with Google, both redirecting to `window.location.origin`.
- `src/app/onboarding`: anyone who signs in can **create a business**, so the app supports account creation.
- `src/app/(app)/account/AccountView.tsx`: shows the plan label and links to `/eliminar-datos`. That page (`src/app/eliminar-datos/page.tsx`) tells people to **email** cheKe to have their data deleted. There is no in-app delete button.
- `src/lib/company.ts`: address, phone and email are still `[… completar]` placeholders, and `website` is the `vercel.app` URL.
- Channels can be disconnected in-app (`disconnectChannel` in `src/app/(app)/channels/actions.ts`).
- I found no pricing or checkout UI inside the app. `terminos` §7 says prices will be communicated before any charge.

---

## TL;DR

1. **Payments: no in-app purchase is needed, as long as the app never sells.** On iOS, cheKe fits **3.1.3(f) Free Stand-alone Apps**: a free companion to a paid web tool may skip IAP "provided there is no purchasing inside the app, or calls to action for purchase outside of the app". On Google Play, **consumption-only apps** are explicitly allowed. Inside the native shell, hide every price, "mejorar plan", bank-transfer or PixelPay prompt. On Play you may say "visit our website" without a link. On Apple's Honduras storefront you may not even say that.
2. **Login: on iOS, Google login triggers 4.8, and the email code probably doesn't count as the "equivalent" option.** The cheapest fix is to hide the Google button inside the iOS app, which leaves only cheKe's own login and qualifies for the 4.8 exemption. The other option is to add Sign in with Apple. Separately, Google OAuth **cannot run inside the WebView** (Google policy), and magic links open Safari or Chrome rather than the app. Switch the app to a typed 6-digit email code, and if Google stays on Android, run it through the system browser.
3. **Build before submitting:** an in-app "Eliminar mi cuenta" flow (required by Apple 5.1.1(v) and Google Play; email-only deletion is explicitly rejected by Apple); a reviewer demo account that works without opening an inbox; real company details and an org-domain website; and enough native behaviour (push, badge, notification-tap routing, offline screen, native photo picker or share) to pass 4.2.
4. **Accounts and timing:** both stores need a **D-U-N-S number** for Inversiones y Representaciones Arguz (Apple quotes about 5 business days plus 2; Google says plan for up to 30 days). Google's **12 testers for 14 days** rule applies only to *personal* accounts created after 2023-11-13, so it does not apply to an organization account. Apple reviews 50% of submissions in under 24 h and 90% in under 48 h. Google says new or "certain" accounts can take up to 7 days or longer.

---

## 1. Apple 4.2 Minimum Functionality (webview wrappers)

Text, [App Review Guidelines §4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality):

> "Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store."

§4.2.2: apps "shouldn't primarily be marketing materials, advertisements, web clippings, content aggregators, or a collection of links."

The guideline is about the experience, not the technology. Apple publishes no list of features that guarantee a pass, so the list below is my judgement of what makes the wrapper read as an app rather than a website:

- **Already present:** push notifications for new customer messages (the strongest native signal for an inbox) and opening the right place from a notification tap.
- **Cheap additions:** an app icon **badge** with the unread count. A **native offline / no-connection screen** bundled in the app, never a white page or Safari-style error, because a remote `server.url` shell with no network is the classic 4.2 / 2.1 rejection. Native **camera / photo picker** for product photos and chat attachments (`@capacitor/camera`). The native **share sheet** for products or catalog links. Haptics on send and drag. Safe-area-correct layout and no website chrome (no web header or footer, no "download our app" banner, no landing page). Login should be the first screen, not the marketing home page.
- **Avoid:** the marketing page (`/`) as the app's start URL, external links that leave the app for core flows, and any screen that is obviously desktop-only.

**Google Play counterpart:** the [Spam policy](https://support.google.com/googleplay/android-developer/answer/9899034) bars apps that "provide a webview of a website without permission from the website owner or administrator". cheKe owns its site, so this is fine. The [Functionality, Content and User Experience policy](https://support.google.com/googleplay/android-developer/answer/9898783) requires apps to be stable, responsive and engaging, and lists apps that load but aren't responsive as violations. In practice Play is much less strict on wrappers than Apple.

## 2. Apple 4.8 Login Services: does Google login force Sign in with Apple?

Text, [§4.8](https://developer.apple.com/app-store/review/guidelines/#login-services): an app that uses a third-party or social login "(such as … Google Sign-In …) to set up or authenticate the user's primary account with the app must also offer as an equivalent option another login service with the following features":

- "limits data collection to the user's name and email address;"
- "allows users to keep their email address private as part of setting up their account; and"
- "does not collect interactions with your app for advertising purposes without consent."

The exemptions include: "Your app exclusively uses your company's own account setup and sign-in systems", and "Your app is an education, enterprise, or business app that requires the user to sign in with an existing education or enterprise account."

What this means for cheKe:

- The guideline no longer names Sign in with Apple. Any service that meets the three bullets is acceptable, and Sign in with Apple is the one that clearly does.
- **cheKe's email code or magic link is its "own account system", but on a strict reading it does not satisfy bullet 2**, because the user must hand over a real email address and cannot keep it private. As long as Google is offered, the "exclusively your own sign-in" exemption no longer applies. So "Google + email code" is a real 4.8 rejection risk. This is my reading of the text; Apple publishes no ruling on email-OTP logins.
- The business-app exemption doesn't fit cleanly either: anyone can sign up and create a business. That is not "an existing enterprise account".
- **Options, cheapest first:** (a) hide "Continuar con Google" when `Capacitor.getPlatform() === "ios"`, so cheKe's own login is the only one and the first exemption applies. (b) Add Sign in with Apple via Supabase's Apple provider. If you do, Apple's [deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/) also requires revoking tokens through the Sign in with Apple REST API when an account is deleted.
- **Android:** Google Play has no equivalent rule.

## 3. Apple 5.1.1(v) and Google Play account deletion

Apple, [§5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage): "If your app supports account creation, you must also offer account deletion within the app." Apple's [support page](https://developer.apple.com/support/offering-account-deletion-in-your-app/) adds:

- "Make the account deletion option easy to find in your app. Typically, it's included in the app's account settings."
- A link is allowed: "If people need to visit a website to finish deleting their account, include a link directly to the page on your website where they can complete the process."
- **Apps outside highly regulated industries "should not require people to make a phone call, send an email, use a chat support flow, or go through other support flows."** cheKe's current "write to us by email" page therefore fails.
- "only offering to temporarily deactivate or disable an account is insufficient."
- Deletion may be manual or delayed: "Inform the person how long it will take to delete the account and provide a confirmation when the deletion is complete."

Google Play, [account deletion requirement](https://support.google.com/googleplay/android-developer/answer/13327111): if users can create an account, provide "an in-app path to delete their app accounts and associated data" **and** a web link where deletion can be requested. That link goes in the Data safety form's data-deletion questions and must name the app or developer as listed on Play. Enforcement, including removal, has applied since 2024-05-31.

**What to build:** Cuenta → "Eliminar mi cuenta" → a confirmation that explains what is deleted (the user, and if they are the business's last owner, the business with its contacts, conversations and catalog, plus disconnected channels) and how long it takes (say up to 30 days) → a server action that deletes or queues the deletion → a confirmation email when done. Also keep a public web page with the same button behind login (it can be `/eliminar-datos`) for Google's web-link field. Decide what happens when the last owner of a business with other agents deletes their account: block it, or require transferring ownership first.

## 4. Payments: 3.1.1 vs 3.1.3(b)/(c)/(f), and what the app may say about prices

Apple, [§3.1.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase): unlocking features or subscriptions in the app requires IAP. The exceptions in §3.1.3:

- **3.1.3(b) Multiplatform Services:** lets users access what they bought elsewhere "provided those items are also available as in-app purchases within the app". This **requires offering IAP too**, so it is not the route for cheKe.
- **3.1.3(c) Enterprise Services:** "only sold directly by you to organizations or groups for their employees … Consumer, single user, or family sales must use in-app purchase." This partly fits, but a one-person Honduran shop signing itself up looks like a single-user sale, and self-serve signup weakens the "sold directly to organizations" claim.
- **3.1.3(f) Free Stand-alone Apps:** "Free apps acting as a stand-alone companion to a paid web based tool (i.e. VoIP, Cloud Storage, Email Services, Web Hosting) do not need to use in-app purchase, provided there is no purchasing inside the app, or calls to action for purchase outside of the app." **This is the best fit**: a free app, with the subscription sold on the web or by invoice. Say so explicitly in the review notes.

**What the iOS app may say.** The §3.1.3 intro: these apps "cannot, within the app, encourage users to use a purchasing method other than in-app purchase, except for apps on the United States storefront and as set forth in 3.1.1(a) and 3.1.3(a). Developers can send communications outside of the app to their user base about purchasing methods other than in-app purchase."

- **US storefront:** §3.1.1(a) and §3.1.3 say no entitlement is needed to include "buttons, external links, or other calls to action in their United States storefront apps".
- **Honduras and every other non-US storefront:** none of Apple's published link-entitlement programs mention Honduras. The [StoreKit External Purchase Link page](https://developer.apple.com/support/storekit-external-entitlement/) I checked covers only Netherlands dating apps. So the iOS app in Honduras may show **no prices, no "upgrade", no "pay by transfer or PixelPay", and no link to a pricing page**.
- **Allowed:** showing the current plan name and status, and contacting customers outside the app by email or WhatsApp about payment.
- **Practical rule:** gate all billing UI behind `!Capacitor.isNativePlatform()`. For an expired trial, show a neutral "Tu plan no está activo" with no instructions or link. The Terms page reachable in-app is fine as long as it contains no checkout link.
- **Not affected:** in-chat payment requests and links that a *business* sends its *customers* for physical goods. §3.1.3(e) (goods and services consumed outside the app) and Play's physical-goods exemption cover those.

Google Play, [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738): Play billing is required when the app charges for digital features, and "cloud software and services", including business productivity software, are in scope. **However, the [Payments FAQ](https://support.google.com/googleplay/android-developer/answer/10281818) says "Google Play allows any app to be consumption-only, even if it is part of a paid service"**, and such apps "may choose to provide additional information about purchasing options without direct links", for example "Go to our website to upgrade your subscription to Premium." Direct links that could lead to an alternative payment method are not allowed outside the regional programs. US users can get links only through the enrolled [US external content links program](https://support.google.com/googleplay/android-developer/answer/16470497). That program has fees (Google's [June 2026 post](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html); fee reporting moved to 2026-12-01), and a revised Epic settlement is pending ([US policy update](https://support.google.com/googleplay/android-developer/answer/15582165)). This is irrelevant if cheKe launches in Honduras only.

**Recommendation:** distribute in Honduras only at launch, on both stores. Make the app consumption-only with no billing UI on either platform. On Android, optional plain text such as "Gestiona tu plan en cheke.io" is allowed, but leave it out for simplicity.

## 5. Demo account for reviewers

Apple, [§2.1](https://developer.apple.com/app-store/review/guidelines/#app-completeness): "include demo account info (and turn on your back-end service!) if your app includes a login". A built-in demo mode instead of an account needs "prior approval by Apple". Submissions must not contain "placeholder text, empty websites, and other temporary content". This hits the `[… completar]` fields in `src/lib/company.ts` and the draft banner on the legal pages.

Google Play, [Prepare your app for review → Sign-in details](https://support.google.com/googleplay/android-developer/answer/9859455): "you must provide all required details to enable access to your app". Use "Any other instructions" for "a one-time password, multi-factor authentication" and similar.

The problem is that a reviewer can't open an inbox to click a magic link. Options:

- (a) Enable Supabase email+password for **one reviewer account only**, through a small "Acceso para revisores" link or a hidden path, and give Apple and Google the email and password.
- (b) Have that one account accept a fixed code, implemented by you server-side.

Either way, the demo business must be **pre-filled**: seeded conversations across WhatsApp, Instagram and Messenger, contacts, products, a Chekeo board and a template. The reviewer cannot connect a real WhatsApp number. Turn on "modo prueba" so nothing is sent to real people, and say in the notes that channel connection needs a Meta Business account.

## 6. OAuth in the WebView, and universal links / app links for magic links

- **Google forbids OAuth in an embedded WebView.** [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies): "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control." Today's `signInWithOAuth` inside Capacitor's WKWebView or Android WebView will be refused (users see Google's `disallowed_useragent` error). The fix is to open the auth URL in the **system browser** and bring the user back to the app:
  - Get the URL with `signInWithOAuth({ options: { skipBrowserRedirect: true, redirectTo: <app link> } })`, then open it with `ASWebAuthenticationSession` on iOS ([Apple docs](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession)) or Custom Tabs on Android, for example through a Capacitor browser or auth plugin.
  - Catch the return URL with `@capacitor/app`'s `appUrlOpen` and load `/auth/callback?code=…` inside the WebView. The PKCE verifier was stored there when the flow started, so the code exchange works.
- **Magic links break in the shell.** The emailed link opens in Safari or Chrome, which have a different cookie jar from the app's WebView, so the user ends up signed in to the browser, not the app. Fixes:
  - **(Recommended)** Switch the app to a **6-digit code typed in-app**: add `{{ .Token }}` to the Supabase email template and call `verifyOtp({ email, token, type: "email" })`. No deep links are needed.
  - Or register `/auth/callback` as an iOS **Universal Link** (`apple-app-site-association` on the domain plus the Associated Domains entitlement; [Apple docs](https://developer.apple.com/documentation/xcode/supporting-associated-domains)) and an Android **App Link** (`/.well-known/assetlinks.json`; [Android docs](https://developer.android.com/training/app-links/verify-android-applinks)). Both need a domain you control and serve these files from, so plan this together with moving off `cheke-eight.vercel.app`.
- **Untested risk:** the "Conectar WhatsApp" Embedded Signup uses Facebook Login popups. Meta can block Facebook login in embedded browsers ([Login Security](https://developers.facebook.com/documentation/facebook-login/security); a [community thread](https://developers.facebook.com/community/threads/619143272573553) shows the "embedded browser is disabled" error), and `window.open` popups don't work in a Capacitor WebView by default. Test this on a device. If it fails, have the app open channel connection in the system browser, or tell owners to connect from a computer.
- Apple §5.1.1(v) also asks for a way to revoke social-network access in-app. cheKe already has disconnect for its channels.

## 7. Google Play developer account: organization, testing rule, D-U-N-S

- **Testing requirement:** [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465). It applies to "personal developer accounts created after November 13, 2023", which must run a closed test with "a minimum of 12 testers who have been opted in continuously for at least 14 days" before production. The page mentions only personal accounts, so **an organization account for Inversiones y Representaciones Arguz is not subject to it** and can go straight to production after review. A closed or internal test is still worth running.
- **D-U-N-S:** [Required information to create a developer account](https://support.google.com/googleplay/android-developer/answer/13628312). An organization account cannot be created without one, and the process "can take up to 30 days". D-U-N-S is free from Dun & Bradstreet; beware paid intermediaries. The organization name and address come from the Google Payments profile and must be verified, and contact email and phone are verified by one-time password.
- **Apple:** [D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S/) is required for companies. The legal entity must be a recognized entity (an S.A. de C.V. qualifies), and "DBAs, fictitious businesses, trade names" are not accepted, so enroll as the legal name, not "cheke". Allow up to 5 business days from D&B plus up to 2 for Apple to receive it. [Enrollment](https://developer.apple.com/programs/enroll/) requires the person enrolling to have legal authority to bind the company, and "Your organization's website must be publicly available and functional, and its domain name must be associated with your organization". The work email must be on that domain, so **a `vercel.app` site and a Gmail address won't pass**. The fee is 99 USD per membership year.

## 8. Review times

- **Apple:** [App Review](https://developer.apple.com/distribute/app-review/): "typically reviewing at least 50% of submissions in less than 24 hours and 90% in less than 48 hours". Incomplete submissions take longer. Expedited review is available for critical fixes or event dates.
- **TestFlight:** [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/). Up to 100 internal and 10,000 external testers. The first build sent to external testers goes through review; internal testers per Apple's docs don't need it. Builds expire after 90 days.
- **Google Play:** [Prepare your app for review](https://support.google.com/googleplay/android-developer/answer/9859751): "For certain developer accounts, we'll take more time … review times of up to seven days or longer in exceptional cases." Assume about a week for a brand-new organization account's first submission.
- **Timeline:** for "TestFlight / Play testing by early December, public in December", D-U-N-S and enrollment are the long poles. Start them in October. Expect at least one 4.2 or 4.8 rejection round on Apple and budget about a week for it.

---

## Pre-submission checklist for cheKe

**Accounts and identity (start now)**
- [ ] Look up or request a D-U-N-S number for *Inversiones y Representaciones Arguz, S.A. de C.V.*, using the exact legal name.
- [ ] Custom domain live (e.g. the `cheke.io` implied by `appId io.cheke.app`), a work email on it, and `server.url` and `COMPANY.website` moved to it.
- [ ] Apple Developer Program enrollment as an organization (99 USD/yr) by someone with signing authority.
- [ ] Google Play organization developer account; verify the Payments profile, email and phone.
- [ ] Fill in every `[… completar]` in `src/lib/company.ts` so the legal pages lose the draft banner.

**Must-build features**
- [ ] In-app **Eliminar mi cuenta** in Cuenta, with confirmation, time estimate, a done email and handling for the last owner. Make `/eliminar-datos` link to or perform the same flow instead of asking for an email.
- [ ] Login in the native shell: **6-digit email code** instead of a magic link.
- [ ] iOS: **hide Google login** (or add Sign in with Apple, plus token revocation on deletion).
- [ ] Android, if Google login stays: run it through Custom Tabs plus an app link callback, never the WebView.
- [ ] Hide all pricing, upgrade and payment-method UI when `Capacitor.isNativePlatform()`; show a neutral message when a plan has lapsed.
- [ ] Reviewer login that needs no inbox (password or fixed code), with a seeded demo business and modo prueba on.
- [ ] Native polish for 4.2: offline screen bundled in the app, unread badge, notification tap opens the conversation, camera or photo picker for uploads, share sheet, safe areas. The app starts at login or the inbox, not the marketing page.
- [ ] Device-test "Conectar WhatsApp" (Facebook popup) inside the app, with a fallback if it fails.

**Store listings and forms**
- [ ] Privacy policy URL, and Apple privacy "nutrition" labels plus Google Data safety form, including the data-deletion questions and the web deletion URL.
- [ ] App Review notes (Apple): "Free companion app for businesses that subscribe to cheKe on the web (3.1.3(f)); no purchases in app; demo credentials: …; WhatsApp connection requires a Meta Business account, so the demo business is pre-connected with sample data."
- [ ] Play "App access": demo credentials plus notes on the code login.
- [ ] Availability: Honduras only at launch, on both stores.
- [ ] Screenshots from the real app (inbox, chat, Chekeo, inventory), with no desktop screenshots.
- [ ] Push permission requested in context, after login, not on first launch. The app must work if it's denied.

**Release timing**
- [ ] First TestFlight external build and a Play internal or closed track by about 2026-11-25, to leave time for a rejection round.
- [ ] Production submission to both stores by about 2026-12-07 for a public release in mid-December.
