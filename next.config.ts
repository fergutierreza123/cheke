import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The webhooks convert WhatsApp voice notes to M4A (Safari/iPhone) with
  // the ffmpeg program from ffmpeg-static (src/lib/messageMedia.ts). It finds
  // the program next to its own file, so it must not be bundled, and the
  // program itself has to be copied into those two functions on Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/meta/webhook": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  experimental: {
    serverActions: {
      // Default is 1mb, too small for a product photo uploaded via
      // saveProduct's Server Action (src/app/(app)/inventory/actions.ts).
      // Vercel itself rejects bodies over 4.5 MB, so the browser shrinks
      // photos first (src/lib/shrinkPhoto.ts) and the action caps them at 4 MB.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
