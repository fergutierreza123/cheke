"use client";

import { useEffect, useRef, useState } from "react";
import { nextPlaybackRate } from "@/lib/chatTimeline";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

// The photo, video, voice note, document, sticker, location or contact card
// inside a Chat bubble (issue #48). Files live in the private
// "message-media" bucket and are opened through signed links that last an
// hour; the database only lets a person sign files of their own Tiendas
// (migration 0023). While a file downloads, or if it couldn't be, the bubble
// shows the message's text instead ("📷 Foto", "🎤 Nota de voz").

const BUCKET = "message-media";
const LINK_SECONDS = 60 * 60;

// True when the media takes the place of the text: the bubble then shows
// only the caption (if any) under it, not "📷 Foto".
export function mediaReplacesBody(m: Message): boolean {
  if (m.media_kind === "location") return typeof m.media_info?.latitude === "number";
  if (m.media_kind === "contacts") return Boolean(m.media_info?.contacts?.length);
  return Boolean(m.media_kind && m.media_path);
}

export function MessageMedia({ message }: { message: Message }) {
  const info = message.media_info ?? {};
  if (!mediaReplacesBody(message)) return null;

  switch (message.media_kind) {
    case "location":
      return <LocationCard latitude={info.latitude!} longitude={info.longitude!} place={info.place} address={info.address} />;
    case "contacts":
      return <ContactCards contacts={info.contacts ?? []} />;
    case "document":
      return <DocumentCard path={message.media_path!} filename={info.filename} size={info.size} fallback={message.body} />;
    default:
      return (
        <>
          <FileMedia message={message} />
          {message.transcription && <Transcription text={message.transcription} />}
        </>
      );
  }
}

// What the customer said in a voice note (issue #49): agents read faster
// than they listen.
function Transcription({ text }: { text: string }) {
  return (
    <div className="-mx-1 mb-1 max-w-[17rem] rounded-md bg-black/[0.04] px-2.5 py-1.5">
      <span className="block text-[11.5px] font-semibold text-[#667781]">Transcripción</span>
      <span className="block whitespace-pre-wrap break-words text-[13.5px] leading-snug">{text}</span>
    </div>
  );
}

function FileMedia({ message }: { message: Message }) {
  const kind = message.media_kind;
  // Voice notes play from the M4A copy when there is one (Safari/iPhone).
  const path = (kind === "voice" || kind === "audio" ? message.media_m4a_path : null) ?? message.media_path!;
  const { url, failed } = useSignedUrl(path);
  const [broken, setBroken] = useState(false);

  if (failed || broken) return <span className="text-[#667781]">{message.body}</span>;
  if (!url) return <div className="-mx-1 mb-1 mt-0.5 h-12 w-48 animate-pulse rounded-md bg-black/5" />;

  if (kind === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="-mx-1 mb-1 mt-0.5 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage link */}
        <img src={url} alt="Foto" onError={() => setBroken(true)} className="max-h-72 w-full rounded-md object-cover" />
      </a>
    );
  }
  if (kind === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage link
    return <img src={url} alt="Sticker" onError={() => setBroken(true)} className="mb-1 mt-0.5 h-32 w-32 object-contain" />;
  }
  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        onError={() => setBroken(true)}
        className="-mx-1 mb-1 mt-0.5 max-h-72 w-[calc(100%+8px)] rounded-md bg-black"
      />
    );
  }
  return <AudioPlayer url={url} onError={() => setBroken(true)} />;
}

