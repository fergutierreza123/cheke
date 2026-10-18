# Chat de cheke vs WhatsApp Business y la competencia

Investigación del 17–18 de octubre de 2026 para el lanzamiento del 31 de diciembre. Busca que la pantalla Chat tenga **todo lo que un vendedor ya usa en la app WhatsApp Business**, más extras para vender, y que le gane a la competencia.

Este documento parte de dos investigaciones anteriores (`research/voice-calls-payments` y `research/market-and-competitors`) y del código de `main` (628f5f5).

**Confianza:**
- **A (alta):** se leyó en la página del dueño (Meta, el proveedor) o en el código fuente.
- **M (media):** viene de una fuente primaria leída solo en parte, o de varias señales oficiales.
- **B (baja):** es una inferencia o viene de una fuente secundaria. Hay que confirmarla antes de construir.

En la tabla, "?" significa que el proveedor no lo documenta en público. No significa "no lo tiene".

---

## Resumen

1. **El Chat de cheke ya tiene una buena base.** Hoy envía texto, notas de voz (mantener presionado para grabar), documentos, tarjetas de producto, "Cobrar", respuestas rápidas con `/`, citas ("Responder"), reacciones y palomitas de leído. También recibe todo tipo de contenido y transcribe las notas de voz. Varios competidores no muestran ni las reacciones (respond.io y HubSpot lo documentan como "no soportado").
2. **Lo que más falta es lo básico de WhatsApp.** No se pueden **mandar fotos ni videos** desde la galería o la cámara. Falta el **menú "+" de adjuntos** en el teléfono. La lista de chats **no muestra contador de no leídos**. Y no hay forma de **escribirle a un cliente pasadas 24 h** en WhatsApp: el botón "Usar una plantilla" solo llena el cuadro de texto, sin enviar una plantilla aprobada. En la app WhatsApp Business se le puede escribir a un cliente en cualquier momento, así que el vendedor lo va a notar el primer día.
3. **Algunas cosas no se pueden hacer por la API**, así que hay que decirlo claro y no prometerlas: encuestas, estados, grupos, llamadas en Coexistence, difusiones en Coexistence, ubicación en tiempo real y mensajes temporales. WhatsApp Pay tampoco funciona en Honduras.
4. **Dónde gana cheke:** chekelin vende y cobra en Lempiras. "Cobrar" con link de pago termina en "Confirmar pago" y en el kanban chekeo. Las tarjetas de producto salen del Catálogo, se transcriben las notas de voz y los tres canales caben en un solo precio mensual en Lempiras. Además, con Coexistence el teléfono sigue funcionando, algo que HubSpot no permite. El siguiente paso es convertir "Cobrar" en un **botón "Pagar"** nativo (mensaje CTA URL de WhatsApp) y los productos en **mensajes de catálogo nativos**.

---

## 1. Qué hace el Chat de cheke HOY (leído en el código)

Archivos: `src/app/(app)/chat/ChatView.tsx`, `ComposerMedia.tsx`, `MessageExtras.tsx`, `MessageMedia.tsx`, `QuickReplyPicker.tsx`, `actions.ts`, `src/app/(app)/actions.ts`, `src/lib/channelSend.ts`, `mediaSend.ts`, `messageEvents.ts`, `outgoingMedia.ts`, `whatsapp.ts`, `metaMessaging.ts`.

