import type { MetadataRoute } from "next";

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
      {
        src: "/pwa-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
