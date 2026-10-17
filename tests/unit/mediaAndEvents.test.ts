import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DELETED_TEXT,
  deletedFields,
  metaReaction,
  metaReplyTo,
  whatsappChange,
  whatsappReaction,
  whatsappReplyTo,
} from "@/lib/messageEvents";
import {
  MAX_DOCUMENT_BYTES,
  MAX_RECORDING_BYTES,
  cleanFilename,
  documentAccept,
  documentExtension,
  documentMime,
  formatDuration,
  formatFileSize,
  outgoingBody,
  pickRecordingMime,
  recordingExtension,
  uploadProblem,
} from "@/lib/outgoingMedia";
import {
  awaitsTranscription,
  canTranscribeMime,
  textForChekelin,
  transcribe,
  transcriptionPrompt,
} from "@/lib/transcription";
import type { WhatsAppMessage } from "@/lib/whatsappMessages";

const base = { id: "wamid.2", from: "50499999999", timestamp: "1700000000" };
const wa = (m: Partial<WhatsAppMessage> & { type: string }) => ({ ...base, ...m }) as WhatsAppMessage;

describe("messageEvents: WhatsApp", () => {
  it("reads the quoted message, but not for forwards", () => {
    expect(whatsappReplyTo(wa({ type: "text", context: { id: "wamid.1" } } as never))).toBe("wamid.1");
    expect(whatsappReplyTo(wa({ type: "text", context: { id: "wamid.1", forwarded: true } } as never))).toBeNull();
    expect(whatsappReplyTo(wa({ type: "text" }))).toBeNull();
  });

  it("reads reactions; an empty emoji removes it", () => {
    expect(whatsappReaction(wa({ type: "reaction", reaction: { message_id: "m1", emoji: "❤️" } } as never))).toEqual({ targetId: "m1", emoji: "❤️" });
    expect(whatsappReaction(wa({ type: "reaction", reaction: { message_id: "m1", emoji: "" } } as never))).toEqual({ targetId: "m1", emoji: null });
    expect(whatsappReaction(wa({ type: "text" }))).toBeNull();
  });

  it("reads edits (as the original message id) and deletes", () => {
    const edit = whatsappChange(
      wa({ type: "edit", edit: { original_message_id: "m1", message: { type: "text", text: { body: "nuevo" } } } } as never),
    );
    expect(edit).toMatchObject({ kind: "edit", targetId: "m1", message: { id: "m1", type: "text", text: { body: "nuevo" }, from: base.from } });
    expect(whatsappChange(wa({ type: "edit", edit: { original_message_id: "m1" } } as never))).toBeNull();
    expect(whatsappChange(wa({ type: "revoke", revoke: { original_message_id: "m2" } } as never))).toEqual({ kind: "revoke", targetId: "m2" });
    expect(whatsappChange(wa({ type: "revoke" }))).toBeNull();
    expect(whatsappChange(wa({ type: "text" }))).toBeNull();
  });
});

describe("messageEvents: Instagram / Messenger", () => {
  it("reads replies and reactions", () => {
    expect(metaReplyTo({ reply_to: { mid: "mid.1" } })).toBe("mid.1");
    expect(metaReplyTo(undefined)).toBeNull();
    expect(metaReaction({ mid: "mid.1", action: "react", reaction: "love" })).toEqual({ targetId: "mid.1", emoji: "❤️" });
    expect(metaReaction({ mid: "mid.1", action: "react", emoji: "😂" })).toEqual({ targetId: "mid.1", emoji: "😂" });
    expect(metaReaction({ mid: "mid.1", action: "react", reaction: "weird" })).toEqual({ targetId: "mid.1", emoji: "👍" });
    expect(metaReaction({ mid: "mid.1", action: "unreact" })).toEqual({ targetId: "mid.1", emoji: null });
    expect(metaReaction({ action: "react" })).toBeNull();
  });

  it("blanks a deleted message", () => {
    expect(deletedFields("t")).toEqual({ body: DELETED_TEXT, deleted_at: "t", reaction_in: null, reaction_out: null });
  });
});

