import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentBusiness } from "@/lib/stores";
import { fakeSupabase } from "./fakeSupabase";

// Server actions with Supabase, the signed-in Negocio and Next's cache faked.
let business: CurrentBusiness | null = null;
let db = fakeSupabase();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

const { createLead, setConversationStage, setConversationValue, seedDemoData } = await import("@/app/(app)/actions");
const { saveProduct } = await import("@/app/(app)/inventory/actions");
const { saveTemplate } = await import("@/app/(app)/templates/actions");
const { setMemberStore } = await import("@/app/(app)/team/actions");

const OPEN = { id: "A", name: "Centro", archived: false };
const OPEN_B = { id: "B", name: "Mall", archived: false };
const ARCHIVED = { id: "X", name: "Vieja", archived: true };

function as(role: CurrentBusiness["role"], opts: { mine?: string[]; selected?: string } = {}): CurrentBusiness {
  const all = [OPEN, OPEN_B, ARCHIVED];
  const stores = role === "owner" ? [OPEN, OPEN_B] : [OPEN, OPEN_B].filter((s) => (opts.mine ?? []).includes(s.id));
  const archivedStores = role === "owner" ? [ARCHIVED] : [];
  const selectedStore = [...stores, ...archivedStores].find((s) => s.id === opts.selected) ?? null;
  return {
    id: "biz",
    name: "Luna",
    plan: "trial",
    role,
    userId: "me",
    allStores: all,
    stores,
    archivedStores,
    multiStore: stores.length > 1,
    selected: selectedStore?.id ?? "all",
    selectedStore,
    scopeStoreIds: selectedStore ? [selectedStore.id] : stores.map((s) => s.id),
  };
}

beforeEach(() => {
  db = fakeSupabase();
  business = as("owner");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
});

describe("archived Tiendas are read-only (issue #35)", () => {
  it("createLead refuses an archived Tienda", async () => {
    const result = await createLead({ name: "Ana", phone: null, ig_handle: null, fb_id: null, storeId: "X" });
    expect(result.error).toMatch(/archivada/);
    expect(db.writes("contacts", "insert")).toHaveLength(0);
  });

  it("createLead still works in an open Tienda", async () => {
    db.queue("contacts", { data: { id: "k1", name: "Ana", phone: null, ig_handle: null, fb_id: null, notes: null } });
    db.queue("conversations", { data: { id: "c1" } });
    const result = await createLead({ name: "Ana", phone: null, ig_handle: null, fb_id: null, storeId: "A" });
    expect(result.error).toBeUndefined();
    expect(result.conversation?.id).toBe("c1");
  });

  it("createLead refuses a Tienda the person doesn't work in", async () => {
    business = as("agent", { mine: ["A"] });
    expect((await createLead({ name: "Ana", phone: null, ig_handle: null, fb_id: null, storeId: "B" })).error).toBe("Elige la tienda del contacto.");
  });

  it("saveProduct refuses while viewing an archived Tienda", async () => {
    business = as("owner", { selected: "X" });
    const form = new FormData();
    form.set("name", "Blusa");
    expect((await saveProduct(form)).error).toMatch(/archivada/);
    expect(db.writes("products", "insert")).toHaveLength(0);
  });

  it("seedDemoData uses an open Tienda, never the archived one on screen", async () => {
    business = as("owner", { selected: "X" });
    db.queue("contacts", { count: 0 });
    for (let i = 0; i < 3; i++) db.queue("channels", { data: { id: `ch${i}` } });
    for (let i = 0; i < 6; i++) {
      db.queue("contacts", { data: { id: `k${i}` } });
      db.queue("conversations", { data: { id: `c${i}` } });
    }
    expect(await seedDemoData()).toEqual({});
    const channelInsert = db.writes("channels", "insert")[0].ops.find((o) => o.op === "insert")!.args[0] as { store_id: string };
    expect(channelInsert.store_id).toBe("A");
  });

  it("seedDemoData reports a failure instead of throwing", async () => {
    db.queue("contacts", { count: 0 });
    db.queue("channels", { data: null, error: { message: "permission denied" } });
    expect(await seedDemoData()).toEqual({ error: "No se pudieron crear los datos de ejemplo. Inténtalo de nuevo." });
  });
});

