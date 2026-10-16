import type { User } from "@supabase/supabase-js";
import { formatPhone } from "@/lib/auth/phone";

// `phone` is "+504 9999-9999" (or "" without one). People who signed in by
// SMS may have no email at all.
export type UserInfo = { name: string; email: string; phone?: string };

// What to call the signed-in person: the name on their profile (set at
// onboarding or in Mi cuenta), else the first part of their email, else
// their number.
export function userInfoFrom(user: User | null): UserInfo {
  const email = user?.email ?? "";
  const phone = formatPhone(user?.phone);
  const profileName = (user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined;
  const fallback = email.split("@")[0] || phone;
  return { name: profileName?.trim() || fallback || "Mi cuenta", email, phone };
}