**Envía**
- **Texto** en los tres canales. En Instagram y Facebook, una persona puede seguir respondiendo entre las 24 h y los 7 días con la etiqueta `HUMAN_AGENT`. chekelin no puede.
- **Notas de voz.** El micrófono funciona como en WhatsApp: se mantiene presionado para grabar, se desliza para cancelar, o se toca una vez para grabar sin las manos. Graba hasta 2 min. En WhatsApp sale como nota de voz real (`audio` OGG/Opus con `voice: true`). En IG y FB sale como `audio` M4A.
- **Documentos** de hasta 25 MB: PDF, Word, Excel, PowerPoint y TXT. Instagram solo acepta PDF.
- **Tarjeta de producto** ("Enviar producto del catálogo"): sale como **una imagen con la foto del producto y un pie con nombre, precio y descripción** (`sendProductToConversation` → `type: image`). **No** es un mensaje de producto nativo de WhatsApp (SPM/MPM).
- **Cobrar:** concepto, monto en Lempiras y link de pago o datos para transferir. Se manda como texto y crea un pedido `awaiting_payment`. Después hay que tocar "Confirmar pago" o "Cancelar".
- **Respuestas rápidas** con `/atajo`, que llenan `{nombre}`.
- **Plantillas** ("Usar una plantilla"): **solo llenan el borrador** y resaltan las variables `{{producto}}` y `{{precio}}`. No envían una plantilla aprobada por Meta.
- **Responder citando** un mensaje (menú o deslizar en el teléfono), en los tres canales.
- **Reacciones:** en WhatsApp con 6 emojis rápidos, en Instagram solo ❤️ y en Messenger ninguna, porque Messenger no lo permite.
- **Selector de emojis** en computadora. En el teléfono se usa el del teclado.
- **Palomitas de leído:** al abrir un chat, el cliente ve sus mensajes como leídos (palomitas azules en WhatsApp, "Visto" en IG/FB). chekelin muestra "escribiendo…" mientras prepara la respuesta.

**Recibe y muestra**
- Fotos, videos, stickers, notas de voz y audios, documentos, ubicaciones (mapa) y tarjetas de contacto (migración 0023, en el bucket privado).
- Transcripción de las notas de voz debajo del audio, con `gpt-4o-transcribe`. chekelin la lee como el mensaje del cliente.
- Etiquetas "Editado" y "Mensaje eliminado", además de las reacciones del cliente y sus citas.
- El estado de cada mensaje enviado (enviado, entregado, leído o falló), con el motivo cuando falla.

**Gestión**
- Buscar por nombre del contacto, filtrar por canal y por Tienda, y asignar o reasignar el chat.
- Etapa de venta, apagar chekelin en un chat, el resumen de traspaso de chekelin, la etiqueta de queja y el aviso "Esperando respuesta desde…".
- Aviso de ventana cerrada: "Ventana de 24 h cerrada" en WhatsApp y "7 días" en IG/FB.

**No hace (hoy)**
- Mandar fotos de la galería, usar la cámara o mandar videos, stickers, ubicación o contactos.
- Encuestas, botones o listas interactivas, ni mensajes de catálogo o producto nativos.
- Enviar una **plantilla aprobada fuera de las 24 h**.
- El menú "+" de adjuntos en el teléfono.
- **Contador o filtro de no leídos**, ni foto de perfil del cliente (solo muestra iniciales).
- Buscar dentro de una conversación, copiar, reenviar o destacar mensajes.
- Notas internas escritas por el equipo (solo existen las de chekelin), etiquetas libres, ni archivar, fijar o silenciar chats.
- Editar o borrar un mensaje propio ya enviado.

---

## 2. Matriz de funciones

Columnas: **WA app** = app WhatsApp Business. **cheke** = hoy. Competidores: **respond.io**, **Kommo**, **Callbell** y **Leadsales**, que son los que más se venden en LatAm. **API** = si la API oficial lo permite en WhatsApp (Cloud API) / Instagram / Messenger.

Símbolos: ✅ sí · ❌ no · ◐ parcial · ? no documentado en público.

### Enviar

