"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { OpenMapLink } from "@/components/open-map-link";
import { addHillshade, collapseAttribution, MAP_STYLE, maplibregl } from "@/lib/maplibre";

/** `openHref`: un clic en el mapa (sin arrastrar) lleva ahí, al mapa completo. */
export function StartPointMap({ lat, lng, openHref }: { lat: number; lng: number; openHref?: string }) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const openHrefRef = useRef(openHref);
  useEffect(() => {
    openHrefRef.current = openHref;
  }, [openHref]);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom: 12.5,
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.once("load", () => {
      addHillshade(map);
      collapseAttribution(map);
    });
    // maplibre solo emite click si no hubo arrastre: mover el mapa no navega
    map.on("click", () => {
      if (openHrefRef.current) router.push(openHrefRef.current);
    });
    if (openHrefRef.current) map.getCanvas().style.cursor = "pointer";

    const el = document.createElement("div");
    el.className = "flex items-center gap-2 rounded-full border border-outline-variant/80 bg-surface-container-lowest/95 px-2.5 py-1.5 shadow-md";
    el.innerHTML = '<span class="size-3 rounded-full border-2 border-white bg-primary"></span><span class="font-headline text-xs font-bold">Inicio del sendero</span>';
    new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);

    return () => map.remove();
  }, [lat, lng, router]);

  // maplibre-gl.css pone position: relative al contenedor, por eso el absolute va en un wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      {openHref && <OpenMapLink href={openHref} />}
    </div>
  );
}
