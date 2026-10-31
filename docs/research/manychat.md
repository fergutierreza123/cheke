# ManyChat: qué hace bien, cómo se vende y qué le sirve a cheke

Investigación del 30 de octubre de 2026. ManyChat es la herramienta más conocida para **automatizar mensajes de Instagram** ("comentá PRECIO y te mando la info"). Este documento explica qué ofrece, cuánto cuesta, cómo se promociona, qué tiene para **negocios de servicios** (salones, clínicas, gimnasios, consultores) y qué vale la pena copiar en cheke. Al final hay una lista ordenada de ideas.

Fuentes: solo material de ManyChat. Su centro de ayuda (`help.manychat.com`), su blog y sus páginas de producto (`manychat.com`), su comunidad oficial y sus anuncios de producto (`community.manychat.com/product-updates`), su tienda de apps (`apps.manychat.com`), su app en la App Store y sus cuentas oficiales. El código de cheke se leyó en la carpeta `src/` el mismo día.

**Lo que no se pudo ver:**
- **manychat.com y help.manychat.com bloquean la lectura automática** (responden "403 prohibido"). De esas páginas solo se leyó el resumen que da el buscador web. Por eso casi todo lo que viene de ahí tiene confianza **M**, no A. La comunidad y la tienda de apps sí se leyeron completas.
- **Página de precios en vivo.** Se leyó lo que el buscador muestra de `manychat.com/pricing` y de los artículos de ayuda de cada plan. Los precios de un país a otro pueden variar (ManyChat lo cambia país por país).
- **YouTube, TikTok, Facebook y Google Play:** la página abrió vacía para la herramienta. **X (Twitter):** pidió pago para leer (error 402). No se usan como fuente salvo el nombre de la cuenta.
- **Plantillas por dentro.** Se vio la lista de plantillas y su descripción, no los pasos de cada una.

**Confianza:**
- **A (alta):** leído completo en una página de ManyChat (comunidad, tienda de apps, App Store) o en el código de cheke.
- **M (media):** de ManyChat, pero leído solo a través del buscador, o es material de venta (blog, casos de éxito).
- **B (baja):** inferencia mía, o comentario de un usuario.

---

## Resumen

