import type { Metadata, Viewport } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import { Splash } from "./splash";
import { ThemeSync } from "./theme-sync";

/**
 * Sets `.dark` on <html> before first paint, mirroring the resolution in
 * src/lib/theme.ts. Preferences only live in localStorage — the server
 * render can't know the athlete's choice — so without this, a page load
 * would flash the wrong theme (or, for the map screens, the wrong basemap
 * style) until React hydrates and ThemeSync catches up.
 */
const THEME_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem("xanthus:preferences");var theme=raw?JSON.parse(raw).theme:"system";var dark=theme==="dark"||(theme!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;

/** Rounder, chubbier than Geist for body text and headings — the numeric readouts (pace, distance, splits) stay on Geist Mono below for tabular alignment. */
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

/** Fixed at Bold rather than the variable range — every number on screen (pace, distance, splits) reads thicker now, not just the ones with an explicit font-bold class. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "Xanthus",
  description:
    "Corra com pace estável, aviso por voz a cada trecho e previsão de chegada em tempo real.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Xanthus",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e11" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      // The theme-init script (below) adds/removes "dark" before hydration,
      // ahead of what the server rendered — an intentional mismatch, not a bug.
      suppressHydrationWarning
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeSync />
        <Splash />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
