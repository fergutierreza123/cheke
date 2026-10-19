import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { reviewerLoginEnabled } from "@/lib/reviewerDemo";
import { ReviewerLoginForm } from "./ReviewerLoginForm";

export const metadata = { title: "Acceso para revisores · cheke" };

// Sign-in for Apple App Store and Google Play reviewers, who can't open an
// email inbox to use the normal login. Only the one reviewer email +
// password set on the server works here (src/lib/reviewerDemo.ts).
export default async function ReviewerLoginPage() {
  await connection();
  const enabled = reviewerLoginEnabled();

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-brand-dark px-4"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-sm">
        <Image src="/logos/cheke-icon-blue.png" alt="cheke" width={64} height={75} className="mx-auto mb-4" />
        <h1 className="text-display text-center font-heading text-2xl font-semibold text-white">Acceso para revisores</h1>
        <p className="mt-1 text-center text-sm text-white/70">
          Entra con el correo y la contraseña de la cuenta de demostración.
        </p>

        {enabled ? (
          <ReviewerLoginForm />
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center text-sm text-ink-muted">
            El acceso para revisores no está activo.
          </div>
        )}

        <Link href="/login" className="mt-5 block text-center text-[13px] text-white/70 underline underline-offset-2">
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
