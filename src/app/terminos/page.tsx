import type { Metadata } from "next";
import { Bullets, LegalLayout, Section } from "@/components/LegalLayout";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Términos de uso — cheke" };

export default function TermsPage() {
  return (
    <LegalLayout title="Términos de uso">
      <p>
        Al crear una cuenta o usar <strong>{COMPANY.brand}</strong>, operada por {COMPANY.legalName}, aceptas estos
        términos. Si no estás de acuerdo, no uses el servicio.
      </p>

      <Section title="1. El servicio">
        <p>
          {COMPANY.brand} es una plataforma de bandeja de entrada unificada y CRM para negocios que venden por
          WhatsApp, Instagram y Facebook: recibir y responder mensajes, organizar ventas, administrar un catálogo y
          plantillas, y usar un asistente de IA (chekelin) para la primera respuesta.
        </p>
      </Section>

      <Section title="2. Tu cuenta">
        <Bullets
          items={[
            "Debes dar información verdadera y mantener seguro tu acceso. Eres responsable de lo que ocurre en tu cuenta y de las personas a quienes invitas a tu equipo.",
            "Debes tener autoridad para actuar en nombre del negocio que registras.",
          ]}
        />
      </Section>

      <Section title="3. Uso aceptable">
        <p>Te comprometes a usar el servicio de forma legal y a respetar las políticas de las plataformas conectadas, incluidos los términos de WhatsApp Business y las políticas de comercio de Meta. En particular, no puedes:</p>
        <Bullets
          items={[
            "Enviar spam, mensajes masivos no solicitados ni escribir a personas que no te dieron su consentimiento.",
            "Vender o promover productos o servicios prohibidos por esas políticas.",
            "Intentar acceder a datos de otros negocios, interferir con el servicio o usarlo para fraude o acoso.",
          ]}
        />
        <p>Podemos suspender cuentas que incumplan estas reglas.</p>
      </Section>

      <Section title="4. Tus datos y los de tus clientes">
        <p>
          Tú conservas la propiedad del contenido que cargas y de las conversaciones con tus clientes. Nos autorizas a
          tratarlos solo para prestarte el servicio, como describe la{" "}
          <a href="/privacidad" className="text-brand underline">política de privacidad</a>. Eres responsable de contar
          con las bases legales y los consentimientos necesarios para escribirles a tus clientes.
        </p>
      </Section>

      <Section title="5. Asistente de IA">
        <p>
          chekelin genera respuestas automáticas a partir de tu catálogo y plantillas. Puede equivocarse: tú decides si
          lo activas y puedes pausarlo en cualquier conversación y responder tú mismo. Revisa que la información de tu
          catálogo sea correcta.
        </p>
      </Section>

      <Section title="6. Disponibilidad y cambios">
        <p>
          Trabajamos para que el servicio esté disponible, pero no garantizamos que funcione sin interrupciones.
          Dependemos de plataformas de terceros (por ejemplo Meta), cuyas reglas o fallas pueden afectar el servicio.
          Podemos mejorar o modificar funciones y te avisaremos de cambios importantes.
        </p>
      </Section>

      <Section title="7. Precios">
        <p>
          Los planes y precios se comunicarán antes de cobrarte cualquier cantidad. Los costos que cobre Meta por el uso
          de WhatsApp Business Platform son independientes de cheke.
        </p>
      </Section>

      <Section title="8. Responsabilidad">
        <p>
          En la medida que permita la ley, {COMPANY.brand} no responde por pérdidas indirectas, por ventas no
          concretadas ni por contenidos que tú o tus clientes envíen. Nuestra responsabilidad total se limita a lo que
          hayas pagado por el servicio en los últimos doce meses.
        </p>
      </Section>

      <Section title="9. Terminación">
        <p>
          Puedes dejar de usar cheke y pedir la eliminación de tu cuenta cuando quieras. Podemos suspender o cerrar
          cuentas que incumplan estos términos.
        </p>
      </Section>

      <Section title="10. Ley aplicable y contacto">
        <p>
          Estos términos se rigen por las leyes de {COMPANY.country}. Dudas: {COMPANY.email} · {COMPANY.phone} ·{" "}
          {COMPANY.address}, {COMPANY.city}.
        </p>
      </Section>
    </LegalLayout>
  );
}