| Función | WA app | cheke | respond.io | Kommo | Callbell | Leadsales | API WA / IG / FB |
|---|---|---|---|---|---|---|---|
| Texto | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ / ✅ (1000 bytes) / ✅ |
| Foto (galería / cámara) | ✅ | ❌ (solo la foto de un producto) | ✅ | ✅ | ✅ | ✅ (B) | ✅ JPEG/PNG 5 MB / ✅ PNG/JPEG 8 MB, hasta 10 por mensaje / ✅ |
| Video | ✅ | ❌ | ✅ (16 MB) | ? | ? | ? | ✅ MP4 H.264+AAC 16 MB / ✅ 25 MB / ✅ |
| Nota de voz (mantener para grabar) | ✅ | ✅ | ? | ? | ✅ nativa + transcripción (jul 2026) | ? | ✅ `voice:true` / ◐ audio M4A / ◐ audio |
| Documento | ✅ | ✅ | ✅ (100 MB) | ✅ | ✅ | ? | ✅ / ◐ solo PDF / ✅ |
| Sticker | ✅ | ❌ | ✅ | ? | ? | ? | ✅ WebP 100 KB (animado 500 KB) / ◐ solo `like_heart` / ✅ (M) |
| Ubicación | ✅ | ❌ | ? | ? | ? | ? | ✅ / ❌ (mandar link de Maps) / ❌ (link) |
| Pedir ubicación al cliente (botón) | ❌ | ❌ | ? | ? | ? | ? | ✅ `location_request_message` / ❌ / ❌ |
| Tarjeta de contacto | ✅ | ❌ | ? | ? | ? | ? | ✅ / ❌ / ❌ |
| Encuesta | ✅ | ❌ | ❌ ("unsupported") | ? | ? | ? | ❌ (no aparece en la lista de tipos) / ❌ / ❌ |
| Emojis | ✅ | ✅ (computadora) | ✅ | ✅ | ✅ | ✅ | n/a |
| Responder citando | ✅ | ✅ | ? | ? | ? | ? | ✅ `context` / ✅ `reply_to` / ✅ `reply_to` |
| Reaccionar | ✅ | ✅ (IG solo ❤️) | ❌ ("unsupported") | ? | ? | ? | ✅ / ✅ `sender_action: react` / ❌ |
| Editar o borrar lo enviado | ✅ | ❌ | ? | ❌ en Coexistence | ? | ? | ❌ (B: no aparece entre los tipos que se pueden enviar) |
| Botones (hasta 3) y listas (hasta 10 filas) | ❌ (solo en difusiones) | ❌ | ✅ (bots) | ✅ (salesbot) | ◐ (bot builder) | ✅ (Leadbot, B) | ✅ / ✅ respuestas rápidas (13) y plantilla genérica / ✅ |
| Botón con link (CTA URL) | ❌ | ❌ | ? | ? | ? | ? | ✅ imagen + texto + botón de 20 caracteres / ✅ plantilla genérica o de botones / ✅ |
| Catálogo y producto nativo | ✅ catálogo, links y carrito | ◐ foto + precio | ◐ (integración "Meta Product Catalog") | ? | ? | ? | ✅ catálogo, 1 producto, multi (30) y carrusel (10) / ◐ plantilla genérica / ◐ plantilla genérica |
| Cobro con link de pago | ◐ (WhatsApp Pay no existe en HN) | ✅ Cobrar (texto) + pedido | ? | ◐ (marketing: "AI agent sending a payment link") | ? | ? | ❌ pagos nativos solo en India y Brasil; ✅ con CTA URL o texto |
| Plantilla aprobada después de 24 h | n/a (sin ventana) | ❌ | ✅ | ✅ | ✅ | ✅ (plan Profesional) | ✅ plantillas / ◐ `HUMAN_AGENT` hasta 7 días / ◐ igual |
| Respuestas rápidas `/` | ✅ (B: 50) | ✅ | ✅ (snippets, B) | ✅ | ✅ | ✅ | n/a |

### Recibir y ver

| Función | WA app | cheke | respond.io | Kommo | Callbell | Leadsales | Nota de la API |
|---|---|---|---|---|---|---|---|
| Fotos, video, documentos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Webhook con id de media |
| Notas de voz | ✅ | ✅ + **transcripción** | ✅ | ✅ (Pro: "voice message handling") | ✅ + transcripción | ? | — |
| Stickers, ubicación, contactos | ✅ | ✅ | ◐ (stickers ✅) | ? | ? | ? | HubSpot también los recibe (A) |
| Reacciones, editado y eliminado | ✅ | ✅ | ❌ (lo muestra como "Unsupported Message") | ? | ? | ? | — |
| Encuestas | ✅ | ❌ | ❌ | ? | ? | ? | No llegan por la API |
| Palomitas (enviado, entregado, leído) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Webhook `statuses` |
| Mostrar "leído" al cliente | ✅ | ✅ al abrir el chat | ? | ? | ? | ? | `status: read` / `mark_seen` |

