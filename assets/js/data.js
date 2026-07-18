/**
 * Jeu de données de DÉMONSTRATION.
 * Toutes les annonces ci-dessous sont fictives et servent uniquement à illustrer
 * l'interface. Pour brancher de vraies sources, voir assets/js/sources/.
 *
 * Modèle d'une annonce (schéma normalisé, commun à toutes les sources) :
 * {
 *   id, source, sourceUrl, title, type, transaction,
 *   country, city, priceEUR, currencyHint, surface, rooms, bedrooms, bathrooms,
 *   floor, year, energy, features[], lat, lng, createdAt (ISO), hue (0-360)
 * }
 */

export const CURRENCIES = {
  EUR: { symbol: '€', rate: 1, label: 'Euro' },
  USD: { symbol: '$', rate: 1.08, label: 'Dollar US' },
  GBP: { symbol: '£', rate: 0.85, label: 'Livre sterling' },
  CHF: { symbol: 'CHF', rate: 0.96, label: 'Franc suisse' },
  AED: { symbol: 'AED', rate: 3.97, label: 'Dirham (EAU)' },
};

export const PROPERTY_TYPES = {
  apartment: 'Appartement',
  house: 'Maison',
  villa: 'Villa',
  studio: 'Studio',
  loft: 'Loft',
  penthouse: 'Penthouse',
  land: 'Terrain',
  commercial: 'Local commercial',
};

export const FEATURES = {
  balcony: 'Balcon',
  terrace: 'Terrasse',
  garden: 'Jardin',
  pool: 'Piscine',
  parking: 'Parking',
  elevator: 'Ascenseur',
  furnished: 'Meublé',
  seaview: 'Vue mer',
  newbuild: 'Neuf',
  airco: 'Climatisation',
};

// Sources fictives (portails) — chacune correspondrait à un adaptateur réel.
export const SOURCES = [
  'SeLoger', 'Leboncoin', "Bien'ici", 'Immoweb', 'Idealista',
  'ImmoScout24', 'Rightmove', 'Zillow', 'Bayut', 'Green-Acres',
];

// Villes de référence : pays, coordonnées approx., indice de prix, monnaie locale.
const CITIES = [
  { city: 'Paris',     country: 'France',       lat: 48.857, lng: 2.352,  base: 11000, cur: 'EUR', sources: ['SeLoger', 'Leboncoin', "Bien'ici"] },
  { city: 'Lyon',      country: 'France',       lat: 45.764, lng: 4.836,  base: 5200,  cur: 'EUR', sources: ['SeLoger', 'Leboncoin', "Bien'ici"] },
  { city: 'Nice',      country: 'France',       lat: 43.710, lng: 7.262,  base: 5600,  cur: 'EUR', sources: ['SeLoger', 'Green-Acres'] },
  { city: 'Bordeaux',  country: 'France',       lat: 44.838, lng: -0.579, base: 4700,  cur: 'EUR', sources: ['Leboncoin', "Bien'ici"] },
  { city: 'Bruxelles', country: 'Belgique',     lat: 50.851, lng: 4.352,  base: 3600,  cur: 'EUR', sources: ['Immoweb'] },
  { city: 'Genève',    country: 'Suisse',       lat: 46.204, lng: 6.143,  base: 14000, cur: 'CHF', sources: ['ImmoScout24'] },
  { city: 'Zurich',    country: 'Suisse',       lat: 47.377, lng: 8.541,  base: 15500, cur: 'CHF', sources: ['ImmoScout24'] },
  { city: 'Barcelone', country: 'Espagne',      lat: 41.385, lng: 2.173,  base: 4500,  cur: 'EUR', sources: ['Idealista', 'Green-Acres'] },
  { city: 'Madrid',    country: 'Espagne',      lat: 40.417, lng: -3.703, base: 4200,  cur: 'EUR', sources: ['Idealista'] },
  { city: 'Marbella',  country: 'Espagne',      lat: 36.510, lng: -4.883, base: 5200,  cur: 'EUR', sources: ['Idealista', 'Green-Acres'] },
  { city: 'Lisbonne',  country: 'Portugal',     lat: 38.722, lng: -9.139, base: 4300,  cur: 'EUR', sources: ['Idealista', 'Green-Acres'] },
  { city: 'Porto',     country: 'Portugal',     lat: 41.158, lng: -8.629, base: 3200,  cur: 'EUR', sources: ['Idealista'] },
  { city: 'Londres',   country: 'Royaume-Uni',  lat: 51.507, lng: -0.128, base: 13500, cur: 'GBP', sources: ['Rightmove'] },
  { city: 'Miami',     country: 'États-Unis',   lat: 25.762, lng: -80.191, base: 6500, cur: 'USD', sources: ['Zillow'] },
  { city: 'New York',  country: 'États-Unis',   lat: 40.713, lng: -74.006, base: 12500, cur: 'USD', sources: ['Zillow'] },
  { city: 'Dubaï',     country: 'Émirats A. U.', lat: 25.205, lng: 55.271, base: 4800,  cur: 'AED', sources: ['Bayut'] },
];

