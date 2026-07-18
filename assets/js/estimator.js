/**
 * Estimateur de prix — compare le prix au m² d'un bien à une référence de
 * marché.
 *
 * Les valeurs ci-dessous sont des références de DÉMONSTRATION (€/m² à l'achat).
 * En production, on les remplace par des agrégats réels issus de l'open data
 * **DVF** (Demandes de Valeurs Foncières, data.gouv.fr) calculés par
 * commune/quartier côté back-end, puis exposés en JSON à ce module.
 */
export const MARKET_REF = {
  Paris: 11000, Lyon: 5200, Nice: 5600, Bordeaux: 4700, Bruxelles: 3600,
  'Genève': 14000, Zurich: 15500, Barcelone: 4500, Madrid: 4200, Marbella: 5200,
  Lisbonne: 4300, Porto: 3200, Londres: 13500, Miami: 6500, 'New York': 12500,
  'Dubaï': 4800,
};

/**
 * Renvoie l'estimation d'un bien à l'achat, ou null si non estimable.
 * { refPerM2, perM2, deltaPct, verdict: 'below'|'fair'|'above' }
 */
export function estimate(listing) {
  if (listing.transaction !== 'buy' || !listing.surface) return null;
  const ref = MARKET_REF[listing.city];
  if (!ref) return null;
  const perM2 = listing.priceEUR / listing.surface;
  const deltaPct = Math.round(((perM2 - ref) / ref) * 100);
  let verdict = 'fair';
  if (deltaPct <= -7) verdict = 'below';
  else if (deltaPct >= 7) verdict = 'above';
  return { refPerM2: ref, perM2: Math.round(perM2), deltaPct, verdict };
}
