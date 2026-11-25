import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Bickri Codex System",
    short_name: "BCX",
    description: "Assistant IA, studio de code et outils de création.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#182557",
    icons: [
      { src: "/bcx-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/bcx-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/bcx-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Chat", url: "/ai" },
      { name: "Codex", url: "/codex" },
    ],
  };
}
