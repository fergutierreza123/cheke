// Where each part of cheke lives (founder, 2026-10-16): the app (cheke
// ventas) at ventas.cheke.app, and cheke.io as the informational site with
// the legal pages. The split turns on only once NEXT_PUBLIC_APP_URL is set
// (e.g. "https://ventas.cheke.app"); until then every host serves everything,
// as before. Safe to import anywhere: it reads nothing but env.

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

// Hosts that only serve the informational site.
const SITE_HOSTS = ["cheke.io", "www.cheke.io"];

// What the informational site serves itself; anything else goes to the app.
export const SITE_PATHS = ["/", "/privacidad", "/terminos", "/eliminar-datos"];

export function isSiteHost(host: string | null | undefined): boolean {
  if (!APP_URL || !host) return false;
  return SITE_HOSTS.includes(host.toLowerCase().split(":")[0]);
}

// A link from the informational site into the app ("/login", "/demo").
export function appHref(path: string): string {
  return `${APP_URL}${path}`;
}
