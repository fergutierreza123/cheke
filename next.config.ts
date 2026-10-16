import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
