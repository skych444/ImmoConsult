import { seededFor, isApartment } from './util.js';

/**
 * Transparence copropriété (appartements uniquement).
 *
 * Démo déterministe. En production : registre national des copropriétés
 * (open data) + pré-état daté fourni par le vendeur.
 */
export function copro(listing) {
  if (!isApartment(listing.type)) return null;
  const r = seededFor(listing, 'copro');
  const lots = 6 + Math.floor(r() * 120);
  const procedures = r() < 0.18;
  const unpaidPct = Math.round(r() * 22);
  const worksFund = Math.round(listing.surface * (r() * 60 + 10));
  const syndic = r() < 0.6 ? 'professionnel' : 'bénévole';

  const alert = procedures || unpaidPct > 12;
  return {
    lots, procedures, unpaidPct, worksFund, syndic, alert,
    monthlyCharges: Math.round(listing.surface * 2.5),
  };
}