1. **ManyChat es un constructor de automatizaciones, no una bandeja.** Su fuerte es que un comentario, una respuesta a una historia, un nuevo seguidor o un link dispare un mensaje automático en Instagram. Su lema en Instagram es literal: *"The OG's at 'comment WORD for the link'"* ("los originales del 'comentá PALABRA y te mando el link'") ([instagram.com/manychat](https://www.instagram.com/manychat/), A).
2. **Su cliente es el creador de contenido**, no la tienda. LinkedIn: *"Built for creators who run like businesses"*, más de 1 millón de creadores en más de 170 países ([linkedin.com/company/manychat](https://www.linkedin.com/company/manychat), A). Los casos de éxito son coaches, cursos en línea y gimnasios ([manychat.com/blog/success-stories](https://manychat.com/blog/success-stories/), M).
3. **Desde el 2 de marzo de 2026 cobra por "contactos activos"** (personas que escribieron o recibieron algo en el mes). Gratis: 25. Essential: US$17/mes (250, **sin WhatsApp**). Pro: US$39/mes (2,500, con WhatsApp e IA incluida). Business: US$99/mes. Cada persona extra en la bandeja cuesta US$25 ([Pro plan](https://help.manychat.com/hc/en-us/articles/25800228332572-Pro-plan), M).
4. **Para negocios de servicios ManyChat no tiene agenda propia.** Tiene un selector de fecha que **no sabe qué horas están libres**, y para reservar de verdad hay que conectar Calendly, Google Sheets, Zapier o una app de terceros que se paga aparte ([Data Collection block](https://help.manychat.com/hc/en-us/articles/14281167138588-Data-Collection-block-and-Custom-User-Fields), M; [Calendly App by ManyApps](https://apps.manychat.com/calendly-app), A). Este es un hueco real que cheke puede llenar de forma simple.
5. **Para cheke:** copiar 5 cosas pequeñas: **palabra clave por publicación** en Comentarios, **link y código QR** para que el cliente escriba, **botones de inicio** en WhatsApp, **recordatorio de cita** con Plantilla de Utilidad y **"pedir cita" dentro de chekelin**. No copiar el constructor de flujos.

---

## 1. Qué hace ManyChat, canal por canal

| Qué | Cómo lo hace ManyChat | Fuente |
|---|---|---|
| Canales | Instagram, Facebook Messenger, WhatsApp, TikTok, Telegram, SMS y correo. La app del teléfono junta los mensajes de todos | [App Store](https://apps.apple.com/my/app/manychat/id1460129210) (A) |
| **Comentario → mensaje (Instagram y Facebook)** | Un disparador "el usuario comenta tu publicación o reel". Se elige **una publicación, todas, o "la próxima que publiques"**. Puede pedir palabras exactas, excluir palabras o responder a cualquier comentario | [Guía de comentarios](https://manychat.com/blog/the-ultimate-guide-for-instagram-comment-automation/) (M) |
| Reglas de la palabra clave | "Es exactamente", "contiene", "palabra completa" y "empieza con" | [Instagram Live Comments Trigger](https://help.manychat.com/hc/en-us/articles/14281275933724-Instagram-Live-Comments-Trigger) (M) |
| **Respuesta a historias** | Se activa con cualquier respuesta o reacción a una historia (o solo con ciertas palabras), en todas o en una historia de las últimas 24 h. Se puede esperar hasta 10 minutos antes de contestar para que parezca natural | [Story Reply Trigger](https://help.manychat.com/hc/en-us/articles/13556930006428-Instagram-Story-Reply-Trigger) (M) |
| **Nuevo seguidor → mensaje** ("Follow to DM") | Saluda solo a quien empieza a seguir la cuenta (con cupón, regalo o pregunta). Una sola por cuenta, en beta, Meta decide qué cuentas lo tienen. Desde octubre de 2025 | [Follow to DM](https://community.manychat.com/product-updates/turn-every-follow-into-a-conversation-introducing-follow-to-dm-7628) (A) |
| Premiar a quien comparte | Mensaje a quien comparte tu publicación en su historia (noviembre de 2025) | [Product updates](https://community.manychat.com/product-updates) (A) |
| Instagram en vivo y anuncios | Disparadores para comentarios en un en vivo y para quien escribe desde un anuncio | [Live Comments](https://help.manychat.com/hc/en-us/articles/14281275933724-Instagram-Live-Comments-Trigger), [Ads Trigger](https://help.manychat.com/hc/en-us/articles/14281321942428-Instagram-Ads-Trigger) (M) |
| **Links y QR** ("Ref URL") | Un link (y su QR) que abre el chat con un texto ya escrito y arranca una automatización. Hay para WhatsApp, Messenger, Instagram y TikTok | [WhatsApp Ref URL](https://help.manychat.com/hc/en-us/articles/20083006204444-WhatsApp-Ref-URL-Trigger) (M) |
| **Botones de inicio en WhatsApp** ("Ice Breakers") | Hasta 4 botones que el cliente ve al abrir el chat por primera vez, de 80 letras, sin emojis, cada uno con su respuesta | [Ice Breakers for WhatsApp](https://help.manychat.com/hc/en-us/articles/15406423857052-Ice-Breakers-for-WhatsApp) (M) |
| WhatsApp masivo | Difusiones con Plantillas aprobadas. ManyChat cobra lo que cobra Meta, sin recargo, desde una billetera prepagada | [WhatsApp pricing guide](https://help.manychat.com/hc/en-us/articles/14281380243740-WhatsApp-pricing-guide), [Broadcasting](https://help.manychat.com/hc/en-us/articles/14281461353756-Broadcasting-in-WhatsApp) (M) |
| Anuncios a WhatsApp | Desde octubre de 2026: quien escribe desde un anuncio abre **7 días** para responder y 7 días de mensajes gratis (antes 24 h y 3 días). Llega poco a poco, según Meta | [Click-to-WhatsApp 7 días](https://community.manychat.com/product-updates/your-click-to-whatsapp-ads-now-unlock-7-days-of-free-messaging-10977) (A) |
| TikTok | Desde enero de 2025 (EE. UU. desde noviembre de 2025, no en Europa). Palabra clave por mensaje, captar datos, bandeja, preguntas sugeridas, link y QR. **Comentario → mensaje no existe en TikTok** | [TikTok en EE. UU.](https://community.manychat.com/product-updates/tiktok-automations-are-now-available-in-the-u-s-7729) (A); [TikTok auto-dm](https://community.manychat.com/general-q-a-43/tiktok-auto-dm-from-comments-6480) (B) |
| **Flow Builder** | Un lienzo donde se dibujan pasos: mensaje, pregunta, espera ("Smart Delay"), condición, acción, sorteo de caminos (hasta 12). Es lo que todo lo demás usa por dentro | [Randomizer 12 paths](https://community.manychat.com/product-updates/randomizer-now-supports-up-to-12-paths-9481) (A); [Quiz guide](https://manychat.com/blog/how-to-create-a-quiz-in-manychat/) (M) |
| Automatizaciones rápidas | Plantillas de un clic en la pestaña de inicio ("Say hi to new followers" y otras), con un "Go Live" | [Follow to DM](https://community.manychat.com/product-updates/turn-every-follow-into-a-conversation-introducing-follow-to-dm-7628) (A) |
| Cobrar | Botón de compra con Stripe o PayPal dentro del chat, y catálogo en la bandeja para cobrar a mano. Requiere plan pagado | [Stripe](https://help.manychat.com/hc/en-us/articles/14281204933532-How-to-connect-Stripe-to-Manychat), [Selling via Inbox](https://help.manychat.com/hc/en-us/articles/14281089183260-Selling-products-via-Inbox) (M) |

### Inteligencia artificial

| Qué | Cómo lo hace ManyChat | Fuente |
|---|---|---|
| **AI Replies + Knowledge** | El dueño pega links y textos ("lo que la IA sabe") y la IA contesta preguntas frecuentes en mensajes y comentarios. Desde febrero de 2026 puede **leer la página web** y mostrar qué sabe | [AI hub](https://community.manychat.com/product-updates/your-new-ai-hub-beta-is-live-smarter-replies-faster-setup-same-manychat-magic-7631), [Knowledge v2](https://community.manychat.com/product-updates/knowledge-v2-import-website-content-and-review-what-your-ai-knows-9132) (A) |
| **Pase a una persona** | Se fija un nivel de confianza: si la IA no está segura, el chat va al equipo. Un tablero cuenta respuestas, pases y metas | [AI hub](https://community.manychat.com/product-updates/your-new-ai-hub-beta-is-live-smarter-replies-faster-setup-same-manychat-magic-7631) (A) |
| AI Comments y AI Goals | La IA responde comentarios positivos para iniciar conversación, y lleva la conversación hacia una meta (dar un link, pedir datos, ganar seguidores) | ídem (A) |
| **AI Behavior** | Rol, tono de la marca y temas prohibidos. Los **pre-llena leyendo la biografía y comentarios de Instagram**; se prueba en un "Playground" antes de activar | [AI Behavior](https://community.manychat.com/product-updates/your-ai-now-speaks-your-language-meet-ai-behavior-9491), [AI Playground](https://community.manychat.com/product-updates/ai-playground-test-your-ai-detect-knowledge-gaps-and-go-live-with-confidence-9189) (A) |
| AI Step e Intenciones | Un paso de IA dentro de un flujo (para pedir datos conversando) y disparadores por **intención** ("el cliente pregunta por precios") en vez de palabra exacta. **No usan el mismo conocimiento** que AI Replies, cosa que confunde a los usuarios | [AI Step](https://help.manychat.com/hc/en-us/articles/14281187288860-Manychat-AI-Step), [Intention Recognition](https://help.manychat.com/hc/en-us/articles/14281187229468-Manychat-AI-Intention-Recognition) (M); [Highly confused about Manychat AI](https://community.manychat.com/general-q-a-43/highly-confused-about-manychat-ai-8022) (B) |
| Asistente que arma flujos | Le dices el objetivo y propone la automatización (captar datos, encuestas, **reservar citas**) | [AI Flow Builder assistant](https://help.manychat.com/hc/en-us/articles/14281200017948-Manychat-AI-Flow-Builder-assistant) (M) |

### Bandeja ("Inbox", antes "Live Chat")

- Junta chats manuales y automáticos. Tiene filtro de **No leídos**, por etiqueta o por campo, **etiquetas de bandeja** (beta, noviembre de 2025) y **posponer** un chat para que vuelva después ([Inbox updates](https://community.manychat.com/product-updates/keep-conversations-organized-with-new-inbox-updates-9120), A).
- Asignar a una persona, asignación automática, grupos de equipo y **notas con @mención** ([Manychat Inbox](https://help.manychat.com/hc/en-us/articles/14281070478748-Manychat-Inbox), [auto-assignment](https://help.manychat.com/hc/en-us/articles/14281072676764-Conversations-auto-assignment), [Mobile App](https://help.manychat.com/hc/en-us/articles/19858378137756-Manychat-Mobile-App), M).
- **Cada persona que responde necesita un "asiento" de bandeja** que se paga aparte (US$25 en Pro) ([Pro plan](https://help.manychat.com/hc/en-us/articles/25800228332572-Pro-plan), M).
- En el teléfono no se pueden crear etiquetas, y los usuarios reportan que el filtro "asignados a mí" se borra cada vez que abren la app ([Mobile App](https://help.manychat.com/hc/en-us/articles/19858378137756-Manychat-Mobile-App), M; [Inbox updates, comentarios](https://community.manychat.com/product-updates/keep-conversations-organized-with-new-inbox-updates-9120), B).

### Integraciones

- **Nativas:** Google Sheets, Zapier (a más de 7,000 apps), HubSpot, Klaviyo, ActiveCampaign, Mailchimp, Kit, Flodesk, Hotmart, la API de Conversiones de Meta, y ChatGPT, Claude y DeepSeek ([Integrations](https://help.manychat.com/hc/en-us/sections/13556926216988-Integrations), M).
- **Calendly y Google Calendar no son nativos.** Google Calendar se pide en su tablero de sugerencias "porque ya tienen Google Sheets" ([feedback: Google Calendar](https://feedback.manychat.com/features/p/google-calendar-integration), M; hoy esa dirección redirige a la comunidad y no se pudo leer). Calendly existe como **app de un tercero (ManyApps), de pago** ([Calendly App](https://apps.manychat.com/calendly-app), A).
- **Shopify:** la comunidad dice que ya no hay integración nativa; el blog viejo habla de "carrito abandonado". Se contradicen ([ManyChat + Shopify](https://community.manychat.com/general-q-a-43/manychat-shopify-integration-5884), B).

---

## 2. Precios (modelo nuevo desde el 2 de marzo de 2026)

Se cobra por **contacto activo**: una persona que en el mes te escribió, comentó, respondió una historia o recibió algo por automatización, IA, difusión o bandeja. Cuenta una vez al mes aunque escriba 50 veces. Los contactos guardados que no hacen nada no cuentan ([Active Contacts](https://help.manychat.com/hc/en-us/articles/25800323349020-Active-Contacts), M).

| Plan | Precio mensual (anual) | Contactos activos | Notas | Fuente |
|---|---|---|---|---|
| Free | US$0 | 25 | ManyChat dice que es "de prueba", no para un negocio | [Free plan](https://help.manychat.com/hc/en-us/articles/25800197498652-Free-plan), [Top 4 complaints](https://manychat.com/blog/manychat-pricing/) (M) |
| Essential | US$17 (US$14) | 250 | 2 personas, 2 canales, **sin WhatsApp, SMS ni correo**. Extra: US$0.10 por contacto | [Essential plan](https://help.manychat.com/hc/en-us/articles/25800276116508-Essential-plan) (M) |
| Pro | US$39 (US$29) | 2,500 | 3 canales con WhatsApp, **IA incluida**, US$25 por persona extra. Extra: US$0.05 | [Pro plan](https://help.manychat.com/hc/en-us/articles/25800228332572-Pro-plan) (M) |
| Business | US$99 (US$69) | 7,500 | 5 personas, canales ilimitados. Extra: US$0.025 | [Business plan](https://help.manychat.com/hc/en-us/articles/25800254159900-Business-plan) (M) |
| Advanced | US$139 (anual) | 25,000 | Precio de exceso a la medida | [Subscription guide](https://help.manychat.com/hc/en-us/articles/25800347122716-Manychat-subscription-How-to-choose-the-right-one-for-you) (M) |

- **WhatsApp se paga aparte**, por cada Plantilla entregada, a la tarifa de Meta, desde una billetera ([WhatsApp pricing guide](https://help.manychat.com/hc/en-us/articles/14281380243740-WhatsApp-pricing-guide), M).
- **Comparado con cheke (B, cambio aproximado de L26 por dólar):** Pro sale en ~L1,000 al mes con 1 persona; con 2 personas más, ~L2,300. cheke Plus cuesta L1,590 con el equipo incluido y en Lempiras. Pero ojo: el **Pro de ManyChat incluye 2,500 contactos activos**, mientras cheke cuenta conversaciones de chekelin (40 / 80 / 200 al mes según `src/lib/plan.ts`, A). Son cosas distintas, pero un vendedor de ManyChat diría "2,500 contra 80".
- El cambio de precios generó quejas. ManyChat escribió su propio artículo para responder las 4 principales: el gasto si una publicación se hace viral, el cobro por exceso, el plan gratis de solo 25 y el viejo cobro aparte de IA (US$29) ([Top 4 complaints](https://manychat.com/blog/manychat-pricing/), M). Hay cuentas viejas que todavía ven los planes anteriores ([comunidad: solo veo el plan de $95](https://community.manychat.com/general-q-a-43/how-can-i-switch-to-the-new-active-contacts-pricing-only-old-95-mo-plan-is-available-in-my-account-10102), B).

---

## 3. Cuentas oficiales y cómo se promocionan

| Canal | Dirección | Qué se vio | Fuente |
|---|---|---|---|
| Instagram | instagram.com/manychat | Verificada, **668 mil seguidores**. Biografía: "The OG's at 'comment WORD for the link' / Automation by creators, for creators / Official Meta Business Partners". Publica reels y carruseles seguido (último: octubre de 2026); los textos no se pudieron leer | [Instagram](https://www.instagram.com/manychat/) (A) |
| LinkedIn | linkedin.com/company/manychat | ~35,800 seguidores, 201–500 empleados, sede en Austin, oficinas en Barcelona, Ereván, São Paulo y Ámsterdam. Publica humor de creadores ("evaluaciones de desempeño" donde el jefe es "El Algoritmo"), historias de creadores y cultura interna | [LinkedIn](https://www.linkedin.com/company/manychat) (A) |
| Facebook | facebook.com/manychat | ~200 mil seguidores según el buscador. La página no se pudo leer | [Facebook](https://www.facebook.com/@Manychat/) (no se pudo abrir) |
| YouTube | youtube.com/@manychat | El sitio lo enlaza en su menú. La página abrió vacía | (no se pudo abrir) |
| TikTok | tiktok.com/@manychat | Abrió vacía | (no se pudo abrir) |
| X (Twitter) | x.com/manychat | Pidió pago para leer | (no se pudo abrir) |
| **Comunidad** | community.manychat.com | Foro propio que **reemplazó al grupo de Facebook**. ~35 mil creadores, con secciones en **español** y portugués, "expertos" de la comunidad que responden y una sección de anuncios de producto | [¿es la nueva comunidad?](https://community.manychat.com/general-q-a-43/is-this-the-new-manychat-community-or-is-this-the-old-facebook-group-1277), [Bienvenida](https://community.manychat.com/welcome-to-the-manychat-community-41) (M) |
| Programa de socios | manychat.com/agency | Afiliados y agencias ganan **30% a 50% de cada cliente que traen, por 12 meses**, según cuántos lleven. Hay un directorio de agencias | [Partner Program FAQ](https://help.manychat.com/hc/en-us/articles/20518248843164-Manychat-Partner-Program-FAQ), [Agency](https://manychat.com/agency/) (M) |
| Curso y certificación | course.manychat.com | Curso gratis en video. La certificación oficial **se cerró**, según la comunidad | [course.manychat.com](http://course.manychat.com/), [Certificaciones](https://community.manychat.com/preguntas-y-respuestas-58/certificaciones-manychat-595) (M/B) |

**Tácticas de marketing que se repiten:**
1. **Se usan a sí mismos como demostración.** La biografía de Instagram es la técnica "comentá PALABRA y te mando el link". El cliente aprende el producto al usarlo como cliente (A).
2. **Casos de éxito con números en dólares**: "un coach generó US$180 mil", "un gimnasio vendió €10 mil en membresías en 30 días" ([Lauren Tickner](https://manychat.com/blog/lauren-tickner/), [LEO](https://manychat.com/blog/leo-lassistente-virtuale/), M).
3. **Un ejército de creadores que enseñan ManyChat** en YouTube, casi todos con link de afiliado (los videos de "tutorial 2026" del buscador no son de ManyChat sino de afiliados) ([búsqueda en YouTube](https://www.youtube.com/watch?v=QX0-zXKbZkk), B). El programa de 30–50% lo alimenta.
4. **Comunidad con "expertos"** que responden gratis y comparten plantillas, en el idioma del usuario (A).
5. **Humor de creadores** en LinkedIn, no funciones del producto (A).

---

## 4. Negocios de servicios: citas, reservas y cotizaciones

| Qué | Cómo lo hace ManyChat | Fuente |
|---|---|---|
| Plantillas para salones y clínicas | Plantillas de Messenger **"Take Reservations"** (salones, spas, salud y belleza) y **"Quote Customers"** (cotizar), más "Qualify Leads", "Our Locations" y "Contact Us". El artículo de salones es de la época del COVID | [Take Reservations](https://manychat.com/messenger-marketing-examples/take-reservations), [Salones](https://manychat.com/blog/salon-marketing-ideas/), [Ejemplos: belleza](https://manychat.com/messenger-marketing-examples?industry=salons-spas-health-and-beauty) (M) |
| Mensaje de bienvenida de una clínica | El ejemplo del centro de ayuda: un botón **"Agendar una cita"** que lleva a escoger fecha y hora | [Welcome Message](https://help.manychat.com/hc/en-us/articles/14281185974940-Welcome-Message-in-Manychat) (M) |
| **Selector de fecha** | Un tipo de respuesta "Fecha" o "Fecha y hora" que abre un calendario. Solo en Pro. **No sabe qué horas están ocupadas**: hay un pedido en su tablero para que muestre la disponibilidad | [Data Collection block](https://help.manychat.com/hc/en-us/articles/14281167138588-Data-Collection-block-and-Custom-User-Fields), [feedback: date picker](https://feedback.manychat.com/features/p/date-and-time-picker-be-customizable-for-reservations) (M) |
| Reservar con agenda real | No hay agenda propia. Opciones: (a) mandar el link de Calendly, (b) una app de terceros de pago que reserva, recuerda y reagenda con Calendly, (c) Zapier o Make hacia Calendly o Google Calendar, (d) una hoja de Google Sheets con horas libres | [Calendly App](https://apps.manychat.com/calendly-app), [Calendar Link Generator](https://apps.manychat.com/ical-calendar-link-generator) (A); [blog de Zapier](https://blog.manychat.com/new-manychat-and-zapier-integration/) (M) |
| Lo que dice la comunidad en español | Alguien preguntó cómo dar citas por Instagram mostrando solo horas libres. La respuesta elegida: **guardar las horas en Google Sheets** y que ManyChat las lea; conectar Google Calendar directo "es complejo" | [Automatización de citas con Google Calendar](https://community.manychat.com/preguntas-y-respuestas-58/automatizacion-de-citas-desde-intagram-con-google-calendar-6812) (A) |
| Calificar al cliente | Comentario con palabra clave → mensaje → 2 o 3 preguntas (presupuesto, fecha, tipo) → etiqueta → link para agendar | [Lead qualification funnel](https://manychat.com/blog/lead-qualification-funnel/) (M) |
| **Recordatorios** | En **Instagram y Messenger no se pueden mandar mensajes automáticos después de 24 h**; una persona puede escribir a mano hasta 7 días después. En **WhatsApp sí**, con una Plantilla aprobada (que se paga) | [Messaging windows](https://help.manychat.com/hc/en-us/articles/23358636027932-Understanding-messaging-windows), [Outside the 24-hour window](https://help.manychat.com/hc/en-us/articles/14281199732892-How-to-send-messages-outside-the-24-hour-and-7-day-windows-in-Messenger-and-Instagram) (M) |
| Cobrar un anticipo | Botón de Stripe o PayPal. **Ninguno de los dos sirve bien para cobrar en Lempiras a un salón hondureño** (B) | [Stripe](https://help.manychat.com/hc/en-us/articles/14281204933532-How-to-connect-Stripe-to-Manychat) (M) |

**Conclusión (B):** para un salón, ManyChat es un **embudo para conseguir el link de la cita**, no una agenda. El dueño tiene que armar el flujo, pagar Calendly o una app extra, y la cita queda fuera del chat. En Honduras, donde la cita se cuadra hablando ("¿tiene para el sábado en la tarde?"), una IA que pregunta y anota la cita en el mismo chat le gana a un flujo de botones.

---

## 5. Debilidades y quejas

**Límites que la misma ManyChat documenta (M, centro de ayuda):**
- La automatización por comentario solo se activa con el **primer comentario** de cada persona en esa publicación ([Post and Reel Comments trigger](https://help.manychat.com/hc/en-us/articles/14281316989724-Instagram-Post-and-Reel-Comments-trigger)).
- El primer mensaje privado después de un comentario solo puede llevar **un bloque**, sin preguntas ni listas (ídem).
- En Instagram: textos de máximo 640 letras con botones, links "Ref URL" que solo funcionan en la app del teléfono, y cambiar la página de Facebook conectada **apaga las automatizaciones** hasta que soporte las reconecte ([Instagram troubleshooting](https://help.manychat.com/hc/en-us/articles/14281308423452-Instagram-automation-troubleshooting)).
- Fuera de 24 h no hay automatización en Instagram ni Messenger ([Messaging windows](https://help.manychat.com/hc/en-us/articles/23358636027932-Understanding-messaging-windows)).
- No funciona en grupos de Facebook ni en perfiles personales ([ManyChat & grupos de Facebook](https://community.manychat.com/general-q-a-43/manychat-private-facebook-groups-1946), M).

**Lo que dicen los usuarios (B, son reseñas):**
- **App Store: 4.3 de 5 con 2,200 calificaciones.** Quejas: la app y la web no hacen lo mismo ("algunas cosas se hacen en la app y no en la web y al revés"), no se pueden programar mensajes en la app, errores genéricos de "algo salió mal", soporte lento y **funciones que antes eran básicas ahora piden un plan más caro** ([App Store](https://apps.apple.com/my/app/manychat/id1460129210), reseñas).
- Comunidad: la IA confunde porque AI Replies, AI Step e Intenciones se configuran en lugares distintos ([Highly confused](https://community.manychat.com/general-q-a-43/highly-confused-about-manychat-ai-8022)); piden poder detener la IA cuando una persona ya está hablando ([Stop AI interrupting](https://community.manychat.com/general-q-a-43/how-to-stop-manychat-ai-agent-from-interrupting-live-conversations-6813)); "Follow to DM" dejó de funcionar a varios ([Follow to DM, comentarios](https://community.manychat.com/product-updates/turn-every-follow-into-a-conversation-introducing-follow-to-dm-7628)).

**Debilidades frente a cheke (B):**
- Está pensado para **un creador que publica**, no para un equipo de 3 que atiende. Pagar asiento por persona castiga justamente al negocio con empleados.
- Precio en dólares, tarjeta internacional, todo en inglés en la parte de configuración, y WhatsApp cobrado por mensaje desde una billetera.
- **Armar un flujo es trabajo de técnico.** Por eso existe un mercado de agencias y plantillas de pago (hay plantillas de clínicas dentales y estéticas a la venta en la comunidad en portugués: [Templates Manychat](https://community.manychat.com/perguntas-e-respostas-pt-61/templates-manychat-331)).
- No tiene catálogo de WhatsApp, chekeo de ventas ni confirmación de pago por transferencia como cheke.

---

## 6. Qué podemos adoptar en cheke

Ordenado por **impacto para un negocio hondureño pequeño** entre **esfuerzo para un desarrollador a medio tiempo** (S = días, M = 1–2 semanas, L = más). La columna "cheke hoy" se revisó en el código.

### Para todos los negocios

| # | Qué hace ManyChat | cheke hoy | Versión más pequeña para cheke | Esfuerzo |
|---|---|---|---|---|
| 1 | **Palabra clave por publicación** ("comentá PRECIO"), con "solo esta publicación / todas / la próxima" | Comentarios ya responde en privado, pero **decide chekelin** si es precio, queja u otro (`classifyCommentByKeywords` y `defaultPrivateReply` en `src/lib/comments.ts`, A). No hay palabra elegida por el dueño ni texto por publicación | En Comentarios: "Si alguien comenta **[palabra]** en **[esta publicación / todas]**, mandarle: [texto + foto o producto]". Una regla por publicación, sin flujo. Lo demás sigue igual con chekelin | S–M |
| 2 | **Link y código QR** que abre el chat con un texto ya escrito ("Ref URL") | No hay. `wa.me` solo se usa para compartir Invitaciones (`src/app/(app)/team/TeamView.tsx`, A) | En Canales: botón "Tu link y QR" por canal (`wa.me/<número>?text=Hola, vi su anuncio`, `ig.me/m/<cuenta>`, `m.me/<página>`) para pegar en la biografía, el mostrador o una tarjeta. Solo generar el link y el QR, sin automatización | S |
| 3 | **Botones de inicio en WhatsApp** (hasta 4) | No hay (no aparece `ice_breaker` en el código, A) | En "Lo que chekelin sabe": elegir hasta 4 preguntas ("Ver catálogo", "Precios", "Ubicación", "Pedir cita") que se suben a WhatsApp como botones de inicio. chekelin contesta lo que toquen | S–M |
| 4 | **IA que lee la web/biografía** para llenar lo que sabe ("AI Behavior", "Knowledge v2") | El Dueño escribe a mano "Lo que chekelin sabe" (`src/app/(app)/chekelin/`, A) | Un botón "Llenar con mi Instagram": leer la biografía y los textos de las últimas publicaciones y proponer un borrador que el Dueño revisa | M |
| 5 | **"Playground"**: probar la IA antes de activarla | **Ya existe "Modo prueba"** en Chat: la persona escribe como cliente y ve qué contesta chekelin, solo en chats de ejemplo y sin mandar nada a Meta (`src/lib/modoPrueba.ts`, A). No está en la pantalla de chekelin | Un botón "Probar a chekelin" en la pantalla de "Lo que chekelin sabe" que abra ese mismo Modo prueba. Solo un acceso nuevo | S |
| 6 | Mensaje a quien escribe desde un anuncio, con **7 días** de ventana | cheke ya guarda el anuncio (`referral_*`, `src/lib/adReferral.ts`, A) y la ventana de 24 h (`window_expires_at`, A) | Cuando Meta lo active para el número, mostrar "Puedes responder hasta el [día]" en vez de 24 h en esos chats. Solo cambiar el cálculo de la ventana | S (cuando llegue) |

### Para negocios de servicios (salones, clínicas, gimnasios, consultores)

| # | Qué hace ManyChat | cheke hoy | Versión más pequeña para cheke | Esfuerzo |
|---|---|---|---|---|
| S1 | Plantilla "Take Reservations" y selector de fecha (sin saber qué horas están libres) | **Nada de citas.** chekelin está pensado para vender productos (pedido, pago, entrega en `src/lib/ai.ts`); "cita" o "reserva" solo aparece en textos legales y ejemplos de Plantillas (A) | **"Pedir cita" dentro de chekelin**: el Dueño escribe en "Lo que chekelin sabe" sus servicios, duración y horario de atención. chekelin pregunta servicio, día y hora, y hace un **Traspaso** con la nota "Quiere cita: corte, sábado 3 p. m." para que una persona confirme. Sin agenda todavía | S–M |
| S2 | No tiene agenda propia (pide Calendly, Sheets o una app de pago) | Nada | **Lista de citas simple** por Tienda: fecha, hora, Contacto, servicio, estado (pendiente / confirmada / no llegó). chekelin solo propone horas que no estén tomadas. Sin Google Calendar al inicio. Es el hueco que ManyChat deja abierto | M–L |
| S3 | Recordatorios: solo WhatsApp con Plantilla; Instagram no deja | cheke ya manda Plantillas aprobadas y Campañas (`src/lib/whatsappTemplates.ts`, `src/lib/broadcasts.ts`, A). No hay envíos programados (no existe `scheduled_at`, A) | **Recordatorio el día antes** con una Plantilla de Utilidad ("Hola {nombre}, te esperamos mañana a las {hora}. Responde 1 para confirmar o 2 para cambiar"), enviado por el cron. Solo WhatsApp, decirlo en pantalla | M (después de S2) |
| S4 | Plantilla "Quote Customers" (cotizar) | cheke tiene `orders` con total en Lempiras y link de pago (`src/lib/orders.ts`, `src/lib/payments.ts`, A) | **Cotización** = un pedido con estado "cotización" que se manda como mensaje con precio y se convierte en pedido si acepta. Para consultores y talleres | M |
| S5 | Calificar al cliente con 2–3 preguntas antes de pasarlo | chekelin ya conversa y hace Traspaso (A) | En "Lo que chekelin sabe": "Antes de pasar el chat, pregunta: [presupuesto / fecha / zona]". chekelin las pone en la nota de Traspaso | S |
| S6 | Anticipo con Stripe/PayPal | cheke: link de pago pegado + **Confirmar pago** a mano (A) | Ya alcanza: usar el mismo flujo de Confirmar pago para el anticipo de la cita | ya existe |

### Lo que NO hay que copiar

- **El constructor de flujos (Flow Builder).** Es el corazón de ManyChat y también su mayor problema: necesita un técnico, genera un mercado de agencias y plantillas de pago, y sus propios usuarios se confunden. En cheke, **chekelin hace el trabajo del flujo** conversando. Cada idea de arriba es un formulario de una pantalla, no un lienzo.
- **Cobrar por contacto activo o por asiento.** Asusta al que se hace viral y castiga al negocio con empleados. El cobro de cheke en Lempiras con equipo incluido es más claro.
- **Tres IAs distintas** (AI Replies, AI Step, Intenciones) con conocimientos separados. cheke ya tiene una sola: chekelin con "Lo que chekelin sabe". Mantenerlo así.
- **IA que contesta comentarios positivos solo para "hacer conversación"** ("AI Comments") y metas de seguidores. Es táctica de creador, no de tienda o salón.
- **"Follow to DM" y premiar a quien comparte.** Meta lo controla, está en beta y falla según los propios usuarios. Esperar.
- **TikTok, Telegram, SMS y correo.** No son donde vende el negocio hondureño (ver `tiktok-channel.md`).
- **Stripe y PayPal.** No sirven para cobrar en Lempiras por transferencia.

### Ideas de marketing que sí vale copiar (no son código)

- **Usar cheke para vender cheke**: en el Instagram de cheke, "Comentá **CITA** y te mostramos cómo tu salón agenda por WhatsApp", respondido con la regla #1. Es la demostración que usa ManyChat en su biografía.
- **Casos con números en Lempiras** de los primeros 3 negocios ("la barbería X confirmó 40 citas en un mes sin contestar a mano").
- **Programa de referidos** para contadores, agencias pequeñas o diseñadores que manejan redes de negocios, con un porcentaje los primeros 12 meses, como el 30–50% de ManyChat.

---

## Fuentes

Leídas completas (A):
- https://community.manychat.com/product-updates (lista de anuncios, octubre de 2026)
- https://community.manychat.com/product-updates/your-click-to-whatsapp-ads-now-unlock-7-days-of-free-messaging-10977
- https://community.manychat.com/product-updates/your-ai-now-speaks-your-language-meet-ai-behavior-9491
- https://community.manychat.com/product-updates/your-new-ai-hub-beta-is-live-smarter-replies-faster-setup-same-manychat-magic-7631
- https://community.manychat.com/product-updates/turn-every-follow-into-a-conversation-introducing-follow-to-dm-7628
- https://community.manychat.com/product-updates/keep-conversations-organized-with-new-inbox-updates-9120
- https://community.manychat.com/preguntas-y-respuestas-58/automatizacion-de-citas-desde-intagram-con-google-calendar-6812
- https://community.manychat.com/manychat-tutorials-33/how-to-create-appointment-booking-chatbot-on-whatsapp-8886
- https://apps.manychat.com/calendly-app
- https://apps.apple.com/my/app/manychat/id1460129210
- https://www.instagram.com/manychat/ · https://www.linkedin.com/company/manychat

Leídas solo a través del buscador, porque el sitio bloquea la lectura directa (M):
- Precios y planes: https://manychat.com/pricing · https://help.manychat.com/hc/en-us/articles/25800323349020-Active-Contacts · https://help.manychat.com/hc/en-us/articles/25800197498652-Free-plan · https://help.manychat.com/hc/en-us/articles/25800276116508-Essential-plan · https://help.manychat.com/hc/en-us/articles/25800228332572-Pro-plan · https://help.manychat.com/hc/en-us/articles/25800254159900-Business-plan · https://manychat.com/blog/manychat-pricing/
- Instagram: https://manychat.com/blog/the-ultimate-guide-for-instagram-comment-automation/ · https://help.manychat.com/hc/en-us/articles/13556930006428-Instagram-Story-Reply-Trigger · https://help.manychat.com/hc/en-us/articles/14281316989724-Instagram-Post-and-Reel-Comments-trigger · https://help.manychat.com/hc/en-us/articles/14281308423452-Instagram-automation-troubleshooting · https://help.manychat.com/hc/en-us/articles/23358636027932-Understanding-messaging-windows
- WhatsApp: https://help.manychat.com/hc/en-us/articles/14281380243740-WhatsApp-pricing-guide · https://help.manychat.com/hc/en-us/articles/15406423857052-Ice-Breakers-for-WhatsApp · https://help.manychat.com/hc/en-us/articles/20083006204444-WhatsApp-Ref-URL-Trigger
- IA: https://help.manychat.com/hc/en-us/articles/14281187288860-Manychat-AI-Step · https://help.manychat.com/hc/en-us/articles/14281187229468-Manychat-AI-Intention-Recognition · https://help.manychat.com/hc/en-us/articles/14281200017948-Manychat-AI-Flow-Builder-assistant
- Bandeja: https://help.manychat.com/hc/en-us/articles/14281070478748-Manychat-Inbox · https://help.manychat.com/hc/en-us/articles/19858378137756-Manychat-Mobile-App
- Servicios: https://manychat.com/messenger-marketing-examples/take-reservations · https://manychat.com/blog/salon-marketing-ideas/ · https://help.manychat.com/hc/en-us/articles/14281167138588-Data-Collection-block-and-Custom-User-Fields · https://manychat.com/blog/lead-qualification-funnel/
- Integraciones y pagos: https://help.manychat.com/hc/en-us/sections/13556926216988-Integrations · https://help.manychat.com/hc/en-us/articles/14281204933532-How-to-connect-Stripe-to-Manychat
- Socios: https://help.manychat.com/hc/en-us/articles/20518248843164-Manychat-Partner-Program-FAQ · https://manychat.com/agency/
- Casos: https://manychat.com/blog/success-stories/

No se pudieron abrir: youtube.com/@manychat, tiktok.com/@manychat, facebook.com/manychat, x.com/manychat, la ficha de Google Play y feedback.manychat.com (ahora redirige a la comunidad).
