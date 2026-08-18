import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { OAuthCallbackListener } from "./oauth-callback-listener";
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

/** Body text and headings, at whatever weight each element already asks for (variable font, no fixed weight here). */
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

/**
 * Every numeric readout on screen (pace, distance, splits) used to run on
 * Geist Mono — a real monospace, chosen for tabular alignment in things
 * like the splits table. Nunito at a fixed Black weight keeps that same
 * alignment (it supports tabular figures, and `tabular-nums` is already
 * applied everywhere these numbers render) while reading rounder and
 * heavier — the "chubby, game-HUD" look asked for, compared side by side
 * against several other candidates before landing here. Fixed at Black
 * (900) rather than the variable range for the same reason Geist Mono was
 * pinned to Bold before it: every number reads at the same weight, not
 * just the ones with their own explicit font-bold class.
 */
const nunitoNumbers = Nunito({
  variable: "--font-nunito-numbers",
  subsets: ["latin"],
  weight: "900",
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
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
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
      className={`${nunito.variable} ${nunitoNumbers.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeSync />
        <Splash />
        {children}
        <ServiceWorkerRegistration />
        <OAuthCallbackListener />
      </body>
    </html>
  );
}
