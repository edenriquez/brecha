import { normalize } from "@/lib/route-filters";

/**
 * Municipios y alcaldías del buscador de lugares. Copiado del catálogo de "entre lugares"
 * (packages/ingest/places_ingest/seed/municipalities.py): códigos INEGI y centro aproximado de la cabecera.
 */
export type Place = { cvegeo: string; state: string; name: string; lat: number; lng: number };
export type PlaceState = { cve: string; name: string; places: Place[] };

const ROWS: [string, string, string, number, number][] = [
  ["17020", "Morelos", "Tepoztlán", 18.9853, -99.0997],
  ["17026", "Morelos", "Tlayacapan", 18.9558, -98.9808],
  ["17029", "Morelos", "Yautepec", 18.8828, -99.0668],
  ["17006", "Morelos", "Cuautla", 18.8123, -98.9545],
  ["17022", "Morelos", "Tetela del Volcán", 18.8930, -98.7295],
  ["17027", "Morelos", "Totolapan", 18.9880, -98.9198],
  ["17002", "Morelos", "Atlatlahucan", 18.9350, -98.8967],
  ["17007", "Morelos", "Cuernavaca", 18.9242, -99.2216],
  ["15052", "Estado de México", "Malinalco", 18.9490, -99.4949],
  ["15088", "Estado de México", "Tenancingo", 18.9608, -99.5906],
  ["15063", "Estado de México", "Ocuilan", 18.9790, -99.4166],
  ["15009", "Estado de México", "Amecameca", 19.1236, -98.7664],
  ["15068", "Estado de México", "Ozumba", 19.0392, -98.7936],
  ["15094", "Estado de México", "Tepetlixpa", 19.0000, -98.8167],
  ["15017", "Estado de México", "Ayapango", 19.1264, -98.8033],
  ["15103", "Estado de México", "Tlalmanalco", 19.2044, -98.8025],
  ["15015", "Estado de México", "Atlautla", 19.0167, -98.7667],
  ["15034", "Estado de México", "Ecatzingo", 18.9522, -98.7503],
  ["15050", "Estado de México", "Juchitepec", 19.1000, -98.8792],
  ["15089", "Estado de México", "Tenango del Aire", 19.1572, -98.8583],
  ["15022", "Estado de México", "Cocotitlán", 19.2264, -98.8622],
  ["15083", "Estado de México", "Temamatla", 19.2028, -98.8694],
  ["15025", "Estado de México", "Chalco", 19.2636, -98.8978],
  ["15039", "Estado de México", "Ixtapaluca", 19.3181, -98.8823],
  ["17009", "Morelos", "Huitzilac", 19.0326, -99.2653],
  ["17023", "Morelos", "Tlalnepantla", 19.0076, -98.9970],
  ["17030", "Morelos", "Yecapixtla", 18.8824, -98.8626],
  ["17016", "Morelos", "Ocuituco", 18.8763, -98.7756],
  ["17032", "Morelos", "Zacualpan de Amilpas", 18.7847, -98.7698],
  ["17033", "Morelos", "Temoac", 18.7705, -98.7788],
  ["17004", "Morelos", "Ayala", 18.7644, -98.9842],
  ["17024", "Morelos", "Tlaltizapán de Zapata", 18.6849, -99.1187],
  ["17010", "Morelos", "Jantetelco", 18.7162, -98.7763],
  ["17013", "Morelos", "Jonacatepec de Leandro Valle", 18.6856, -98.8026],
  ["15119", "Estado de México", "Zumpahuacán", 18.8357, -99.5774],
  ["15113", "Estado de México", "Villa Guerrero", 18.9616, -99.6415],
  ["15049", "Estado de México", "Joquicingo", 19.0498, -99.5334],
  ["15090", "Estado de México", "Tenango del Valle", 19.1046, -99.5908],
  ["15101", "Estado de México", "Tianguistenco", 19.1803, -99.4674],
  ["15043", "Estado de México", "Xalatlaco", 19.1800, -99.4165],
  ["15040", "Estado de México", "Ixtapan de la Sal", 18.8451, -99.6767],
  ["15107", "Estado de México", "Tonatico", 18.8056, -99.6703],
  ["21114", "Puebla", "Puebla", 19.0440, -98.2029],
  ["21140", "Puebla", "San Pedro Cholula", 19.0674, -98.3037],
  ["21119", "Puebla", "San Andrés Cholula", 19.0533, -98.2969],
  ["21019", "Puebla", "Atlixco", 18.9072, -98.4347],
  ["21074", "Puebla", "Huejotzingo", 19.1597, -98.4080],
  ["21026", "Puebla", "Calpan", 19.1053, -98.4651],
  ["21138", "Puebla", "San Nicolás de los Ranchos", 19.0726, -98.4862],
  ["21188", "Puebla", "Tochimilco", 18.8893, -98.5814],
  ["21043", "Puebla", "Cuetzalan del Progreso", 20.0190, -97.5233],
  ["21207", "Puebla", "Zacapoaxtla", 19.8726, -97.5884],
  ["21186", "Puebla", "Tlatlauquitepec", 19.8504, -97.4966],
  ["21174", "Puebla", "Teziutlán", 19.8152, -97.3618],
  ["21208", "Puebla", "Zacatlán", 19.9353, -97.9616],
  ["21053", "Puebla", "Chignahuapan", 19.8367, -98.0327],
  ["21172", "Puebla", "Tetela de Ocampo", 19.8166, -97.8059],
  ["21071", "Puebla", "Huauchinango", 20.1731, -98.0542],
  ["21109", "Puebla", "Pahuatlán", 20.2707, -98.1478],
  ["21197", "Puebla", "Xicotepec", 20.2773, -97.9593],
  ["09002", "Ciudad de México", "Azcapotzalco", 19.4825, -99.1854],
  ["09003", "Ciudad de México", "Coyoacán", 19.3241, -99.1534],
  ["09004", "Ciudad de México", "Cuajimalpa de Morelos", 19.3617, -99.2864],
  ["09005", "Ciudad de México", "Gustavo A. Madero", 19.4922, -99.1216],
  ["09006", "Ciudad de México", "Iztacalco", 19.3958, -99.0844],
  ["09007", "Ciudad de México", "Iztapalapa", 19.3460, -99.0543],
  ["09008", "Ciudad de México", "La Magdalena Contreras", 19.3131, -99.2462],
  ["09009", "Ciudad de México", "Milpa Alta", 19.1994, -99.0198],
  ["09010", "Ciudad de México", "Álvaro Obregón", 19.3593, -99.2160],
  ["09011", "Ciudad de México", "Tláhuac", 19.2899, -99.0343],
  ["09012", "Ciudad de México", "Tlalpan", 19.2810, -99.1797],
  ["09013", "Ciudad de México", "Xochimilco", 19.2591, -99.1055],
  ["09014", "Ciudad de México", "Benito Juárez", 19.3801, -99.1647],
  ["09015", "Ciudad de México", "Cuauhtémoc", 19.4323, -99.1501],
  ["09016", "Ciudad de México", "Miguel Hidalgo", 19.4320, -99.1889],
  ["09017", "Ciudad de México", "Venustiano Carranza", 19.4281, -99.1094],
];

