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
      {/* Chat bubble drawn as a white OUTLINE only (green shows through
          inside, like the real mark): a circle (r=7, centered in the badge)
          whose left edge runs straight down into a small tail, as one
          continuous stroked path so the tail joins with no seam. */}
      <path
        d="M5 20.4 L5 11.5 A7 7 0 1 1 8.5 17.56 Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Phone-receiver glyph in white, centered inside the outline. */}
      <path
        transform="translate(0.1 -0.7)"
        d="M15.4 13.52c-.22-.11-1.3-.64-1.5-.71-.2-.08-.35-.11-.5.11-.15.22-.57.71-.7.86-.13.15-.26.17-.48.06-.22-.11-.94-.35-1.79-1.1-.66-.59-1.11-1.32-1.24-1.54-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.19-.68-1.63-.18-.43-.36-.37-.5-.38-.13-.01-.28-.01-.43-.01-.15 0-.39.06-.59.28-.2.22-.78.76-.78 1.86 0 1.1.8 2.15.91 2.3.11.15 1.57 2.4 3.81 3.37.53.23.95.36 1.27.47.53.17 1.02.14 1.4.08.43-.06 1.3-.53 1.49-1.05.18-.51.18-.95.13-1.05-.05-.09-.2-.15-.42-.26z"
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
