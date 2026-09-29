import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { createBusiness, joinBusiness } from "./actions";
import { OnboardingCard } from "./OnboardingCard";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const business = await getCurrentBusiness();
  if (business) redirect("/chekeo");

  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark px-4">
      <div className="w-full max-w-md">
        <Image
          src="/logos/cheke-icon-blue.png"
          alt="Cheke"
          width={64}
          height={75}
          className="mx-auto mb-4"
        />
        <h1 className="text-display text-center font-heading text-2xl font-semibold text-white">
          Configuremos tu negocio y <span className="text-brand">chekea</span>{" "}
          cómo crecen tus ventas
        </h1>
        <p className="mt-1 text-center text-sm text-white/70">
          Crea el negocio de tu equipo, o únete a uno con un código de
          invitación.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-danger-border bg-danger-tint px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <OnboardingCard title="Crear un negocio nuevo" action={createBusiness}>
          <input
            name="name"
            required
            placeholder="Ej. Boutique Alaia"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Crear negocio
          </button>
        </OnboardingCard>

        <OnboardingCard title="Unirme a un negocio existente" action={joinBusiness}>
          <input
            name="code"
            required
            placeholder="Código de invitación"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
          <button
            type="submit"
            className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            Unirme
          </button>
        </OnboardingCard>
      </div>
    </div>
  );
}
