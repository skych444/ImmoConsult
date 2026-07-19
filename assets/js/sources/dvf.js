import { hashStr } from '../util.js';

/**
 * Source RÉELLE : DVF (Demandes de Valeurs Foncières) — transactions
 * immobilières réelles publiées en open data par la DGFiP / Etalab.
 *
 * API utilisée : https://api.cquest.org/dvf (JSON, gratuit, sans clé).
 * ⚠️ Ce sont des VENTES RÉALISÉES (prix réels du marché), pas des annonces
 * en cours. France uniquement. Si l'API renvoie une erreur (indisponibilité
 * ou CORS), l'application bascule automatiquement en mode démonstration
 * (voir sources/index.js) ; dans ce cas, passez par un proxy serverless.
 */
const DVF = 'https://api.cquest.org/dvf';

const TYPE_MAP = { Appartement: 'apartment', Maison: 'house' };

export function mapDvf(row, i) {
  const price = parseFloat(row.valeur_fonciere);
  const surface = parseFloat(row.surface_relle_bati);
  const type = TYPE_MAP[row.type_local];
  const lat = parseFloat(row.lat);
  const lng = parseFloat(row.lon);
  if (!type || !price || !surface || !isFinite(lat) || !isFinite(lng)) return null;

  const rooms = parseInt(row.nombre_pieces_principales, 10) || 0;
  const address = `${row.adresse_numero || ''} ${row.adresse_nom_voie || ''}`.trim() || row.commune;
  const date = row.date_mutation;

  return {
    id: `dvf-${row.id_mutation || ''}-${i}`,
    source: 'DVF · vente réalisée',
    sourceUrl: 'https://app.dvf.etalab.gouv.fr/',
    title: `${row.type_local} ${Math.round(surface)} m² · ${row.commune}`,
    address,
    type,
    transaction: 'buy',
    country: 'France',
    city: row.commune,
    priceEUR: Math.round(price),
    currencyHint: 'EUR',
    surface: Math.round(surface),
    rooms,
    bedrooms: Math.max(0, rooms - 1),
    bathrooms: Math.max(1, Math.round((rooms - 1) / 2)),
    floor: 0,
    year: null,
    energy: null, // DVF ne contient pas le DPE
    features: [],
    lat,
    lng,
    createdAt: date ? new Date(date).toISOString() : new Date().toISOString(),
    saleDate: date || null,
    hue: hashStr(address + price) % 360,
    realData: true,
  };
}

/** Transactions réelles autour d'un point (lat/lng), rayon en mètres. */
export async function dvfByCenter(center, dist = 1000, cap = 120) {
  const url = `${DVF}?lat=${center.lat}&lon=${center.lng}&dist=${dist}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DVF ${res.status}`);
  const j = await res.json();
  const rows = j.resultats || [];
  const seen = new Set();
  const out = [];
  rows.forEach((row, i) => {
    const m = mapDvf(row, i);
    if (!m) return;
    const k = `${m.address}|${m.priceEUR}|${m.surface}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(m);
  });
  out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return out.slice(0, cap);
}

// Villes chargées par défaut (centres réels) pour peupler le site au démarrage.
export const DVF_DEFAULT_CENTERS = [
  { label: 'Bordeaux', lat: 44.841, lng: -0.579 },
  { label: 'Nantes', lat: 47.218, lng: -1.554 },
  { label: 'Nice', lat: 43.701, lng: 7.268 },
  { label: 'Lille', lat: 50.630, lng: 3.057 },
];

export async function dvfDefaults() {
  const res = await Promise.allSettled(DVF_DEFAULT_CENTERS.map((c) => dvfByCenter(c, 900, 60)));
  const all = [];
  res.forEach((r) => { if (r.status === 'fulfilled') all.push(...r.value); });
  if (!all.length) throw new Error('DVF: aucune donnée');
  return all;
}
