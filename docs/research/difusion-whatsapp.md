# Difusión por WhatsApp: qué permite Meta (octubre 2026)

Investigación antes de construir "Difusión": mandar una plantilla aprobada (Marketing o Utilidad) a todos los contactos con una etiqueta. Solo fuentes primarias de Meta, leídas el 26 de octubre de 2026. Responde el pendiente "Confirmar (B)" del punto 2 de `docs/research/respond-io-gap.md`.

## Resumen

1. **Sí: un número con Coexistencia puede mandar plantillas de Marketing por la Cloud API.** Meta no lo prohíbe en ninguna parte. Lo único propio de Coexistencia es un **límite fijo de 20 mensajes por segundo** y que las **listas de difusión de la app** quedan desactivadas. Confianza: alta.
2. **Un negocio nuevo puede escribirle a 250 clientes distintos cada 24 h** fuera de la ventana de 24 h. Con el negocio verificado sube a 2,000, y después sube solo (10,000 → 100,000 → ilimitado) si la calidad es buena.
3. **Honduras entra en "Resto de América Latina": Marketing US$0.074 y Utilidad US$0.0113 por mensaje entregado** (tarifa vigente desde el 1 de octubre de 2026).
4. **Opt-in:** el cliente tiene que haber dado su número **y** haber aceptado recibir mensajes de ese negocio. Hay que respetar cualquier "ya no me escriban", se diga dentro o fuera de WhatsApp.
5. **Fecha que importa:** la Cloud API deja de mandar Marketing el **13 de octubre de 2027**. Las cuentas creadas desde el **13 de abril de 2027** ya no podrán hacerlo nunca. Hay que pasarse a la Marketing Messages API (MM API) antes de esa fecha. Hoy la MM API no es obligatoria.

---

## 1. Coexistencia y plantillas de Marketing

**Lo que dice Meta**

