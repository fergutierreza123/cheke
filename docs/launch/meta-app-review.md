# Meta App Review para cheke ventas

Guía para pasar la revisión de Meta (App Review) con la app **cheke** (App ID `2972924036384741`, hoy *Unpublished*, verificación del negocio pendiente).

Revisado el 2026-10-17 contra el código de `main` (`src/app/(app)/channels/*`, `src/lib/whatsapp.ts`, `src/lib/metaMessaging.ts`, `src/lib/commentsServer.ts`, `src/app/api/meta/webhook/route.ts`, `src/app/api/whatsapp/webhook/route.ts`) y contra la documentación oficial de Meta. Las fuentes están junto a cada dato.

Los textos para pegar en Meta van **en inglés**, porque así lo pide Meta. Las etiquetas de pantalla (botones y menús) se dejan en inglés tal como aparecen.

---

## 0. Resumen en 30 segundos

- **El código usa 12 permisos y 2 funciones (features).** La lista exacta está en la sección 1. No pidas nada más: pedir permisos que la app no usa es una causa común de rechazo ([WhatsApp app review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review)).
- **No puedes enviar a revisión hasta que Meta verifique el negocio.** "Your business must be verified before you can start the app review process" ([Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)). Mañana sí puedes grabar los videos y dejar todo listo.
- **Hay que hacer un video por permiso.** Meta no acepta capturas de pantalla, y cada permiso necesita su propia descripción. No copies y pegues la misma ([Submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)).
- **Envía en dos tandas.** Primero WhatsApp (2 permisos; Meta dice que responde en unas 24 h en promedio). Después Messenger, Instagram y Comentarios.
- **Bloqueos que ya encontré:** las páginas legales de cheke.io muestran el aviso «Borrador» y les faltan la dirección, el teléfono y el correo (`src/lib/company.ts`). El acceso para revisores está apagado en producción. Detalle en la sección 6.

---

## 1. Qué permisos usa el código (lista verificada)

