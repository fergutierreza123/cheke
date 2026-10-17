// Photos cheke stores or sends must come from our own Supabase Storage, not
// an arbitrary address a browser could submit. Safe to import anywhere.
export function isOwnStorageUrl(url: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  if (!supabaseUrl) return false;
  try {
    return new URL(url).origin === new URL(supabaseUrl).origin;
  } catch {
    return false;
  }
}
