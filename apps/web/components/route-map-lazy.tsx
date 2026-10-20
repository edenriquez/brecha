"use client";

import dynamic from "next/dynamic";

/** RouteMap sin SSR y en su propio chunk: maplibre solo se baja cuando el mapa se pinta. */
export const RouteMap = dynamic(() => import("./route-map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#e3e8e1]" />,
});
