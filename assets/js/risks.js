import { seededFor } from './util.js';

/**
 * Risques & qualité de vie hyperlocaux.
 *
 * Valeurs de DÉMONSTRATION générées de façon déterministe par bien. En
 * production, on les remplace par les API open data :
 *  - Risques : Géorisques (georisques.gouv.fr) — inondation, argiles, radon…
 *  - Bruit : cartes de bruit (Bruitparif / data.gouv.fr)
 *  - Air : Atmo / indices ATMO
 *  - Écoles : annuaire + IVAL (résultats)
 *  - Fibre : ARCEP (Ma connexion internet)
 */
const RISK_LABELS = {
  flood: 'Inondation', clay: 'Retrait-gonflement argiles', radon: 'Radon',
  seismic: 'Sismique', pollution: 'Sols pollués',
};

export function risks(listing) {
  const r = seededFor(listing, 'risk');
  const level = () => Math.floor(r() * 4); // 0 nul, 1 faible, 2 moyen, 3 fort
  const hazards = {
    flood: level(), clay: level(), radon: level(), seismic: level(), pollution: Math.min(2, level()),
  };
  const worst = Math.max(...Object.values(hazards));

  const quality = {
    noise: Math.round(30 + r() * 65),      // 0 calme … 100 bruyant
    air: Math.round(35 + r() * 60),        // indice qualité air (100 = excellent)
    schools: Math.round(40 + r() * 55),    // score écoles
    shops: Math.round(35 + r() * 60),      // commerces/services
    transit: Math.round(30 + r() * 65),    // transports
    fiber: r() > 0.25,                     // fibre disponible
  };

  // Score de vie global (0–100) : bonne qualité, faible bruit, faible risque.
  const livability = Math.round(
    (quality.air * 0.2 + (100 - quality.noise) * 0.2 + quality.schools * 0.15
      + quality.shops * 0.15 + quality.transit * 0.2 + (quality.fiber ? 100 : 40) * 0.1)
    - worst * 6,
  );

  return {
    hazards, worst, quality,
    livability: Math.max(0, Math.min(100, livability)),
    labels: RISK_LABELS,
  };
}

export const RISK_LEVEL_TXT = ['nul', 'faible', 'moyen', 'fort'];

/* ------------------------------------------------------------------ *
 *  Risques RÉELS via l'API Géorisques (gratuite, sans clé).
 *  https://georisques.gouv.fr/  — France uniquement.
 *  Renvoie { hazards, real:true } ou null si indisponible (CORS/erreur).
 * ------------------------------------------------------------------ */
const _riskCache = new Map();

export async function fetchRealRisks(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (_riskCache.has(key)) return _riskCache.get(key);
  let result = null;
  try {
    const url = `https://georisques.gouv.fr/api/v1/gaspar/risques?rayon=1000&latlon=${lng},${lat}`;
    const res = await fetch(url);
    if (res.ok) result = parseGeorisques(await res.json());
  } catch { /* CORS ou réseau : on gardera l'estimation */ }
  _riskCache.set(key, result);
  return result;
}

/** Analyse tolérante : détecte la présence de familles de risques. */
function parseGeorisques(json) {
  const s = JSON.stringify(json).toLowerCase();
  const has = (...w) => w.some((x) => s.includes(x));
  return {
    real: true,
    hazards: {
      flood: has('inondation') ? 2 : 0,
      clay: has('argile', 'mouvement de terrain') ? 2 : 0,
      radon: has('radon') ? 2 : 0,
      seismic: has('sismi') ? 2 : 0,
      pollution: has('pollu', 'industriel', 'icpe') ? 1 : 0,
    },
    labels: RISK_LABELS,
  };
}
