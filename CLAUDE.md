# cheKe CRM

cheKe is a subscription CRM / unified inbox for Honduran businesses that sell through WhatsApp, Instagram, and Facebook. Each business (tenant) connects its own channels and its team answers every conversation from one place.

The founder is not a full-time developer. Explain what you are doing in plain language, keep changes small, and tell me exactly what to click or run when I need to do something myself (accounts, keys, deploys).

## Design reference

The approved UI lives in `/design` as static HTML mockups (sample data only). Match their layout, colors, fonts, and Spanish copy. Do not edit files in `/design`; build real components from them.

| Screen | File |
|---|---|
| chekeo (kanban de ventas) | design/Main.html |
| Chat (bandeja unificada) | design/Inbox.html |
| Contactos | design/Contacts.html |
| Comentarios | design/Comments.html |
| Plantillas | design/Templates.html |
| Catálogo (route /inventory) | design/Inventory.html |
| Equipo | design/Team.html |
| Notificaciones | design/Notifications.html |
| Analítica | design/Analytics.html |

Brand: dark blue #001037, intense blue #0043F8, mint #52EBBB, white. Fonts: Space Grotesk (headings), Work Sans (body). Channel colors: WhatsApp #25D366, Instagram #C1387B, Facebook #1877F2. Logos in `design/assets/`.

Brand names are always lowercase in copy: cheke, chekeo, chekelin.

## Stack

- Next.js (App Router, TypeScript) + Tailwind
- Supabase: Postgres, Auth, Realtime (new messages appear live in Chat)
- `motion` (the Framer Motion successor, `import from "motion/react"`) for anything animated
- Hosting: Vercel
- UI language: Spanish (Honduras). Code and comments: English.

## Interaction & motion

House style for anything that moves, distilled from an Apple-style interface
design skill (WWDC "Designing Fluid Interfaces" translated to the web). This
matters most from Phase 7 onward (chekeo drag-and-drop, Chat send/swipe,
sheets), but the rules apply anywhere something animates.

- **Respond on press, not on release.** A button dims/scales the instant it's
  pressed (`:active`), never waits for the click to resolve. See the
  `:active` rule already in `globals.css`.
- **Springs, not fixed-duration curves, for anything touchable.** Use
  `motion`'s spring type. Default to critically damped (`bounce: 0`,
  `duration: 0.3–0.4`) for menus, panels, and layout changes — no overshoot.
  Only add bounce (`bounce: ~0.2`) when the interaction itself carried
  momentum (a drag release, a flick) — never on something that just faded
  or slid in on its own.
- **Never lock input during a transition, and never animate from the target
  value.** If a user can interrupt something mid-motion (dragging a chekeo
  card, dismissing a sheet), the next animation must start from the live
  on-screen position, not restart from zero.
