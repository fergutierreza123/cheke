import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/stores";
import { invitationErrorMessage } from "@/lib/invitations";
import { acceptInvitation } from "./actions";

export const metadata = { title: "Invitación · cheke", robots: { index: false, follow: false } };

type Preview = { business_name: string; role: Role; store_names: string[]; status: "valid" | "used" | "expired" };

// The page an invitation link opens. Signed-out visitors are sent to log in
// first (src/proxy.ts remembers the link and brings them back here).
export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  // A fixed sentence per error code; never text from the URL.
  const error = invitationErrorMessage((await searchParams).error);

  const supabase = await createClient();
  const { data } = await supabase.rpc("invitation_preview", { p_token: token });
  const preview = (Array.isArray(data) ? data[0] : data) as Preview | undefined;

  let title: string;
  let body: React.ReactNode = null;
  let canAccept = false;
  if (!preview) {
    title = "Este link de invitación no existe";
    body = "Revisa que lo copiaste completo, o pide uno nuevo a quien te invitó.";
  } else if (preview.status === "used") {
    title = "Esta invitación ya se usó";
    body = "Cada link sirve una sola vez. Pide uno nuevo a quien te invitó.";
  } else if (preview.status === "expired") {
    title = "Esta invitación venció";
    body = "Los links duran 7 días. Pide uno nuevo a quien te invitó.";
  } else {
    canAccept = true;
    // Tiendas only when they add something (a Negocio with one Tienda named
    // like itself never shows the word).
    const stores = preview.store_names.filter((n) => n !== preview.business_name);
    title = `Te invitaron a ${preview.business_name}`;
    body = (
      <>
        Vas a entrar como <strong className="text-ink">{ROLE_LABEL[preview.role]}</strong>
        {stores.length > 0 && (
          <>
            {" "}
            en <strong className="text-ink">{preview.store_names.join(", ")}</strong>
          </>
        )}
        .
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="w-full max-w-md">
        <Image src="/logos/cheke-icon-blue.png" alt="Cheke" width={64} height={75} className="mx-auto mb-4" />
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-display font-heading text-xl font-semibold text-ink">{title}</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{body}</p>

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-danger-border bg-danger-tint px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {canAccept ? (
            <form action={acceptInvitation} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Unirme
              </button>
            </form>
          ) : (
            <Link href="/" className="mt-5 block text-center text-sm font-semibold text-brand">
              Ir a cheke
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
