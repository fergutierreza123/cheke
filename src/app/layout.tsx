import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (variable, Latin subset incl. ñ/á) so the build never depends
// on downloading from Google Fonts. Files from @fontsource-variable 5.3.0.
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

const workSans = localFont({
  src: "./fonts/work-sans-latin.woff2",
  variable: "--font-work-sans",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "cheke.io",
  description: "CRM omnicanal para negocios que venden por WhatsApp, Instagram y Facebook.",
  // Meta's "verify your domain" step gives a code to publish here; set it as
  // NEXT_PUBLIC_META_DOMAIN_VERIFICATION and redeploy.
  other: process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION
    ? { "facebook-domain-verification": process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION }
    : undefined,
};

// viewportFit "cover" lets the app draw under the iPhone notch/home bar so
// the safe-area insets (used by the bottom tab bar) actually apply.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#001037",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${spaceGrotesk.variable} ${workSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
