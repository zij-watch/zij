import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/reem-kufi/500.css";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/400-italic.css";
import "@fontsource/amiri/700.css";
import "./globals.css";
import "./ui.css";
import "./errors.css";
import { tokensCss } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Zij: 26 years of fire on one scale",
  description: "Satellite fire detections from MODIS and VIIRS, 2000 to today, harmonized into one record per area.",
  // The Seal, the same mark as the logo: drawn by scripts/icons.mjs.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  // What a link to any page unfurls with: the landing's opening, drawn by scripts/og.mjs.
  metadataBase: new URL("https://zij.watch"),
  openGraph: {
    type: "website",
    siteName: "Zij",
    title: "Zij: 26 years of fire on one scale",
    description: "Satellite fire detections from MODIS and VIIRS, 2000 to today, harmonized into one record per area.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "The Zij seal over a desert night sky: Satellites do the watching. We make the tables." }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6edd8" };

// The bare frame: fonts, tokens and the theme. The top bar and credits are in app/(site)/layout.tsx.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokensCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
