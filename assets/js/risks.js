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
