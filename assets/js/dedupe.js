/**
 * Déduplication des annonces.
 *
 * Un même bien est souvent publié sur plusieurs portails. Ce module regroupe
 * les annonces qui décrivent vraisemblablement le même bien (même
 * transaction, type, ville, surface arrondie et nombre de pièces, avec un
 * prix proche à ±5 %), puis fusionne le groupe en une seule fiche qui liste
 * toutes ses sources (« Vu sur N sites »).
 *
 * Le matching est volontairement flou (aucune clé cachée) : c'est la même
 * logique qui fonctionnerait sur de vraies annonces hétérogènes.
 */
export function dedupe(listings) {
  const buckets = new Map();
  for (const it of listings) {
    const key = `${it.transaction}|${it.type}|${it.city}|${Math.round(it.surface / 4)}|${it.rooms}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }

  const out = [];
  for (const group of buckets.values()) {
    const used = new Array(group.length).fill(false);
    for (let i = 0; i < group.length; i++) {
      if (used[i]) continue;
      const cluster = [group[i]];
      used[i] = true;
      for (let j = i + 1; j < group.length; j++) {
        if (used[j]) continue;
        const a = group[i].priceEUR;
        const b = group[j].priceEUR;
        if (Math.abs(a - b) <= 0.05 * Math.max(a, b)) { cluster.push(group[j]); used[j] = true; }
      }
      out.push(mergeCluster(cluster));
    }
  }
  return out;
}

function mergeCluster(cluster) {
  // Le représentant affiché est l'annonce la moins chère du groupe.
  const rep = cluster.slice().sort((a, b) => a.priceEUR - b.priceEUR)[0];
  const bySource = new Map();
  for (const c of cluster) {
    if (!bySource.has(c.source)) {
      bySource.set(c.source, { source: c.source, sourceUrl: c.sourceUrl, priceEUR: c.priceEUR });
    }
  }
  const sources = [...bySource.values()];
  return { ...rep, sources, sourcesCount: sources.length, postingsCount: cluster.length };
}