- **Spatial consistency.** Things enter and exit along the same path. A
  panel opened from the right closes to the right. A moved/selected state
  (like the sidebar's active-section highlight) should slide from its old
  position to its new one — see `layoutId` usage in `Sidebar.tsx` — never
  just disappear in one spot and reappear in another.
- **`prefers-reduced-motion` is mandatory, not optional**, on every animated
  component: swap the spring/slide for a short opacity cross-fade
  (`motion`'s `useReducedMotion()` hook), keep the state change, drop the
  physicality. Already wired into `Sidebar.tsx`, `PageStub.tsx`, and the
  auth pages — follow the same pattern in new components.
- **Type tracking is size-specific.** Large headings get slightly negative
  letter-spacing and tight leading (the `.text-display` utility class in
  `globals.css`); body text stays near default tracking. Don't hardcode one
  `letter-spacing` for every size.
- **Materials:** only the modal/sheet scrim gets `backdrop-filter` blur +
  dimming. The sidebar and cards stay solid per the brand manual — don't
  add translucency to brand-colored surfaces.

## Design skills

The user-level skills `impeccable`, `design-taste-frontend`,
`redesign-existing-projects`, `imagegen-frontend-mobile` and `motion-design`
are available for UI work (critique, polish, audit, animate, mobile
concepts). In this repo they **refine, never replace**:

- The approved mockups in `/design`, the brand (colors, Space Grotesk / Work
  Sans, logos) and the "Interaction & motion" rules above always win over a
  skill's taste or defaults. Use `motion` springs as specified, not GSAP or
  fixed-duration curves.
- No redesign of an existing screen unless the founder asks for one.
- Simplicity first: users in Honduras aren't tech-savvy, so prefer fewer
  options and familiar WhatsApp/Instagram patterns over novelty.
- impeccable is installed without its engine binary or hooks, so its launcher
  step fails by design. Use its fallback (read the project files directly).

## Multi-tenant rules

- Every table with business data has `business_id`.
- Supabase Row Level Security ON for every table: a user only reads/writes rows of businesses they belong to.
- Secrets (Supabase service key, Meta tokens) only on the server, never in client code. Meta access tokens stored encrypted.

## Core data model (start here, extend later)

- `businesses` (id, name, plan, created_at) = the Negocio
- `stores` (business_id, name, archived_at) = its Tiendas (migration 0018). Channels, conversations, messages, products, catalogs and orders carry `store_id`; contacts and templates stay Negocio-wide. RLS: Dueños see every Tienda, Gerentes/Agentes only theirs (`my_store_ids()`). Server code gets the Negocio, role and selected Tienda from `getCurrentBusiness()` (src/lib/business.ts).
- `members` (business_id, user_id, role: owner | manager | agent = Dueño | Gerente | Agente) and `store_members` (store_id, user_id: which Tiendas a Gerente/Agente works in)
- `invitations` (single-use links, 7 days, role + Tiendas; `create_invitation` / `accept_invitation`)
- `channels` (business_id, type: whatsapp | instagram | facebook, external_id e.g. phone_number_id, access_token_encrypted, status)
- `contacts` (business_id, name, phone, ig_handle, fb_id, tags, notes)
- `conversations` (business_id, contact_id, channel_id, status: open | pending | closed, assigned_to, last_message_at, window_expires_at). The ad it came from (migration 0039): `referral` (Meta's raw object), `referral_source` (anuncio | publicación), `referral_ad_id`, `referral_headline`, `referral_url`, `referral_at`; first ad wins, written only by the webhooks (src/lib/adReferral.ts). Chat shows "Vino de un anuncio: …", Analítica "Por anuncio".
- `messages` (conversation_id, business_id, direction: in | out, body, media_url, external_message_id unique, status: sent | delivered | read | failed, created_at). Received photos, voice notes, documents, stickers, locations and contact cards (migration 0023): `media_kind`, `media_path` / `media_m4a_path` in the private `message-media` bucket (`business_id/store_id/message_id.ext`, signed links), `media_info`; `body` keeps the text fallback. Downloaded after the webhook answers (src/lib/messageMedia.ts). A customer's voice note is then transcribed (migration 0025: `transcription`, `transcription_status`; OpenAI `gpt-4o-transcribe`, needs `OPENAI_API_KEY`, src/lib/voiceTranscription.ts): Chat shows it under the audio and chekelin reads it as the customer's message.

- `catalogs` (business_id, meta_catalog_id, status, last_synced_at)
- `products` (business_id, retailer_id unique per Tienda, name, category, description, price_hnl, image_url, visible, meta_sync_status). Products are informative only (photo, name, category, description, price, visible on/off), no stock management; the old `stock` column stays in the DB but is never read or written.
- `post_comments` (migration 0027, issue #43): comments under the Tienda's Instagram / Facebook posts (webhook fields `comments` and `feed`), chekelin's reading (`kind`: price | complaint | other), the public reply and the private-reply queue (Meta: 750 per hour per account; drained by /api/cron/comments). Never hidden or deleted. Code: src/lib/comments.ts (pure) and src/lib/commentsServer.ts.
- `orders` (business_id, conversation_id, contact_id, items json, total_hnl, status: new | awaiting_payment | paid | delivered | cancelled, payment_link)
- `whatsapp_templates` (migration 0033): each WhatsApp number's Meta message templates (name, language, status, category, components, rejected_reason, source_template_id = the Plantilla it was created from), synced from `GET /{waba_id}/message_templates` on "Actualizar" and daily by /api/cron/channel-health. Chat's "Enviar plantilla" sends an APPROVED one after the 24 h window; Plantillas' "Enviar a aprobación de WhatsApp" creates one. Read by the Tienda's people; written only by the server. Code: src/lib/whatsappTemplates.ts (pure) and src/lib/whatsappTemplatesServer.ts.
- `broadcasts` + `broadcast_recipients` (migration 0042) = Campaña: an APPROVED template to every contact with the picked tags (Plantillas → Campañas, Dueño/Gerente). /api/cron/broadcasts sends in batches within Meta's 24 h limit; 131049 retries once after 24 h; 131050, a "BAJA" reply or the `user_preferences` webhook set `contacts.marketing_opt_out`. Recipients are written only by the server. Code: src/lib/broadcasts.ts (pure) and src/lib/broadcastsServer.ts. Facts: docs/research/difusion-whatsapp.md (PR #92).

`window_expires_at` = last inbound message + 24h. Outside the window only approved templates can be sent; the UI must show this.

## Build phases (do them in order, one at a time)

1. **Foundation**: project setup, Supabase schema + RLS, email login, create/join a business, app shell with the sidebar from the designs.
2. **Chat + Contactos with real data**: build these two screens against the database, with seed data and Realtime updates.
3. **Deploy**: GitHub + Vercel, environment variables, custom domain. Walk me through each click.
4. **WhatsApp Cloud API (test number)**:
   - `GET /api/whatsapp/webhook`: verification handshake (hub.mode, hub.verify_token, hub.challenge).
   - `POST /api/whatsapp/webhook`: validate `X-Hub-Signature-256` with the app secret, save inbound messages and status updates, dedupe by `external_message_id`, respond 200 fast.
   - `sendWhatsAppMessage()`: server function calling the Graph API messages endpoint; send text inside the 24h window, templates outside it.
5. **Embedded Signup + Coexistence**: "Conectar WhatsApp" button so each business connects its existing WhatsApp Business app number; store its WABA id, phone_number_id, and token in `channels`. Handle the history/contacts sync webhooks.
6. **Catálogo + WhatsApp catalog**:
   - Catálogo screen (design/Inventory.html) with real products: create, edit, photos, description, price in Lempiras, visible on/off (no stock).
   - "Importar catálogo": bulk import from a spreadsheet or photos, for businesses rebuilding the catalog they had in the WhatsApp Business app.
   - Sync products to the business's Meta catalog with the Catalog API (create the catalog if missing, connect it to their WhatsApp Business Account, enable cart and catalog visibility for the number). The business never has to open Commerce Manager.
   - In Chat, an "Enviar producto" button: send the full catalog message, a single product, a multi-product list (max 30 items), or a carousel. Use template versions outside the 24h window.
   - Handle incoming cart orders from the webhook: create an `orders` row, add the deal to chekeo, and reply with a payment link (payment provider to be decided; keep it pluggable).
   - Leave a hook for AI-enhanced product photos during import (built later).
7. Later: Instagram + Facebook Messenger, Comentarios (comment-to-DM), Plantillas, chekeo kanban, Equipo, Notificaciones, Analítica, bot first-line replies with human handoff.

Before starting a phase, show me a short plan. After finishing, tell me how to test it myself.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for fergutierreza123/cheke, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
