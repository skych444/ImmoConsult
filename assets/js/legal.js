/**
 * Calendrier d'interdiction de location des passoires thermiques (loi Climat
 * & Résilience, France) selon la classe DPE :
 *   G → depuis 2025, F → 2028, E → 2034.
 */
const DPE_BAN = { G: 2025, F: 2028, E: 2034 };

export function dpeBan(listing) {
  if (!listing.energy) return null;
  const year = DPE_BAN[listing.energy];
  if (!year) return null;
  const now = new Date().getFullYear();
  return {
    energy: listing.energy,
    year,
    active: now >= year,
    label: now >= year
      ? `Interdit à la location depuis ${year} (DPE ${listing.energy})`
      : `Sera interdit à la location en ${year} (DPE ${listing.energy})`,
  };
}
