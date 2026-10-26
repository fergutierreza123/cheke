import { describe, expect, it } from "vitest";
import { hasAnyTag, normalizeTags, tagsInUse } from "@/lib/tags";

describe("Etiquetas", () => {
  it("normalizes: lowercase, trimmed, single spaces, no blanks or repeats", () => {
    expect(normalizeTags([" VIP", "vip ", "Compra   al Mayor", "  "])).toEqual(["vip", "compra al mayor"]);
  });

  it("lists the Negocio's Etiquetas once each, alphabetically", () => {
    expect(tagsInUse([{ tags: ["vip", "mayorista"] }, { tags: ["Mayorista"] }, { tags: null }, {}])).toEqual(["mayorista", "vip"]);
  });

  it("filters by any of the picked Etiquetas; none picked shows everyone", () => {
    expect(hasAnyTag({ tags: ["vip"] }, [])).toBe(true);
    expect(hasAnyTag({ tags: [] }, [])).toBe(true);
    expect(hasAnyTag({ tags: ["vip"] }, ["mayorista", "vip"])).toBe(true);
    expect(hasAnyTag({ tags: ["vip"] }, ["mayorista"])).toBe(false);
  });
});
