import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Space_Mono } from "next/font/google";
import "./globals.css";

// Bricolage Grotesque = a characterful modern grotesque (optical-size variable) —
// more personality than Space Grotesk while staying legible; carries the display.
// Inter = clean neutral UI body. Space Mono = the instrument/HUD face: coordinates,
// stats, and readouts render like a spatial-OS panel, not generic UI numbers.
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});
const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Panogram — stand in the world",
  description:
    "Immersive social for panoramic, 360° and 180° media. Teleport anywhere. Built spatial-native.",
};

// Runs before first paint: resolve the theme (stored choice, else system) and
// stamp it on <html> so there's no flash of the wrong theme. Dark stays the
// default when nothing is stored and the system has no light preference.
const themeInit = `(function(){try{var t=localStorage.getItem("pg-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      {/* Browser extensions (password managers, Demoway, Grammarly…) inject
          attributes on <body> before React hydrates; suppress that one-level warning. */}
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