### Organizar

| Función | WA app | cheke | respond.io | Kommo | Callbell | Leadsales |
|---|---|---|---|---|---|---|
| Contador y filtro de no leídos | ✅ | ❌ | ✅ (M) | ✅ (M) | ✅ (M) | ✅ (M) |
| Etiquetas | ✅ (B: hasta 20) | ◐ etapas de chekeo + queja | ✅ | ✅ | ✅ | ✅ |
| Buscar mensajes | ✅ | ❌ (solo el nombre del contacto) | ✅ | ✅ | ✅ (también las notas, nov 2025) | ? |
| Notas internas del equipo | ❌ | ◐ solo las de chekelin | ✅ | ✅ | ✅ (con fotos y PDF) | ? |
| Asignar chat a una persona | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Saludo y mensaje de ausencia | ✅ | ◐ chekelin y "ya le avisamos" | ✅ | ✅ | ✅ | ✅ |
| Difusiones | ✅ (desactivadas en Coexistence) | ❌ | ✅ | ✅ (Advanced) | ✅ (US$0.02 por contacto) | ✅ (Profesional) |
| Seguir usando la app del teléfono (Coexistence) | — | ✅ | ? | ✅ | ? | ? |
| IA que vende | ✅ Meta Business Agent (Meta One desde US$14.99) | ✅ chekelin | ✅ Growth+ | ✅ hasta 3 agentes en Advanced | ❌ (ChatGPT solo en Enterprise) | ✅ Lead Agent +US$87 |

**Lo que ni la API ni Coexistence permiten** (A, según Kommo y la investigación anterior que citó a Meta): grupos, llamadas de voz y video, difusiones, estados, ubicación en tiempo real, mensajes de "ver una vez", mensajes temporales y el catálogo, los pedidos y los estados de la app. Kommo agrega que en Coexistence **"Message edit and revoke are no longer supported"**.

---

## 3. Brechas priorizadas

Esfuerzo para un agente de IA: **S** ≤ 1 día · **M** 2–4 días · **L** 1–2 semanas.

### P0: antes del lanzamiento del 31 de diciembre (cualquier usuario de WhatsApp lo espera)

