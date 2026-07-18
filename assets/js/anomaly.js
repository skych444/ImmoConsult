import { estimate } from './estimator.js';

/**
 * Détecteur d'anomalies / arnaques potentielles.
 * Signale les annonces au comportement inhabituel pour inciter à la prudence.
 */
export function anomaly(listing) {
  const reasons = [];
  const est = estimate(listing);
  if (est && est.deltaPct <= -30) reasons.push('Prix très en dessous du marché (méfiance : arnaque possible)');
  if (!listing.energy && listing.type !== 'land') reasons.push('DPE manquant');
  const ppm2 = listing.priceEUR / listing.surface;
  if (listing.transaction === 'buy' && ppm2 < 500) reasons.push('Prix au m² anormalement bas');
  if (listing.surface < 9 && listing.type !== 'land') reasons.push('Surface sous le minimum légal de décence (9 m²)');

  const level = reasons.length === 0 ? 'ok' : reasons.some((x) => x.includes('arnaque')) ? 'danger' : 'warn';
  return { level, reasons };
}
