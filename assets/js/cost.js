import { isApartment, monthlyPayment } from './util.js';

/**
 * Coût réel total d'un bien — au-delà du prix affiché.
 * Toutes les valeurs sont en EUR. Les barèmes sont des estimations calibrées
 * (France) ; branchez vos propres barèmes locaux si besoin.
 */

// Consommation indicative par lettre DPE (kWh/m²/an, énergie primaire).
const DPE_KWH = { A: 50, B: 90, C: 150, D: 230, E: 330, F: 420, G: 500 };
const ENERGY_PRICE = 0.15; // €/kWh (mix élec/gaz indicatif)

export const CREDIT_DEFAULTS = { downPct: 10, years: 20, ratePct: 3.5 };

export function computeCost(listing, credit = CREDIT_DEFAULTS) {
  const price = listing.priceEUR;
  const apt = isApartment(listing.type);

  if (listing.transaction === 'rent') {
    // Location : charges + énergie + assurance.
    const energy = energyCost(listing);
    const charges = apt ? Math.round(listing.surface * 2.2 * 12) : 0; // charges locatives
    const insurance = 120;
    return {
      mode: 'rent',
      energyYear: energy,
      chargesYear: charges,
      insuranceYear: insurance,
      monthlyAllIn: Math.round(price + (energy + charges + insurance) / 12),
    };
  }

  // Achat.
  const newbuild = listing.features.includes('newbuild');
  const notaryRate = newbuild ? 0.025 : (listing.type === 'land' ? 0.08 : 0.075);
  const notary = Math.round(price * notaryRate);
  const propertyTax = Math.round(price * 0.004); // ~0,4 %/an, indicatif
  const coproYear = apt ? Math.round(listing.surface * 30) : 0; // ~30 €/m²/an
  const energy = energyCost(listing);
  const ownershipYear = propertyTax + coproYear + energy;

  const down = Math.round(price * (credit.downPct / 100));
  const loan = price - down;
  const monthly = Math.round(monthlyPayment(loan, credit.ratePct, credit.years));
  const totalInterest = Math.round(monthly * credit.years * 12 - loan);

  const tenYear = notary + ownershipYear * 10;

  return {
    mode: 'buy',
    notary,
    propertyTax,
    coproYear,
    energyYear: energy,
    ownershipYear,
    acquisition: price + notary,
    down,
    loan,
    monthly,
    totalInterest,
    tenYear,
  };
}

export function energyCost(listing) {
  const kwh = DPE_KWH[listing.energy] || 230;
  return Math.round(listing.surface * kwh * ENERGY_PRICE);
}

export { monthlyPayment };