describe("saveProduct photo", () => {
  it("refuses a photo address that isn't cheke's storage", async () => {
    business = as("owner", { selected: "A" });
    const form = new FormData();
    form.set("name", "Blusa");
    form.set("existingImageUrl", "https://evil.example/x.jpg");
    expect((await saveProduct(form)).error).toBe("La foto no es válida.");
  });

  it("keeps a photo from our storage, and edits only products of the Tienda on screen", async () => {
    business = as("owner", { selected: "A" });
    const form = new FormData();
    form.set("id", "p1");
    form.set("name", "Blusa");
    form.set("existingImageUrl", "https://proj.supabase.co/storage/v1/object/public/product-images/biz/x.jpg");
    db.queue("products", { data: [{ id: "p1" }] });
    expect((await saveProduct(form)).error).toBeUndefined();
    const ops = db.writes("products", "update")[0].ops;
    expect(ops).toContainEqual({ op: "eq", args: ["store_id", "A"] });
  });

  it("says so when the product to edit isn't there", async () => {
    business = as("owner", { selected: "A" });
    const form = new FormData();
    form.set("id", "p-other-store");
    form.set("name", "Blusa");
    db.queue("products", { data: [] });
    expect((await saveProduct(form)).error).toMatch(/No se encontró el producto/);
  });
});

describe("chekeo stage and value are checked on the server", () => {
  it("refuses an unknown stage without touching the database", async () => {
    expect((await setConversationStage("c1", "hackeado" as never)).error).toBe("Etapa inválida.");
    expect(db.calls).toHaveLength(0);
  });

  it("reports when nothing was saved (another Tienda's conversation, RLS)", async () => {
    db.queue("conversations", { data: [] });
    expect((await setConversationStage("c1", "ganado")).error).toMatch(/No se pudo mover/);
    db.queue("conversations", { data: [{ id: "c1" }] });
    expect(await setConversationStage("c1", "ganado")).toEqual({});
  });

  it("refuses negative or impossible values and rounds to cents", async () => {
    expect((await setConversationValue("c1", -5)).error).toBeDefined();
    expect((await setConversationValue("c1", Number.POSITIVE_INFINITY)).error).toBeDefined();
    db.queue("conversations", { data: [{ id: "c1" }] });
    expect(await setConversationValue("c1", 10.555)).toEqual({});
    const update = db.writes("conversations", "update")[0].ops.find((o) => o.op === "update")!.args[0];
    expect(update).toEqual({ value_hnl: 10.56 });
  });
});

describe("saveTemplate", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it("refuses an unknown category", async () => {
    expect((await saveTemplate(form({ name: "T", body: "x", category: "spam" }))).error).toBe("Elige una categoría.");
  });

  it("keeps the Sugerencia pending when the Plantilla can't be saved", async () => {
    db.queue("template_suggestions", { data: { id: "s1" } });
    db.queue("templates", { error: { message: "fallo" } });
    const result = await saveTemplate(form({ name: "T", body: "x", category: "precios", suggestion_id: "s1" }));
    expect(result.error).toBe("fallo");
    expect(db.writes("template_suggestions", "update")).toHaveLength(0);
  });

  it("approves the Sugerencia after saving the Plantilla", async () => {
    db.queue("template_suggestions", { data: { id: "s1" } });
    expect(await saveTemplate(form({ name: "T", body: "x", category: "precios", suggestion_id: "s1" }))).toEqual({});
    const order = db.calls.map((c) => `${c.table}:${c.ops[0].op}`);
    expect(order).toEqual(["template_suggestions:select", "templates:insert", "template_suggestions:update"]);
  });
});

describe("setMemberStore reads the person's real role", () => {
  it("a Gerente can't move another Gerente by calling them an Agente", async () => {
    business = as("manager", { mine: ["A"] });
    db.queue("members", { data: { role: "manager" } });
    expect((await setMemberStore("u9", "agent", "A", false)).error).toBe("No puedes cambiar las tiendas de esta persona.");
    expect(db.writes("store_members", "delete")).toHaveLength(0);
  });

  it("a Gerente moves an Agente within their own Tienda", async () => {
    business = as("manager", { mine: ["A"] });
    db.queue("members", { data: { role: "agent" } });
    expect(await setMemberStore("u9", "agent", "A", true)).toEqual({});
  });

  it("refuses Tiendas of another Negocio", async () => {
    expect((await setMemberStore("u9", "agent", "other-biz-store", true)).error).toBeDefined();
    expect(db.calls).toHaveLength(0);
  });
});
