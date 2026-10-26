// Etiquetas of a Contacto (contacts.tags): free words like "mayorista" or
// "vip", stored lowercase so the filter (and later a Difusión) matches
// "VIP" and "vip" as one.

export const TAG_MAX = 30;
export const TAGS_PER_CONTACT_MAX = 20;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

// Lowercased, trimmed, without blanks or repeats, in the order given.
export function normalizeTags(raw: string[]): string[] {
  return [...new Set(raw.map(normalizeTag).filter(Boolean))];
}

// Every Etiqueta used in the Negocio, alphabetical (suggestions and filter).
export function tagsInUse(contacts: Array<{ tags?: string[] | null }>): string[] {
  return normalizeTags(contacts.flatMap((c) => c.tags ?? [])).sort((a, b) => a.localeCompare(b, "es"));
}

// The filter: a contact shows when it has any of the picked Etiquetas.
export function hasAnyTag(contact: { tags?: string[] | null }, picked: string[]): boolean {
  return picked.length === 0 || picked.some((t) => contact.tags?.includes(t));
}
