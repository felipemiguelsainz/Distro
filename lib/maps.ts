/** Utilidades para abrir rutas/PDVs en Google Maps. */

export interface Punto {
  lat: number;
  lon: number;
  nombre?: string;
}

/** Distancia en km entre dos coordenadas (haversine). */
export function distanciaKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** URL para ver un único PDV en Google Maps. */
export function googleMapsPunto(p: Punto): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}

/**
 * URL de ruta optimizada en Google Maps. El primer punto es el origen, el
 * último el destino; los intermedios van como waypoints. Google reordena con
 * `&waypoints=optimize:true|...` para minimizar la distancia.
 */
export function googleMapsRuta(puntos: Punto[]): string | null {
  const validos = puntos.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );
  if (validos.length < 2) return null;

  const origin = `${validos[0].lat},${validos[0].lon}`;
  const destination = `${validos[validos.length - 1].lat},${validos[validos.length - 1].lon}`;
  const intermedios = validos.slice(1, -1);

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (intermedios.length > 0) {
    const wp = intermedios.map((p) => `${p.lat},${p.lon}`).join("|");
    params.set("waypoints", `optimize:true|${wp}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
