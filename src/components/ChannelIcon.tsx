import type { ChannelType } from "@/lib/types";

// Small circular channel badges (WhatsApp/Instagram/Facebook) — replaces
// the old plain colored dot used everywhere a conversation's channel needs
// identifying (avatar overlay, list rows, filters), closer to how
// respond.io badges a contact's platform directly on their avatar instead
// of relying on color alone.
export function ChannelIcon({ type, className }: { type: ChannelType; className?: string }) {
  if (type === "whatsapp") return <WhatsAppIcon className={className} />;
  if (type === "instagram") return <InstagramIcon className={className} />;
  return <FacebookIcon className={className} />;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="WhatsApp" role="img">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      {/* The official WhatsApp glyph (bubble outline + tail + phone, as in the
          Simple Icons set), white on the green badge and scaled to ~66% so
          it keeps the real logo's proportions and still reads at 12px. */}
      <path
        transform="translate(4.08 4.08) scale(0.66)"
        fill="#fff"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  const gradId = "ig-grad";
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Instagram" role="img">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FEDA75" />
          <stop offset="30%" stopColor="#D62976" />
          <stop offset="65%" stopColor="#962FBF" />
          <stop offset="100%" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="12" fill={`url(#${gradId})`} />
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.2" fill="none" stroke="#fff" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.3" />
      <circle cx="15.7" cy="8.3" r="0.9" fill="#fff" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Facebook" role="img">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        d="M14.2 12.9h-1.73V19h-2.51v-6.1H8.7v-2.14h1.26V9.44c0-1.24.6-3.17 3.17-3.17l2.33.01v2.08h-1.69c-.28 0-.67.14-.67.74v1.66h2.39l-.29 2.14z"
        fill="#fff"
      />
    </svg>
  );
}
