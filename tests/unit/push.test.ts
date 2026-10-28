import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memoryDb";

// Who a phone notification reaches, with Agentes in the team, and what is
// handed to Firebase. Firebase itself is recorded instead of called.
const sent = vi.hoisted(() => ({ calls: [] as Array<{ tokens: string[]; data: { url: string } }>, deadTokens: [] as string[] }));

vi.mock("firebase-admin/app", () => ({ getApps: () => [], cert: (x: unknown) => x, initializeApp: () => ({}) }));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (msg: { tokens: string[]; data: { url: string } }) => {
      sent.calls.push(msg);
      return {
        responses: msg.tokens.map((t) =>
          sent.deadTokens.includes(t) ? { error: { code: "messaging/registration-token-not-registered" } } : {},
        ),
      };
    },
  }),
}));

const { recipientsForConversation, notifyConversation } = await import("@/lib/push");

const B = "biz-1";
const S = "store-1";
const OTHER_STORE = "store-2";

function team(over: Partial<Record<string, { away?: boolean; notify_all?: boolean }>> = {}) {
  const m = (user_id: string, role: string) => ({ business_id: B, user_id, role, away: false, notify_all: false, ...over[user_id] });
  return memoryDb({
    members: [m("duena", "owner"), m("gerente", "manager"), m("ana", "agent"), m("beto", "agent"), m("carla", "agent")],
    store_members: [
      { store_id: S, user_id: "gerente" },
      { store_id: S, user_id: "ana" },
      { store_id: S, user_id: "beto" },
      { store_id: OTHER_STORE, user_id: "carla" },
    ],
    device_tokens: ["duena", "gerente", "ana", "beto", "carla"].map((u) => ({ business_id: B, user_id: u, token: `tok-${u}` })),
    messages: [{ store_id: S, conversation_id: "c1", direction: "in", created_at: new Date().toISOString() }],
  });
}

type Admin = Parameters<typeof recipientsForConversation>[0];
const recipients = (db: ReturnType<typeof memoryDb>, assignedTo: string | null, chekelinHandling = false) =>
  recipientsForConversation(db.client as unknown as Admin, { businessId: B, storeId: S, assignedTo, chekelinHandling }).then((p) =>
    p.sort(),
  );

beforeEach(() => {
  sent.calls = [];
  sent.deadTokens = [];
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
});

describe("quién recibe el aviso", () => {
  it("chat asignado a una Agente: solo ella", async () => {
    expect(await recipients(team(), "ana")).toEqual(["ana"]);
  });

  it("chat asignado a una Agente que está ausente: le llega igual (es suyo)", async () => {
    expect(await recipients(team({ ana: { away: true } }), "ana")).toEqual(["ana"]);
  });

  it("chat sin asignar: Agentes disponibles de la Tienda + Gerente, no Agentes de otra Tienda ni la Dueña", async () => {
    expect(await recipients(team(), null)).toEqual(["ana", "beto", "gerente"]);
  });

  it("chat sin asignar: una Agente ausente no recibe; el Gerente sí aunque esté ausente", async () => {
    expect(await recipients(team({ beto: { away: true }, gerente: { away: true } }), null)).toEqual(["ana", "gerente"]);
  });

  it("chekelin lo atiende: no se interrumpe a los Agentes", async () => {
    expect(await recipients(team(), null, true)).toEqual([]);
  });

  it("Dueña con «avisarme de todo» recibe además del Agente", async () => {
    expect(await recipients(team({ duena: { notify_all: true } }), "beto")).toEqual(["beto", "duena"]);
  });

  it("Tienda sin nadie disponible: le llega a la Dueña", async () => {
    const db = team({ ana: { away: true }, beto: { away: true } });
    db.rows("store_members").splice(0, 1); // sin Gerente en la Tienda
    expect(await recipients(db, null)).toEqual(["duena"]);
  });
});

describe("envío a Firebase", () => {
  it("manda a los teléfonos de esas personas, con el enlace al chat, y borra los tokens muertos", async () => {
    const db = team();
    sent.deadTokens = ["tok-beto"];
    await notifyConversation(db.client as unknown as Admin, { businessId: B, storeId: S, assignedTo: null }, {
      title: "María te escribió",
      body: "¿Tienen la blusa en L?",
      conversationId: "c1",
    });
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0].tokens.sort()).toEqual(["tok-ana", "tok-beto", "tok-gerente"]);
    expect(sent.calls[0].data.url).toBe("/chat?c=c1");
    expect(db.rows("device_tokens").map((d) => d.token)).not.toContain("tok-beto");
  });

  it("sin la llave de Firebase no hace nada ni falla", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    await notifyConversation(team().client as unknown as Admin, { businessId: B, storeId: S, assignedTo: "ana" }, { title: "x", body: "y" });
    expect(sent.calls).toHaveLength(0);
  });
});
