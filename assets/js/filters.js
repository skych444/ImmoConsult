/**
 * Prédicat de filtrage PUR, partagé par l'affichage (app.js) et les alertes
 * (alerts.js). Il travaille sur un objet de filtres « normalisé » (nf) dont
 * les bornes de prix sont exprimées en EUR, ce qui rend les alertes
 * indépendantes de la devise d'affichage.
 */
export function listingMatches(it, nf, favorites) {
  if (nf.favoritesOnly && favorites && !favorites.has(it.id)) return false;
  if (nf.transaction && nf.transaction !== 'all' && it.transaction !== nf.transaction) return false;
  if (nf.types.length && !nf.types.includes(it.type)) return false;
  if (nf.countries.length && !nf.countries.includes(it.country)) return false;
  if (nf.rooms && it.rooms < nf.rooms) return false;
  if (nf.bedrooms && it.bedrooms < nf.bedrooms) return false;
  if (nf.priceMinEUR != null && it.priceEUR < nf.priceMinEUR) return false;
  if (nf.priceMaxEUR != null && it.priceEUR > nf.priceMaxEUR) return false;
  if (nf.surfaceMin != null && it.surface < nf.surfaceMin) return false;
  if (nf.surfaceMax != null && it.surface > nf.surfaceMax) return false;
  if (nf.features.length && !nf.features.every((x) => it.features.includes(x))) return false;
  if (nf.energy.length && !nf.energy.includes(it.energy)) return false;
  if (nf.q) {
    const hay = `${it.title} ${it.city} ${it.country} ${it.address} ${it.source}`.toLowerCase();
    if (!hay.includes(nf.q)) return false;
  }
  return true;
}

/** Résumé lisible d'un jeu de filtres (pour l'affichage des alertes). */
export function describeFilters(nf) {
  const parts = [];
  if (nf.transaction && nf.transaction !== 'all') parts.push(nf.transaction === 'rent' ? 'Location' : 'Achat');
  if (nf.q) parts.push(`« ${nf.q} »`);
  if (nf.countries.length) parts.push(nf.countries.join(', '));
  if (nf.types.length) parts.push(`${nf.types.length} type(s)`);
  if (nf.priceMaxEUR != null) parts.push(`≤ ${Math.round(nf.priceMaxEUR).toLocaleString('fr-FR')} €`);
  if (nf.surfaceMin != null) parts.push(`≥ ${nf.surfaceMin} m²`);
  if (nf.rooms) parts.push(`${nf.rooms}+ pièces`);
  return parts.length ? parts.join(' · ') : 'Tous les biens';
}
