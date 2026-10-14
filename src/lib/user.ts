import type { User } from "@supabase/supabase-js";

export type UserInfo = { name: string; email: string };

// What to call the signed-in person: the name on their profile (Google
// supplies one), or the first part of their email when there isn't one.
export function userInfoFrom(user: User | null): UserInfo {
  const email = user?.email ?? "";
  const profileName = (user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined;
  const fallback = email.split("@")[0] ?? "";
  return { name: profileName?.trim() || fallback || "Mi cuenta", email };
}
