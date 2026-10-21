import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Imperium — App do técnico",
    short_name: "Imperium",
    description: "OMs do dia, checklist, fotos, assinatura e materiais.",
    start_url: "/tecnico",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#040914",
    theme_color: "#040914",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "OMs de hoje", url: "/tecnico" },
      { name: "Escanear QR", url: "/tecnico/escanear" },
    ],
  };
}
