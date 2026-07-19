/**
 * Géocodage réel via la Base Adresse Nationale (BAN) — gratuit, sans clé.
 * https://adresse.data.gouv.fr/api-doc/adresse
 */
const BAN = 'https://api-adresse.data.gouv.fr/search/';

/** Cherche une commune française et renvoie son centre + code INSEE. */
export async function geocodeCommune(q) {
  const url = `${BAN}?q=${encodeURIComponent(q)}&type=municipality&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BAN ${res.status}`);
  const j = await res.json();
  const f = j.features && j.features[0];
  if (!f) return null;
  return {
    label: f.properties.label,
    citycode: f.properties.citycode,
    postcode: f.properties.postcode,
    context: f.properties.context,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  };
}
