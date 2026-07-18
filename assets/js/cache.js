/**
 * Cache client des annonces (localStorage + TTL).
 *
 * Il évite de re-solliciter les sources à chaque visite et illustre, côté
 * front, le cache qu'un back-end d'agrégation appliquerait côté serveur.
 * En production, ce cache navigateur se double d'un cache serveur (Redis /
 * KV) devant les API partenaires.
 */
const KEY = 'ir.cache.v1';
const DEFAULT_TTL = 10 * 60 * 1000; // 10 min

export async function getListings(fetcher, ttlMs = DEFAULT_TTL) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < ttlMs && Array.isArray(data) && data.length) {
        return { data, cached: true, age: Date.now() - ts };
      }
    }
  } catch { /* cache illisible : on ignore */ }

  const data = await fetcher();
  try { localStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
  return { data, cached: false, age: 0 };
}

export function clearCache() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
