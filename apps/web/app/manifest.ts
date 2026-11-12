import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Brecha · Rutas y salidas de hiking",
    short_name: "Brecha",
    description: "Rutas de hiking, salidas en grupo y mapas para usar sin conexión.",
    lang: "es-MX",
    start_url: "/",
    display: "standalone",
    background_color: "#fcf9f2",
    theme_color: "#164525",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
