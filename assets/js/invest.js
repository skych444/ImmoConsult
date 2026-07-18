import { seededFor } from './util.js';
import { computeCost } from './cost.js';

/**
 * Analyse investisseur : rendement locatif, potentiel de plus-value et timing
 * de marché. Le loyer de marché est estimé (démo) ; en production il provient
 * d'observatoires des loyers (open data) ou de vos propres données.
 */
// Loyer mensuel de marché ≈ prix / coefficient (varie selon la ville).
export function invest(listing) {
  if (listing.transaction !== 'buy' || !listing.surface) return null;
  const r = seededFor(listing, 'invest');

  const estRentMonthly = Math.round((listing.priceEUR / 230) * (0.9 + r() * 0.3));
  const cost = computeCost(listing);
  const grossYield = (estRentMonthly * 12 / listing.priceEUR) * 100;
  const netAnnual = estRentMonthly * 12 - cost.propertyTax - cost.coproYear - estRentMonthly * 12 * 0.08;
  const netYield = (netAnnual / listing.priceEUR) * 100;

  const trendPerYear = Math.round((r() * 6 - 1) * 10) / 10; // -1 % à +5 %/an
  const stockRising = r() < 0.4;

  return {
    estRentMonthly,
    grossYield: Math.round(grossYield * 10) / 10,
    netYield: Math.round(netYield * 10) / 10,
    trendPerYear,
    timing: stockRising ? 'acheteur' : 'vendeur',
  };
}
