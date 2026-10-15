// Tiendas, roles and the signed-in person's context — the types and pure
// helpers, safe to import from browser components. The server lookup that
// fills it is getCurrentBusiness() in src/lib/business.ts.

// Dueño | Gerente | Agente (see GLOSSARY.md).
export type Role = "owner" | "manager" | "agent";

export const ROLE_LABEL: Record<Role, string> = { owner: "Dueño", manager: "Gerente", agent: "Agente" };

export type StoreRef = { id: string; name: string; archived: boolean };

// Which Tienda the screens show: one Tienda's id, or "all" (Todas las tiendas).
export type StoreSelection = string | "all";

export const STORE_COOKIE = "cheke_store";

// Everything a screen needs to know about who is signed in and where:
// the Negocio, their role, the Tiendas they can use and the one picked in
// the selector. The Negocio fields keep their old names (id, name, plan) so
// `business.id` still means the Negocio everywhere.
export type CurrentBusiness = {
  id: string;
  name: string;
  plan: string;
  role: Role;
  userId: string;
  // Every Tienda of the Negocio, archived ones included (names for tags).
  allStores: StoreRef[];
  // Open Tiendas this person works in (all open ones for a Dueño).
  stores: StoreRef[];
  // Dueños only: closed Tiendas whose history they can still read.
  archivedStores: StoreRef[];
  // 2+ Tiendas: show the selector, "Todas las tiendas" and store tags.
  // With one Tienda the word never appears anywhere.
  multiStore: boolean;
  selected: StoreSelection;
  selectedStore: StoreRef | null;
  // The Tiendas whose data the screens show right now.
  scopeStoreIds: string[];
};

// Store tags for combined views: id → name while "Todas las tiendas" is on
// screen, otherwise null (one Tienda in view needs no tag).
export function storeNamesForTags(business: CurrentBusiness): Record<string, string> | null {
  if (!business.multiStore || business.selected !== "all") return null;
  return Object.fromEntries(business.stores.map((s) => [s.id, s.name]));
}

// Dueños manage every Tienda; Gerentes their own open ones.
export function canManageStore(business: CurrentBusiness, storeId: string): boolean {
  if (business.role === "owner") return business.allStores.some((s) => s.id === storeId);
  return business.role === "manager" && business.stores.some((s) => s.id === storeId);
}

// Every Tienda this person can open (archived ones for Dueños).
export function canAccessStore(business: CurrentBusiness, storeId: string): boolean {
  return [...business.stores, ...business.archivedStores].some((s) => s.id === storeId);
}
