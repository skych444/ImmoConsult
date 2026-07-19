import { demoSource } from './demo.js';
import { dvfDefaults } from './dvf.js';

/**
 * Registre des sources.
 *
 * Par défaut, l'application tente d'abord les VRAIES données DVF
 * (transactions réelles, open data). Si elles sont indisponibles (API en
 * erreur ou CORS), elle bascule automatiquement sur le jeu de démonstration.
 *
 * Pour ajouter un vrai portail d'annonces en cours :
 *   1. Créez assets/js/sources/monportail.js exportant un objet avec la même
 *      forme que demoSource (id, label, enabled, fetchListings()).
 *   2. fetchListings() appelle l'API/le flux (idéalement via un proxy
 *      serverless qui garde vos clés secrètes) et renvoie des annonces au
 *      schéma normalisé (voir le commentaire en tête de data.js).
 *   3. Importez-le ici et ajoutez-le au tableau SOURCE_ADAPTERS.
 *
 * ⚠️ Rappel juridique : ne connectez que des sources autorisées (API
 * partenaire, flux publics, open data type DVF). L'aspiration non autorisée
 * des portails viole généralement leurs conditions d'utilisation.
 */
export const SOURCE_ADAPTERS = [
  demoSource,
];

/**
 * Charge le catalogue : vraies données DVF si possible, sinon démo.
 * Renvoie { listings, mode: 'real'|'demo', error }.
 */
export async function loadCatalog() {
  let error = null;
  try {
    const listings = await dvfDefaults();
    if (listings.length) return { listings, mode: 'real' };
  } catch (err) {
    error = err && err.message;
    console.warn('DVF indisponible, bascule en démonstration :', error);
  }
  return { listings: await fetchAllListings(), mode: 'demo', error };
}

/** Agrège les annonces des adaptateurs de démonstration actifs. */
export async function fetchAllListings() {
  const active = SOURCE_ADAPTERS.filter((s) => s.enabled);
  const results = await Promise.allSettled(active.map((s) => s.fetchListings()));
  const listings = [];
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') listings.push(...res.value);
    else console.warn(`Source "${active[i].id}" indisponible :`, res.reason);
  });
  return listings;
}
