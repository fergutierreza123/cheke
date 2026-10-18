import { describe, expect, it } from "vitest";
import {
  BODY_MAX,
  SHORTCUT_MAX,
  fillQuickReply,
  filterQuickReplies,
  insertQuickReply,
  normalizeShortcut,
  parsePastedReplies,
  slashQuery,
  type QuickReply,
} from "@/lib/quickReplies";

describe("normalizeShortcut", () => {
  it("lowercases, drops accents and the slash, joins words", () => {
    expect(normalizeShortcut("Envíos SPS")).toBe("envios-sps");
    expect(normalizeShortcut("//Horario")).toBe("horario");
    expect(normalizeShortcut("¡Precio!")).toBe("precio");
    expect(normalizeShortcut("a_b-c")).toBe("a_b-c");
  });

  it("caps the length", () => {
    expect(normalizeShortcut("x".repeat(50))).toHaveLength(SHORTCUT_MAX);
  });
});

describe("slashQuery", () => {
  it("finds the /word at the end", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/hor")).toBe("hor");
    expect(slashQuery("Hola /env")).toBe("env");
  });

  it("ignores links and slashes in the middle of words", () => {
    expect(slashQuery("https://cheke.app")).toBeNull();
    expect(slashQuery("1/2")).toBeNull();
    expect(slashQuery("/horario listo")).toBeNull();
  });
});

describe("filterQuickReplies", () => {
  const replies: QuickReply[] = [
    { id: "1", shortcut: "envios", body: "Enviamos a todo el país" },
    { id: "2", shortcut: "horario", body: "Abrimos de 8 a 5" },
    { id: "3", shortcut: "pago-envios", body: "Pagos" },
  ];

  it("shows everything for an empty query", () => {
    expect(filterQuickReplies(replies, "")).toHaveLength(3);
  });

  it("puts shortcut prefix matches first, then contains, then text", () => {
    expect(filterQuickReplies(replies, "env").map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterQuickReplies(replies, "pais").map((r) => r.id)).toEqual(["1"]);
    expect(filterQuickReplies(replies, "zzz")).toEqual([]);
  });
});

describe("fillQuickReply", () => {
  it("uses the contact's first name", () => {
    expect(fillQuickReply("Hola {nombre}, ¿cómo estás?", "María José López")).toBe("Hola María, ¿cómo estás?");
  });

  it("drops the placeholder when the name is only a number", () => {
    expect(fillQuickReply("Hola {nombre}, gracias", "+504 9999-9999")).toBe("Hola, gracias");
    expect(fillQuickReply("Hola {nombre}", null)).toBe("Hola");
  });
});

describe("insertQuickReply", () => {
  it("replaces the /word at the end", () => {
    expect(insertQuickReply("Buenas /hor", "Abrimos 8 a 5")).toBe("Buenas Abrimos 8 a 5");
    expect(insertQuickReply("/hor", "Abrimos")).toBe("Abrimos");
  });
});

describe("parsePastedReplies", () => {
  it("reads one reply per /atajo, multi-line bodies included", () => {
    const text = "/horario Abrimos de lunes a sábado.\r\n/envios\nEnviamos a todo el país.\nLlega en 2 días.\n";
    expect(parsePastedReplies(text)).toEqual([
      { shortcut: "horario", body: "Abrimos de lunes a sábado." },
      { shortcut: "envios", body: "Enviamos a todo el país.\nLlega en 2 días." },
    ]);
  });

  it("skips text before the first /atajo and empty replies; the last duplicate wins", () => {
    const text = "intro\n/vacio\n/a uno\n/A dos";
    expect(parsePastedReplies(text)).toEqual([{ shortcut: "a", body: "dos" }]);
  });

  it("caps each body", () => {
    expect(parsePastedReplies(`/largo ${"x".repeat(BODY_MAX + 10)}`)[0].body).toHaveLength(BODY_MAX);
  });
});
