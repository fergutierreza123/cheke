"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { prepareChatUpload } from "./mediaActions";
import {
  MAX_VOICE_SECONDS,
  documentAccept,
  documentMime,
  formatDuration,
  formatFileSize,
  outgoingBody,
  pickRecordingMime,
  uploadProblem,
  type OutgoingKind,
} from "@/lib/outgoingMedia";
import type { ChannelType, Message } from "@/lib/types";

// Voice notes and documents in the Chat composer (issue #50), WhatsApp-style:
//   - Mic (shown instead of Send while the box is empty): hold to record and
//     release to send, slide left to cancel. A quick tap keeps recording
//     hands-free, with a trash button and Send. Stops and sends at 2 minutes.
//   - Clip: pick a PDF (or Word/Excel…) and confirm in the strip above.
// The file is uploaded straight to storage, then /api/chat/media converts
// and sends it (see src/lib/outgoingMedia.ts).

export type MediaSendResult = { message?: Message; error?: string; sendError?: string };

type Recording = { mode: "hold" | "tap"; startedAt: number };

const HOLD_MS = 400; // shorter press = tap (hands-free recording)
const CANCEL_SLIDE_PX = 90;

export function useComposerMedia({
  conversationId,
  channelType,
  disabled,
  demo = false,
  onResult,
  onError,
}: {
  conversationId: string | null;
  channelType: ChannelType | null | undefined;
  disabled: boolean;
  // The public demo (/demo): nothing is uploaded or sent; the bubble only
  // shows in the screen.
  demo?: boolean;
  onResult: (result: MediaSendResult) => void;
  onError: (message: string | null) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  // Kept per chat: a file picked in one chat never shows in another.
  const [pickedDoc, setPendingDoc] = useState<{ conversationId: string; file: File; mime: string } | null>(null);
  const pendingDoc = pickedDoc && pickedDoc.conversationId === conversationId ? pickedDoc : null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pressRef = useRef<{ down: boolean; x: number; at: number }>({ down: false, x: 0, at: 0 });
  const recordingRef = useRef<Recording | null>(null);
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  // Latest callbacks, for async code that outlives a render.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const upload = useCallback(
    async (targetId: string, kind: OutgoingKind, blob: Blob, extra: { filename?: string; duration?: number }) => {
      setBusy(kind === "voice" ? "Enviando nota de voz…" : `Enviando ${extra.filename ?? "documento"}…`);
      onErrorRef.current(null);
      try {
        if (demo) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          onResultRef.current({
            message: {
              id: crypto.randomUUID(),
              conversation_id: targetId,
              business_id: "demo",
              direction: "out",
              body: outgoingBody(kind, extra.filename),
              media_url: null,
              status: "sent",
              is_bot: false,
              created_at: new Date().toISOString(),
            },
          });
          return;
        }
        const prep = await prepareChatUpload(targetId, {
          kind,
          mime: blob.type,
          size: blob.size,
          filename: extra.filename,
        });
        if (prep.error || !prep.path || !prep.token) return onErrorRef.current(prep.error ?? "No se pudo enviar.");
        const { error } = await createClient()
          .storage.from("message-media")
          .uploadToSignedUrl(prep.path, prep.token, blob, { contentType: blob.type || "application/octet-stream" });
        if (error) return onErrorRef.current("No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.");
        const res = await fetch("/api/chat/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: targetId, kind, path: prep.path, ...extra }),
        });
        const result = (await res.json().catch(() => null)) as MediaSendResult | null;
        onResultRef.current(result ?? { error: "No se pudo enviar. Inténtalo de nuevo." });
      } catch {
        onErrorRef.current("No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
      } finally {
        setBusy(null);
      }
    },
    [demo],
  );

  // ---- Recording -----------------------------------------------------------

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(null);
    setElapsed(0);
    setSlide(0);
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    chunksRef.current = [];
    releaseMic();
  }, [releaseMic]);

  const stopAndSend = useCallback(() => {
    const recorder = recorderRef.current;
    const current = recordingRef.current;
    if (!recorder || !current || !conversationId) return cancelRecording();
    const seconds = (Date.now() - current.startedAt) / 1000;
    const targetId = conversationId;
    recorder.onstop = () => {
      const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: type.split(";")[0] });
      chunksRef.current = [];
      // Under a second is almost always a slip of the finger.
      if (seconds >= 1 && blob.size > 0) void upload(targetId, "voice", blob, { duration: Math.round(seconds) });
    };
    if (recorder.state !== "inactive") recorder.stop();
    releaseMic();
  }, [conversationId, cancelRecording, releaseMic, upload]);

  const startRecording = useCallback(async () => {
    onErrorRef.current(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onErrorRef.current("Este navegador no permite grabar notas de voz. Actualízalo o usa Chrome o Safari.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = pickRecordingMime((type) => MediaRecorder.isTypeSupported?.(type) ?? false);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      streamRef.current = stream;
      recorderRef.current = recorder;
      // Released while the browser was still asking for the microphone (or
      // a quick tap): keep recording hands-free.
      setRecording({ mode: pressRef.current.down ? "hold" : "tap", startedAt: Date.now() });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      onErrorRef.current(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Permite el micrófono para grabar notas de voz (en los permisos del navegador o del teléfono)."
          : name === "NotFoundError"
            ? "No encontramos un micrófono en este dispositivo."
            : "No se pudo empezar a grabar. Inténtalo de nuevo.",
      );
    } finally {
      setStarting(false);
    }
  }, []);

  // Timer, and the 2-minute stop (a longer note loses WhatsApp's play button).
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const seconds = (Date.now() - recording.startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_VOICE_SECONDS) stopAndSend();
    }, 250);
    return () => window.clearInterval(id);
  }, [recording, stopAndSend]);

  // Switching chats, leaving Chat, or sending becoming blocked (window
  // closed, Modo prueba) throws an unsent recording away.
  useEffect(() => {
    return () => cancelRecording();
  }, [conversationId, disabled, cancelRecording]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || busy || e.button !== 0) return;
    e.preventDefault(); // no text selection / iOS callout while holding
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not supported: release still arrives on the button in most cases
    }
    pressRef.current = { down: true, x: e.clientX, at: Date.now() };
    if (recordingRef.current?.mode === "tap") return stopAndSend();
    if (!recordingRef.current && !starting) void startRecording();
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pressRef.current.down || recordingRef.current?.mode !== "hold") return;
    const dx = Math.min(0, e.clientX - pressRef.current.x);
    setSlide(dx);
    if (dx < -CANCEL_SLIDE_PX) {
      pressRef.current.down = false;
      cancelRecording();
    }
  }

  function onPointerUp() {
    if (!pressRef.current.down) return;
    pressRef.current.down = false;
    const current = recordingRef.current;
    if (current?.mode !== "hold") return; // still starting: it will start in tap mode
    if (Date.now() - pressRef.current.at < HOLD_MS) {
      setRecording({ ...current, mode: "tap" });
      setSlide(0);
    } else {
      stopAndSend();
    }
  }

  // Keyboard (Enter/Space) has no pointer events: start, then send.
  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (e.detail !== 0 || disabled || busy) return;
    if (recordingRef.current) stopAndSend();
    else {
      pressRef.current.down = false;
      void startRecording();
    }
  }

  // ---- Documents -----------------------------------------------------------

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still fires
    if (!file) return;
    const problem = uploadProblem({ kind: "document", channelType, mime: file.type, size: file.size, filename: file.name });
    if (problem) return onErrorRef.current(problem);
    if (!conversationId) return;
    onErrorRef.current(null);
    setPendingDoc({ conversationId, file, mime: documentMime(channelType, file.type, file.name)! });
  }

  function sendDocument() {
    if (!pendingDoc || !conversationId) return;
    const { file, mime } = pendingDoc;
    setPendingDoc(null);
    const blob = file.type === mime ? file : new Blob([file], { type: mime });
    void upload(conversationId, "document", blob, { filename: file.name });
  }

  // ---- UI ------------------------------------------------------------------

  const attachButton = (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || Boolean(busy)}
        title="Enviar un documento (PDF…)"
        aria-label="Adjuntar documento"
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 disabled:opacity-50"
      >
        <ClipIcon className="h-4 w-4" />
      </button>
      <input ref={fileInputRef} type="file" accept={documentAccept(channelType)} onChange={onPickFile} className="hidden" />
    </>
  );

  const hold = recording?.mode === "hold";
  const tap = recording?.mode === "tap";

  const micButton = (
    <>
      <AnimatePresence>
        {recording && (
          <motion.div
            key="recording"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: "spring", bounce: 0, duration: 0.3 }}
            className="absolute inset-y-0 left-0 right-[56px] z-20 flex items-center gap-3 bg-surface pl-3 lg:right-[70px] lg:pl-6"
            role="status"
            aria-live="polite"
          >
            {tap && (
              <button
                type="button"
                onClick={cancelRecording}
                aria-label="Borrar grabación"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
              >
                <TrashIcon className="h-[18px] w-[18px]" />
              </button>
            )}
            <motion.span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#E5484D]"
              animate={reduceMotion ? undefined : { opacity: [1, 0.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
            />
            <span className="w-11 shrink-0 tabular-nums text-[14px] text-ink">{formatDuration(elapsed)}</span>
            {hold ? (
              <span
                className="min-w-0 flex-1 truncate text-center text-[13px] text-ink-soft"
                style={{ transform: `translateX(${slide / 2}px)`, opacity: 1 + slide / (CANCEL_SLIDE_PX * 1.5) }}
              >
                ‹ Desliza para cancelar
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                Grabando…
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled || Boolean(busy)}
        aria-label={recording ? "Enviar nota de voz" : "Grabar nota de voz (mantén presionado)"}
        title={recording ? "Enviar nota de voz" : "Mantén presionado para grabar, o toca para grabar sin sostener"}
        animate={reduceMotion ? undefined : { scale: hold ? 1.18 : 1 }}
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
        className={`relative z-30 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-60 ${
          hold ? "bg-[#E5484D]" : "bg-brand"
        }`}
      >
        {tap ? <SendIcon className="h-4 w-4" /> : <MicIcon className="h-[18px] w-[18px]" />}
      </motion.button>
    </>
  );

  const strip = busy ? (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-surface-2 px-4 py-2 text-[12.5px] text-ink-muted lg:px-6">
      <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {busy}
    </div>
  ) : pendingDoc ? (
    <div className="flex shrink-0 items-center gap-3 border-t border-accent bg-accent-tint px-4 py-2.5 lg:px-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-dark">
        <DocIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold text-brand-dark">{pendingDoc.file.name}</div>
        <div className="text-[11.5px] text-brand-dark/80">
          {[pendingDoc.file.name.split(".").pop()?.toUpperCase(), formatFileSize(pendingDoc.file.size)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPendingDoc(null)}
        className="min-h-8 shrink-0 rounded-lg border border-border bg-surface px-3 text-[12px] text-ink-muted"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={sendDocument}
        disabled={disabled}
        className="min-h-8 shrink-0 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white disabled:opacity-60"
      >
        Enviar
      </button>
    </div>
  ) : null;

  return { attachButton, micButton, strip, recording: Boolean(recording) };
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  );
}
function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}
function ClipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}
function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
