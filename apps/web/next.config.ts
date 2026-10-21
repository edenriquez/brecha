import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // la imagen para compartir lee las portadas de public/ con fs: sin esto no viajan en la función de Vercel
  outputFileTracingIncludes: { "/salidas/[id]/opengraph-image": ["./public/rutas/**", "./assets/fonts/**"] },
  images: {
    formats: ["image/avif", "image/webp"],
    // Supabase local corre en 127.0.0.1; solo en desarrollo se permite optimizar imágenes de IP privada.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54371" },
      { protocol: "https", hostname: "*.supabase.co" },
      // fotos de perfil de quienes entran con Google
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
