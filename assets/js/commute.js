import { haversineKm } from './util.js';

/**
 * Recherche par temps de trajet (isochrones), y compris multi-points :
 * ne garder que les biens accessibles en ≤ N minutes de CHAQUE point.
 *
 * Ici le temps est estimé à partir de la distance à vol d'oiseau et d'une
 * vitesse moyenne par mode (démo). En production, on appelle un service
 * d'isochrones réel (IGN, OpenRouteService, Mapbox…) via un proxy.
 */
export const MODES = {
  walk: { label: '🚶 à pied', kmh: 4.5 },
  bike: { label: '🚲 vélo', kmh: 15 },
  transit: { label: '🚌 transports', kmh: 22 },
  car: { label: '🚗 voiture', kmh: 38 },
};

// Facteur de détour : la distance réelle > vol d'oiseau.
const DETOUR = 1.3;

export function travelMinutes(listing, point, mode) {
  const km = haversineKm(listing, point) * DETOUR;
  return Math.round((km / MODES[mode].kmh) * 60);
}

/** points : [{ lat, lng, maxMin, mode, label }] — tous doivent être satisfaits. */
export function matchesCommute(listing, points) {
  if (!points || !points.length) return true;
  return points.every((p) => travelMinutes(listing, p, p.mode) <= p.maxMin);
}
