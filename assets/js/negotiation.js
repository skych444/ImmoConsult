import { seededFor } from './util.js';
import { estimate } from './estimator.js';

/**
 * Score de négociabilité : marge de baisse probable, à partir de
 *  - l'ancienneté de l'annonce (jours en ligne),
 *  - l'historique des baisses de prix,
 *  - la surévaluation vs marché (DVF).
 *
 * L'historique de prix est ici synthétisé de façon déterministe (démo).
 * En production il provient du suivi des annonces dans le temps.
 */
export function negotiation(listing) {
  const daysOnMarket = Math.max(0, Math.round((Date.now() - new Date(listing.createdAt)) / 86400000));
  const r = seededFor(listing, 'nego');

  // Historique de baisses (0 à 2).
  const drops = [];
  let p = listing.priceEUR;
  const nDrops = daysOnMarket > 45 ? (r() < 0.6 ? 2 : 1) : (r() < 0.3 ? 1 : 0);
  for (let i = 0; i < nDrops; i++) {
    const pct = 2 + Math.floor(r() * 6);
    const before = Math.round(p / (1 - pct / 100));
    drops.unshift({ pct, from: before, to: p });
    p = before;
  }
  const initialPrice = drops.length ? drops[0].from : listing.priceEUR;
  const alreadyDropped = Math.round(((initialPrice - listing.priceEUR) / initialPrice) * 100);

  const est = estimate(listing);
  const overpricePct = est ? Math.max(0, est.deltaPct) : 0;

  // Marge estimée (0–15 %).
  let margin = 0;
  margin += Math.min(6, daysOnMarket / 20);
  margin += Math.min(6, overpricePct * 0.4);
  margin += Math.min(3, drops.length * 1.5);
  margin = Math.round(Math.min(15, margin));

  const level = margin >= 8 ? 'high' : margin >= 4 ? 'medium' : 'low';
  return { daysOnMarket, drops, alreadyDropped, overpricePct, margin, level };
}
