import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentBusiness } from "@/lib/stores";
import { fakeSupabase } from "./fakeSupabase";

// QA round 2: server actions of the screens outside Chat and chekelin
// (Catálogo, chekeo, Contactos, onboarding, Equipo, Mi cuenta), with
// Supabase, the signed-in Negocio and Next faked as in actions.test.ts.
let business: CurrentBusiness | null = null;
let db = fakeSupabase();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/business", async () => {
  const stores = await vi.importActual<typeof import("@/lib/stores")>("@/lib/stores");
  return { ...stores, getCurrentBusiness: async () => business };
});
vi.mock("@/lib/bot", () => ({ handOffActiveChats: vi.fn(), handleInboundMessage: vi.fn(), afterPaymentConfirmed: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushToPeople: vi.fn(), notifyConversation: vi.fn() }));
vi.mock("@/lib/images", () => ({ removeBackgroundToWhite: async () => ({}) }));

const { saveProduct } = await import("@/app/(app)/inventory/actions");
const { saveContact } = await import("@/app/(app)/contacts/actions");
const { createBusiness } = await import("@/app/onboarding/actions");
const { deleteAccount } = await import("@/app/(app)/account/actions");
const { updateMemberRole, cancelInvitation } = await import("@/app/(app)/team/actions");

const OPEN = { id: "A", name: "Centro", archived: false };

function asOwner(): CurrentBusiness {
  return {
    id: "biz",
    name: "Luna",
    plan: "trial",
    role: "owner",
    userId: "me",
    allStores: [OPEN],
    stores: [OPEN],
    archivedStores: [],
    multiStore: false,
    selected: "A",
    selectedStore: OPEN,
    scopeStoreIds: ["A"],
  };
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const inserted = (table: string) =>
  db.writes(table, "insert")[0]?.ops.find((o) => o.op === "insert")?.args[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  db = fakeSupabase();
  business = asOwner();
});

describe("Catálogo: the product price is what the person typed", () => {
  it("reads «1,500.50» as one thousand five hundred and fifty cents", async () => {
    expect(await saveProduct(form({ name: "Vestido", price: "1,500.50" }))).toEqual({ photoWarning: undefined });
    expect(inserted("products")?.price_hnl).toBe(1500.5);
  });

  it("reads a Spanish keyboard's decimal comma («1500,50») as cents", async () => {
    await saveProduct(form({ name: "Vestido", price: "1500,50" }));
    expect(inserted("products")?.price_hnl).toBe(1500.5);
  });

  it("refuses a price that isn't a number instead of saving L 0", async () => {
    expect((await saveProduct(form({ name: "Vestido", price: "mil" }))).error).toBe("Escribe un precio válido en Lempiras, por ejemplo 1,500.");
    expect(db.writes("products", "insert")).toHaveLength(0);
  });

  it("an empty price still saves as L 0 (price to be confirmed)", async () => {
    await saveProduct(form({ name: "Vestido", price: "" }));
    expect(inserted("products")?.price_hnl).toBe(0);
  });

  it("refuses a name longer than WhatsApp's catalog allows", async () => {
    expect((await saveProduct(form({ name: "x".repeat(151) }))).error).toBe("El nombre es muy largo (máximo 150 letras).");
  });
});

describe("Contactos: saveContact limits what one contact can hold", () => {
  it("refuses a name over 100 letters and notes over 2000", async () => {
    expect((await saveContact(form({ name: "x".repeat(101) }))).error).toBe("El nombre es muy largo (máximo 100 letras).");
    expect((await saveContact(form({ name: "Ana", notes: "x".repeat(2001) }))).error).toBe("Las notas son muy largas (máximo 2000 letras).");
    expect(db.writes("contacts", "insert")).toHaveLength(0);
  });

  it("collapses the spaces of a pasted name", async () => {
    await saveContact(form({ name: "  Ana   María  " }));
    expect(inserted("contacts")?.name).toBe("Ana María");
  });

  it("says so when the contact to edit is gone (deleted or another Negocio's)", async () => {
    db.queue("contacts", { data: [] });
    expect((await saveContact(form({ id: "k-other", name: "Ana" }))).error).toBe("No se encontró el contacto. Recarga la página.");
  });
});

