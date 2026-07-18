import { estimate } from './estimator.js';
import { computeCost } from './cost.js';
import { negotiation } from './negotiation.js';
import { risks } from './risks.js';
import { dpeBan } from './legal.js';
import { copro } from './copro.js';
import { invest } from './invest.js';
import { anomaly } from './anomaly.js';

/**
 * Calcule toutes les analyses d'un bien en une passe et les attache sous
 * `listing.ix`. Appelé une fois au chargement (après déduplication).
 */
export function enrich(listing) {
  listing.ix = {
    estimate: estimate(listing),
    cost: computeCost(listing),
    negotiation: negotiation(listing),
    risks: risks(listing),
    dpeBan: dpeBan(listing),
    copro: copro(listing),
    invest: invest(listing),
    anomaly: anomaly(listing),
  };
  return listing;
}
