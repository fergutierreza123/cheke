# Cheke CRM

CRM omnicanal para negocios hondureños que venden por WhatsApp, Instagram y
Facebook. Ver `CLAUDE.md` para el plan completo del proyecto y las reglas de
interacción/animación.

## Qué es esto ahora mismo (demo completa, WhatsApp real bloqueado en Meta)

- Proyecto Next.js (App Router, TypeScript) + Tailwind, listo para correr.
- Esquema de base de datos multi-negocio con seguridad por fila (RLS) —
  `supabase/migrations/0001_init.sql` y `0002_onboarding_rpc.sql`.
- Login por correo (enlace mágico, sin contraseña) y pantalla para crear tu
  negocio o unirte a uno con un código de invitación.
- El "shell" de la app: el menú lateral con las 9 secciones del diseño, con
  un indicador de sección activa que se desliza suavemente (usando `motion`).
- **Contactos** conectado a datos reales: lista, búsqueda, crear/editar
  contacto (nombre, teléfono, Instagram, Facebook, notas), panel de detalle.
- **Chat** conectado a datos reales: lista de conversaciones con filtro por
  canal, hilo de mensajes, enviar respuesta — y **Realtime**: los mensajes
  nuevos aparecen al instante sin recargar la página.
- Ambas pantallas incluyen un botón de "Sembrar datos de ejemplo" cuando un
  negocio está vacío, para poder probar/mostrar la app sin depender de
  WhatsApp real.
- **Desplegado de verdad** en Vercel (Fase 3), conectado a GitHub — cada
  `git push` a `main` publica una nueva versión automáticamente.
- **WhatsApp Cloud API** conectado con un número de prueba: los mensajes que
  te escriben de verdad por WhatsApp llegan al Chat (`/api/whatsapp/webhook`
  recibe y guarda), y lo que respondes desde el Chat se envía de verdad por
  WhatsApp (`sendWhatsAppMessage` en `src/lib/whatsapp.ts`). Ver la sección
  de abajo para conectar tu propio número de prueba.
- **Chekeo** conectado a datos reales: tablero kanban con las 6 etapas de
  venta, arrastra contactos entre columnas (o usa las flechas), valor del
  negocio en Lempiras, tasa de cierre, aviso de contactos sin respuesta en
  24h. Comparte los mismos datos que Chat — mover la etapa desde cualquiera
  de las dos pantallas se refleja en la otra.
- **Inventario** conectado a datos reales: catálogo de productos, categoría,
  precio en Lempiras, stock, aviso de poco inventario, botón "Enviar por
  chat" que manda el producto a cualquier conversación existente.
- **Plantillas** conectado a datos reales: mensajes reutilizables por
  categoría, "Copiar plantilla" para pegar en cualquier chat.
- **Equipo** conectado a datos reales: quién tiene acceso al negocio, su
  rol, código de invitación, cambiar rol o quitar a alguien (solo el
  dueño). El diseño original era un ranking de ventas por vendedor — no
  construible con datos reales todavía porque nada asigna conversaciones a
  un vendedor específico ni registra metas; ver el comentario en
  `supabase/migrations/0007_team_management.sql`.
- **Analítica** conectado a datos reales: KPIs (ventas cerradas, tasa de
  conversión, contactos nuevos, activos), embudo por etapa, conversaciones
  por canal, tendencia de 7 días, productos con más valor en existencia —
  con selector de semana/mes/trimestre.