- En "Limitations", la página de Coexistencia solo pone dos límites: el de 20 mps y un error con líneas de crédito de un partner anterior. *"business phone numbers that are in use with both the WhatsApp Business app and Cloud API have a fixed throughput of 20 mps"*. [Onboard Business app users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users.md). Lo mismo dice [Throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput.md).
- Precio: *"messages sent via Cloud API will be subject to Cloud API pricing"*. Lo que se manda desde la app sigue siendo gratis (misma página).
- La tabla de funciones dice que las **Broadcast lists** de la app *"will be disabled… Existing Broadcast lists will become read-only"*. La fila "Messaging tools (for example, marketing messages, greeting message…)" dice "Not supported" en la columna *"Is the WhatsApp Business app feature supported on Cloud API?"*. Eso significa que las **herramientas de la app** no pasan a la API. **No** significa que la API no pueda mandar plantillas de Marketing (misma página).
- La ventana de 24 h solo se abre cuando el cliente escribe **después** de conectar. Lo que se manda desde la app no abre ni alarga la ventana de la API (misma página).
- La MM API se puede usar con cualquier número que ya esté registrado en la Cloud API: *"Existing phone numbers remain registered on Cloud API and become eligible to use MM API for WhatsApp alongside Cloud API"*. Para usarla, el negocio acepta los términos en WhatsApp Manager. La página de requisitos no excluye Coexistencia. [MM API Onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/onboarding.md).
- Calendario de la MM API: GA el 19-nov-2025; aviso global el 13-oct-2026; cuentas nuevas sin Marketing por Cloud API desde el 13-abr-2027; apagado total el 13-oct-2027 (*"sending marketing messages on Cloud API will produce an error"*). También: *"Utility messages reclassified as marketing must route to MM API"*. [MM API Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/overview.md) · [página anterior](https://developers.facebook.com/docs/whatsapp/marketing-messages-api-for-whatsapp).

**Límites que aplican a todos los números, con o sin Coexistencia**

- **Límite de Marketing por persona.** WhatsApp puede no entregar Marketing a alguien que lee poco. Responde con el error **131049**: hay que esperar al menos 24 h antes de reintentar, porque reintentar antes bloquea hasta 24 h más. Si el cliente contesta, los mensajes de Marketing dentro de esa ventana no cuentan. Los números de **EE. UU. (+1)** no reciben Marketing. [Per-user marketing template limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits.md).
- **El cliente puede detener el Marketing** desde "Ofertas y anuncios". Meta acepta el envío pero no lo entrega, y avisa con el error **131050**. El webhook `user_preferences` avisa cuando el cliente lo detiene o lo reanuda. [Marketing templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates.md).

**Veredicto:** Sí, con confianza alta. Ninguna página prohíbe Marketing en Coexistencia, y la página de precios lo cobra como cualquier mensaje de la API. Lo que no está documentado: Meta no dice nada específico de "Coexistencia + MM API". El riesgo es bajo, porque la MM API usa los mismos números de la Cloud API.

## 2. Límite de mensajes por día

- El límite cuenta **clientes distintos fuera de la ventana de 24 h, en 24 h móviles**. Se fija **por portafolio de negocio** y lo comparten todos sus números. Un portafolio nuevo arranca en **250**. [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md).
- **Para llegar a 2,000** basta una de estas: verificar el negocio, que el partner lo verifique, o entregar 2,000 mensajes fuera de ventana a números distintos en 30 días con plantillas de calidad alta (misma página).
- **Después sube solo** a 10,000, 100,000 e ilimitado, siempre que se cumplan dos cosas: mensajes de calidad alta en todos los números y plantillas, y haber usado al menos la mitad del límite en los últimos 7 días. Sube dentro de 6 h (misma página).
- **Calidad:** desde el 7-oct-2025, si la calidad del número baja, *"its messaging limit will not be downgraded"* (ya no existe el estado "Flagged"). Pero con calidad baja el límite deja de subir, y las plantillas pueden **pausarse o desactivarse**. [Upcoming changes to messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/upcoming-messaging-limits-changes.md) · [Template quality](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality.md) (GREEN / YELLOW / RED).
- Para leer el límite por API se usa el campo `whatsapp_business_manager_messaging_limit`. `messaging_limit_tier` está obsoleto (Messaging limits).
- Meta también puede limitar a los negocios que mantienen calidad baja: *"Our systems will rate limit businesses if the business's quality is low for a sustained period of time"*. [Getting opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in.md).

## 3. Precio para Honduras

- El cobro es **por mensaje** desde el 1-jul-2025. Lo que escribe el cliente es gratis. Dentro de la ventana de servicio, las plantillas de Utilidad son gratis. Si el cliente llegó por un anuncio Click-to-WhatsApp, hay una ventana gratuita (FEP) para Marketing, Utilidad, Autenticación y Servicio. [Pricing](https://developers.facebook.com/docs/whatsapp/pricing).
- Honduras (+504) está en **"Rest of Latin America"** (misma página, tabla de códigos de país).
- **Tarifa en USD vigente desde el 1-oct-2026** (CSV de Meta enlazado desde [Pricing](https://developers.facebook.com/docs/whatsapp/pricing). El archivo es un .xlsx aunque diga .csv; tarifas interactivas en [business.whatsapp.com/products/platform-pricing#rates](https://business.whatsapp.com/products/platform-pricing#rates)):

| Región | Marketing | Utilidad | Autenticación | Servicio |
|---|---|---|---|---|
| Rest of Latin America (incluye Honduras) | **US$0.0740** | **US$0.0113** | US$0.0113 | US$0.0113 |

- La misma hoja dice: *"Marketing rates apply across Cloud API and Marketing Messages Lite API"*. Pasarse a la MM API no cambia el precio.
- Hay descuentos por volumen solo para Utilidad y Autenticación (en EUR, desde 100,001 mensajes al mes). No le aplican a una tienda pequeña.
- Ejemplo: 250 clientes × US$0.074 = **US$18.50** por cada envío de Marketing. Con Utilidad serían US$2.83.

## 4. Opt-in

- *"Businesses may contact people on WhatsApp if: (a) they have given their mobile phone number; and (b) businesses have received opt-in permission from the recipient confirming that they wish to receive subsequent messages or calls from a particular business."* El permiso puede ser general (no tiene que mencionar WhatsApp), pero tiene que decir el **nombre del negocio** y que la persona acepta recibir mensajes. [Getting opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in.md).
- Meta recomienda pedir permiso por categoría (ofertas aparte de avisos de pedido) y dar instrucciones claras para darse de baja (misma página).
- *"You must respect all requests (either on or off WhatsApp) by a person to block, discontinue, or otherwise opt out."* [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/) (antes business.whatsapp.com/policy).
- Que el cliente le haya escrito antes a la tienda **no** cuenta por sí solo como opt-in para Marketing. Es la base más defendible, pero la tienda igual necesita un "sí, mándame ofertas".

---

## Qué ya existe en cheke

- `src/lib/whatsappTemplates.ts`: tipo `WhatsAppTemplate` con `category` y `status`; `templateVariables`, `renderTemplate` y `firstName`, que llena `{{1}}` con el nombre.
- `src/lib/whatsappTemplatesServer.ts`: sincroniza y crea plantillas, y `sendTemplateMessage()` envía una plantilla a un número y devuelve `errorCode`.
- `src/lib/whatsappErrors.ts`: ya traduce 131049 y 131050 al español.
- `Contact.tags: string[]` existe (`src/lib/types.ts`) pero la pantalla no lo usa. `Channel.coexistence` también existe.
- No hay campo de "no quiere ofertas" ni nada de difusiones.

## Qué construir (mínimo)

1. **Pantalla de vista previa antes de enviar.** Se elige una plantilla `APPROVED` y una etiqueta. La pantalla muestra cuántos la van a recibir: contactos con esa etiqueta, con teléfono, sin `marketing_opt_out` y, si la plantilla es Marketing, sin números +1. Muestra también el costo estimado: `n × 0.074` (Marketing) o `n × 0.0113` (Utilidad) en USD, con su equivalente en Lempiras. Si `n` pasa el límite de 24 h, avisa ("hoy se envían 250, el resto mañana"). La tarifa va en una constante con la fecha y el enlace a la fuente.
2. **Enviar por partes respetando el límite.** Se guarda una fila `broadcast` con un estado por destinatario (`pendiente / enviado / falló + errorCode`). Un cron reutiliza `sendTemplateMessage()`, que ya existe, y manda en lotes pequeños (muy por debajo de 20 mps). Cada lote se corta al llegar al límite de 24 h del portafolio. Ese límite se lee de `whatsapp_business_manager_messaging_limit`; si no se puede leer, se usa 250. Con error 131049 no se reintenta antes de 24 h, y como máximo se reintenta una vez. Cada envío queda en el Chat como cualquier plantilla, y chekelin atiende las respuestas.
3. **Bajas.** Agregar `contacts.marketing_opt_out boolean`. Se marca en tres casos: cuando llega un 131050, cuando llega el webhook `user_preferences` con "stop", y cuando el cliente responde "BAJA", "no más" o "stop". Se desmarca con "resume". Además, una casilla obligatoria antes del primer envío: "Confirmo que estos clientes aceptaron recibir ofertas de [nombre de la tienda]".

Lo que queda fuera: programar la hora, pruebas A/B, segmentos con varias etiquetas y la MM API. La migración a la MM API sí tiene fecha: cambiar el endpoint de Marketing antes del 13-abr-2027 para cuentas nuevas, y antes del 13-oct-2027 para todas.
