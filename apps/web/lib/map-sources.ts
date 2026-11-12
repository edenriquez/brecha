// Sin maplibre: lo usa también la descarga sin conexión, que vive en páginas sin mapa.
// Si cambian los hosts, actualizar MAP_HOSTS en public/sw.js.
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
