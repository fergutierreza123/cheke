import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalLayout, Section } from "@/components/LegalLayout";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Eliminación de datos — cheke" };

// Meta requires a public "how to delete your data" page (or callback) for
// apps that use its platforms. Apple and Google also require deleting the
// account from inside the app, so this page points to "Eliminar mi cuenta"
// first and keeps email as the fallback. The in-app flow lands here with
// ?cuenta=eliminada once it's done.
export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const justDeleted = (await searchParams).cuenta === "eliminada";

  return (
    <LegalLayout title="Eliminación de datos">
      {justDeleted && (
        <div role="status" className="rounded-xl border border-accent bg-accent-tint px-4 py-3.5 text-[14.5px] text-ink">
          <strong>Tu cuenta fue eliminada.</strong> Ya no puedes iniciar sesión con ella. Gracias por haber usado{" "}
          {COMPANY.brand}.
        </div>
      )}

      <p>
        Puedes eliminar tu cuenta y tus datos de <strong>{COMPANY.brand}</strong> en cualquier momento. Así se hace:
      </p>

      <Section title="Desde la app (lo más rápido)">
        <Bullets
          items={[
            <>
              Inicia sesión en {COMPANY.brand} y entra a <strong>Mi cuenta</strong>.
            </>,
            <>
              Toca <strong>Eliminar mi cuenta</strong>, revisa lo que se va a borrar y escribe <strong>ELIMINAR</strong>{" "}
              para confirmar.
            </>,
            "Tu cuenta se borra en ese momento: ya no podrás iniciar sesión y dejarás de recibir avisos en tu teléfono. Si estabas en un equipo, sales de él y el negocio sigue para los demás.",
            "Si eres la única persona en tu negocio, también se elimina el negocio completo: contactos, conversaciones, catálogo y fotos, plantillas, pedidos y canales conectados.",
            "Si eres el único dueño y hay más personas en tu equipo, primero haz dueño a otra persona en Equipo; así el negocio no se queda sin quien lo administre.",
          ]}
        />
        <p className="mt-3">
          <Link href="/account" className="font-semibold text-brand underline underline-offset-2">
            Ir a Mi cuenta
          </Link>
        </p>
      </Section>

      <Section title="Si ya no puedes entrar a tu cuenta">
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
