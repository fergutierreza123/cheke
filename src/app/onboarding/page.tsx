import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { INVITE_COOKIE, isInviteToken } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

// First time with no invitation: one screen, name + business name.
export default async function OnboardingPage() {
  const business = await getCurrentBusiness();
  if (business) redirect("/chat");

  // Logged in from an invitation link without joining yet: back to it.
  const invite = (await cookies()).get(INVITE_COOKIE)?.value;
  if (isInviteToken(invite)) redirect(`/invitacion/${invite}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const savedName = (user.user_metadata?.full_name ?? user.user_metadata?.name) as string | undefined;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-brand-dark px-4"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-sm">
        <Image src="/logos/cheke-icon-blue.png" alt="cheke" width={64} height={75} className="mx-auto mb-4" />
        <h1 className="text-display text-center font-heading text-2xl font-semibold text-white">
          Bienvenido a <span className="text-accent">cheke</span>
        </h1>
        <p className="mt-1 text-center text-sm text-white/70">
          Dos datos y listo. Si alguien te invitó, abre el link que te mandó.
        </p>
        <OnboardingForm defaultName={savedName?.trim() ?? ""} />
      </div>
    </div>
  );
}
