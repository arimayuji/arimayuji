import type { Metadata, Viewport } from "next";
import { Inter, Oswald, Rajdhani } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { OAuthCallbackListener } from "./oauth-callback-listener";
import { PushRegistration } from "./push-registration";
import { FriendPresencePing } from "./friend-presence-ping";
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
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/**
 * Every numeric readout on screen (pace, distance, splits) and every
 * display heading runs on Oswald — condensed enough to hold the giant
 * focus-metric number (see /run) at a size that would otherwise overflow,
 * while still reading as digits rather than a logo face. Static weights
 * (not the variable axis) because only three are ever asked for by design:
 * 500 for small labels/wordmark, 600 for most numbers, 700 for the
 * post-run summary's headline time. `tabular-nums` (already applied
 * everywhere these numbers render, e.g. the splits table) still keeps
 * digits aligned — Oswald's digits are already near-uniform width by
 * design, so the two combine rather than fight.
 */
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

/**
 * Angular, technical-feeling digits for the active-tracking screen only (the
 * giant focus number + its 4 metric cards, via `.text-metal-run` in
 * globals.css) — every other numeric readout in the app stays on Oswald
 * above. Single static weight since that's the only one that screen asks for.
 */
const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Xanthus",
  description:
    "Corra com pace estável, aviso por voz a cada trecho e previsão de chegada em tempo real.",
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
      className={`${inter.variable} ${oswald.variable} ${rajdhani.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeSync />
        <Splash />
        {children}
        <OAuthCallbackListener />
        <PushRegistration />
        <FriendPresencePing />
      </body>
    </html>
  );
}
