# cheKe CRM

cheKe is a subscription CRM / unified inbox for Honduran businesses that sell through WhatsApp, Instagram, and Facebook. Each business (tenant) connects its own channels and its team answers every conversation from one place.

The founder is not a full-time developer. Explain what you are doing in plain language, keep changes small, and tell me exactly what to click or run when I need to do something myself (accounts, keys, deploys).

## Design reference

The approved UI lives in `/design` as static HTML mockups (sample data only). Match their layout, colors, fonts, and Spanish copy. Do not edit files in `/design`; build real components from them.

| Screen | File |
|---|---|
| Chekeo (kanban de ventas) | design/Main.html |
| Chat (bandeja unificada) | design/Inbox.html |
| Contactos | design/Contacts.html |
| Comentarios | design/Comments.html |
| Plantillas | design/Templates.html |
| Inventario | design/Inventory.html |
| Equipo | design/Team.html |
| Notificaciones | design/Notifications.html |
| Analítica | design/Analytics.html |

Brand: dark blue #001037, intense blue #0043F8, mint #52EBBB, white. Fonts: Space Grotesk (headings), Work Sans (body). Channel colors: WhatsApp #25D366, Instagram #C1387B, Facebook #1877F2. Logos in `design/assets/`.

## Stack

- Next.js (App Router, TypeScript) + Tailwind
- Supabase: Postgres, Auth, Realtime (new messages appear live in Chat)
- `motion` (the Framer Motion successor, `import from "motion/react"`) for anything animated
- Hosting: Vercel
- UI language: Spanish (Honduras). Code and comments: English.

## Interaction & motion

House style for anything that moves, distilled from an Apple-style interface
design skill (WWDC "Designing Fluid Interfaces" translated to the web). This
matters most from Phase 7 onward (Chekeo drag-and-drop, Chat send/swipe,
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
  value.** If a user can interrupt something mid-motion (dragging a Chekeo
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

## Multi-tenant rules

- Every table with business data has `business_id`.
- Supabase Row Level Security ON for every table: a user only reads/writes rows of businesses they belong to.
- Secrets (Supabase service key, Meta tokens) only on the server, never in client code. Meta access tokens stored encrypted.

## Core data model (start here, extend later)

- `businesses` (id, name, plan, created_at)
- `members` (business_id, user_id, role: owner | agent)
- `channels` (business_id, type: whatsapp | instagram | facebook, external_id e.g. phone_number_id, access_token_encrypted, status)
- `contacts` (business_id, name, phone, ig_handle, fb_id, tags, notes)
- `conversations` (business_id, contact_id, channel_id, status: open | pending | closed, assigned_to, last_message_at, window_expires_at)
- `messages` (conversation_id, business_id, direction: in | out, body, media_url, external_message_id unique, status: sent | delivered | read | failed, created_at)

- `catalogs` (business_id, meta_catalog_id, status, last_synced_at)
- `products` (business_id, retailer_id unique per business, name, description, price_hnl, image_url, stock, visible, meta_sync_status)
- `orders` (business_id, conversation_id, contact_id, items json, total_hnl, status: new | awaiting_payment | paid | delivered | cancelled, payment_link)

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
6. **Inventario + WhatsApp catalog**:
   - Inventario screen (design/Inventory.html) with real products: create, edit, photos, price in Lempiras, stock, visible on/off.
   - "Importar catálogo": bulk import from a spreadsheet or photos, for businesses rebuilding the catalog they had in the WhatsApp Business app.
   - Sync products to the business's Meta catalog with the Catalog API (create the catalog if missing, connect it to their WhatsApp Business Account, enable cart and catalog visibility for the number). The business never has to open Commerce Manager.
   - In Chat, an "Enviar producto" button: send the full catalog message, a single product, a multi-product list (max 30 items), or a carousel. Use template versions outside the 24h window.
   - Handle incoming cart orders from the webhook: create an `orders` row, add the deal to Chekeo, and reply with a payment link (payment provider to be decided; keep it pluggable).
   - Leave a hook for AI-enhanced product photos during import (built later).
7. Later: Instagram + Facebook Messenger, Comentarios (comment-to-DM), Plantillas, Chekeo kanban, Equipo, Notificaciones, Analítica, bot first-line replies with human handoff.

Before starting a phase, show me a short plan. After finishing, tell me how to test it myself.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
