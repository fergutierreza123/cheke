# Cheke CRM

CRM omnicanal para negocios hondureños que venden por WhatsApp, Instagram y
Facebook. Ver `CLAUDE.md` para el plan completo del proyecto y las reglas de
interacción/animación.

## Qué es esto ahora mismo (Fase 2 — Chat + Contactos)

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
  negocio está vacío, para poder probar/mostrar la app antes de conectar
  WhatsApp, Instagram o Facebook de verdad (eso es la Fase 4 en adelante).
- Las demás secciones (Chekeo, Comentarios, Plantillas, Inventario, Equipo,
  Notificaciones, Analítica) todavía muestran el aviso de "próximamente".
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
2. Abre el archivo `supabase/migrations/0001_init.sql` de este proyecto,
   copia todo su contenido, pégalo en el SQL Editor y dale **Run**.
3. Deberías ver las tablas nuevas en **Table Editor**: `businesses`,
   `members`, `contacts`, `conversations`, `messages`, etc.

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

## Siguiente fase

Fase 3 en `CLAUDE.md`: desplegar a GitHub + Vercel con variables de entorno
y dominio propio.
