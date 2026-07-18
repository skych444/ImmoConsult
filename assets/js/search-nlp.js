import { PROPERTY_TYPES, FEATURES, CITY_NAMES, COUNTRIES } from './data.js';

/**
 * Recherche en langage naturel (règles, sans LLM).
 * Transforme une phrase en filtres structurés + mots-clés restants.
 * Ex. : « appartement 3 pièces à Lyon avec terrasse moins de 400k »
 *   → type=apartment, rooms=3, ville=Lyon, feature=terrace, prixMax=400000
 *
 * Le point d'entrée peut être remplacé par un appel LLM (via proxy) qui
 * renverrait le même objet de filtres.
 */
const FEATURE_WORDS = {
  pool: ['piscine'], terrace: ['terrasse'], balcony: ['balcon'], garden: ['jardin'],
  parking: ['parking', 'garage'], elevator: ['ascenseur'], furnished: ['meublé', 'meuble'],
  seaview: ['vue mer', 'vue sur mer'], newbuild: ['neuf', 'récent', 'recent'], airco: ['clim', 'climatisation'],
};
const TYPE_WORDS = {
  studio: ['studio'], apartment: ['appartement', 'appart', 't1', 't2', 't3', 't4', 't5'],
  house: ['maison', 'pavillon'], villa: ['villa'], loft: ['loft'], penthouse: ['penthouse'],
  land: ['terrain'], commercial: ['local', 'commerce', 'bureau'],
};

function parsePrice(q) {
  // « 400k », « 400 000 », « 1,2m »
  const norm = (s) => {
    s = s.replace(/\s/g, '').replace(',', '.');
    if (/m$/.test(s)) return Math.round(parseFloat(s) * 1e6);
    if (/k$/.test(s)) return Math.round(parseFloat(s) * 1e3);
    return Math.round(parseFloat(s));
  };
  let priceMin = null; let priceMax = null;
  const between = q.match(/entre\s+([\d.,\s]+[km]?)\s+et\s+([\d.,\s]+[km]?)/i);
  if (between) { priceMin = norm(between[1]); priceMax = norm(between[2]); return { priceMin, priceMax }; }
  const max = q.match(/(?:moins de|sous|<|jusqu'?à|max\.?|budget)\s*([\d.,\s]+[km]?)\s*(?:€|euros?)?/i);
  if (max) priceMax = norm(max[1]);
  const min = q.match(/(?:plus de|à partir de|>|min\.?)\s*([\d.,\s]+[km]?)\s*(?:€|euros?)?/i);
  if (min) priceMin = norm(min[1]);
  return { priceMin, priceMax };
}

export function parseQuery(query) {
  const q = ` ${query.toLowerCase()} `;
  const recognized = [];
  const patch = { types: new Set(), countries: new Set(), features: new Set() };

  // Transaction
  if (/\b(location|louer|à louer|a louer)\b/.test(q)) { patch.transaction = 'rent'; recognized.push('Location'); }
  else if (/\b(achat|acheter|à vendre|a vendre|vente)\b/.test(q)) { patch.transaction = 'buy'; recognized.push('Achat'); }

  // Prix
  const { priceMin, priceMax } = parsePrice(q);
  if (priceMin != null) { patch.priceMin = priceMin; recognized.push(`≥ ${priceMin.toLocaleString('fr-FR')} €`); }
  if (priceMax != null) { patch.priceMax = priceMax; recognized.push(`≤ ${priceMax.toLocaleString('fr-FR')} €`); }

  // Surface
  const surf = q.match(/(\d{2,4})\s*m(?:²|2)/);
  if (surf) { patch.surfaceMin = Number(surf[1]); recognized.push(`≥ ${surf[1]} m²`); }

  // Pièces / chambres
  const tX = q.match(/\bt([1-9])\b/);
  const rooms = q.match(/(\d)\s*(?:pièces?|pieces?|p\.)/);
  if (rooms) { patch.rooms = Number(rooms[1]); recognized.push(`${rooms[1]}+ pièces`); }
  else if (tX) { patch.rooms = Number(tX[1]); recognized.push(`T${tX[1]}`); }
  const beds = q.match(/(\d)\s*(?:chambres?|ch\.)/);
  if (beds) { patch.bedrooms = Number(beds[1]); recognized.push(`${beds[1]}+ chambres`); }

  // Type
  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    if (words.some((w) => q.includes(w))) { patch.types.add(type); recognized.push(PROPERTY_TYPES[type]); }
  }

  // Équipements
  for (const [feat, words] of Object.entries(FEATURE_WORDS)) {
    if (words.some((w) => q.includes(w))) { patch.features.add(feat); recognized.push(FEATURES[feat]); }
  }

  // Villes / pays (deviennent le terme de localisation)
  const places = [];
  for (const place of [...CITY_NAMES, ...COUNTRIES]) {
    const re = new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(q)) { places.push(place); recognized.push(place); }
  }
  patch.places = places;

  return { patch, recognized };
}