export const PLACES: Place[] = ROWS.map(([cvegeo, state, name, lat, lng]) => ({ cvegeo, state, name, lat, lng }));

/** Los estados salen de los municipios: su clave son los 2 primeros dígitos del cvegeo. */
export const STATES: PlaceState[] = (() => {
  const byCve = new Map<string, PlaceState>();
  for (const p of PLACES) {
    const cve = p.cvegeo.slice(0, 2);
    if (!byCve.has(cve)) byCve.set(cve, { cve, name: p.state, places: [] });
    byCve.get(cve)!.places.push(p);
  }
  return [...byCve.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

/** Valor de `lugar` cuando la zona sale de la ubicación del navegador. */
export const MY_LOCATION = "gps";

/**
 * `lugar` guarda el código (cvegeo del municipio, clave del estado o "gps") y no el nombre:
 * "Puebla" es estado y municipio. `label` va en la píldora y el chip; `where`, en frases ("rutas cerca de…").
 */
export function describePlace(code: string | null): { label: string; where: string } | null {
  if (code === MY_LOCATION) return { label: "Cerca de ti", where: "cerca de ti" };
  const state = STATES.find((s) => s.cve === code);
  if (state) return { label: `Todo ${state.name}`, where: `en ${state.name}` };
  const place = PLACES.find((p) => p.cvegeo === code);
  return place ? { label: `Cerca de ${place.name}`, where: `cerca de ${place.name}` } : null;
}

/** Estados y municipios (máx. 8) cuyo nombre contiene el texto, sin acentos; primero los que empiezan con él. */
export function searchPlaces(text: string) {
  const q = normalize(text);
  const starts = (name: string) => Number(!normalize(name).startsWith(q));
  return {
    states: STATES.filter((s) => normalize(s.name).includes(q)),
    places: PLACES.filter((p) => normalize(p.name).includes(q))
      .sort((a, b) => starts(a.name) - starts(b.name) || a.name.localeCompare(b.name))
      .slice(0, 8),
  };
}
