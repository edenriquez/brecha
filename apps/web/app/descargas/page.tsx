import type { Metadata } from "next";
import { Suspense } from "react";
import { OfflineRoutes } from "@/components/offline-routes";

export const metadata: Metadata = { title: "Rutas sin conexión", robots: { index: false } };

// Estática y sin datos del servidor: el service worker la guarda y la sirve sin red; todo sale del cache del dispositivo.
export default function DownloadsPage() {
  return (
    <Suspense>
      <OfflineRoutes />
    </Suspense>
  );
}
