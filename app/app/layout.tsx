import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/reem-kufi/500.css";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/400-italic.css";
import "@fontsource/amiri/700.css";
import "./globals.css";
import { tokensCss } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Zij: 26 years of fire on one scale",
  description: "Satellite fire detections from MODIS and VIIRS, 2000 to today, harmonized into one record per area.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

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