describe("onboarding: createBusiness", () => {
  it("refuses a Negocio name over 60 letters before creating anything", async () => {
    const rpc = vi.spyOn(db.client, "rpc");
    const result = await createBusiness({}, form({ full_name: "Fernando", name: "x".repeat(61) }));
    expect(result.error).toBe("El nombre del negocio es muy largo (máximo 60 letras).");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Equipo", () => {
  it("changing the role of someone who already left says so, and adds them to no Tienda", async () => {
    db.queue("members", { count: 1 }); // another Dueño exists
    db.queue("members", { data: [] }); // the update found nobody
    expect((await updateMemberRole("gone", "agent")).error).toBe("Esa persona ya no está en tu negocio.");
    expect(db.writes("store_members", "insert")).toHaveLength(0);
  });

  it("cancelling an invitation that was already used or isn't yours says so", async () => {
    db.queue("invitations", { data: [] });
    expect((await cancelInvitation("inv-1")).error).toBe("Esta invitación ya se usó o ya no existe.");
  });
});

describe("Mi cuenta: «Eliminar mi cuenta» takes the Negocio's files with it", () => {
  // A storage bucket with folders, as Supabase lists them (100 per page by default).
  function fakeStorage(files: Record<string, string[]>) {
    const removed: string[] = [];
    const bucket = (name: string) => ({
      list: async (prefix: string, opts: { limit?: number; offset?: number } = {}) => {
        const all = (files[name] ?? []).filter((p) => p.startsWith(`${prefix}/`)).map((p) => p.slice(prefix.length + 1));
        const entries = [...new Set(all.map((rest) => rest.split("/")[0]))].map((n) => ({
          name: n,
          id: all.includes(n) ? `id-${n}` : null, // folders have no id
        }));
        const offset = opts.offset ?? 0;
        return { data: entries.slice(offset, offset + (opts.limit ?? 100)), error: null };
      },
      remove: async (paths: string[]) => {
        removed.push(...paths.map((p) => `${name}:${p}`));
        return { data: [], error: null };
      },
    });
    return { removed, storage: { from: bucket } };
  }

  it("removes the customers' photos and voice notes (message-media) and every product photo of a Negocio it deletes", async () => {
    const productPhotos = Array.from({ length: 1200 }, (_, i) => `biz/p${i}.jpg`);
    const { removed, storage } = fakeStorage({
      "product-images": productPhotos,
      "message-media": ["biz/A/m1.jpg", "biz/A/m2.ogg", "biz/A/m2.m4a", "biz/B/m3.pdf", "other-biz/Z/m9.jpg"],
    });
    const deleteUser = vi.fn(async () => ({ error: null }));
    Object.assign(db.client, {
      storage,
      auth: {
        getUser: async () => ({ data: { user: { id: "me" } } }),
        signOut: async () => ({}),
        admin: { deleteUser },
      },
    });
    // The only member of Negocio "biz": the whole Negocio goes.
    db.queue("members", { data: [{ business_id: "biz", role: "owner", businesses: { name: "Luna" } }] });
    db.queue("members", { data: [{ business_id: "biz", user_id: "me", role: "owner" }] });

    await expect(deleteAccount("ELIMINAR")).rejects.toThrow("redirect:/eliminar-datos?cuenta=eliminada");

    expect(removed.filter((p) => p.startsWith("message-media:")).sort()).toEqual([
      "message-media:biz/A/m1.jpg",
      "message-media:biz/A/m2.m4a",
      "message-media:biz/A/m2.ogg",
      "message-media:biz/B/m3.pdf",
    ]);
    expect(removed.filter((p) => p.startsWith("product-images:"))).toHaveLength(1200);
    expect(deleteUser).toHaveBeenCalledWith("me");
  });
});