describe("outgoingMedia", () => {
  it("Instagram only takes PDFs", () => {
    expect(documentAccept("instagram")).toBe(".pdf,application/pdf");
    expect(documentAccept("whatsapp")).toContain(".xlsx");
    expect(documentMime("instagram", "application/msword", "a.doc")).toBeNull();
    expect(documentMime("instagram", "application/pdf", "a.pdf")).toBe("application/pdf");
  });

  it("falls back to the file name when the phone gives no type", () => {
    expect(documentMime("whatsapp", "", "Factura.PDF")).toBe("application/pdf");
    expect(documentMime("whatsapp", "application/x-msdownload", "virus.exe")).toBeNull();
    expect(documentExtension("application/pdf")).toBe("pdf");
    expect(documentExtension("x/y")).toBe("bin");
  });

  it("knows browser recording formats", () => {
    expect(recordingExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(recordingExtension("audio/MP4")).toBe("m4a");
    expect(recordingExtension("audio/wav")).toBeNull();
    expect(pickRecordingMime((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecordingMime(() => false)).toBe("");
  });

  it("explains uploads that can't go out", () => {
    const voice = { kind: "voice" as const, channelType: "whatsapp" as const, mime: "audio/webm", size: 1000 };
    expect(uploadProblem(voice)).toBeNull();
    expect(uploadProblem({ ...voice, size: 0 })).toBe("El archivo está vacío.");
    expect(uploadProblem({ ...voice, mime: "audio/wav" })).toMatch(/formato de audio/);
    expect(uploadProblem({ ...voice, size: MAX_RECORDING_BYTES + 1 })).toMatch(/muy larga/);
    const doc = { kind: "document" as const, channelType: "whatsapp" as const, mime: "application/pdf", size: 1000, filename: "a.pdf" };
    expect(uploadProblem(doc)).toBeNull();
    expect(uploadProblem({ ...doc, size: MAX_DOCUMENT_BYTES + 1 })).toMatch(/25 MB/);
    expect(uploadProblem({ ...doc, channelType: "instagram", mime: "text/plain", filename: "a.txt" })).toMatch(/solo permite enviar documentos PDF/);
    expect(uploadProblem({ ...doc, mime: "image/png", filename: "a.png" })).toMatch(/no se puede enviar/);
  });

  it("cleans file names", () => {
    expect(cleanFilename("C:\\fotos\\recibo.pdf")).toBe("recibo.pdf");
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename("a\u0000b.pdf")).toBe("ab.pdf");
    expect(cleanFilename("   ")).toBe("Documento");
    const long = cleanFilename(`${"x".repeat(200)}.pdf`);
    expect(long).toHaveLength(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("formats bodies, durations and sizes", () => {
    expect(outgoingBody("voice")).toBe("🎤 Nota de voz");
    expect(outgoingBody("document", "a.pdf")).toBe("📄 a.pdf");
    expect(formatDuration(7.9)).toBe("0:07");
    expect(formatDuration(102)).toBe("1:42");
    expect(formatDuration(-3)).toBe("0:00");
    expect(formatFileSize(100)).toBe("1 KB");
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});

describe("transcription", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a short prompt with the store's product names first", () => {
    const prompt = transcriptionPrompt({ storeName: " Luna ", productNames: ["Blusa  de lino", "blusa de lino", "", "Sandalias"] });
    expect(prompt).toMatch(/^Nota de voz de un cliente de Honduras a la tienda Luna\./);
    expect(prompt).toContain("Productos: Blusa de lino, Sandalias.");
    expect(prompt).toContain("pisto");
    expect(transcriptionPrompt({ productNames: [] })).not.toContain("Productos");
  });

  it("never goes over the size budget", () => {
    const many = Array.from({ length: 500 }, (_, i) => `Producto número ${i}`);
    const prompt = transcriptionPrompt({ storeName: "Luna", productNames: many });
    expect(prompt.length).toBeLessThanOrEqual(900);
    expect(prompt).toContain("Producto número 0");
    expect(prompt.endsWith("Pedro Sula.")).toBe(true);
  });

  it("knows which audio it can send", () => {
    expect(canTranscribeMime("audio/ogg")).toBe(true);
    expect(canTranscribeMime("audio/amr")).toBe(false);
  });

  it("reads voice notes to chekelin as words", () => {
    expect(textForChekelin({ body: "🎤 Nota de voz", transcription: " ¿Tiene talla M? " })).toBe('[Nota de voz]: "¿Tiene talla M?"');
    expect(textForChekelin({ body: "hola", transcription: null })).toBe("hola");
  });

  it("waits only for audio not yet transcribed", () => {
    expect(awaitsTranscription({ body: "x", media_kind: "voice" })).toBe(true);
    expect(awaitsTranscription({ body: "🎤 Nota de voz" })).toBe(true);
    expect(awaitsTranscription({ body: "x", media_kind: "voice", transcription_status: "done" })).toBe(false);
    expect(awaitsTranscription({ body: "x", media_kind: "image" })).toBe(false);
  });

  it("skips without a key and refuses bad audio, without calling OpenAI", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const audio = { bytes: new Uint8Array([1, 2]), mime: "audio/ogg" };
    expect(await transcribe(audio, "p", { apiKey: "" })).toHaveProperty("skipped");
    expect(await transcribe({ ...audio, mime: "audio/amr" }, "p", { apiKey: "k" })).toEqual({ error: "unsupported audio type audio/amr" });
    expect(await transcribe({ ...audio, bytes: new Uint8Array() }, "p", { apiKey: "k" })).toHaveProperty("error");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the text, or OpenAI's error", async () => {
    const audio = { bytes: new Uint8Array([1, 2]), mime: "audio/ogg" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: " hola " }), { status: 200 })));
    expect(await transcribe(audio, "p", { apiKey: "k" })).toEqual({ text: "hola" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })));
    expect(await transcribe(audio, "p", { apiKey: "k" })).toEqual({ error: "openai 401: bad key" });
  });
});