- **Notificaciones** conectado a datos reales: mensajes nuevos, contactos
  fríos, poco inventario, ventas cerradas recientes — calculado en vivo en
  cada carga (no hay tabla de notificaciones todavía, así que "marcar como
  leída" no persiste entre sesiones).
- **Comentarios** es la única pantalla que sigue en "próximamente" —
  necesita los webhooks de comentarios de Instagram/Facebook de Meta.
- **Chekelin**, el asistente de IA: responde automáticamente el primer
  mensaje (y los siguientes, hasta que un agente responda a mano) usando tu
  catálogo y tus plantillas reales como referencia. Se puede activar o
  pausar por conversación desde el Chat. Necesita una clave de Anthropic —
  ver la sección "Chekelin" más abajo. Todavía no cambia la etapa del
  Chekeo automáticamente — eso es la siguiente fase.
- Reglas de interacción y movimiento documentadas en `CLAUDE.md` — de ahí
  sale el estilo de las animaciones (resortes, no curvas de tiempo fijas;
  feedback al presionar, no al soltar; `prefers-reduced-motion` respetado).

## Cómo probarlo tú mismo

### 1. Crear el proyecto de Supabase (una sola vez)

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratis.
2. Clic en **New project**. Ponle un nombre (ej. `cheke`) y una contraseña de
   base de datos (guárdala en un lugar seguro, no la necesitarás seguido).
3. Cuando el proyecto esté listo, ve a **Project Settings → API**. Ahí vas a
   ver dos valores que necesitas:
   - **Project URL**
   - **anon public key**

### 2. Configurar las variables de entorno

1. En la carpeta del proyecto, copia `.env.local.example` a un archivo nuevo
   llamado `.env.local`.
2. Pega ahí el **Project URL** y el **anon public key** del paso anterior.

### 3. Crear las tablas en Supabase

1. En el panel de Supabase, ve a **SQL Editor**.
2. Corre los archivos de `supabase/migrations/` **en orden numérico**,
   uno por uno (copia el contenido de cada uno, pégalo en una consulta
   nueva, dale **Run**, sigue con el siguiente): `0001_init.sql`,
   `0002_onboarding_rpc.sql`, `0003_conversation_stage.sql`,
   `0004_conversation_value.sql`, `0005_products_category.sql`,
   `0006_templates.sql`, `0007_team_management.sql`, `0008_chatbot.sql`.
3. Deberías ver las tablas nuevas en **Table Editor**: `businesses`,
   `members`, `contacts`, `conversations`, `messages`, `templates`, etc.

### 4. Activar el login por correo

Ya viene activado por defecto en Supabase (Authentication → Providers →
Email). No necesitas hacer nada extra para probarlo en desarrollo local.

### 5. Correr la app en tu computadora

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Te va a mandar a
`/login`: escribe tu correo, revisa tu bandeja de entrada, haz clic en el
enlace. La primera vez te va a pedir crear tu negocio — después de eso vas a
ver el menú completo.

> Nota técnica: este proyecto trae su propio `.npmrc` apuntando a una caché
> local (`.npm-cache/`) porque tu caché global de npm tenía archivos con
> permisos de `root` de una instalación anterior. No afecta nada — `npm
> install` simplemente funciona. Si algún día quieres arreglar la caché
> global también, el comando es `sudo chown -R 501:20 ~/.npm`.

## Estructura del proyecto

```
src/app/
  login/            página de inicio de sesión
  auth/callback/     recibe el enlace mágico de Supabase
  onboarding/         crear o unirse a un negocio
  (app)/              todo lo que requiere sesión iniciada
    chat/ chekeo/ contacts/ comments/ templates/
    inventory/ team/ notifications/ analytics/
src/components/       Sidebar, componentes compartidos
src/lib/supabase/      clientes de Supabase (browser y servidor)
src/lib/business.ts    helper para saber a qué negocio pertenece el usuario
supabase/migrations/   esquema de base de datos + RLS
design/                mockups aprobados (no editar — son la referencia)
```

## Cómo probar Chat y Contactos

1. Entra a la app y ve a **Contactos** o **Chat**.
2. Si el negocio está vacío, verás un botón **"Sembrar datos de ejemplo"** —
   haz clic para crear 6 contactos, sus conversaciones y algunos mensajes.
3. En **Contactos**: busca, haz clic en un contacto para ver su detalle, o
   en "Nuevo contacto" para agregar uno (o el lápiz para editar).
4. En **Chat**: elige una conversación, escribe una respuesta y presiona
   enter o el botón de enviar. Para ver Realtime en acción, abre la misma
   cuenta en dos pestañas/navegadores y envía un mensaje en una — debería
   aparecer en la otra al instante, sin recargar.

## Cómo probar Chekeo, Inventario, Plantillas, Equipo, Analítica y Notificaciones

Antes de nada, corre las migraciones `0003` a `0007` en el SQL Editor de
Supabase (ver la sección de migraciones más abajo) — si no, Chekeo,
Plantillas y Equipo no van a guardar cambios de verdad.

- **Chekeo**: arrastra una tarjeta entre columnas, o usa las flechas ‹ › en
  cada tarjeta. Haz clic en una tarjeta para ver/editar el valor del
  negocio y cambiar la etapa desde ahí también. "Nuevo contacto" agrega un
  lead sin necesidad de que te haya escrito primero.
- **Inventario**: "Nuevo producto" para agregar uno, "Enviar por chat" en
  cualquier producto para mandarlo como mensaje a una conversación real.
- **Plantillas**: filtra por categoría, "Copiar plantilla" copia el texto
  (con `{{producto}}`, `{{precio}}`, `{{ciudad}}` de marcador) para pegarlo
  en el Chat.
- **Equipo**: copia el código de invitación y pruébalo uniéndote desde otra
  cuenta de correo (o pide a alguien que lo use). Si eres dueño, puedes
  cambiar roles o quitar gente.
- **Analítica**: cambia entre "Esta semana / Este mes / Este trimestre" y
  mira los números moverse — todo sale de tus conversaciones y productos
  reales, no hay datos inventados.
- **Notificaciones**: aparecen solas según lo que ya tengas en Chat/Chekeo/
  Inventario (mensajes recientes, contactos fríos, poco stock, ventas
  cerradas). Cada notificación tiene su propio botón ✓ para marcarla leída
  (no hay "marcar todas" — se quitó a propósito).

## Conectar tu número de prueba de WhatsApp

### 1. Crear la app de Meta

1. Entra a [developers.facebook.com](https://developers.facebook.com) e
   inicia sesión con tu cuenta de Facebook (o crea una).
2. **Mis apps → Crear app**. Elige el tipo **"Empresa"**, ponle un nombre.
3. En el panel de la app, busca el producto **WhatsApp** en la lista y haz
   clic en **Configurar**.
4. En **WhatsApp → Configuración de la API**, vas a ver:
   - Un **número de teléfono de prueba** (ya viene listo, no hay que pagar).
   - Un **Token de acceso temporal** (dura 24h — luego se puede generar uno
     permanente, pero para probar sirve este).
   - El **ID del número de teléfono** (debajo del número de prueba).
5. En **Configuración de la app → Básica**, copia el **secreto de la app**
   (App Secret) — hay que hacer clic en "Mostrar" y puede pedir tu contraseña.

### 2. Guardar las variables de entorno

Abre `.env.local` (en la raíz del proyecto) y completa estas líneas con lo
que copiaste — **este archivo nunca se sube a GitHub**, así que es seguro
pegarlo ahí directamente en tu computadora:

```
WHATSAPP_ACCESS_TOKEN=el-token-temporal-que-copiaste
WHATSAPP_PHONE_NUMBER_ID=el-id-del-numero-de-telefono
WHATSAPP_APP_SECRET=el-secreto-de-la-app
WHATSAPP_VERIFY_TOKEN=inventa-cualquier-palabra-clave-aqui
```

`WHATSAPP_VERIFY_TOKEN` no viene de ningún lado — es una contraseña que tú
inventas y usas en dos lugares (aquí, y en el paso de Meta más abajo).

También necesitas la **service role key** de Supabase — es distinta a la
`anon public key` que ya usamos, y es más sensible (da acceso completo a la
base de datos). Ve a tu [Supabase API Settings](https://supabase.com/dashboard/project/sxhrbeqfecddzcmkweix/settings/api-keys),
busca **service_role**, cópiala, y agrégala tú mismo a `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=la-service-role-key
```

(Este valor no me lo compartas a mí — pégalo directo en el archivo.)

### 3. Crear el canal de WhatsApp para tu negocio

Como todavía no existe un botón "Conectar WhatsApp" en la app (eso es la
Fase 5), hay que crear esa conexión una vez a mano. En el **SQL Editor** de
Supabase, corre esto (reemplaza los dos valores marcados):

```sql
insert into channels (business_id, type, external_id, status)
values (
  'tu-business-id',            -- ve a la tabla "businesses" en Table Editor y copia el id
  'whatsapp',
  'el-id-del-numero-de-telefono', -- el mismo WHATSAPP_PHONE_NUMBER_ID de arriba
  'connected'
);
```

### 4. Correr la app y probar localmente

```bash
npm run dev
```

En **WhatsApp → Configuración de la API** en Meta, hay una sección para
mandarte un mensaje de prueba a tu propio WhatsApp desde el número de
prueba — respóndele desde tu teléfono. Como el webhook todavía no está
registrado, no vas a ver el mensaje en el Chat todavía; eso es el paso 5.

### 5. Registrar el webhook (para producción)

Esto necesita una URL pública, así que se hace sobre lo ya desplegado en
Vercel, no en localhost:

1. Agrega las mismas 4 variables de WhatsApp (y la service role key) en
   **Vercel → tu proyecto → Settings → Environment Variables**, igual que
   hicimos con las de Supabase.
2. Vuelve a desplegar (Vercel → Deployments → "..." → Redeploy) para que
   tome las variables nuevas.
3. En Meta, **WhatsApp → Configuración → Webhooks → Editar**:
   - **URL de retorno de llamada**: `https://cheke-eight.vercel.app/api/whatsapp/webhook`
   - **Token de verificación**: el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`
4. Clic en **Verificar y guardar**.
5. Debajo, suscríbete al campo **messages**.

Ahora escríbele al número de prueba desde tu teléfono — el mensaje debería
aparecer en **Chat** casi al instante (gracias a Realtime), y lo que
respondas desde ahí debería llegarte de verdad a WhatsApp.

## Chekelin (asistente de IA)

Chekelin responde automáticamente el primer mensaje de un cliente (y los
siguientes, mientras ningún agente humano haya respondido a mano todavía)
usando tu catálogo de Inventario y tus Plantillas como referencia — nunca
inventa precios que no estén ahí. En cuanto tú o un agente responde algo
manualmente desde el Chat, Chekelin se pausa solo para esa conversación
("handoff"): no se pisan las respuestas. Se puede volver a activar o pausar
a mano con el botón "Chekelin activo/pausado" en la cabecera del Chat.

### 1. Obtener una clave de Anthropic

1. Entra a [console.anthropic.com](https://console.anthropic.com) y crea una
   cuenta (o inicia sesión).
2. Ve a **Billing** y agrega un método de pago — la API se cobra por uso,
   pero cada respuesta de Chekelin cuesta una fracción de centavo (usa el
   modelo más económico, Claude Haiku).
3. Ve a **API Keys** → **Create Key**. Ponle un nombre (ej. `cheke-prod`) y
   cópiala — Anthropic solo la muestra una vez.

### 2. Guardarla en tu proyecto (sin pegarla en el chat conmigo)

Corre esto en tu terminal, dentro de la carpeta del proyecto — te va a pedir
que pegues la clave ahí mismo (no se va a ver en pantalla mientras escribes,
eso es normal) y la guarda directo en `.env.local`:

```bash
printf "ANTHROPIC_API_KEY=" >> .env.local && read -s key && printf "%s\n" "$key" >> .env.local && unset key
```

Reinicia `npm run dev` si lo tenías corriendo, para que tome la variable
nueva.

### 3. Agregarla también en Vercel (para que funcione en producción)

1. En tu proyecto en [vercel.com](https://vercel.com), ve a **Settings →
   Environment Variables**.
2. Agrega `ANTHROPIC_API_KEY` con el mismo valor, marcada para
   **Production** (y Preview si quieres probarla ahí también).
3. Ve a **Deployments** y dale **Redeploy** al último deploy para que tome
   la variable nueva.

### 4. Probarlo sin esperar a WhatsApp real

En **Chat**, abre cualquier conversación y haz clic en el ícono de robot 🤖
junto al cuadro de texto — eso activa el "modo prueba", donde escribes como
si fueras el cliente. Envía un mensaje y Chekelin te va a responder de
verdad usando tu catálogo. Es solo para probar/mostrar la demo; no manda
nada por WhatsApp real. Cuando WhatsApp esté conectado, Chekelin responde
igual de forma automática a los mensajes que de verdad lleguen.

## Siguiente fase

Fase 5 en `CLAUDE.md`: Embedded Signup — que cada negocio pueda conectar su
propio WhatsApp existente desde un botón en la app, sin tocar SQL a mano.

Después de eso: que Chekelin, además de responder, también elija
automáticamente la etapa del Chekeo según la conversación (hoy la etapa
sigue siendo manual).
