"use client";

import dynamic from "next/dynamic";

const placeholder = () => <div className="absolute inset-0 bg-[#e3e8e1]" />;

/** Mapas sin SSR y en su propio chunk: maplibre solo se baja cuando el mapa se pinta. */
export const RouteMap = dynamic(() => import("./route-map").then((m) => m.RouteMap), { ssr: false, loading: placeholder });

export const StartPointMap = dynamic(() => import("./start-point-map").then((m) => m.StartPointMap), { ssr: false, loading: placeholder });

export const TrackMap = dynamic(() => import("./track-map").then((m) => m.TrackMap), { ssr: false, loading: placeholder });
