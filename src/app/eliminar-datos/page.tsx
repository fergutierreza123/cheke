import type { Metadata } from "next";
import { Bullets, LegalLayout, Section } from "@/components/LegalLayout";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Eliminación de datos — cheke" };

// Meta requires a public "how to delete your data" page (or callback) for
// apps that use its platforms.
export default function DataDeletionPage() {
  return (
    <LegalLayout title="Eliminación de datos">
      <p>
        Puedes pedir que eliminemos tus datos de <strong>{COMPANY.brand}</strong> en cualquier momento. Así se hace:
      </p>

      <Section title="Si eres un negocio que usa cheke">
        <Bullets
          items={[
            <>Escribe a <strong>{COMPANY.email}</strong> desde el correo de tu cuenta con el asunto «Eliminar mis datos».</>,
            "Indica el nombre de tu negocio. Eliminaremos tu cuenta, tu catálogo, tus plantillas, tus contactos y conversaciones, y desconectaremos tus canales de WhatsApp, Instagram y Facebook.",
            "Lo haremos en un máximo de 30 días y te confirmaremos por correo cuando termine.",
          ]}
        />
      </Section>

      <Section title="Si eres cliente de un negocio que usa cheke">
        <p>
          Si le escribiste a un negocio por WhatsApp, Instagram o Facebook y quieres que se borren tus mensajes y tus
          datos de contacto, escríbenos a {COMPANY.email} con tu nombre y el teléfono o usuario desde el que escribiste,
          e indica a qué negocio le escribiste si lo sabes. También puedes pedírselo directamente al negocio.
        </p>
      </Section>

      <Section title="Datos en Facebook, Instagram o WhatsApp">
        <p>
          Eliminar tus datos de cheke no borra lo que tengas en Meta. Para eso usa la configuración de privacidad de
          tu cuenta en Facebook, Instagram o WhatsApp.
        </p>
      </Section>

      <Section title="Qué podemos conservar">
        <p>
          Solo lo que la ley nos obligue a guardar (por ejemplo registros de facturación), y copias de seguridad que se
          borran automáticamente en pocas semanas.
        </p>
      </Section>
    </LegalLayout>
  );
}