| # | Brecha | Por qué | Canales que lo permiten | Esfuerzo |
|---|---|---|---|---|
| 1 | **Mandar fotos** (galería, pegar o arrastrar, varias a la vez) con pie de foto | Es lo más usado para vender ("así queda en negro"). El código ya manda una imagen con pie (`type: image`) y ya sube archivos (`prepareChatUpload`). Se pueden reutilizar `shrinkPhoto.ts` y el envío de documentos. | WA ✅ JPEG/PNG 5 MB · IG ✅ 8 MB, hasta 10 por mensaje · FB ✅ | M |
| 2 | **Cámara** en el teléfono: `<input capture>` y la cámara nativa de la app | En la app de WhatsApp la cámara está siempre a un toque. | Igual que fotos | S (sobre el #1) |
| 3 | **Mandar videos** | Muestran el producto en uso. WhatsApp exige MP4 H.264/AAC de hasta 16 MB, así que algunos videos del iPhone (HEVC/MOV) se van a tener que convertir con ffmpeg, igual que las notas de voz. | WA ✅ 16 MB · IG ✅ 25 MB · FB ✅ | M |
| 4 | **Menú "+" de adjuntos** en el teléfono, estilo WhatsApp: Cámara · Fotos · Documento · Ubicación · Producto · Cobrar · Respuestas rápidas | Hoy los botones están en una fila, a la manera de computadora. La gente en Honduras busca el "+" o el clip. Un sheet con un `motion` spring y la regla de `prefers-reduced-motion`. | n/a (UI). Esconde lo que el canal no permite. | S–M |
| 5 | **No leídos**: un contador verde en cada chat, el nombre en negrita y el filtro "No leídos" | Sin esto, los chats nuevos se pierden. Hace falta `unread_count` (o `last_read_at` por persona) en `conversations`. | n/a | S–M |
| 6 | **Escribir pasadas las 24 h en WhatsApp con plantilla aprobada**: elegir una plantilla aprobada, llenar las variables y enviarla (`type: template`) | En la app, el vendedor le escribe al cliente cuando quiere. En cheke, después de 24 h el chat queda **bloqueado**. Es la queja número uno que se puede esperar ("no le puedo escribir a mi clienta"). Hace falta sincronizar las plantillas aprobadas desde la WABA y conectar Plantillas. El precio de las plantillas de Meta está en `research/whatsapp-oct-2026-pricing`. | WA ✅ · IG/FB: no hay plantillas. Una persona puede escribir hasta 7 días con `HUMAN_AGENT` (ya está hecho). | M–L |
| 7 | **Mandar ubicación** de la Tienda (guardada en la configuración) | "¿Dónde quedan?" es una pregunta diaria. | WA ✅ `location` · IG/FB ❌, así que se manda un link de Google Maps | S |
| 8 | **Copiar el texto** de un mensaje (en el menú del mensaje) | Básico para copiar una dirección o un número de cuenta. | n/a | S |

### P1: enero

| # | Brecha | Canales | Esfuerzo |
|---|---|---|---|
| 9 | **"Cobrar" como botón "Pagar"**: un mensaje CTA URL con la foto del producto, el monto en Lempiras y el botón. Si falla, se manda el texto de hoy. Se ve mucho más confiable que un link largo. | WA ✅ CTA URL · IG/FB ✅ plantilla genérica con botón `web_url` (M) | S–M |
| 10 | **Mensajes de producto nativos** (1 producto, multi-producto de hasta 30 y carrusel de hasta 10) y de catálogo completo, desde el Catálogo sincronizado con Meta (fase 6) | WA ✅ · IG/FB ◐ carrusel con plantilla genérica de hasta 10 tarjetas | L (depende de la sincronización con Meta) |
| 11 | **Pedir la ubicación de entrega** con un botón (`location_request_message`) y guardarla en el pedido. chekelin la puede pedir sola. | Solo WA | S |
| 12 | **Mandar tarjeta de contacto** (por ejemplo, el número del repartidor) | Solo WA. En IG/FB se manda como texto. | S |
| 13 | **Notas internas** del equipo dentro del chat, con @mención y una notificación | n/a | M |
| 14 | **Etiquetas libres y filtros** (míos, sin asignar, esperando, con queja) | n/a | M |
| 15 | **Buscar mensajes** dentro del chat y en todos los chats | n/a | M |
| 16 | **Foto de perfil** del cliente en IG y FB. La Cloud API de WhatsApp no da la foto (B), así que ahí se quedan las iniciales. | IG/FB ✅ (M) | S |
| 17 | **Reenviar** un mensaje o archivo a otro chat | Reenviar por id de media (WA) o por link firmado | S–M |
| 18 | **Botones de respuesta y listas** para chekelin ("¿Talla S, M o L?") | WA ✅ 3 botones o lista de 10 · IG/FB ✅ 13 respuestas rápidas | M |
| 19 | **Saludo y mensaje de ausencia** para el plan cheke (L790, sin chekelin) | Ventana de 24 h | S |

### P2: más adelante

| # | Brecha | Nota |
|---|---|---|
| 20 | Mandar stickers | WA ✅ WebP · IG solo ❤️. Poco valor para vender. |
| 21 | Galería de fotos, archivos y links del contacto | Solo UI. S–M. |
| 22 | Programar un mensaje | Se puede con un cron y la ventana. M. |
| 23 | WhatsApp Flows (formularios de pedido o cita) | WA ✅. L. |
| 24 | Difusiones con plantillas de marketing | US$0.074 cada una (investigación de precios). L, para Plantillas. |
| 25 | Llamadas | Solo con números API. Coexistence no las soporta (investigación anterior). |
| — | **No se puede (no prometer):** encuestas, estados, grupos, ubicación en tiempo real, "ver una vez", mensajes temporales, editar o borrar en Coexistence, WhatsApp Pay en Honduras | Usar botones o listas en vez de encuestas. Cobrar con link en vez de WhatsApp Pay. |

---

## 4. Dónde gana cheke

**Funciones para vender que nadie del grupo junta en un solo plan en Lempiras:**

1. **chekelin vende y cobra**: responde, manda la tarjeta del producto y cierra con "Cobrar". Leadsales cobra su IA aparte (US$87 o más al mes). Callbell no tiene IA fuera de Enterprise. Kommo la pone desde Advanced (US$35 por usuario, con un mínimo de 6 meses).
2. **Cobrar con pedido y Confirmar pago**, que mueve el trato a "ganado" en chekeo. WhatsApp Pay no existe en Honduras, y la página de payment links de Meta dice "not publicly available yet" y apunta a la India (A). **Cobrar es la forma real de cobrar en Honduras.** El botón "Pagar" (P1 #9) lo hace verse nativo.
3. **Productos con precio en L** salidos del Catálogo, en los tres canales. Después vienen los mensajes nativos (P1 #10).
4. **Transcripción de notas de voz** que chekelin entiende. Callbell la lanzó en julio de 2026, así que ya no es exclusiva, pero sigue siendo rara. Respond.io y HubSpot ni siquiera muestran las reacciones.
5. **Coexistence**: el negocio sigue usando la app en el teléfono. HubSpot dice que al conectarse "messages no longer appear in the WhatsApp mobile or web app" (A).
6. **Tres canales sin cobros extra**: Callbell cobra +US$22 por Instagram y Zoko +US$9.99 (A).

**Comparación de precios** (cheke antes del ISV, a L26.90 por US$1):

| | Precio mensual | Usuarios | IA | Pago |
|---|---|---|---|---|
| **cheke** | **L790 ≈ US$29** | ver issue #9 | sin chekelin (#9) | mensual, en L |
| **cheke Plus** | **L1,590 ≈ US$59** | 5 | chekelin, 3,000 respuestas | mensual, en L |
| **cheke Pro** | **L3,990 ≈ US$148** | más | más | mensual, en L |
| respond.io | US$99 (US$79 pagando el año) por 5 usuarios; Growth US$199 | 5 / 10 | AI Agents desde Growth | USD |
| Kommo | US$25 / 35 / 45 por usuario | por usuario | desde Advanced | **mínimo 6 meses**, USD |
| Callbell | 15 / 20 por usuario + IG 22 | por usuario | solo Enterprise | USD/EUR |
| Leadsales | US$97 (sin API) / US$133 | 3 / 4 | Lead Agent +US$87 | USD |
| Chatwoot | US$19 / 39 por agente | por agente | Captain, 300–500 créditos | USD |
| Wati | Growth, Pro y Business (el texto de la página no da los montos; +US$24 por usuario en Pro) | 3 / 5 | Astra se cobra aparte | USD |
| Zoko | US$49.99–139.99 + IG 9.99 | — | Sello: US$24.99 + 3% del pedido | USD |
| Meta One | desde US$14.99 | 1 número | Business Agent | USD |

Un negocio con 3 vendedores pagaría por mes: Kommo Advanced US$105 (por 6 meses adelantados), Callbell US$45 + US$22 por IG, Leadsales con IA US$220, respond.io US$99. **cheke Plus cuesta unos US$59, con IA y los 3 canales.** Lo que sigue vigente de `market-and-competitors`: no pelear contra Meta One como "una IA que contesta WhatsApp", sino como **"tu equipo, tus tres canales y un vendedor que cobra en Lempiras"**.

---

## 5. Notas para quien lo construya

- Las fotos y videos usan el mismo flujo que los documentos (#50): un link de subida firmado, luego `/api/chat/media`, luego la media de WA por id, o un attachment por link en IG/FB. Hay que agregar `kind: "image" | "video"` a `OutgoingKind` y comprimir las fotos en el navegador.
- Cada canal debe esconder lo que no permite, como ya se hace con las reacciones en Messenger: ubicación y contacto solo en WhatsApp, y PDF solo en Instagram.
- Las plantillas aprobadas (P0 #6) cuestan dinero (marketing US$0.074, utility más barato) y abren una ventana nueva de 24 h cuando el cliente responde.

---

## Fuentes (consultadas el 17–18 de octubre de 2026)

**Meta / WhatsApp**
- Funciones de la app WhatsApp Business (perfil, saludo, ausencia, respuestas rápidas, etiquetas, catálogo, carrito, difusiones, 10 dispositivos): https://whatsappbusiness.com/products/business-app-features/
- Cloud API: tipos de mensajes que se pueden enviar, la ventana de 24 h, reacciones, respuestas con contexto, palomitas de leído e indicador de escritura: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
- Imágenes (JPEG/PNG de 5 MB, pie de 1024 caracteres): https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/image-messages
- Videos (MP4/3GP de 16 MB, H.264 + AAC): https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/video-messages
- Listas (10 secciones y 10 filas): https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages
- CTA URL (header de imagen, botón de 20 caracteres): https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-cta-url-messages
- Mensajes de dirección (solo India): https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/address-messages
- Mensajes de producto (catálogo, 1 producto, multi de 30, carrusel de 10; el botón de checkout es solo para India): https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/share-products
- Payment links ("not publicly available yet", INR/UPI): https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/payment-links/
- Instagram Messaging API (tipos, tamaños, hasta 10 imágenes, like_heart, reacciones, PDF): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- Messenger Send Messages (adjuntos, reply_to, tipos de mensaje): https://developers.facebook.com/docs/messenger-platform/send-messages
- Messenger, respuestas rápidas (hasta 13): https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/quick-replies
- Messenger, plantilla genérica (10 elementos, 3 botones): https://developers.facebook.com/docs/messenger-platform/reference/templates/generic

**Competidores**
- respond.io, WhatsApp Cloud API (tamaños; reacciones, borrados y encuestas no soportados): https://respond.io/help/whatsapp/whatsapp-cloud-api
- respond.io, precios: https://respond.io/pricing
- Kommo, precios (mínimo 6 meses): https://www.kommo.com/pricing/
- Kommo, Coexistence (lo que no se sincroniza, edit/revoke): https://support.kommo.com/docs/manage-whatsapp-chats-in-both-kommo-and-the-app
- Kommo, link de pago con agente IA (marketing): https://www.kommo.com/whatsapp-qr-code-generator/
- Callbell, precios: https://www.callbell.eu/en/pricing/
- Callbell, notas de voz nativas y transcripción (3 jul 2026): https://feedback.callbell.eu/changelog/messages-audio-integres-a-whatsapp-studiomicrophone
- Callbell, notas internas con archivos (26 nov 2025): https://feedback.callbell.eu/changelog/nota-interna-pesquisa-e-anexos
- Leadsales, precios: https://leadsales.io/precios/
- Leadsales, cómo funciona: https://leadsales.io/que-es-leadsales/
- Chatwoot, precios: https://www.chatwoot.com/pricing
- Chatwoot, código del envío por WhatsApp Cloud (texto, imagen, audio, video, documento, nota de voz, plantillas, botones y listas, citas): https://github.com/chatwoot/chatwoot/blob/develop/app/services/whatsapp/providers/whatsapp_cloud_service.rb
- HubSpot, WhatsApp en el inbox (requisitos, lo que se recibe y envía, reacciones y encuestas no soportadas, sin Coexistence): https://knowledge.hubspot.com/inbox/connect-whatsapp-to-the-conversations-inbox
- Wati, precios: https://www.wati.io/pricing/
- Zoko, precios: https://www.zoko.io/pricing
- Treble (sin precios públicos; fuente secundaria): https://hackceleration.com/es/labs/treble-precio

**Fuentes secundarias (B)**: límite de 50 respuestas rápidas y 20 etiquetas en la app (Trengo y ChatDaddy), y polls en el menú de adjuntos (Tom's Guide). La ayuda de faq.whatsapp.com no se pudo leer automáticamente.

**Investigación anterior del repo**: `research/voice-calls-payments` (Coexistence, llamadas, pagos en HN) y `research/market-and-competitors` (precios y tipo de cambio).
