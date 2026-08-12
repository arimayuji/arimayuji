import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Xanthus",
    short_name: "Xanthus",
    description:
      "Corra com pace estável, aviso por voz a cada trecho e previsão de chegada em tempo real.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e11",
    theme_color: "#0b0e11",
    icons: [
      // Chrome's installability check (what fires the "add to home screen"
      // prompt) wants a real PNG at 192 and 512 — an SVG-only manifest
      // silently fails that check on Android with no error anywhere.
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
