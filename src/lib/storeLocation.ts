import type { ChannelType } from "@/lib/types";

// "Ubicación" in Chat's "+" sheet: the Tienda's location, saved in
// "Lo que chekelin sabe" (store_chekelin_info, migration 0034).
// The owner either pastes the Google Maps link of the shop, taps
// «Usar mi ubicación actual» while standing in it, or just writes the
// address. WhatsApp gets a real location message (a map pin) when there are
// coordinates; Instagram and Messenger have no location message, so they
// get the same as text with a Google Maps link.

export type StoreLocation = {
  address: string;
  mapsUrl: string;
  latitude: number | null;
  longitude: number | null;
};

export const EMPTY_STORE_LOCATION: StoreLocation = { address: "", mapsUrl: "", latitude: null, longitude: null };

export const ADDRESS_MAX = 300;
const MAPS_URL_MAX = 2000;

type Coords = { latitude: number; longitude: number };

function validCoords(latitude: number, longitude: number): Coords | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

const PAIR = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

function pairFrom(text: string | null | undefined): Coords | null {
  if (!text) return null;
  const m = PAIR.exec(text);
  return m && m[0].trim() === text.trim() ? validCoords(Number(m[1]), Number(m[2])) : null;
}

// The coordinates in a Google Maps link (or "lat, lng" pasted on its own).
// The place pin (!3d…!4d…) wins over the map's centre (@lat,lng). Share
// links (maps.app.goo.gl) carry none: see isShortMapsLink.
export function coordsFromMapsLink(input: string): Coords | null {
  const text = input.trim();
  if (!text) return null;
  const bare = pairFrom(text);
  if (bare) return bare;

  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(text);
  if (pin) return validCoords(Number(pin[1]), Number(pin[2]));

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  for (const key of ["q", "query", "ll", "destination", "center"]) {
    const found = pairFrom(url.searchParams.get(key));
    if (found) return found;
  }
  const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(decodeURIComponent(url.pathname));
  if (centre) return validCoords(Number(centre[1]), Number(centre[2]));
  return null;
}

function parseUrl(text: string): URL | null {
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// The Maps app's "Compartir" link: one redirect away from the real one.
export function isShortMapsLink(text: string): boolean {
  const url = parseUrl(text);
  if (!url) return false;
  return url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps"));
}

export function isGoogleMapsLink(text: string): boolean {
  const url = parseUrl(text);
  if (!url) return false;
  if (isShortMapsLink(text)) return true;
  const host = url.hostname.replace(/^www\./, "");
  if (/^maps\.google\.[a-z.]+$/.test(host)) return true;
  return /^google\.[a-z.]+$/.test(host) && url.pathname.startsWith("/maps");
}

// What "Lo que chekelin sabe" saves: trimmed, the link checked, and the pin
// taken from the link when it has one (otherwise the one given).
export function normalizeStoreLocation(input: StoreLocation): { location?: StoreLocation; error?: string } {
  const address = (input.address ?? "").trim();
  const mapsUrl = (input.mapsUrl ?? "").trim();
  if (address.length > ADDRESS_MAX) return { error: `La dirección es muy larga (máximo ${ADDRESS_MAX} letras).` };
  if (mapsUrl.length > MAPS_URL_MAX) return { error: "El link de Google Maps es muy largo." };
  if (mapsUrl && !isGoogleMapsLink(mapsUrl)) {
    return { error: "Pega un link de Google Maps (empieza con https://maps.app.goo.gl o https://www.google.com/maps)." };
  }
  const given =
    input.latitude !== null && input.longitude !== null ? validCoords(input.latitude, input.longitude) : null;
  const pin = (mapsUrl ? coordsFromMapsLink(mapsUrl) : null) ?? given;
  return {
    location: { address, mapsUrl, latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null },
  };
}

export function hasStoreLocation(location: StoreLocation): boolean {
  return mapsLinkFor(location) !== null;
}

// The link customers can open: the one the Tienda pasted, else the pin,
// else a search for the address. Null when nothing is saved.
export function mapsLinkFor(location: StoreLocation): string | null {
  if (location.mapsUrl.trim()) return location.mapsUrl.trim();
  const query =
    location.latitude !== null && location.longitude !== null
      ? `${location.latitude},${location.longitude}`
      : location.address.trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// What goes out for "Ubicación" on each network. `text` is also what Chat
// shows and what is saved as the message body.
export function locationSendPlan(
  channelType: ChannelType | null | undefined,
  location: StoreLocation,
  storeName: string,
): { location: { latitude: number; longitude: number; name: string; address: string } | null; text: string } | null {
  const link = mapsLinkFor(location);
  if (!link) return null;
  const name = storeName.trim();
  const address = location.address.trim();
  const text = [`📍 ${name}`, address, link].filter(Boolean).join("\n");
  const pinned = location.latitude !== null && location.longitude !== null;
  return {
    location:
      channelType === "whatsapp" && pinned
        ? { latitude: location.latitude as number, longitude: location.longitude as number, name, address }
        : null,
    text,
  };
}
