import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LegalFooter } from "@/components/LegalLayout";

// Public home page — what a visitor (or Meta's business reviewers) sees at
// the domain. Signed-in people skip straight into the app.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/chekeo");

  return (
    <div className="min-h-screen bg-bg text-ink">
      <section className="bg-brand-dark px-5 pb-16 pt-6 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Image src="/logos/cheke-wordmark-color.png" alt="cheke" width={96} height={52} priority />
          <Link href="/login" className="rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold hover:bg-white/10">
            Entrar
          </Link>
        </div>
        <div className="mx-auto mt-14 max-w-3xl text-center">
          <h1 className="text-display font-heading text-4xl font-semibold leading-tight sm:text-5xl">
            Todos tus mensajes de <span className="text-accent">WhatsApp, Instagram y Facebook</span> en un solo buzón
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            cheke es el CRM para negocios hondureños que venden por mensajes: responde desde un solo lugar, organiza
            tus ventas y deja que chekelin, tu asistente de IA, atienda la primera respuesta.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className="rounded-xl bg-accent px-6 py-3 text-[15px] font-semibold text-brand-dark hover:opacity-90">
              Empezar
            </Link>
            <Link href="/demo" className="rounded-xl border border-white/25 px-6 py-3 text-[15px] font-semibold hover:bg-white/10">
              Ver demo en iPhone
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-5 py-14 sm:grid-cols-3">
        {[
          ["Un solo buzón", "Los mensajes de todos tus canales llegan al mismo chat. Tu equipo responde sin saltar entre aplicaciones."],
          ["chekelin responde primero", "Un asistente de IA contesta la primera consulta con tu catálogo y tus plantillas, y se pausa solo cuando tú tomas la conversación."],
          ["Tus ventas, ordenadas", "Un tablero muestra en qué etapa está cada cliente, cuánto vale cada venta y a quién hay que darle seguimiento."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">{text}</p>
          </div>
        ))}
      </section>

      <LegalFooter />
    </div>
  );
}
