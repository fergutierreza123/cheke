import type { createClient } from "@/lib/supabase/server";
import { coordsFromMapsLink, isGoogleMapsLink, isShortMapsLink, type StoreLocation } from "@/lib/storeLocation";

// Server side of the Tienda's location (store_chekelin_info, migration 0034).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const NO_STORE_LOCATION =
  "Todavía no guardaste la ubicación de la tienda. Agrégala en «Lo que chekelin sabe» y vuelve a intentarlo.";

const COLUMNS = "store_id, location_address, location_maps_url, location_lat, location_lng";

type Row = {
  store_id: string;
  location_address: string | null;
  location_maps_url: string | null;
  location_lat: number | null;
  location_lng: number | null;
};

function fromRow(row: Row): StoreLocation {
  return {
    address: row.location_address ?? "",
    mapsUrl: row.location_maps_url ?? "",
    latitude: row.location_lat ?? null,
    longitude: row.location_lng ?? null,
  };
}

// The saved location of each Tienda (RLS applies). `available` is false
// before migration 0034 runs (the columns don't exist yet).
export async function getStoreLocations(
  supabase: Supabase,
  storeIds: string[],
): Promise<{ available: boolean; locations: Record<string, StoreLocation> }> {
  if (storeIds.length === 0) return { available: true, locations: {} };
  const { data, error } = await supabase.from("store_chekelin_info").select(COLUMNS).in("store_id", storeIds);
  if (error) return { available: false, locations: {} };
  return {
    available: true,
    locations: Object.fromEntries((data as Row[]).map((row) => [row.store_id, fromRow(row)])),
  };
}

export async function getStoreLocation(supabase: Supabase, storeId: string): Promise<StoreLocation | null> {
  const { locations } = await getStoreLocations(supabase, [storeId]);
  return locations[storeId] ?? null;
}

// The Maps app's "Compartir" link (maps.app.goo.gl/…) hides the pin behind a
// redirect: follow it (Google hosts only, a few hops) to read the pin.
// Null when it can't be read; the link itself still works for customers.
export async function pinFromShortMapsLink(link: string): Promise<{ latitude: number; longitude: number } | null> {
  if (!isShortMapsLink(link)) return null;
  let current = link;
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
    } catch {
      return null;
    }
    const next = res.headers.get("location");
    if (!next) return null;
    const absolute = new URL(next, current).toString();
    const pin = coordsFromMapsLink(absolute);
    if (pin) return pin;
    const host = new URL(absolute).hostname;
    if (!isGoogleMapsLink(absolute) && host !== "google.com" && !host.endsWith(".google.com")) return null;
    current = absolute;
  }
  return null;
}
