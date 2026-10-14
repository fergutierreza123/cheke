import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { userInfoFrom } from "@/lib/user";
import { AccountView } from "./AccountView";

export const metadata = { title: "Mi cuenta · cheke" };

export default async function AccountPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const provider = (user.app_metadata?.provider as string | undefined) === "google" ? "google" : "email";
  return (
    <AccountView
      user={userInfoFrom(user)}
      provider={provider}
      lastSignIn={user.last_sign_in_at ?? null}
      business={{ name: business.name, plan: business.plan, role: business.role }}
    />
  );
}
