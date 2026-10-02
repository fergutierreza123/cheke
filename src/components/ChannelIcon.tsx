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
      {/* The circle itself is the "bubble" (matching the Instagram/Facebook
          badges below), so only the phone-receiver glyph sits on top. */}
      <path
        d="M16.52 14.38c-.25-.13-1.47-.72-1.7-.81-.23-.08-.4-.13-.56.13-.17.25-.65.81-.8.98-.14.17-.3.19-.55.06-.25-.13-1.06-.39-2.02-1.24-.75-.66-1.25-1.49-1.4-1.74-.15-.25-.02-.39.11-.51.11-.11.25-.3.37-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.15-.01-.31-.01-.48-.01-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.09 0 1.23.9 2.42 1.03 2.59.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z"
        fill="#fff"
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