| # | Permiso / feature | Dónde lo usa el código | Para qué |
|---|---|---|---|
| 1 | `whatsapp_business_management` | `channels/actions.ts`: `GET /{waba-id}/phone_numbers`, `POST /{waba-id}/subscribed_apps`; `channelHelpers.ts` (desuscribir); `coexistence.ts`: `/{phone-id}/smb_app_data`; webhook `history`, `smb_app_state_sync`, `account_update` | Conectar la cuenta de WhatsApp Business (WABA) del cliente con Embedded Signup, leer sus números, suscribir el webhook e importar el historial de Coexistence |
| 2 | `whatsapp_business_messaging` | `whatsapp.ts`: `POST /{phone-id}/messages` (texto, foto, reacción, "escribiendo…", leído); `channels/actions.ts`: `POST /{phone-id}/register`; `mediaSend.ts`: `/{phone-id}/media`; `messageMedia.ts`: `GET /{media-id}` | Enviar y recibir mensajes y archivos, y registrar el número |
| 3 | `business_management` | Token de *system user* de Arguz (`whatsapp.ts`, issue #56) y la configuración de Facebook Login for Business con token de *System-user* (`metaActions.ts`, `grantedPages`) | Acceder a los activos que el cliente comparte con el portafolio de Arguz. Es dependencia de `pages_messaging`, `pages_show_list` e `instagram_manage_messages` ([Messenger Platform overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)) |
| 4 | `pages_show_list` | `metaActions.ts`: `GET /me/accounts` | Mostrar las páginas del dueño para que elija cuál conectar |
| 5 | `pages_manage_metadata` | `metaActions.ts`: `POST /{page-id}/subscribed_apps` con `messages, messaging_postbacks, message_echoes, message_deliveries, message_reads, message_reactions, message_edits, feed` | Suscribir la página al webhook. Lo pide el campo `feed` ([Webhooks for Pages](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages)) |
| 6 | `pages_messaging` | `metaMessaging.ts`: `POST /{page-id}/messages` (Messenger e Instagram, respuesta privada a un comentario, `mark_seen`, `typing_on`) | Responder mensajes de Messenger y enviar la respuesta privada a un comentario ([Private Replies](https://developers.facebook.com/docs/messenger-platform/discovery/private-replies)) |
| 7 | `pages_read_engagement` | `metaMessaging.ts` `fetchPostInfo` (texto, enlace y foto del post de la página); dependencia de los permisos de Instagram | Mostrar en Comentarios en qué publicación comentó el cliente |
| 8 | `pages_read_user_content` | Webhook `feed` (texto y nombre de quien comenta en la página); dependencia de `pages_manage_engagement` e `instagram_basic` ([Permissions reference](https://developers.facebook.com/docs/permissions)) | Leer los comentarios que los clientes dejan en las publicaciones de la página |
| 9 | `pages_manage_engagement` | `metaMessaging.ts` `replyToComment`: `POST /{comment-id}/comments` | Respuesta pública bajo un comentario de Facebook. cheke nunca oculta ni borra comentarios |
| 10 | `instagram_basic` | `metaActions.ts`: `instagram_business_account{id,username}`; `fetchPostInfo` para Instagram (`caption, permalink, media_url`) | Saber qué cuenta de Instagram está vinculada a la página y mostrar el post comentado |
| 11 | `instagram_manage_messages` | `metaMessaging.ts`: envíos por `/{page-id}/messages` a un IGSID, reacción ❤️, `fetchMetaProfile` (nombre y usuario) | Responder los DMs de Instagram desde Chat ([IG user profile](https://developers.facebook.com/docs/messenger-platform/instagram/features/user-profile)) |
| 12 | `instagram_manage_comments` | Webhook `comments`; `replyToComment`: `POST /{comment-id}/replies`; respuesta privada en Instagram | Leer y contestar comentarios de Instagram ([IG comment replies](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies), [Webhooks for Instagram](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram)) |
| F1 | Feature **Human Agent** | `channelSend.ts` → `sendMetaMessage(..., { humanAgent: true })`: etiqueta `HUMAN_AGENT` cuando una persona responde entre 24 h y 7 días después | Solo funciona con aprobación ([Send API](https://developers.facebook.com/docs/messenger-platform/reference/send-api/)) |
| F2 | Feature **Business Asset User Profile Access** | `fetchMetaProfile` para Messenger: `GET /{psid}?fields=first_name,last_name` | Poner el nombre del cliente en Contactos. Pide "Advanced Access for the Business Asset User Profile Access feature" ([User Profile API](https://developers.facebook.com/docs/messenger-platform/identity/user-profile)) |

`public_profile` viene incluido por defecto y no necesita video.

**Qué NO pedir** (el código no lo usa):

- `catalog_management`, `whatsapp_business_manage_events`, `ads_management` y `pages_manage_posts`.
- `instagram_business_*`: son los permisos de *Instagram API with Instagram Login*. cheke conecta Instagram a través de la página de Facebook (Facebook Login for Business), así que esos no aplican.
- La sincronización con el catálogo de Meta (fase 6) **todavía no está en el código** (no hay llamadas a `product_catalogs`). Cuando exista, `catalog_management` se pedirá en otra revisión.
- Las «Plantillas» de cheke son respuestas guardadas dentro de cheke. **No** se crean plantillas de WhatsApp en Meta desde cheke, así que el video de `whatsapp_business_management` muestra la plantilla creada en WhatsApp Manager, algo que Meta acepta explícitamente: "Record a video of your app, or WhatsApp Manager, being used to create a message template".

---

## 2. Requisitos previos (en este orden)

### 2.1 Verificación del negocio (Business verification), el paso más largo

- **Dónde:** [Meta Business Suite → Settings → Security Center](https://business.facebook.com/settings/security), o en el App Dashboard → **Use cases** → WhatsApp → **Customize** → **Tech Provider onboarding** → Step 1.
- **Datos:** nombre legal exacto *Inversiones y Representaciones Arguz, S.A. de C.V.*, la dirección y el teléfono que aparecen en la escritura o el RTN, y el sitio `https://cheke.io`.
- **Importante:** Meta compara esos datos con lo que dice el sitio. Hoy el pie de cheke.io dice «[Dirección — completar] · [Teléfono — completar] · [correo@dominio — completar]» y muestra «Borrador». **Rellena `src/lib/company.ts` y despliega antes de mandar documentos**, o la verificación puede fallar. Usa un correo `@cheke.io` y no Gmail: Meta puede pedir verificar el dominio por correo o por DNS.
- **Tiempo:** Meta no publica un plazo. Cuenta de unos días a 2 semanas. Fuente: [Business Verification](https://developers.facebook.com/docs/development/release/business-verification/).

### 2.2 Tech Provider y access verification

- cheke es **Tech Provider**: atiende las cuentas de WhatsApp de otros negocios con Embedded Signup. El camino es: App Dashboard → WhatsApp → **Tech Provider onboarding** → 1) Business verification → 2) App Review ([Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)).
- **Access verification ya no se pide.** El [WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog) del 3 de octubre de 2025 dice que ya no hace falta para ser Tech Provider. Si el panel todavía te la muestra, complétala, pero no la esperes.

### 2.3 App settings → Basic (5 minutos, hazlo mañana)

En [developers.facebook.com/apps](https://developers.facebook.com/apps) → **cheke** → **App settings** → **Basic**:

| Campo | Valor |
|---|---|
| **Display name** | cheke |
| **App domains** | `cheke.io`, `ventas.cheke.app` |
| **Contact email** | un correo `@cheke.io` (no Gmail) |
| **Privacy Policy URL** | `https://cheke.io/privacidad` |
| **Terms of Service URL** | `https://cheke.io/terminos` |
| **User data deletion** | "Data deletion instructions URL" → `https://cheke.io/eliminar-datos` |
| **App icon** | 1024 × 1024 PNG (el logo de `design/assets/`) |
| **Category** | Business and pages |
| **Business portfolio** | el portafolio de Inversiones y Representaciones Arguz |

Luego ve a **Facebook Login for Business → Settings**:

- **Allowed Domains for the JavaScript SDK:** `https://ventas.cheke.app/`
- **Valid OAuth Redirect URIs:** `https://ventas.cheke.app/`
- Activa **Client OAuth login**, **Web OAuth login**, **Login with the JavaScript SDK** y **Enforce HTTPS**.

### 2.4 Casos de uso (Use cases) que la app necesita

| Use case | Permisos que van dentro |
|---|---|
| **Connect with customers through WhatsApp** | `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management` |
| **Engage with customers on Messenger from Meta** | Obligatorios: `business_management`, `pages_manage_metadata`, `pages_messaging`, `pages_show_list`, `public_profile`. Agregar con **Add**: `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages` y **Business Asset User Profile** ([Customize the Messenger use case](https://developers.facebook.com/documentation/business-messaging/messenger-platform/create-an-app)) |
| **Manage everything on your Page** | Agregar: `pages_manage_engagement`, `pages_read_user_content` ([Pages use case](https://developers.facebook.com/documentation/pages-api/create-an-app)) |

- `instagram_manage_comments` y **Human Agent** no aparecen en la tabla del caso de uso de Messenger. Búscalos en **App Review → Permissions and Features** (buscador arriba) y dale **Request advanced access**. Si el panel exige un caso de uso, agrégalos donde el buscador los ofrezca.
- **La configuración de Facebook Login for Business** para Instagram + Facebook (`NEXT_PUBLIC_META_MESSAGING_CONFIG_ID`) debe pedir los mismos permisos: 4 a 12 de la tabla de la sección 1 (todos menos los dos de WhatsApp) más `business_management`. Si falta uno, el cliente no lo concede y la función falla aunque Meta lo apruebe.
- **Página de Facebook publicada:** Meta exige que la página asociada a la app esté publicada ([Messenger app review](https://developers.facebook.com/documentation/business-messaging/messenger-platform/app-review)). Si cheke no tiene página propia, crea una («cheke») y publícala.

### 2.5 Usuarios de prueba (para grabar los videos)

Con *Standard access* (antes de la aprobación) solo funcionan las personas con un rol en la app ([WhatsApp app review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review)). Para grabar necesitas:

1. **Tu cuenta de Facebook** con rol **Administrator** en la app (ya lo tienes).
2. **Una página de prueba** de la que seas admin, con una **cuenta de Instagram profesional (Business o Creator) vinculada** y pública. Meta no manda comentarios de cuentas privadas ([Webhooks for Instagram](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram)).
3. **Un número de WhatsApp de prueba:** el que da **WhatsApp → API Setup**, o tu propio WhatsApp Business conectado por Coexistence.
4. **Un «cliente»:** un segundo teléfono con WhatsApp y una cuenta personal de Instagram y Facebook distinta (de un familiar, por ejemplo), para escribirle a la página y que se vea llegar el mensaje.
5. En cheke: un negocio de prueba **sin** «modo prueba», porque el modo prueba no envía nada de verdad y el video debe mostrar el mensaje llegando.

**Acceso para los revisores de Meta:** ellos usan sus propias cuentas de prueba, y Meta pide no dar tus credenciales personales de Facebook ([Submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)). Dales el login de cheke de la cuenta de revisión (sección 5).

### 2.6 Data handling questions y Data Use Checkup

Al enviar la revisión, Meta pregunta cómo trata los datos. Respuestas basadas en el código y en la política de privacidad:

| Pregunta | Respuesta |
|---|---|
| Who is the data controller / Do you have data processors? | Yes. Responsible entity: Inversiones y Representaciones Arguz, S.A. de C.V. Processors: Supabase (database and files), Vercel (hosting), Anthropic (AI replies when the business turns chekelin on), OpenAI (voice-note transcription), Twilio (SMS login codes), Resend (email login codes), Google Firebase (push notifications), remove.bg (product photo background removal). |
| Countries where data is processed | United States (the providers' data centers). |
| Do you share Platform Data with third parties for their own purposes? / sell it / use it for ads? | No. |
| Have you received national security requests in the last 12 months? | No. |
| Policies for public authority requests | Yes. Only with a valid legal order, after a legal review, and only the minimum data required. |

- **Ojo:** la política de privacidad (`src/app/privacidad/page.tsx`) **no menciona a OpenAI**, que se usa para transcribir las notas de voz. Tampoco dice que se guarda la credencial de páginas de Facebook e Instagram (solo menciona la de WhatsApp). Corrige eso antes de enviar, porque Meta compara las respuestas con la política.
- **Data Use Checkup (DUC):** es una revisión anual para apps *Live* con *Advanced access*. "You will need to complete DUC before the app can be switched to Live mode" ([Data Use Checkup](https://developers.facebook.com/docs/development/maintaining-data-access/data-use-checkup)). Cuando Meta lo pida, se completa en **App Dashboard → Required actions**. Pon un recordatorio cada año.

### 2.7 Modo Live

Solo después de que aprueben la revisión: App Dashboard → arriba, **App Mode: Development → Live** (o el botón **Publish**). "Switch to Live only after App Review is complete … Development-mode data … becomes visible to all users" ([Submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)). Borra antes los posts y comentarios de prueba que no quieras públicos.

---

## 3. Reglas para grabar los videos (todas)

De la [Submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide) de Meta:

- **Resolución 1080p o más.** En la Mac usa **Cmd + Shift + 5 → Record Entire Screen**, con Chrome a pantalla completa.
- **Sin audio:** "our reviewers will not listen to it".
- **Usa el mouse y agranda el cursor:** **System Settings → Accessibility → Display → Pointer size**.
- **Interfaz en inglés y subtítulos.** cheke está en español, así que agrega **subtítulos en inglés** que expliquen cada paso (por ejemplo con iMovie → **Titles**, o con [Kapwing](https://www.kapwing.com/)). Usa frases cortas como "Business owner clicks 'Conectar WhatsApp' (Connect WhatsApp)". Pon Facebook en inglés para que el diálogo de permisos salga en inglés: Facebook → **Settings → Language → English (US)**.
- **Un video por permiso.** Si dos permisos se ven en el mismo flujo, graba el flujo dos veces o recorta el video. Meta dice: "Do not submit a video that includes multiple permissions supporting different use cases".
- **Cada video empieza en el login de Meta.** Muestra cuando se toca **Conectar…**, la ventana de Facebook que pide los permisos, y el usuario aceptando. Después muestra cómo se usa el permiso.
- **Muestra el resultado del lado del cliente:** el teléfono o la cuenta del «cliente» recibiendo el mensaje. Para el teléfono, usa **QuickTime → File → New Movie Recording → (flecha) iPhone** y graba ambos lado a lado, o haz dos clips seguidos.
- **Duración:** de 1 a 3 minutos cada uno. Usa nombres claros: `01_whatsapp_business_messaging.mp4`, etc.

**Escena común (A): «Conectar WhatsApp».** Se reutiliza en los videos 1 y 2:

1. Abre `https://ventas.cheke.app/login` en Chrome. Subtítulo: "cheke is an inbox for small businesses in Honduras. The business owner logs in."
2. Entra con el código. Menú lateral → **Canales**. Subtítulo: "Channels screen".
3. Toca **Conectar WhatsApp**. Se abre la ventana de Meta (Embedded Signup).
4. En la ventana: **Get started** → elige el portafolio → elige o conecta el número → en la pantalla de permisos se ve "cheke is requesting access to…" → **Confirm**.
5. De vuelta en cheke, la tarjeta de WhatsApp dice **Conectado**, con el número y el nombre verificado.

**Escena común (B): «Conectar Instagram y Facebook».** Se reutiliza en los videos 3 a 12:

1. Login en ventas.cheke.app → **Canales**.
2. Toca **Conectar Instagram y Facebook**. Se abre Facebook Login for Business.
3. **Continue as …** → elige la **página de prueba** y su **cuenta de Instagram** → la pantalla muestra los permisos solicitados → **Save** / **Got it**.
4. En cheke aparece «¿Qué página quieres conectar?». Elige la página → **Conectar esta página**.
5. Quedan las tarjetas **Facebook: Conectado** e **Instagram: Conectado** (@usuario).

---

## 4. Permiso por permiso: texto para pegar y guion del video

> Pega el bloque **"How will your app use this permission?"** en el campo de descripción de cada permiso en **App Review → Permissions and Features → Request advanced access** (o en el formulario **Edit** de la solicitud). Cada texto es distinto a propósito.

### Tanda 1: WhatsApp

#### 1. `whatsapp_business_messaging`

**How will your app use this permission?**

```
cheke (ventas.cheke.app) is a shared inbox for small businesses in Honduras that sell through WhatsApp. After a business connects its own WhatsApp Business number through Embedded Signup, cheke uses whatsapp_business_messaging to: register the connected phone number, receive the customer's incoming messages through our webhook, and let the business's team reply from the cheke inbox with text, photos, voice notes and documents, mark messages as read, show the typing indicator and react to a message. Media files that customers send are downloaded with this permission so the team can see them in the conversation. Messages are only sent in reply to customers who wrote to the business first, inside the 24-hour customer service window. cheke never sends bulk or unsolicited messages and never uses message content for advertising.
```

**Guion del video (unos 2 min):**

1. Escena A completa (conectar el número).
2. En el teléfono del «cliente», escribe al número del negocio: «Hola, ¿tienen la blusa azul en talla M?». Subtítulo: "A customer writes to the business on WhatsApp".
3. En cheke, menú → **Chat**. El mensaje aparece solo, en tiempo real. Subtítulo: "The message arrives in the cheke inbox (webhook)".
4. Abre la conversación, escribe «¡Hola! Sí, la tenemos. Cuesta L 450» y toca **Enviar**.
5. Muestra el teléfono del cliente: llega la respuesta. Subtítulo: "The customer receives the reply in WhatsApp".
6. (Opcional) El cliente manda una foto y aparece en el Chat de cheke. Subtítulo: "Media download".

#### 2. `whatsapp_business_management`

**How will your app use this permission?**

```
Each business connects its existing WhatsApp Business Account to cheke with Embedded Signup. cheke uses whatsapp_business_management to read the phone numbers of the WhatsApp Business Account the business shared with us (to show the number and verified name on the Channels screen), to subscribe our app to that account's webhooks so new messages reach the business's inbox, to unsubscribe when the business disconnects the channel, and, for businesses that keep using the WhatsApp Business app (Coexistence), to receive the one-time chat history and contact sync the business chose to share. Message templates are created by the business in WhatsApp Manager. cheke only manages assets the business explicitly granted during Embedded Signup.
```

**Guion del video (unos 2 min):**

1. Escena A, pero haz una pausa en la pantalla de permisos de Meta, donde se ve "Manage your WhatsApp accounts". Subtítulo: "The business grants access to its WhatsApp Business Account".
2. En cheke, **Canales** → la tarjeta muestra el número y el nombre verificado. Subtítulo: "cheke reads the phone numbers of the shared WABA".
3. Si es Coexistence: muestra el progreso «Importando chats…» y los chats antiguos en **Chat**. Subtítulo: "History sync (Coexistence)".
4. Abre [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/) → **Create template** → categoría **Utility** → nombre `pedido_listo` → texto "Hola {{1}}, tu pedido está listo." → **Submit**. Subtítulo: "Message template created in WhatsApp Manager". Meta pide explícitamente este paso.
5. En cheke, **Canales** → **Desconectar** en WhatsApp → confirmar. Subtítulo: "Disconnecting unsubscribes the webhook".

#### 3. `business_management` (se envía en la tanda 1 y vale para las dos)

**How will your app use this permission?**

```
cheke is a Tech Provider: businesses share their WhatsApp Business Account, Facebook Page and Instagram account with our business portfolio through Embedded Signup and Facebook Login for Business. business_management lets cheke's server access exactly those shared business assets with a system-user token that belongs to our portfolio, so the connection keeps working when the employee who connected it changes their password or leaves. It is also a required dependency of pages_messaging, pages_show_list and instagram_manage_messages. cheke does not create, claim or modify ad accounts or any other business asset, and does not read the business's portfolio data beyond the assets the business granted.
```

**Guion del video (unos 90 s):**

1. Escena B completa. Haz una pausa en la pantalla donde el cliente elige el **portafolio (business portfolio)** y los activos. Subtítulo: "The business selects which business assets (Page, Instagram account) to share with cheke".
2. En cheke, en **Canales**, se ven los dos canales conectados. Subtítulo: "cheke can now access only the assets that were granted".
3. Muestra en [Business Settings → Integrations → Connected apps](https://business.facebook.com/settings/connected-apps) que **cheke** aparece con esos activos. Subtítulo: "The business can remove access at any time here".

### Tanda 2: Messenger, Instagram y Comentarios

#### 4. `pages_show_list`

**How will your app use this permission?**

```
When a business owner clicks "Connect Instagram and Facebook" in cheke, we call /me/accounts to list the Facebook Pages the person manages, with the Instagram professional account linked to each one. cheke shows that list so the owner can pick which Page (and its Instagram account) to connect to their store in cheke, and it uses the same list on our server to confirm that the person really manages the Page before connecting it. The list is not stored; only the Page that the owner selects is saved.
```

**Guion (unos 60 s):** Escena B. Usa una cuenta que maneje **2 páginas** para que se vea la lista «¿Qué página quieres conectar?» con el nombre de cada página y su @instagram. Subtítulo: "cheke lists the Pages the user manages so they can choose one". Elige una → **Conectar esta página**.

#### 5. `pages_manage_metadata`

**How will your app use this permission?**

```
After the business selects its Page, cheke subscribes that Page to our app's webhook (POST /{page-id}/subscribed_apps) for the messages, messaging_postbacks, message_echoes, message_deliveries, message_reads, message_reactions, message_edits and feed fields. Without this subscription the Page's Messenger messages, Instagram messages and post comments would never reach the business's cheke inbox. When the business clicks "Disconnect" in cheke we remove the subscription. cheke does not change any other Page setting.
```

**Guion (unos 90 s):**

1. Escena B hasta **Conectado**. Subtítulo: "cheke subscribes the Page to webhooks".
2. El «cliente» manda un mensaje a la página por Messenger y aparece en **Chat** de cheke. Subtítulo: "Webhook events now arrive".
3. **Canales** → **Desconectar** en Facebook → el cliente escribe otra vez → ya no llega a cheke. Subtítulo: "Disconnect removes the subscription".

#### 6. `pages_messaging`

**How will your app use this permission?**

```
cheke shows the Facebook Page's Messenger conversations in the business's shared inbox and lets the team answer customers who wrote to the Page: text and photos, quoting a message, mark as seen and the typing indicator. Replies are sent through the Send API in response to the customer, within the standard messaging window. The same permission is used for one private reply to a customer who commented on one of the Page's posts asking for a price, as allowed by the Private Replies feature. cheke does not send promotional or unsolicited messages.
```

**Guion (unos 2 min):**

1. Escena B.
2. Desde la cuenta personal del «cliente», en Messenger, escribe a la página: «¿Hacen envíos a San Pedro Sula?».
3. cheke → **Chat** → aparece la conversación con el ícono de Facebook. Abre y responde «Sí, enviamos con Cargo Expreso, L 100». **Enviar**.
4. Muestra Messenger del cliente recibiendo la respuesta. Subtítulo: "Customer receives the reply in Messenger".

#### 7. `pages_read_engagement`

**How will your app use this permission?**

```
cheke has a Comments screen where a business sees the comments customers leave on its Facebook Page posts. To give each comment context, cheke reads the post it belongs to (its text, link and picture) with pages_read_engagement and shows it next to the comment, so the team knows which product the customer is asking about. It is also required for the Instagram permissions we request. cheke does not read Page insights or follower lists.
```

**Guion (unos 90 s):**

1. Escena B.
2. Publica en la página de prueba un post con foto: «Blusa azul, tallas S–L».
3. El «cliente» comenta: «¿Precio?».
4. cheke → **Comentarios**: aparece el comentario **con la foto y el texto del post** arriba. Subtítulo: "cheke reads the Page post to show which product the comment is about".

#### 8. `pages_read_user_content`

**How will your app use this permission?**

```
Customers often ask for prices in the comments of a business's Facebook posts. cheke receives those comments through the Page feed webhook and shows the comment text and the commenter's name on the cheke Comments screen, so the business can answer every comment from one place instead of missing them. This permission is also required for pages_manage_engagement. cheke never hides or deletes customers' comments.
```

**Guion (unos 60 s):** Mismo inicio que el 7, pero enfócate en el **nombre de quien comenta y el texto del comentario** en **Comentarios** de cheke, mostrados al lado del mismo comentario en Facebook. Subtítulo: "The customer's comment on the Page appears in cheke".

#### 9. `pages_manage_engagement`

**How will your app use this permission?**

```
From cheke's Comments screen, the business can publish a public reply under a customer's comment on its Facebook Page post, for example "We sent you the price by private message". The reply is posted as the Page (POST /{comment-id}/comments). When the business turns on chekelin, cheke's assistant can write that short public reply for price questions. cheke only creates replies; it never edits, hides or deletes customers' comments and never likes or reacts on behalf of the Page.
```

**Guion (unos 90 s):**

1. Partiendo del comentario del video 7, en cheke → **Comentarios** → abre el comentario → escribe «¡Hola! Te enviamos el precio por mensaje 📩» → **Responder**.
2. Muestra el post en Facebook: aparece la respuesta de la página bajo el comentario. Subtítulo: "Public reply posted as the Page".

#### 10. `instagram_basic`

**How will your app use this permission?**

```
When a business connects its Facebook Page, cheke reads the Instagram professional account linked to that Page (its ID and username) to show "@username connected" on the Channels screen and to route that account's messages and comments to the right store. On the Comments screen cheke also reads the Instagram post a comment belongs to (caption, permalink and image) so the team sees which product the customer is asking about.
```

**Guion (unos 60 s):** Escena B. Haz una pausa en la tarjeta **Instagram: Conectado · @usuario**. Subtítulo: "cheke reads the linked Instagram account's username". Después muestra en **Comentarios** un comentario de Instagram **con la imagen del post**.

#### 11. `instagram_manage_messages`

**How will your app use this permission?**

```
cheke brings the business's Instagram Direct messages into the same inbox as WhatsApp and Messenger. With instagram_manage_messages the team reads customers' DMs and replies from cheke with text and photos, can react with a heart, marks messages as seen, and cheke reads the customer's name and username to create the contact. Replies are only sent to customers who messaged the business first. It is also used to send one private reply to a person who commented on the business's Instagram post asking for a price.
```

**Guion (unos 2 min):**

1. Escena B.
2. Desde el Instagram personal del «cliente», manda un DM a la cuenta del negocio: «Hola, ¿tienen catálogo?».
3. cheke → **Chat**: aparece con el ícono de Instagram y el **@usuario** del cliente. Responde «¡Hola! Te lo paso ahora». **Enviar**.
4. Muestra Instagram del cliente recibiendo la respuesta.

#### 12. `instagram_manage_comments`

**How will your app use this permission?**

```
Customers comment "price?" on a business's Instagram posts. cheke receives those comments through the Instagram comments webhook and lists them on the Comments screen. From there the business (or chekelin, cheke's assistant, if the business turned it on) posts a short public reply under the comment and sends the commenter one private reply with the price. cheke only reads comments and creates replies; it never hides or deletes comments.
```

**Guion (unos 2 min):**

1. El «cliente» comenta «¿Precio? 😍» en un post de la cuenta de Instagram del negocio.
2. cheke → **Comentarios**: aparece el comentario. Abre → **Responder** en público «¡Te escribimos por DM!» y envía la **respuesta privada** «La blusa cuesta L 450».
3. Muestra en Instagram la respuesta pública bajo el comentario y el DM que le llegó al cliente.

#### F1. Feature **Human Agent**

**How will your app use this feature?**

```
cheke is an inbox where real people (the business's sales team) answer customers. Small businesses in Honduras often can't answer within 24 hours, for example when a customer writes on Saturday night and the shop opens on Monday. When a team member manually types a reply between 24 hours and 7 days after the customer's last message, cheke sends it with the HUMAN_AGENT tag. The tag is applied only to messages typed by a person in the cheke inbox; it is never used for chekelin (our automated assistant), templates or any automated or promotional message.
```

**Guion (unos 90 s):**

1. En cheke → **Chat**, abre una conversación de Messenger cuyo último mensaje del cliente tenga más de 24 h. Si no tienes una, prepárala dos días antes.
2. Muestra el aviso de la ventana de 24 h en la conversación. Subtítulo: "Customer's last message was more than 24 hours ago".
3. El agente escribe a mano «Disculpa la demora, sí tenemos tu talla» → **Enviar** → llega al cliente. Subtítulo: "A human agent replies manually (HUMAN_AGENT tag). Automated replies are disabled outside the window".

#### F2. Feature **Business Asset User Profile Access**

**How will your app use this feature?**

```
When a new customer writes to the business's Facebook Page, cheke reads the customer's first and last name (GET /{PSID}?fields=first_name,last_name) to create the contact in the business's cheke Contacts list, so the team sees "María López" instead of an anonymous ID. We only read the profile of people who messaged the Page, we do not read profile pictures or any other field, and the name is used only inside that business's inbox.
```

**Guion (unos 60 s):** Un «cliente» nuevo escribe a la página por Messenger → en cheke, **Chat** y **Contactos** muestran su **nombre real**. Subtítulo: "cheke shows the customer's name from their profile".

---

## 5. Instrucciones para el revisor (campo de notas de la solicitud)

Pega esto en **App Review → Requests → (tu solicitud) → Testing instructions / Notes**. Cambia lo que está entre `<>`.

```
cheke (https://ventas.cheke.app) is a shared inbox for small businesses in Honduras. The UI is in Spanish; every screencast has English captions.

How to log in: open https://ventas.cheke.app/login, tap "Acceso para revisores" (Reviewer access) at the bottom, and use
  Email: <REVIEWER_EMAIL>
  Password: <REVIEWER_PASSWORD>
This opens a demo business ("Tienda Luna (demo)") with sample conversations.

To test the Meta flows with your own test assets: in the left menu open "Canales" (Channels) and click
  - "Conectar WhatsApp" (Connect WhatsApp) for Embedded Signup, or
  - "Conectar Instagram y Facebook" (Connect Instagram and Facebook) for Facebook Login for Business.
Then use "Chat" (inbox) to read and reply to messages and "Comentarios" (Comments) to see and answer post comments.

Main screens: Chat = unified inbox (WhatsApp, Instagram, Messenger); Comentarios = comments on the business's posts; Contactos = contacts; Canales = connected channels (connect / disconnect).
cheke never hides or deletes comments, never sends unsolicited or bulk messages, and only uses the HUMAN_AGENT tag for replies typed by a person.
Privacy policy: https://cheke.io/privacidad · Data deletion: https://cheke.io/eliminar-datos
```

**Antes de pegar esto**, el acceso para revisores tiene que estar encendido. Hoy `https://ventas.cheke.app/login/revisores` dice «El acceso para revisores no está activo». Haz lo que dice el PR #27:

1. Corre `supabase/migrations/0015_reviewer_demo.sql` en el SQL Editor de Supabase.
2. En Vercel → Project → **Settings → Environment Variables**, agrega `REVIEWER_EMAIL` (por ejemplo `revision@cheke.io`) y `REVIEWER_PASSWORD` (12 caracteres o más) para *Production*.
3. **Redeploy**.

Ojo: el negocio demo está en «modo prueba», así que sus chats de ejemplo no envían nada real. En el código, **Canales** no está bloqueado para el negocio demo, así que el revisor sí puede conectar sus propias cuentas de prueba. Pruébalo tú una vez con la cuenta de revisor antes de enviar.

---

## 6. Bloqueos y riesgos encontrados

1. **Las páginas legales están en borrador.** cheke.io/privacidad, /terminos y /eliminar-datos muestran «Borrador: faltan los datos legales de la empresa» y `[… completar]` en la dirección, el teléfono y el correo (`src/lib/company.ts`). Meta, Apple y Google rechazan URLs de privacidad con contenido de relleno, y la verificación del negocio compara esos datos. **Es lo primero que hay que arreglar.** Pásale a tu agente la dirección, el teléfono y el correo `@cheke.io` exactos de la escritura.
2. **A la política de privacidad le faltan cosas.** No menciona a **OpenAI** (transcripción de notas de voz) ni que se guardan las credenciales de las páginas de Facebook e Instagram, y no dice que se leen comentarios de publicaciones. Hay que actualizarla para que coincida con las respuestas de la sección 2.6.
3. **El acceso para revisores está apagado en producción** (sección 5).
4. **La ventana de Facebook dentro de la app del teléfono no está probada.** Meta puede bloquear Facebook Login en navegadores embebidos (issue #4). Para los videos de Meta usa **Chrome en la computadora**, no la app. En la app móvil, si falla, indica conectar canales desde la computadora.
5. **Comentarios de Instagram exigen Advanced access** incluso para el webhook ("Your app must have successfully completed App Review (advanced access)", [Webhooks for Instagram](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram)). Hasta la aprobación, Comentarios de Instagram solo funciona para cuentas con un rol en la app.

---

## 7. Orden de trabajo sugerido

| Cuándo | Qué |
|---|---|
| Mañana (2 h) | Sección 2.3 (Basic settings y dominios). Revisar los casos de uso de la sección 2.4. Pedir a tu agente que rellene `company.ts` y la política (bloqueos 1 y 2). Confirmar en qué va la verificación del negocio (2.1). |
| Días 2–3 | Preparar la página de prueba, Instagram y el segundo teléfono (2.5). Grabar los videos 1–3 (WhatsApp). |
| Días 4–6 | Grabar los videos 4–12, F1 y F2. Encender el acceso para revisores. |
| Cuando aprueben la verificación | **Tanda 1:** `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management` → **Submit**. No la dejes en borrador: "Drafts are not reviewed". |
| Unos 2 días después | **Tanda 2:** los 9 permisos de páginas e Instagram más las 2 features → **Submit**. |
| Al aprobarse todo | Data Use Checkup si lo pide → **App Mode: Live** (2.7). |

Si rechazan algo, Meta dice qué permiso y por qué en **App Review → Requests**. Se corrige ese video o texto y se reenvía solo ese.
