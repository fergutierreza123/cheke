import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { userInfoFrom } from "@/lib/user";
import { AccountView } from "./AccountView";
import { getDeletionPlan } from "./deletion";
import { getChekelinUsage } from "@/lib/chekelinAllowance";
import { chekelinMeter } from "@/lib/plan";

export const metadata = { title: "Mi cuenta · cheke" };

export default async function AccountPage() {
  const business = await getCurrentBusiness();
  if (!business) redirect("/onboarding");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // What "Eliminar mi cuenta" would do, so the confirmation can say it up
  // front. The server action checks again before deleting anything.
  const plan = await getDeletionPlan(supabase, user.id).catch(() => []);
  // chekelin's monthly allowance: Dueños only (RLS), null before migration 0037.
  const usage = business.role === "owner" ? await getChekelinUsage(supabase, business.id).catch(() => null) : null;
  return (
    <AccountView
      user={userInfoFrom(user)}
      lastSignIn={user.last_sign_in_at ?? null}
      business={{ name: business.name, plan: business.plan, role: business.role }}
      // Dueños: where Tiendas are created, renamed and archived. The only
      // spot a single-Tienda Negocio sees the word.
      storesLink={business.role === "owner" ? (business.allStores.length > 1 ? "manage" : "add") : null}
      chekelin={usage ? chekelinMeter(usage.used, usage.allowance) : null}
      deletion={plan.map(({ businessName, outcome }) => ({ businessName, outcome }))}
    />
  );
}
