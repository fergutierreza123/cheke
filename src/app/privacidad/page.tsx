import type { Metadata } from "next";
import { Bullets, LegalLayout, Section } from "@/components/LegalLayout";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Política de privacidad — cheke" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad">
      <p>
        Esta política explica qué datos trata <strong>{COMPANY.brand}</strong> (operada por {COMPANY.legalName},
        con domicilio en {COMPANY.address}, {COMPANY.city}, {COMPANY.country}) y para qué los usa. {COMPANY.brand}{" "}
        es una plataforma para que negocios atiendan en un solo lugar los mensajes que reciben por WhatsApp,
        Instagram y Facebook.
      </p>

      <Section title="1. Quién es responsable de qué">
        <p>
          Con los datos de las <strong>personas que usan cheke</strong> (los negocios y su equipo), {COMPANY.brand} es
          el responsable. Con los datos de <strong>los clientes de esos negocios</strong> (quienes les escriben por
          WhatsApp, Instagram o Facebook), cada negocio es el responsable y {COMPANY.brand} actúa por cuenta de él,
          tratándolos solo para prestar el servicio.
        </p>
      </Section>

      <Section title="2. Qué datos tratamos">
        <Bullets
          items={[
            "Cuenta: correo electrónico, nombre del negocio, rol dentro del equipo y, si inicias sesión con Google, tu nombre y correo de Google (nunca tu contraseña).",
            "Contenido que cargas: catálogo de productos (nombres, precios, descripciones, fotos), plantillas de mensajes, notas y etapas de venta de tus contactos.",
            "Conversaciones: los mensajes que reciben y envían los canales que conectas (texto, y descripción de fotos, audios o documentos), junto con el nombre, el teléfono o el usuario de quien escribe y la hora de cada mensaje.",
            "Conexión con canales: identificadores de tu cuenta de WhatsApp Business y una credencial de acceso que guardamos cifrada.",
            "Datos técnicos: el identificador del teléfono para enviarte notificaciones (si instalas la app) y registros básicos de funcionamiento.",
          ]}
        />
      </Section>

      <Section title="3. Para qué los usamos">
        <Bullets
          items={[
            "Mostrar y enviar mensajes en tu buzón unificado, organizar tus ventas y notificarte cuando llega un mensaje.",
            "Generar respuestas automáticas con chekelin, nuestro asistente de IA, cuando tú lo activas.",
            "Mantener la seguridad del servicio, evitar abusos y cumplir obligaciones legales.",
          ]}
        />
        <p>No vendemos datos personales ni los usamos para publicidad de terceros.</p>
      </Section>

      <Section title="4. Con quién compartimos datos">
        <p>Solo con proveedores que necesitamos para operar el servicio:</p>
        <Bullets
          items={[
            "Meta Platforms (WhatsApp Business Platform, Instagram y Messenger): para recibir y enviar los mensajes de los canales que conectas.",
            "Supabase y Vercel: almacenamiento de la base de datos, archivos y alojamiento de la aplicación.",
            "Anthropic: cuando chekelin está activo, el texto de la conversación y la información de tu catálogo se envían a su servicio para redactar la respuesta.",
            "Google y Firebase: inicio de sesión con Google y envío de notificaciones al teléfono.",
            "remove.bg: procesamiento de las fotos de productos que subes para quitarles el fondo.",
          ]}
        />
      </Section>

      <Section title="5. Seguridad y conservación">
        <p>
          Cada negocio solo puede ver sus propios datos. Las credenciales de los canales se guardan cifradas y las
          comunicaciones viajan por conexiones seguras. Conservamos los datos mientras tu cuenta esté activa y los
          eliminamos cuando lo solicitas (ver la página de{" "}
          <a href="/eliminar-datos" className="text-brand underline">eliminación de datos</a>), salvo lo que la ley
          nos obligue a conservar.
        </p>
      </Section>

      <Section title="6. Tus derechos">
        <p>
          Puedes pedirnos acceso, corrección o eliminación de tus datos escribiendo a {COMPANY.email}. Si eres cliente
          de un negocio que usa cheke y quieres ejercer estos derechos sobre tus mensajes, puedes dirigirte al negocio
          o a nosotros y te ayudaremos a gestionarlo.
        </p>
      </Section>

      <Section title="7. Menores de edad">
        <p>cheke está dirigido a negocios y no a menores de edad; no recopilamos datos de menores a sabiendas.</p>
      </Section>

      <Section title="8. Cambios y contacto">
        <p>
          Si cambiamos esta política publicaremos la nueva versión aquí con su fecha. Para cualquier duda:{" "}
          {COMPANY.email} · {COMPANY.phone}.
        </p>
      </Section>
    </LegalLayout>
  );
}
