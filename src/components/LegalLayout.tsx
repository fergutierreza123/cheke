import Image from "next/image";
import Link from "next/link";
import { COMPANY, COMPANY_IS_PLACEHOLDER } from "@/lib/company";

// Shared frame for the public legal pages: brand header, readable column,
// footer with the company details Meta wants to see on the site.
export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="bg-brand-dark px-5 py-4">
        <Link href="/" className="mx-auto block max-w-3xl">
          <Image src="/logos/cheke-wordmark-color.png" alt="cheke" width={96} height={52} />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        {COMPANY_IS_PLACEHOLDER && (
          <div className="mb-6 rounded-lg border border-danger-border bg-danger-tint px-4 py-3 text-[13px] text-danger">
            Borrador: faltan los datos legales de la empresa (src/lib/company.ts). No publicar así.
          </div>
        )}
        <h1 className="font-heading text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">Última actualización: {COMPANY.lastUpdated}</p>
        <div className="mt-8 flex flex-col gap-7 text-[15px] leading-relaxed text-ink">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="border-t border-border bg-surface px-5 py-8 text-[13px] text-ink-muted">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <div>
          <strong className="text-ink">{COMPANY.brand}</strong>, una marca de {COMPANY.legalName}
          <br />
          {COMPANY.address}, {COMPANY.city}, {COMPANY.country} · {COMPANY.phone} · {COMPANY.email}
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/privacidad" className="hover:underline">Política de privacidad</Link>
          <Link href="/terminos" className="hover:underline">Términos de uso</Link>
          <Link href="/eliminar-datos" className="hover:underline">Eliminación de datos</Link>
        </nav>
      </div>
    </footer>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-5 flex list-disc flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