const STREETS = ['Rue des Lilas', 'Avenue de la Mer', 'Calle Mayor', 'Main Street', 'Rua do Sol',
  'Boulevard Central', 'Park Lane', 'Marina Walk', 'Carrer Nou', 'Bahnhofstrasse'];

// Générateur déterministe : le même index produit toujours la même annonce.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function buildListings(count = 48) {
  const typesForRent = ['apartment', 'studio', 'house', 'loft'];
  const list = [];
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(1000 + i * 97);
    const c = CITIES[i % CITIES.length];
    const transaction = rng() < 0.7 ? 'buy' : 'rent';
    const type = transaction === 'rent' ? pick(rng, typesForRent) : pick(rng, Object.keys(PROPERTY_TYPES));

    let surface;
    if (type === 'land') surface = 300 + Math.floor(rng() * 4000);
    else if (type === 'studio') surface = 18 + Math.floor(rng() * 22);
    else if (type === 'commercial') surface = 40 + Math.floor(rng() * 400);
    else surface = 35 + Math.floor(rng() * 220);

    const rooms = type === 'studio' ? 1
      : type === 'land' ? 0
      : 1 + Math.floor(surface / 28);
    const bedrooms = Math.max(0, rooms - 1);
    const bathrooms = Math.max(1, Math.round(bedrooms / 2));

    // Prix de vente : indice ville × surface × qualité, avec bruit.
    const quality = 0.75 + rng() * 0.6;
    let priceEUR = Math.round(c.base * surface * quality);
    if (type === 'land') priceEUR = Math.round(c.base * 0.12 * surface * quality);
    if (transaction === 'rent') priceEUR = Math.round((priceEUR / 220) * (0.9 + rng() * 0.3)); // loyer mensuel

    const allFeatures = Object.keys(FEATURES);
    const nFeat = 1 + Math.floor(rng() * 5);
    const features = [];
    for (let f = 0; f < nFeat; f++) {
      const feat = pick(rng, allFeatures);
      if (!features.includes(feat)) features.push(feat);
    }
    if (['Nice', 'Marbella', 'Miami', 'Dubaï', 'Barcelone'].includes(c.city) && rng() < 0.5 && !features.includes('seaview')) {
      features.push('seaview');
    }

    const energy = pick(rng, ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'E', 'F', 'G']);
    const year = 1900 + Math.floor(rng() * 125);
    if (year > 2021 && !features.includes('newbuild')) features.push('newbuild');

    const daysAgo = Math.floor(rng() * 90);
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

    const jitter = () => (rng() - 0.5) * 0.06;
    const source = pick(rng, c.sources);

    list.push({
      id: `demo-${i + 1}`,
      source,
      sourceUrl: '#',
      title: `${PROPERTY_TYPES[type]} ${surface} m² · ${c.city}`,
      address: `${Math.floor(rng() * 200) + 1} ${pick(rng, STREETS)}`,
      type,
      transaction,
      country: c.country,
      city: c.city,
      priceEUR,
      currencyHint: c.cur,
      surface,
      rooms,
      bedrooms,
      bathrooms,
      floor: type === 'house' || type === 'villa' || type === 'land' ? 0 : Math.floor(rng() * 12),
      year,
      energy: type === 'land' ? null : energy,
      features,
      lat: c.lat + jitter(),
      lng: c.lng + jitter(),
      createdAt,
      hue: Math.floor(rng() * 360),
    });
  }

  // Cross-postings : un même bien republié sur d'autres portails (prix et
  // date légèrement différents). Sert à démontrer la déduplication.
  const dupes = [];
  list.forEach((it, idx) => {
    const rng = mulberry32(50000 + idx * 31);
    if (rng() >= 0.35) return;
    const nDup = rng() < 0.35 ? 2 : 1;
    const others = SOURCES.filter((s) => s !== it.source);
    for (let k = 0; k < nDup; k++) {
      const src = others[Math.floor(rng() * others.length)];
      dupes.push({
        ...it,
        id: `${it.id}-x${k + 1}`,
        source: src,
        sourceUrl: '#',
        priceEUR: Math.round(it.priceEUR * (0.98 + rng() * 0.04)),
        createdAt: new Date(Date.now() - Math.floor(rng() * 60) * 86400000).toISOString(),
      });
    }
  });
  return [...list, ...dupes];
}

export const DEMO_LISTINGS = buildListings(48);

export const COUNTRIES = [...new Set(CITIES.map((c) => c.country))].sort();
export const CITY_NAMES = [...new Set(CITIES.map((c) => c.city))].sort();
export const CITY_COORDS = Object.fromEntries(CITIES.map((c) => [c.city, { lat: c.lat, lng: c.lng }]));
