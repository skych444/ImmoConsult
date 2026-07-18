import { demoSource } from './demo.js';

/**
 * Registre des sources.
 *
 * Pour ajouter un vrai portail :
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
  // exampleSource,
];

/** Agrège les annonces de toutes les sources actives, en tolérant les pannes. */
export async function fetchAllListings() {
  const active = SOURCE_ADAPTERS.filter((s) => s.enabled);
  const results = await Promise.allSettled(active.map((s) => s.fetchListings()));
  const listings = [];
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      listings.push(...res.value);
    } else {
      console.warn(`Source "${active[i].id}" indisponible :`, res.reason);
    }
  });
  return listings;
}