// A voice note or audio, with WhatsApp's speed button (1× → 1,5× → 2×).
function AudioPlayer({ url, onError }: { url: string; onError: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const label = `${String(rate).replace(".", ",")}×`;
  // The browser resets the speed when the file (re)loads.
  const apply = () => {
    if (ref.current) ref.current.playbackRate = rate;
  };
  return (
    <span className="mb-1 mt-0.5 flex max-w-full items-center gap-1.5">
      <audio
        ref={ref}
        src={url}
        controls
        preload="metadata"
        onLoadedMetadata={apply}
        onPlay={apply}
        onError={onError}
        className="h-10 w-56 min-w-0 max-w-full"
      />
      <button
        type="button"
        onClick={() => {
          const next = nextPlaybackRate(rate);
          setRate(next);
          if (ref.current) ref.current.playbackRate = next;
        }}
        aria-label={`Velocidad ${label}. Toca para cambiarla`}
        title="Velocidad de reproducción"
        className="min-h-7 min-w-[38px] shrink-0 rounded-full bg-black/[0.07] px-2 text-[12px] font-semibold tabular-nums text-[#54656F] hover:bg-black/[0.1]"
      >
        {label}
      </button>
    </span>
  );
}

function DocumentCard({
  path,
  filename,
  size,
  fallback,
}: {
  path: string;
  filename?: string;
  size?: number;
  fallback: string | null;
}) {
  const name = filename ?? "Documento";
  const { url, failed } = useSignedUrl(path, name);
  if (failed) return <span className="text-[#667781]">{fallback}</span>;
  const extension = name.includes(".") ? name.split(".").pop()!.toUpperCase() : null;
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!url}
      className="-mx-1 mb-1 mt-0.5 flex min-w-[220px] items-center gap-2.5 rounded-md bg-black/[0.04] px-2.5 py-2 hover:bg-black/[0.07]"
    >
      <FileIcon className="h-8 w-8 shrink-0 text-[#667781]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-[12px] text-[#667781]">
          {[extension, size ? formatSize(size) : null].filter(Boolean).join(" · ") || "Archivo"}
        </span>
      </span>
      <span className="shrink-0 text-[12.5px] font-semibold text-[#0043F8]">Abrir</span>
    </a>
  );
}

function LocationCard({
  latitude,
  longitude,
  place,
  address,
}: {
  latitude: number;
  longitude: number;
  place?: string;
  address?: string;
}) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  return (
    <a
      href={mapUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="-mx-1 mb-1 mt-0.5 flex min-w-[220px] items-start gap-2.5 rounded-md bg-black/[0.04] px-2.5 py-2 hover:bg-black/[0.07]"
    >
      <PinIcon className="mt-0.5 h-6 w-6 shrink-0 text-[#E5484D]" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{place ?? "Ubicación"}</span>
        {address && <span className="block text-[12.5px] text-[#667781]">{address}</span>}
        <span className="mt-0.5 block text-[12.5px] font-semibold text-[#0043F8]">Ver en el mapa</span>
      </span>
    </a>
  );
}

function ContactCards({ contacts }: { contacts: Array<{ name: string; phones: string[] }> }) {
  return (
    <div className="-mx-1 mb-1 mt-0.5 space-y-1">
      {contacts.map((c, i) => (
        <div key={i} className="flex min-w-[220px] items-start gap-2.5 rounded-md bg-black/[0.04] px-2.5 py-2">
          <PersonIcon className="mt-0.5 h-6 w-6 shrink-0 text-[#667781]" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{c.name}</span>
            {c.phones.map((phone) => (
              <a key={phone} href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="block text-[12.5px] text-[#0043F8] hover:underline">
                {phone}
              </a>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// Signed links already made, so re-rendering a chat doesn't ask again.
const signedLinks = new Map<string, { url: string; expiresAt: number }>();

function cachedLink(key: string): string | null {
  const hit = signedLinks.get(key);
  return hit && hit.expiresAt > Date.now() ? hit.url : null;
}

function useSignedUrl(path: string, download?: string): { url: string | null; failed: boolean } {
  const key = `${path}|${download ?? ""}`;
  const [url, setUrl] = useState<string | null>(() => cachedLink(key));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (url) return;
    let cancelled = false;
    createClient()
      .storage.from(BUCKET)
      .createSignedUrl(path, LINK_SECONDS, download ? { download } : undefined)
      .then(({ data }) => {
        if (cancelled) return;
        if (!data?.signedUrl) return setFailed(true);
        // Remembered until a few minutes before the link stops working.
        signedLinks.set(key, { url: data.signedUrl, expiresAt: Date.now() + (LINK_SECONDS - 300) * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [url, key, path, download]);

  return { url, failed };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function PersonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
