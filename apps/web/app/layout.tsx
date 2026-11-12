import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const jakarta = localFont({ src: "./fonts/plus-jakarta-sans-latin.woff2", weight: "600 800", variable: "--font-jakarta" });
const inter = localFont({ src: "./fonts/inter-latin.woff2", weight: "100 900", variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Brecha · Rutas y salidas de hiking", template: "%s · Brecha" },
  description: "Descubre las rutas de hiking más populares de la región y únete a salidas en grupo.",
  appleWebApp: { capable: true, title: "Brecha", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#164525" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX" className={`${jakarta.variable} ${inter.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
