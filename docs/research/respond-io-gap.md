# respond.io vs cheke: qué le falta a cheke para un equipo de ventas pequeño

Investigación del 25 de octubre de 2026 para el lanzamiento del 10 de diciembre. Busca qué hace que respond.io valga la pena para equipos de ventas pequeños, qué de eso ya tiene cheke y qué conviene construir antes de lanzar.

Fuentes: solo páginas de respond.io (sitio, centro de ayuda `respond.io/help`, precios, blog y FAQ propios). El código de cheke se leyó en esta rama, el 25 de octubre de 2026.

**Confianza:**
- **A (alta):** se leyó en la página de ayuda o de precios de respond.io, o en el código de cheke.
- **M (media):** viene del blog o del FAQ de respond.io (es material de venta) o de una página de ayuda vieja.
- **B (baja):** es una inferencia. Hay que confirmarla antes de construir.

---

## Resumen

1. **respond.io vende "bandeja + automatización + IA" a equipos B2C medianos.** El plan Starter cuesta US$79–99 al mes con 5 usuarios, pero **no trae difusiones, flujos automáticos, agentes de IA ni reportes avanzados**: eso empieza en Growth, a US$159–199 al mes ([precios](https://respond.io/pricing), A). Para una tienda hondureña, eso es más de L4,000 al mes antes de pagarle a Meta.
2. **cheke ya cubre lo central y en algunas cosas le gana.** Tiene bandeja de 3 canales, Coexistencia, asignación automática con Ausente, chekelin que vende y cobra en Lempiras, chekeo (equivalente a "Lifecycle"), respuestas rápidas con `/`, plantillas de WhatsApp aprobadas, comentarios con respuesta pública y privada, y transcripción de notas de voz. respond.io **no responde comentarios en público** ([roadmap](https://roadmap.respond.io/feature-request/p/instagram-enable-public-reply-to-comments), M) y cheke sí.
3. **Lo que más le falta a cheke son herramientas para volver a venderle al cliente que ya escribió:** etiquetas y segmentos de contactos, difusiones con plantilla, saber de qué anuncio llegó cada chat, notas internas del equipo y tiempos de respuesta por persona.
4. **No hay que copiar el constructor de flujos ni lo "enterprise"** (webhooks, SSO, varios espacios de trabajo, campos personalizados con 8 tipos, cobro por contacto activo). Eso le sirve a una empresa con alguien técnico, no a una tienda en Tegucigalpa.

---

## 1. Qué ofrece respond.io (fuentes primarias)

### Planes ([respond.io/pricing](https://respond.io/pricing), A)

| Plan | Precio mensual (anual / mensual) | Usuarios | Lo que agrega |
|---|---|---|---|
| Starter | US$79 / US$99 | 5 (+US$12 c/u) | Bandejas de equipo, app móvil, AI Prompt, AI Assist, reportes básicos |
| Growth | US$159 / US$199 | 10 (+US$20 c/u) | Difusiones, flujos (Workflows), agentes de IA, reportes avanzados, Zapier/Make, API |
| Advanced | US$279 / US$349 | 10 (+US$24 c/u) | Ocultar teléfonos y correos, varios espacios de trabajo, HTTP y webhooks en flujos, SSO, canales a la medida |
| Enterprise | A cotizar | Sin límite | Más espacios de trabajo y más llamadas a la API |

Todos los planes cobran por **contactos activos al mes** (desde 1,000; el excedente cuesta US$12–15 por cada 100) y por **créditos de IA**. Las tarifas de WhatsApp van aparte.

### Funciones, una por una

| # | Función de respond.io | Qué hace | Fuente |
|---|---|---|---|
| R1 | Bandeja unificada | WhatsApp, TikTok, Instagram, Facebook y correo en un hilo por cliente | [respond.io](https://respond.io/) (A) |
| R2 | Coexistence | Usar la app WhatsApp Business y la API en el mismo número. No trae el historial de la app | [ayuda WhatsApp](https://respond.io/help/whatsapp) (A), [blog](https://respond.io/blog/how-to-use-whatsapp-business-app-and-api-at-the-same-time) (M) |
| R3 | Lifecycle | Etapas del cliente (por defecto: New Lead, Hot Lead, Payment, Customer y Cold Lead como perdida), hasta 20 etapas, etapa por defecto para contactos nuevos | [Lifecycle](https://respond.io/help/workspace-settings/workspace-settings-lifecycle) (A) |
| R4 | Snippets | Respuestas guardadas que se insertan con `/` | [Responder mensajes](https://respond.io/help/quick-start/responding-to-messages) (A) |
| R5 | AI Assist | La IA sugiere una respuesta que la persona edita antes de enviar | [AI Assist](https://respond.io/help/workspace-settings/ai-assist) (A) |
| R6 | Agentes de IA | Responden, califican, pasan al vendedor, recomiendan productos, comparten datos de pago. Aprenden de PDF, DOCX, CSV y sitios web (máx. 20 MB por espacio) | [Fuentes de conocimiento](https://respond.io/help/ai-agents/managing-ai-knowledge-sources) (A), [respond.io](https://respond.io/) (A) |
| R7 | Flujos (Workflows) | Constructor visual de automatizaciones con pasos, condiciones y plantillas | [Workflows](https://respond.io/help/workflows/workflows-overview) (A) |
| R8 | Asignación automática | "Round robin" solo a personas en línea, con cola si nadie está disponible | [Paso Assign To](https://respond.io/help/workflows/step-assign-to) (A), [estrategia](https://respond.io/help/convert-leads/assignment-strategy-automatic-contact-distribution-load-balancing) (A) |
| R9 | Bienvenida y fuera de horario | Plantilla de flujo "Away Message with Business Hours" | [Bienvenida y ausencia](https://respond.io/help/quick-start/automated-welcome-and-away-messages) (A) |
| R10 | Comentarios internos | Notas que el cliente no ve, con @mención a compañeros y resumen con IA de hasta 100 mensajes | [Responder mensajes](https://respond.io/help/quick-start/responding-to-messages) (A) |
| R11 | Notas de cierre | Al cerrar un chat se elige una categoría y un resumen (la IA puede generarlo), para reportes | [Responder mensajes](https://respond.io/help/quick-start/responding-to-messages) (A) |
| R12 | Fusionar contactos | Une canales, mensajes y comentarios de dos contactos en uno | [Contactos](https://respond.io/help/contacts/contacts-overview) (A) |
| R13 | Importar contactos | CSV de hasta 200,000 filas; cada importación crea su etiqueta | [Importar](https://respond.io/help/contacts/contact-import) (A) |
| R14 | Etiquetas y campos | Etiquetas libres y campos personalizados (texto, lista, número, fecha…) | [Campos de contacto](https://respond.io/help/workspace-settings/contact-fields) (A) |
| R15 | Segmentos | Grupos de contactos filtrados, para difusiones | [Difusión simple](https://respond.io/help/broadcasts/sending-a-simple-broadcast) (A) |
| R16 | Difusiones | Plantilla aprobada a un segmento, con prueba y hora programada; también de catálogo (hasta 30 productos) | [Difusión simple](https://respond.io/help/broadcasts/sending-a-simple-broadcast) (A) |
| R17 | Respuestas a difusiones | Un flujo o agente de IA atiende a los que contestan la difusión | [ayuda](https://respond.io/help/broadcasts/handle-broadcast-replies-with-ai-agent-and-workflows) (A) |
| R18 | Anuncios Click-to-WhatsApp + CAPI | Detecta el chat que vino de un anuncio y le devuelve a Meta el evento "compra" (máx. 7 días, un evento por clic) | [Paso CAPI](https://respond.io/help/workflows/step-send-conversions-api-event) (A), [blog](https://respond.io/blog/click-to-whatsapp-ads) (M) |
| R19 | Respuesta privada a comentarios | Un mensaje privado por comentario, dentro de 7 días. **Sin respuesta pública** | [IG](https://respond.io/help/instagram/instagram-auto-private-replies) (A), [FB](https://respond.io/help/facebook-messenger/private-replies) (A), [roadmap](https://roadmap.respond.io/feature-request/p/instagram-enable-public-reply-to-comments) (M) |
| R20 | Catálogo de Meta | Enviar productos del catálogo de Meta | [Catálogo](https://respond.io/help/whatsapp/meta-product-catalog) (A) |
| R21 | Reportes de respuesta | Tiempo de primera respuesta y de resolución, por persona y equipo | [Respuestas](https://respond.io/help/dashboard-reporting/reports-responses) (A), [Usuarios](https://respond.io/help/dashboard-reporting/reports-users) (A) |
| R22 | Reporte de Lifecycle | Entradas y salidas del embudo (ganado, perdido) | [Reporte Lifecycle](https://respond.io/help/dashboard-reporting/reports-lifecycle) (A) |
| R23 | CSAT | Encuesta de satisfacción al cerrar, armada con un flujo | [CSAT](https://respond.io/help/retain-customers/send-csat-and-save-data) (A) |
| R24 | App móvil | Responder desde el teléfono | [Mensajes desde el móvil](https://respond.io/help/mobile-app/messaging-from-your-mobile) (A) |
| R25 | Llamadas | Pasar del chat a llamada (WhatsApp, Messenger, VoIP) | [respond.io](https://respond.io/) (A) |
| R26 | Citas | Agendar citas dentro de la conversación | [respond.io](https://respond.io/) (A) |
| R27 | Integraciones | Zapier, Make, API, webhooks, HTTP en flujos, SSO, varios espacios | [precios](https://respond.io/pricing) (A) |

---

## 2. Qué tiene cheke HOY (leído en el código)

- **Bandeja (Chat):** 3 canales, filtro por canal y Tienda, contador "No leídos" (`src/lib/unread.ts`, migración 0034), fotos y videos, documentos, notas de voz, ubicación de la tienda, producto del catálogo, Cobrar y Confirmar pago, respuestas rápidas con `/`, "Enviar plantilla" fuera de 24 h, reasignar (`src/app/(app)/chat/ChatView.tsx`, `AttachSheet.tsx`, `WhatsAppTemplateSender.tsx`).
- **Coexistencia:** `src/lib/coexistence.ts`, migración 0013.
- **chekelin:** vende solo (respuestas, fotos, pedido, datos de pago, comprobante), hace Traspaso, maneja Quejas y los avisos de 5 y 10 minutos; tope de ~15 mensajes sin pedido (`src/lib/bot.ts`). Aprende de "Lo que chekelin sabe" (`src/app/(app)/chekelin/`). Lee las transcripciones de las notas de voz (`src/lib/voiceTranscription.ts`).
- **Asignación:** `routeConversation()` le da el chat al Agente disponible con menos carga, luego al Gerente y luego al Dueño (`src/lib/bot.ts:220`). Ausente en `src/app/(app)/team/TeamView.tsx`. Funciona en todos los planes (`src/lib/plan.ts`).
- **Notas del chat:** solo las escribe chekelin (Traspaso, Queja, Pago, falta info), en una línea arriba del chat (`src/app/(app)/chat/NoteStrip.tsx`, `src/lib/conversationNotes.ts`).
- **chekeo:** kanban con etapas y valor del negocio (`src/app/(app)/chekeo/ChekeoView.tsx`, `src/lib/deals.ts`).
- **Contactos:** nombre, teléfono, Instagram, Facebook y notas; crear, editar y borrar (`src/app/(app)/contacts/ContactsView.tsx`). La columna `tags` existe (`src/lib/types.ts:10`) pero **la pantalla no la usa**.
- **Comentarios:** respuesta pública y privada, clasificación de chekelin (precio, queja, otro), cola de 750 por hora (`src/lib/comments.ts`, `src/app/(app)/comments/CommentsView.tsx`).
- **Plantillas:** plantillas internas y "Enviar a aprobación de WhatsApp" (`src/app/(app)/templates/`, `src/lib/whatsappTemplates.ts`). Sugerencias de chekelin cada semana (`src/lib/suggestions.ts`).
- **Catálogo:** productos con foto, precio en Lempiras, visible, copiar a otra tienda, enviar por chat (`src/app/(app)/inventory/InventoryView.tsx`).
- **Notificaciones:** se arman en vivo con datos reales, sin tabla de leídas (`src/lib/notifications.ts`); push al teléfono (`src/lib/push.ts`).
- **Analítica:** ventas cerradas, ganadas y perdidas, tasa de conversión, conversaciones por canal, embudo por etapa, por persona y por Tienda (`src/lib/analytics.ts`, `src/app/(app)/analytics/AnalyticsView.tsx`). **No mide tiempos de respuesta.**
- **Canales y Mi cuenta:** conectar WhatsApp, Instagram y Facebook, salud del token (`src/app/(app)/channels/`); tiendas, límite de chekelin y borrar cuenta (`src/app/(app)/account/AccountView.tsx`).

**No se encontró en el código** (búsqueda de `broadcast`, `difusi`, `referral`, `ctwa`, `merge`, `csat`, `first_response`, `business_hours`): difusiones, origen de anuncio, fusionar contactos, encuestas, tiempos de respuesta ni horario de atención.

---

## 3. Tabla de brechas

Valor = para una tienda hondureña que vende por chat. Tamaño = para un fundador solo, a medio tiempo: **S** (1–3 días), **M** (1–2 semanas), **L** (más de 2 semanas).

| respond.io | ¿cheke lo tiene? | Valor | Tamaño |
|---|---|---|---|
| R1 Bandeja unificada | **Sí** (`chat/ChatView.tsx`). Sin TikTok ni correo (`docs/research/tiktok-channel.md`) | Alto: es el producto | — |
| R2 Coexistence | **Sí** (`src/lib/coexistence.ts`) | Alto: nadie quiere soltar el teléfono | — |
| R3 Lifecycle | **Sí**, como chekeo (`chekeo/ChekeoView.tsx`) | Alto | — |
| R4 Snippets | **Sí**, Respuestas rápidas (`quick-replies/`) | Alto | — |
| R5 AI Assist (borrador para la persona) | **No.** chekelin responde solo; la persona no recibe borrador | Medio: ayuda cuando chekelin está apagado o en Traspaso | S |
| R6 Agente de IA | **Sí, y más fuerte** para vender: pedido, cobro y comprobante en Lempiras (`src/lib/bot.ts`). No lee PDF ni sitio web, solo "Lo que chekelin sabe" | Alto | — |
| R7 Constructor de flujos | **No** (las reglas están fijas en código) | Bajo: complejo para el usuario | L |
| R8 Asignación automática | **Sí** (menos carga + Ausente, `bot.ts:220`) | Alto | — |
| R9 Bienvenida y fuera de horario | **Parcial**: aviso automático de 5 min (`plan.ts`, `bot.ts`); chekelin se puede pausar por Tienda (`chekelin_off_until`). Sin horario de atención | Medio: el cliente escribe a las 10 p.m. | S |
| R10 Notas internas con @mención | **Parcial**: solo notas de chekelin (`NoteStrip.tsx`) | Alto con 2+ personas: "ya le cobré", "viene el sábado" | S–M |
| R11 Notas de cierre / cerrar chat | **Parcial**: hay ganado/perdido en chekeo, no hay "cerrar" ni motivo de pérdida | Medio: saber por qué se pierden ventas | S |
| R12 Fusionar contactos | **No** (el glosario lo promete: "merged by hand") | Medio: el mismo cliente escribe por WhatsApp e Instagram | M |
| R13 Importar contactos (CSV) | **No** (solo el catálogo se importa) | Medio: la tienda trae su lista de clientes | S |
| R14 Etiquetas | **Parcial**: columna `tags` sin pantalla (`types.ts:10`) | Alto: "mayorista", "compró en navidad", "VIP" | S |
| R15 Segmentos | **No** | Alto, pero solo junto con difusiones | S (con etiquetas) |
| R16 Difusiones con plantilla | **No** (ya existen plantillas aprobadas, `whatsappTemplatesServer.ts`) | **Alto**: promociones, "llegó mercadería", recuperar clientes. Cada mensaje de Promoción le cuesta a la tienda (`chat-feature-parity.md`, fila 24) | M |
| R17 Respuestas a difusiones con IA | **Parcial**: cuando el cliente contesta se abre la ventana y chekelin atiende como a cualquiera (B) | Alto | S (llega solo con R16) |
| R18 Origen del anuncio (CTWA) | **No** (no se lee `referral` del webhook) | **Alto**: las tiendas pagan anuncios "Enviar mensaje" y no saben cuál vende | S para mostrarlo; L para CAPI |
| R19 Respuesta privada a comentarios | **Sí, y mejor**: pública y privada (`src/lib/comments.ts`) | Alto | — |
| R20 Catálogo de Meta | **Sí** (`inventory/`, fase 6 de CLAUDE.md) | Alto | — |
| R21 Tiempo de primera respuesta | **No** (`analytics.ts` no lo calcula) | Alto para el Dueño: "¿quién deja esperando al cliente?" | S |
| R22 Reporte del embudo | **Sí** (embudo por etapa, `AnalyticsView.tsx`) | Alto | — |
| R23 CSAT | **No** | Bajo: el cliente no contesta encuestas; la venta es la métrica | S |
| R24 App móvil | **Sí** (app nativa y push: `src/lib/nativeApp.ts`, `src/lib/push.ts`) | Alto | — |
| R25 Llamadas | **No** (no funciona en Coexistencia: `chat-feature-parity.md`) | Bajo hoy | L |
| R26 Citas | **No** | Bajo: tiendas de ropa y productos no agendan | M |
| R27 Zapier, API, webhooks, SSO, varios espacios | **No** | Bajo para este cliente | L |

---

## 4. Las 5 que conviene construir antes del 10 de diciembre

Orden pensado para que cada una use la anterior. Total estimado: unas 4–5 semanas a medio tiempo.

1. **Etiquetas en Contactos y filtro por etiqueta (S).** La columna `tags` ya existe. Agregar chips en Contactos y en el detalle del contacto en Chat, y un filtro. Es la base de la difusión.
2. **Difusión con plantilla aprobada a una etiqueta (M).** Elegir plantilla APPROVED, etiqueta y hora; mostrar cuántos la recibirán y el costo aproximado en Lempiras **antes** de enviar; enviar solo a quien escribió antes (como el interruptor de respond.io, [ayuda](https://respond.io/help/broadcasts/sending-a-simple-broadcast)). Lo que contestan entra al Chat y chekelin lo atiende. Es la venta de diciembre: "llegó lo de navidad". **Confirmar (B)** que Meta permite plantillas de Promoción por API en números con Coexistencia; lo que está desactivado es la lista de difusión de la app.
3. **"Llegó por anuncio" en el chat y en Analítica (S).** Guardar el `referral` que manda el webhook cuando el chat viene de un anuncio Click-to-WhatsApp o de Instagram/Facebook, mostrar el nombre del anuncio en el chat y contar ventas ganadas por anuncio. Dejar CAPI para después.
4. **Notas internas del equipo (S–M).** Que una persona escriba en la misma línea de `NoteStrip.tsx` ("ya le cobré", "pasa el sábado"). Mencionar a alguien con @ y avisarle por push (`src/lib/push.ts`). Solo importa con 2+ personas, pero es lo primero que pide un Dueño con empleados.
5. **Tiempo de primera respuesta por persona en Analítica (S).** Ya existe la vista "Por persona". Agregar "tiempo promedio de respuesta" y "chats que esperaron más de 10 min", contando solo respuestas de personas, no de chekelin.

Quedan cerca: horario de atención (R9, S), importar contactos por CSV (R13, S) y fusionar contactos (R12, M).

---

## 5. Lo que NO hay que copiar

- **Constructor visual de flujos (R7).** Para respond.io es el centro del producto; para una tienda hondureña es una pantalla que nadie va a configurar. cheke ya decide por la tienda (asignación, Traspaso, avisos de 5 y 10 min) y chekelin cubre el resto.
- **Campos personalizados con tipos (R14).** Basta con etiquetas y notas.
- **20 etapas configurables y "etapas perdidas" (R3).** chekeo con etapas fijas es más claro.
- **Notas de cierre obligatorias con categorías (R11).** Como mucho, un motivo opcional al marcar "perdido".
- **Cobro por contactos activos y créditos de IA ([precios](https://respond.io/pricing)).** Es difícil de entender y asusta. cheke ya usa un precio en Lempiras con un límite claro de chekelin (`src/lib/plan.ts`).
- **Advanced/Enterprise:** varios espacios de trabajo, SSO, ocultar teléfonos, webhooks, HTTP en flujos, API, Zapier/Make, canales a la medida.
- **CSAT (R23), citas (R26) y llamadas VoIP (R25).** Poco valor para vender ropa, comida o productos por chat, y las llamadas no funcionan en Coexistencia.
- **CAPI (R18) antes de lanzar.** Necesita 50 eventos para que Meta optimice ([ayuda](https://respond.io/help/workflows/step-send-conversions-api-event)), algo que una tienda pequeña tarda en juntar. Primero mostrar el origen del anuncio.

---

## Fuentes

- Precios: https://respond.io/pricing
- Inicio: https://respond.io/
- Lifecycle: https://respond.io/help/workspace-settings/workspace-settings-lifecycle · https://respond.io/help/dashboard-reporting/reports-lifecycle
- Responder mensajes (snippets, comentarios, notas de cierre): https://respond.io/help/quick-start/responding-to-messages
- AI Assist: https://respond.io/help/workspace-settings/ai-assist
- Agentes de IA: https://respond.io/help/ai-agents/managing-ai-knowledge-sources · https://respond.io/help/ai-agents/getting-started-with-ai-agents
- Workflows: https://respond.io/help/workflows/workflows-overview · https://respond.io/help/workflows/step-assign-to · https://respond.io/help/convert-leads/assignment-strategy-automatic-contact-distribution-load-balancing · https://respond.io/help/quick-start/automated-welcome-and-away-messages
- Contactos: https://respond.io/help/contacts/contacts-overview · https://respond.io/help/contacts/contact-import · https://respond.io/help/workspace-settings/contact-fields
- Difusiones: https://respond.io/help/broadcasts/sending-a-simple-broadcast · https://respond.io/help/broadcasts/handle-broadcast-replies-with-ai-agent-and-workflows
- Anuncios y CAPI: https://respond.io/help/workflows/step-send-conversions-api-event · https://respond.io/blog/click-to-whatsapp-ads
- Comentarios: https://respond.io/help/instagram/instagram-auto-private-replies · https://respond.io/help/facebook-messenger/private-replies · https://roadmap.respond.io/feature-request/p/instagram-enable-public-reply-to-comments
- Catálogo: https://respond.io/help/whatsapp/meta-product-catalog
- WhatsApp y Coexistence: https://respond.io/help/whatsapp · https://respond.io/blog/how-to-use-whatsapp-business-app-and-api-at-the-same-time
- Reportes: https://respond.io/help/dashboard-reporting/reports-responses · https://respond.io/help/dashboard-reporting/reports-users
- CSAT: https://respond.io/help/retain-customers/send-csat-and-save-data
- App móvil: https://respond.io/help/mobile-app/messaging-from-your-mobile
