# App Store y Google Play: cuentas, fichas y revisión

Guía para publicar **cheke ventas** (la app de Capacitor `io.cheke.app`, que carga `https://ventas.cheke.app`) en el App Store y en Google Play antes del **2026-12-31**.

Revisado el 2026-10-17 contra el código de `main` y la documentación oficial de Apple y Google, citada junto a cada dato. Se apoya en la investigación del issue #4 ([store-review-rules.md](https://github.com/fergutierreza123/cheke/blob/research/store-review-rules/docs/research/store-review-rules.md)). Las etiquetas de pantalla de App Store Connect y Play Console se dejan en inglés, tal como aparecen.

---

## 0. Resumen

- **Las dos tiendas exigen un D-U-N-S** de *Inversiones y Representaciones Arguz, S.A. de C.V.* Es gratis y es lo que más tarda. **Pídelo mañana, primero que todo.**
- **La regla de Google de 12 testers por 14 días no aplica a cuentas de organización.** El texto oficial la limita a "personal developer accounts created after November 13, 2023" ([App testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)).
- **La app ya tiene «Eliminar mi cuenta»** (issue #16, PR #22), un login para revisores (issue #17, PR #27) y no muestra precios dentro de la app.
- **Bloqueos que hay que resolver antes de enviar** (detalle en la sección 7):
  1. Las páginas legales en cheke.io muestran «Borrador».
  2. El acceso para revisores está apagado en producción.
  3. Todavía no existen los proyectos nativos (`ios/`, `android/`).
  4. La Mac tiene macOS 14.5 y no tiene Xcode. Apple exige Xcode 26, y Xcode 26.6 pide macOS Tahoe 26.2 o más nuevo.
  5. El issue #18 sigue abierto: faltan la cámara o el selector de fotos y el menú de compartir.

---

## 1. Cuentas que hay que crear, en orden

| # | Cuenta | Qué necesitas | Cuánto tarda | Costo |
|---|---|---|---|---|
| 1 | **D-U-N-S** de Dun & Bradstreet, desde el [buscador de Apple](https://developer.apple.com/enroll/duns-lookup/) | Nombre legal exacto (no «cheke»: "DBAs, fictitious businesses, trade names … are not accepted"), dirección de la sede y documentos de constitución a mano | Apple: "allow up to 5 business days" + "up to 2 business days for Apple to receive your information". Google: "can take up to 30 days" ([Apple D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S/), [Google](https://support.google.com/googleplay/android-developer/answer/13628312)) | Gratis. **No pagues a intermediarios** |
| 2 | **Correo con dominio `@cheke.io`** (por ejemplo `hola@cheke.io` y `revision@cheke.io`) | Acceso al DNS de cheke.io. Opciones: Google Workspace o Zoho Mail | Unos 30–60 min, más hasta 24 h de DNS | Workspace desde unos 7 USD/mes, o Zoho gratis |
| 3 | **Firebase** (notificaciones push) | Cuenta de Google. Crear el proyecto y las apps iOS y Android `io.cheke.app` | Unos 30 min | Gratis |
| 4 | **Apple Developer Program, como organización**, en [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) | D-U-N-S, Apple ID con verificación en dos pasos, correo `@cheke.io`, sitio cheke.io funcionando y autoridad legal para firmar por Arguz. Apple puede llamarte para verificar | De 2 a 7 días después de tener el D-U-N-S | 99 USD/año |
| 5 | **Google Play Console, como organización**, en [play.google.com/console/signup](https://play.google.com/console/signup) | D-U-N-S en el perfil de pagos de Google; teléfono y sitio de la organización; correo y teléfono de contacto y de desarrollador, cada uno verificado con un código ([requisitos](https://support.google.com/googleplay/android-developer/answer/13628312)) | De varios días a unas 2 semanas para verificar la organización | 25 USD, una sola vez |
| 6 | **App Store Connect → New App** y **Play Console → Create app** | Las cuentas 4 y 5 activas | 15 min cada una | — |

**Mientras esperas el D-U-N-S** puedes hacer el correo, Firebase, las fichas (sección 3), las capturas (sección 4) y el trabajo de Meta (`docs/launch/meta-app-review.md`).

---

## 2. Requisitos técnicos que no son cuentas

- **Apple:** desde el 28 de abril de 2026, "Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26", y desde el 9 de septiembre de 2026 deben apuntar a iOS 13 o más ([Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)).
  - Xcode 26.6 requiere **macOS Tahoe 26.2** o más nuevo ([Xcode system requirements](https://developer.apple.com/xcode/system-requirements/)). Tu Mac tiene **macOS 14.5** y no tiene Xcode.
  - **Opción A:** actualiza a macOS Tahoe en **System Settings → General → Software Update**, si tu Mac lo admite, e instala Xcode desde el Mac App Store (más de 10 GB).
  - **Opción B:** compila en la nube con Codemagic o Ionic Appflow. Así no necesitas Xcode en tu Mac. Pide a tu agente que lo configure.
- **Google:** desde el 31 de agosto de 2026, "New apps and app updates must target Android 16 (API level 36) or higher" ([Target API level](https://support.google.com/googleplay/android-developer/answer/11926878)). Capacitor 8 ya apunta a API 36 por defecto; tu agente lo verifica en `android/variables.gradle`. Se necesita Android Studio o una compilación en la nube.
- **Generar los proyectos nativos** (tarea para tu agente, no para ti): `npx cap add ios && npx cap add android && npx cap sync`, más los permisos de `capacitor.config.ts` y del README → «App móvil».
  - **Falta en esa lista: los textos de permiso de la cámara y las fotos.** El Catálogo usa `<input type="file" accept="image/*">`. En iPhone eso ofrece «Tomar foto», y sin el texto de permiso **la app se cierra**, que es un rechazo seguro por la guía 2.1. Agrega a `Info.plist`:
    - `NSCameraUsageDescription` = «cheke usa la cámara para tomar fotos de tus productos y enviarlas a tus clientes.»
    - `NSPhotoLibraryUsageDescription` = «cheke usa tus fotos para subir productos al catálogo y enviarlas en el chat.»
  - Además, `ITSAppUsesNonExemptEncryption` = `NO`, porque solo usa HTTPS estándar. Así App Store Connect no pide documentos de exportación en cada versión.
- **Solo iPhone:** en Xcode → target **App** → **General** → **Supported Destinations**, deja solo **iPhone**. Así no te piden capturas de iPad, que son obligatorias si la app admite iPadOS ([Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)).

---

## 3. Fichas de la tienda (listas para pegar)

Distribución: **solo Honduras** al principio, en las dos tiendas. En App Store Connect: **Pricing and Availability → Countries or Regions → Honduras**. En Play Console: **Production → Countries/regions → Honduras**. Precio: **gratis**.

### 3.1 App Store (App Store Connect → App Information y la versión 1.0)

Límites de Apple: descripción hasta 4000 caracteres, *keywords* hasta 100 bytes con palabras de más de 2 caracteres, *promotional text* hasta 170 ([Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)). El nombre y el subtítulo admiten hasta 30 caracteres cada uno.

| Campo | Texto |
|---|---|
| **Name** (12/30) | `cheke ventas` |
| **Subtitle** (27/30) | `Todos tus chats en un lugar` |
| **Primary category** | Business |
| **Secondary category** | Productivity |
| **Keywords** (93/100 bytes) | `bandeja,chats,clientes,pedidos,catalogo,negocio,tienda,crm,mensajes,comentarios,honduras,pyme` |
| **Promotional Text** (158/170) | `Tus clientes te escriben por WhatsApp, Instagram y Facebook. Con cheke los respondes todos desde una sola bandeja, en equipo, y no se te escapa ninguna venta.` |
| **Support URL** | `https://cheke.io` (debe mostrar un correo y un teléfono de contacto reales; hoy dicen «completar») |
| **Marketing URL** | `https://cheke.io` |
| **Privacy Policy URL** | `https://cheke.io/privacidad` |
| **Copyright** | `2026 Inversiones y Representaciones Arguz, S.A. de C.V.` |
| **Age rating** | Responde el cuestionario con la verdad. La app permite mensajería con clientes (contenido generado por usuarios) y no tiene web abierta, juegos de azar ni contenido adulto |

> Las *keywords* **no** llevan «whatsapp», «instagram» ni «facebook». La guía 2.3.7 prohíbe marcas registradas y nombres de apps populares en los metadatos de búsqueda ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata)). En la descripción sí se pueden nombrar para explicar la compatibilidad, con la aclaración final de marcas. Tampoco repitas «cheke» ni «ventas» en las *keywords*: el nombre ya cuenta.

**Description** (pegar tal cual):

```
cheke es la bandeja de ventas para negocios de Honduras que venden por mensajes.

Tus clientes te escriben por WhatsApp, Instagram y Facebook Messenger. Con cheke todos esos chats llegan a un solo lugar, y tú y tu equipo los responden desde el celular o la computadora.

QUÉ PUEDES HACER
• Chat: una sola bandeja con las conversaciones de WhatsApp, Instagram y Messenger. Responde con texto, fotos y notas de voz.
• Avisos al instante: recibe una notificación cuando un cliente te escribe y abre su chat con un toque.
• Comentarios: ve los comentarios de tus publicaciones de Instagram y Facebook y contéstalos sin salir de cheke.
• chekeo: sigue cada venta en un tablero, desde «nuevo» hasta «entregado».
• Contactos: el historial, las notas y las etiquetas de cada cliente.
• Catálogo: tus productos con foto, descripción y precio en lempiras, listos para enviar en el chat.
• Equipo: invita a tus vendedores y gerentes; cada quien ve las tiendas que le tocan.
• chekelin: un asistente que te ayuda a responder preguntas frecuentes, solo cuando tú lo activas.
• Entra con Face ID o tu huella, sin esperar un código.

PARA QUIÉN ES
Tiendas, emprendedores y negocios que venden por redes sociales y necesitan responder rápido, en equipo y sin perder clientes.

CÓMO EMPEZAR
Entra con tu correo o tu número de celular. Conecta tus canales desde la sección Canales con tu cuenta de Meta Business.

Ayuda: escríbenos desde cheke.io.

WhatsApp, Instagram, Facebook y Messenger son marcas de Meta Platforms, Inc. cheke no está afiliado ni patrocinado por Meta.
```

**What's New** (versión 1.0): `Primera versión de cheke en el App Store.`

### 3.2 Google Play (Play Console → Grow users → Store presence → Main store listing)

| Campo | Texto |
|---|---|
| **App name** (12/30) | `cheke ventas` |
| **Short description** (77/80, [límite](https://support.google.com/googleplay/android-developer/answer/9866151)) | `Responde WhatsApp, Instagram y Facebook de tu negocio desde una sola bandeja.` |
| **Full description** | La misma descripción del App Store (menos de 4000 caracteres) |
| **App category** | Business |
| **Tags** | Business management, Messaging (elige las que ofrezca la lista) |
| **Contact email** | `hola@cheke.io` |
| **Website** | `https://cheke.io` |
| **Privacy policy** (en **App content**) | `https://cheke.io/privacidad` |

---

## 4. Capturas de pantalla e imágenes

**Reglas:**

- Usa la app real, con el negocio demo de revisores («Tienda Luna (demo)»). Nada de capturas de escritorio ni de maquetas de `/design`.
- No muestres precios de planes ni pagos. La app ya los oculta.
- Para que el teléfono salga limpio: iPhone **Simulator** en Xcode con **File → Save Screen** (Cmd + S), o el Emulador de Android Studio con el ícono de cámara.

**Las 6 capturas, en este orden** (el título va arriba, en una franja con el azul de cheke #001037):

1. **Chat**: la bandeja con chats de WhatsApp, Instagram y Messenger mezclados. Título: «Todos tus chats en un solo lugar».
2. **Una conversación** con una foto de producto enviada y una nota de voz. Título: «Responde con fotos y notas de voz».
3. **chekeo**, el tablero de ventas. Título: «Sigue cada venta hasta entregarla».
4. **Comentarios**. Título: «Contesta los comentarios de tus publicaciones».
5. **Catálogo**. Título: «Tu catálogo listo para enviar».
6. **Notificación push** en la pantalla bloqueada, o **Equipo**. Título: «Te avisamos cuando un cliente escribe».

**Tamaños:**

| Tienda | Qué subir | Tamaño |
|---|---|---|
| Apple, iPhone 6.9" (simulador iPhone 17 Pro Max) | De 3 a 6 capturas. Mínimo 1 y máximo 10 por tamaño | **1320 × 2868** px vertical (también acepta 1290 × 2796) |
| Apple, iPhone 6.1" (simulador iPhone 17 Pro) | Las mismas capturas. Apple pide como mínimo el tamaño «medium display» | **1206 × 2622** px (o 1179 × 2556) |
| Apple, iPad 13" | Solo si la app admite iPad. **Recomendado: solo iPhone** | 2064 × 2752 |
| Apple, ícono | Lo toma del proyecto de Xcode | 1024 × 1024 PNG, sin transparencia |
| Google, capturas de teléfono | De 4 a 8. Mínimo 2. Lado de 320 a 3840 px, y el lado largo no puede pasar del doble del corto | **1080 × 1920** px vertical (9:16). Las capturas de 1080 × 2400 **no** sirven porque pasan de 2:1. Recórtalas o déjales margen |
| Google, ícono | Obligatorio | **512 × 512** PNG de 32 bits, menos de 1024 KB |
| Google, feature graphic | Obligatorio | **1024 × 500** JPG o PNG de 24 bits, sin transparencia. Fondo #001037, logo y la frase «Todos tus chats en un lugar» |

Fuentes: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), [Google preview assets](https://support.google.com/googleplay/android-developer/answer/9866151).

---

## 5. Privacidad: lo que la app recoge de verdad

Lo que sigue sale del código y de `src/app/privacidad/page.tsx`:

- **Cuenta:** correo y/o celular para el código, nombre, nombre del negocio y rol.
- **Contenido:** mensajes de los clientes del negocio (texto, fotos, notas de voz y su transcripción, documentos, ubicaciones y tarjetas de contacto que el cliente envía), catálogo con fotos, plantillas, notas, etiquetas y pedidos.
- **Identificadores:** el ID de usuario de Supabase y el **token de notificaciones push** del teléfono (`device_tokens`).
- **Datos que no recoge:**
  - analítica, publicidad o crash reporting (no hay SDK de eso);
  - la ubicación del teléfono;
  - la libreta de contactos;
  - datos de pago dentro de la app.
  - Face ID y la huella quedan en el teléfono.
- **Proveedores que procesan datos a nombre de cheke:** Supabase, Vercel, Meta, Anthropic, OpenAI (transcripción), Twilio, Resend, Firebase y remove.bg. **Agrega OpenAI a la política de privacidad**, porque hoy no aparece.

### 5.1 Apple: App Privacy (App Store Connect → App Privacy → Get Started)

Definiciones: [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).

- **Do you or your third-party partners collect data from this app?** → **Yes**
- Marca estos tipos de datos. Para todos: **Linked to the user: Yes**, **Used for tracking: No**, **Purpose: App Functionality**.

| Categoría | Tipo | Por qué |
|---|---|---|
| Contact Info | **Name** | Nombre del usuario y de su negocio |
| Contact Info | **Email Address** | Login con código |
| Contact Info | **Phone Number** | Login por SMS |
| User Content | **Emails or Text Messages** | Los mensajes del chat ("contents of the … message") |
| User Content | **Photos or Videos** | Fotos de productos y fotos del chat |
| User Content | **Audio Data** | Notas de voz que graba el usuario |
| User Content | **Other User Content** | Notas, etiquetas, plantillas, pedidos y comentarios |
| Identifiers | **User ID** | La cuenta de cheke |
| Identifiers | **Device ID** | El token push está ligado al dispositivo. Declararlo es la opción conservadora |

- **No marques:** Location, Contacts, Financial Info, Health, Browsing History, Search History, Usage Data, Diagnostics ni Purchases.
- Si algún día agregas Sentry, analítica o publicidad, **actualiza esta etiqueta antes de publicar esa versión**.
- **Tracking:** No. No hay publicidad ni se comparten datos con brokers.

### 5.2 Google: Data safety (Play Console → Policy → App content → Data safety)

Guía oficial: [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469).

**Data collection and security:**

- **Does your app collect or share any of the required user data types?** → **Yes**
- **Is all of the user data collected by your app encrypted in transit?** → **Yes** (solo HTTPS)
- **Which of the following methods of account creation does your app support?** → **Username and other authentication** (código por correo o SMS; no hay contraseñas, salvo la cuenta de revisores) e **OAuth: No**
- **Do you provide a way for users to request that their data is deleted?** → **Yes**
- **Delete account URL** → `https://cheke.io/eliminar-datos`

**Tipos de datos.** Para todos: **Collected: Yes**, **Shared: No** (los proveedores que procesan datos a nombre de cheke no cuentan como «shared» según Google), **Processed ephemerally: No**, **Required: Yes**.

| Categoría | Tipo | Propósito |
|---|---|---|
| Personal info | **Name** | App functionality, Account management |
| Personal info | **Email address** | App functionality, Account management |
| Personal info | **Phone number** | App functionality, Account management |
| Personal info | **User IDs** | App functionality, Account management |
| Messages | **Other in-app messages** | App functionality |
| Photos and videos | **Photos** | App functionality |
| Audio | **Voice or sound recordings** | App functionality |
| Files and docs | **Files and docs** (documentos que llegan al chat) | App functionality |
| App activity | **Other user-generated content** (notas, etiquetas, plantillas, pedidos) | App functionality |
| Device or other IDs | **Device or other IDs** (token push) | App functionality |

**No marques:** Location, Financial info, Health and fitness, Contacts, Calendar, Web browsing, App info and performance, In-app search history ni Installed apps.

**Otros formularios de App content:**

| Formulario | Respuesta |
|---|---|
| **Ads** | No |
| **App access** | All or some functionality is restricted → los datos de la sección 6 |
| **Target audience** | 18 and over |
| **Content rating** | Cuestionario IARC, categoría *Utility, Productivity, Communication, or Other*. Di que permite que los usuarios se comuniquen |
| **Government app** | No |
| **Financial features** | None |
| **Health** | None |
| **News** | No |

### 5.3 Eliminación de cuenta (issue #16): ya está

- **En la app:** **Mi cuenta → Eliminar mi cuenta**. Muestra lo que se borra, se confirma escribiendo **ELIMINAR**, borra al momento y redirige a `/eliminar-datos?cuenta=eliminada`, que confirma que la cuenta se eliminó. Si eres el único dueño de un negocio con equipo, te pide pasar la propiedad primero (`src/app/(app)/account/actions.ts`, `DeleteAccountDialog.tsx`).
- **Apple** pide que se pueda hacer dentro de la app, sin correo ni llamada, y con confirmación al terminar ([5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage), [Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)). **Cumple.**
- **Google** pide una ruta dentro de la app y un enlace web que "reference the app or developer name" y que permita pedir el borrado "without sending the user back to the app" ([Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)).
  - `cheke.io/eliminar-datos` cumple: nombra «cheke», ofrece borrarla desde la web en Mi cuenta y, si ya no puedes entrar, por correo.
  - **Pero el correo dice `[correo@dominio — completar]`.** Hay que llenarlo.
- **Pendiente menor:** el correo de confirmación después de borrar no existe todavía porque no había proveedor de correo cuando se hizo el PR #22. La confirmación en pantalla basta para Apple. Si quieres, pide a tu agente que la mande con Resend, que ya se usa para los códigos.

---

## 6. Notas para la revisión y login de demostración

**Primero enciende el acceso para revisores.** Hoy `https://ventas.cheke.app/login/revisores` dice «El acceso para revisores no está activo». Sigue estos pasos (PR #27):

1. Supabase → **SQL Editor** → corre `supabase/migrations/0015_reviewer_demo.sql`.
2. Vercel → cheke → **Settings → Environment Variables** → `REVIEWER_EMAIL` = `revision@cheke.io` y `REVIEWER_PASSWORD` = una contraseña de 12 caracteres o más (guárdala en tu gestor de contraseñas) → *Production* → **Save** → **Deployments → Redeploy**.
3. Pruébalo tú en el teléfono: pantalla de login → **Acceso para revisores** → debe abrir «Tienda Luna (demo)» con chats.

### 6.1 Apple: App Review Information (en la versión 1.0)

- **Sign-in required:** Yes. **User name:** `revision@cheke.io`. **Password:** la tuya.
- **Contact:** tu nombre, tu teléfono y `hola@cheke.io`.
- **Notes** (en inglés, pegar):

```
cheke is a free companion app for small businesses in Honduras that subscribe to cheke on the web. It is a shared inbox where a business's team answers its customers' WhatsApp, Instagram and Facebook Messenger messages.

HOW TO SIGN IN: on the login screen tap "Acceso para revisores" (Reviewer access) at the bottom and enter the user name and password above. Normal users sign in with a one-time code sent by SMS or email; reviewers can't receive it, so this account uses a password. It opens a demo business ("Tienda Luna (demo)") in test mode with sample conversations, contacts, products and a sales board. Nothing is sent to real people.

WHAT TO TRY: Chat (unified inbox; open a conversation and send a reply, a photo or a voice note), chekeo (sales board; drag a card), Comentarios (post comments), Catálogo (add a product with a photo from the camera or library), Mi cuenta (Face ID sign-in and "Eliminar mi cuenta").

NATIVE FEATURES: push notifications for new customer messages (permission is asked after sign-in, and the app works if it is denied), unread badge on the app icon, tapping a notification opens that conversation, Face ID sign-in, microphone for voice notes, camera/photo library for product photos, and a bundled offline screen.

PAYMENTS: there are no purchases in the app and the app does not show prices or tell users how to pay (Guideline 3.1.3(f), free stand-alone companion to a paid web tool). Plans are handled outside the app with each business.

CHANNELS: connecting a real WhatsApp, Instagram or Facebook account requires the business's own Meta Business account, so the demo business comes with sample data instead.

ACCOUNT DELETION: Mi cuenta > Eliminar mi cuenta (Guideline 5.1.1(v)).
```

### 6.2 Google: App access (Policy → App content → App access)

- Elige **All or some functionality in my app is restricted** → **Add instructions**.
- **Name:** Reviewer demo
- **Username:** `revision@cheke.io`
- **Password:** la tuya
- **Any other information:**

```
On the login screen tap "Acceso para revisores" at the bottom and enter this email and password. Normal users get a one-time code by SMS or email. The account opens a demo business in test mode with sample data; nothing is sent to real people. Connecting real WhatsApp/Instagram/Facebook accounts requires the business's own Meta Business account.
```

---

## 7. Rechazos comunes de apps «envoltorio» (Guideline 4.2) y cómo los cubre cheke

Apple, [§4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality): "Your app should include features, content, and UI that elevate it beyond a repackaged website." Google es menos estricto: su [política de Spam](https://support.google.com/googleplay/android-developer/answer/9899034) prohíbe mostrar en un webview un sitio ajeno, y el sitio es de cheke.

| Motivo de rechazo típico | Guía | Estado en cheke |
|---|---|---|
| «Solo es un sitio web» | 4.2 | Push al llegar un mensaje, globo con los no leídos, tocar la notificación abre el chat, login con Face ID o huella, notas de voz con el micrófono, safe areas, abre en el login o en el Chat y no en la página de marketing (PR #27). ✅ |
| Pantalla en blanco o error de Safari sin internet | 4.2 / 2.1 | `public/offline.html` viene dentro de la app (`errorPath`). ✅ Pruébalo en modo avión |
| Pide permiso de notificaciones al abrir | 4.5.4 / 5.1.1 | Lo pide después del login, en contexto, y la app funciona si se niega. ✅ |
| Cámara o selector de fotos nativo, menú de compartir | 4.2 (señal «app-like») | ⚠️ **Pendiente (issue #18).** Además faltan los textos `NSCameraUsageDescription` y `NSPhotoLibraryUsageDescription`, y sin ellos la app se cierra (sección 2) |
| El revisor no puede entrar | 2.1 | Login para revisores con contraseña. ⚠️ **Apagado en producción** (sección 6) |
| Contenido de relleno o «borrador» | 2.1 / 5.1.1(i) | ⚠️ **cheke.io muestra «Borrador»** y `[… completar]`. Llena `src/lib/company.ts` |
| Compras o precios fuera de IAP | 3.1.1 / 3.1.3(f) | La app oculta planes, precios y pagos (PR #27). ✅ Dilo en las notas |
| Login de terceros sin una opción equivalente | 4.8 | Solo hay código por SMS o correo, passkey y Face ID; no hay login con Google. **No aplica.** ✅ |
| Sin eliminar cuenta dentro de la app | 5.1.1(v) | Mi cuenta → Eliminar mi cuenta. ✅ |
| Funciones que se ven solo de escritorio | 4.2 / 4.0 | Todas las pantallas están adaptadas al teléfono. App solo para iPhone. ✅ |
| Facebook Login dentro del WebView | (riesgo) | ⚠️ Sin probar (issue #4). Si la ventana de Meta no abre en la app, muestra «Conecta tus canales desde una computadora» y dilo en las notas. El revisor no necesita conectar canales |

**Si Apple rechaza por 4.2**, responde en **Resolution Center**, en inglés, listando las funciones nativas de la fila 1 con capturas o un video corto. Si no basta, el issue #18 (cámara y compartir) es lo siguiente que conviene construir. Cuenta con una ronda de rechazo y deja una semana de margen.

---

## 8. Calendario hasta el 31 de diciembre

| Fecha | Hito |
|---|---|
| **Oct 18 (mañana)** | Pedir el D-U-N-S. Crear el correo `@cheke.io`. Pedir a tu agente que llene `company.ts`, que agregue OpenAI a la política de privacidad y que encienda el acceso para revisores. Basic settings de Meta |
| Oct 19 – Nov 7 | Esperar el D-U-N-S. Mientras tanto: Firebase, actualizar macOS o configurar la compilación en la nube, que tu agente genere `ios/` y `android/`, cerrar el issue #18 y los videos de Meta |
| Al llegar el D-U-N-S, más 2 días hábiles | Enroll en Apple como organización y registrarse en Play Console como organización |
| **~Nov 25** | Primer build en **TestFlight** y en **Internal testing** de Play. Probar en teléfonos reales: login, push, Face ID, cámara, modo avión y Conectar WhatsApp |
| **~Dic 7** | **Submit for Review** en las dos tiendas. Apple revisa "50% of submissions in less than 24 hours and 90% in less than 48 hours" ([App Review](https://developer.apple.com/distribute/app-review/)). Google avisa que una cuenta nueva puede tardar "up to seven days or longer" ([Prepare for review](https://support.google.com/googleplay/android-developer/answer/9859751)) |
| Dic 8 – 20 | Margen para una ronda de rechazo |
| **≤ Dic 31** | Publicada en las dos tiendas |
