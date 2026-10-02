import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for a real product photo uploaded via
      // saveProduct's Server Action (src/app/(app)/inventory/actions.ts).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
