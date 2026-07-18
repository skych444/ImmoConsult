import {
  CURRENCIES, PROPERTY_TYPES, FEATURES, COUNTRIES, CITY_NAMES, CITY_COORDS,
} from './data.js';
import { fetchAllListings } from './sources/index.js';
import { getListings } from './cache.js';
import { dedupe } from './dedupe.js';
import { estimate } from './estimator.js';
import { listingMatches, describeFilters } from './filters.js';
import { loadAlerts, addAlert, removeAlert, updateAlert, deliverAlert } from './alerts.js';
import { enrich } from './insights.js';
import { parseQuery } from './search-nlp.js';
import { MODES, matchesCommute, travelMinutes } from './commute.js';
import { computeCost, CREDIT_DEFAULTS } from './cost.js';
import { RISK_LEVEL_TXT } from './risks.js';

/* ------------------------------------------------------------------ *
 *  État
 * ------------------------------------------------------------------ */
const state = {
  all: [],
  filtered: [],
  currency: localStorage.getItem('ir.currency') || 'EUR',
  view: localStorage.getItem('ir.view') || 'grid',
  favorites: new Set(JSON.parse(localStorage.getItem('ir.favorites') || '[]')),
  compare: new Set(),
  notes: JSON.parse(localStorage.getItem('ir.notes') || '{}'),
  credit: JSON.parse(localStorage.getItem('ir.credit') || 'null') || { ...CREDIT_DEFAULTS },
  commute: [],
  recognized: [],
  page: 1,
  perPage: 12,
  filters: defaultFilters(),
};

function defaultFilters() {
  return {
    q: '', transaction: 'all', types: new Set(), countries: new Set(),
    priceMin: null, priceMax: null, surfaceMin: null, surfaceMax: null,
    rooms: 0, bedrooms: 0, features: new Set(), energy: new Set(),
    favoritesOnly: false, sort: 'recent',
  };
}

/* Filtres effectifs = filtres manuels ∪ recherche en langage naturel. */
function effectiveNF() {
  const f = state.filters;
  const rate = CURRENCIES[state.currency].rate;
  const nl = f.q ? parseQuery(f.q) : null;
  state.recognized = nl ? nl.recognized : [];
  const p = nl ? nl.patch : {};

  const toEUR = (v) => (v == null ? null : v / rate);
  const manualMinEUR = toEUR(f.priceMin);
  const manualMaxEUR = toEUR(f.priceMax);

  // Terme texte : place reconnue (localisation) ; sinon requête brute si rien
  // n'a été reconnu (recherche libre) ; sinon vide (on ne filtre pas sur des adjectifs).
  let q = '';
  if (nl && nl.recognized.length) q = (p.places && p.places.length) ? p.places[0].toLowerCase() : '';
  else q = f.q.trim().toLowerCase();

  return {
    q,
    transaction: p.transaction || f.transaction,
    types: [...new Set([...f.types, ...(p.types || [])])],
    countries: [...f.countries],
    features: [...new Set([...f.features, ...(p.features || [])])],
    energy: [...f.energy],
    priceMinEUR: p.priceMin != null ? p.priceMin : manualMinEUR,
    priceMaxEUR: p.priceMax != null ? p.priceMax : manualMaxEUR,
    surfaceMin: Math.max(f.surfaceMin || 0, p.surfaceMin || 0) || null,
    surfaceMax: f.surfaceMax,
    rooms: Math.max(f.rooms || 0, p.rooms || 0),
    bedrooms: Math.max(f.bedrooms || 0, p.bedrooms || 0),
    favoritesOnly: f.favoritesOnly,
  };
}

/* ------------------------------------------------------------------ *
 *  Utilitaires
 * ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const toCurrency = (eur) => eur * CURRENCIES[state.currency].rate;

function fmt(eur) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(toCurrency(eur)));
}
function formatPrice(eur, transaction) {
  return `${fmt(eur)} ${CURRENCIES[state.currency].symbol}${transaction === 'rent' ? '/mois' : ''}`;
}
function money(eur, suffix = '') {
  return `${fmt(eur)} ${CURRENCIES[state.currency].symbol}${suffix}`;
}
function shortPrice(eur) {
  const v = toCurrency(eur); const s = CURRENCIES[state.currency].symbol;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.0', '')}M${s}`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k${s}`;
  return `${Math.round(v)}${s}`;
}
function formatDate(iso) {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 30) return `il y a ${d} j`;
  return `il y a ${Math.round(d / 30)} mois`;
}

function propertyImage(item, w = 640, h = 420) {
  const h1 = item.hue; const h2 = (item.hue + 40) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='hsl(${h1} 55% 58%)'/><stop offset='1' stop-color='hsl(${h2} 60% 40%)'/>
    </linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/>
    <g fill='rgba(255,255,255,.16)'><path d='M${w * 0.5 - 70} ${h * 0.62} l70 -55 l70 55 v70 h-140 z'/>
    <rect x='${w * 0.5 - 22}' y='${h * 0.66}' width='44' height='46' fill='rgba(0,0,0,.12)'/></g>
    <circle cx='${w * 0.82}' cy='${h * 0.22}' r='34' fill='rgba(255,255,255,.22)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ------------------------------------------------------------------ *
 *  Filtrage + tri
 * ------------------------------------------------------------------ */
function applyFilters() {
  const nf = effectiveNF();
  state.filtered = state.all.filter((it) => listingMatches(it, nf, state.favorites) && matchesCommute(it, state.commute));

  const f = state.filters;
  state.filtered.sort((a, b) => {
    switch (f.sort) {
      case 'price-asc': return a.priceEUR - b.priceEUR;
      case 'price-desc': return b.priceEUR - a.priceEUR;
      case 'surface': return b.surface - a.surface;
      case 'ppm2': return (a.priceEUR / a.surface) - (b.priceEUR / b.surface);
      case 'yield': return (b.ix.invest ? b.ix.invest.grossYield : -1) - (a.ix.invest ? a.ix.invest.grossYield : -1);
      case 'nego': return b.ix.negotiation.margin - a.ix.negotiation.margin;
      case 'livability': return b.ix.risks.livability - a.ix.risks.livability;
      default: return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  renderNlChips();
  state.page = 1;
  render();
}

function renderNlChips() {
  const box = $('#nlChips');
  if (!state.recognized.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<span class="nl-label">Compris :</span>${state.recognized.map((r) => `<span class="nl-chip">${escapeHtml(r)}</span>`).join('')}`;
}

/* ------------------------------------------------------------------ *
 *  Rendu liste/grille
 * ------------------------------------------------------------------ */
function render() {
  const count = state.filtered.length;
  $('#resultCount').textContent = count ? `${count} bien${count > 1 ? 's' : ''}` : 'Aucun résultat';

  if (state.view === 'map') { $('#loadMore').hidden = true; updateMap(); return; }

  const results = $('#results');
  results.classList.toggle('list', state.view === 'list');

  if (!count) {
    results.innerHTML = `<div class="empty-state"><p>Aucun bien ne correspond à vos critères.</p>
      <button class="btn" id="clearFromEmpty">Réinitialiser</button></div>`;
    $('#clearFromEmpty').onclick = resetFilters;
    $('#loadMore').hidden = true;
    return;
  }

  const shown = state.filtered.slice(0, state.page * state.perPage);
  results.innerHTML = shown.map(cardHtml).join('');
  $$('.card', results).forEach((el) => {
    el.querySelector('.fav').onclick = (e) => { e.stopPropagation(); toggleFav(el.dataset.id); };
    const cmp = el.querySelector('.cmp');
    if (cmp) cmp.onclick = (e) => { e.stopPropagation(); toggleCompare(el.dataset.id); };
    el.onclick = () => openDetail(el.dataset.id);
  });
  $('#loadMore').hidden = shown.length >= count;
}

function cardBadges(it) {
  const ix = it.ix; const b = [];
  if (ix.negotiation.level !== 'low') b.push(`<span class="mb nego">négociable −${ix.negotiation.margin}%</span>`);
  if (ix.anomaly.level !== 'ok') b.push(`<span class="mb ${ix.anomaly.level === 'danger' ? 'danger' : 'warn'}">⚠ à vérifier</span>`);
  if (ix.dpeBan) b.push(`<span class="mb ${ix.dpeBan.active ? 'danger' : 'warn'}">DPE ${ix.dpeBan.year}</span>`);
  if (it.transaction === 'buy' && ix.invest) b.push(`<span class="mb yield">${ix.invest.grossYield}% brut</span>`);
  return b.length ? `<div class="mbadges">${b.join('')}</div>` : '';
}

function livabilityDot(it) {
  const l = it.ix.risks.livability;
  const cls = l >= 70 ? 'good' : l >= 45 ? 'mid' : 'bad';
  return `<span class="liv ${cls}" title="Qualité de vie ${l}/100">${l}</span>`;
}

function cardHtml(it) {
  const fav = state.favorites.has(it.id);
  const cmp = state.compare.has(it.id);
  const feats = it.features.slice(0, 3).map((k) => `<span class="chip">${FEATURES[k]}</span>`).join('');
  const badge = it.transaction === 'rent' ? 'Location' : 'Vente';
  const energy = it.energy ? `<span class="energy e-${it.energy}">${it.energy}</span>` : '';
  const sourceTag = it.sourcesCount > 1
    ? `<span class="source-tag multi">Vu sur ${it.sourcesCount} sites</span>`
    : `<span class="source-tag">${escapeHtml(it.source)}</span>`;
  const est = it.ix.estimate;
  const estChip = est ? `<span class="est ${est.verdict}">${est.deltaPct > 0 ? '+' : ''}${est.deltaPct}% · ${est.verdict === 'below' ? 'sous le marché' : est.verdict === 'above' ? 'au-dessus' : 'dans le marché'}</span>` : '';
  return `
  <article class="card" data-id="${it.id}" tabindex="0">
    <div class="card-media">
      <img loading="lazy" src="${propertyImage(it)}" alt="${escapeHtml(it.title)}" />
      <span class="badge ${it.transaction}">${badge}</span>
      <button class="cmp ${cmp ? 'on' : ''}" aria-label="Comparer" title="Ajouter au comparateur">⇄</button>
      <button class="fav ${fav ? 'on' : ''}" aria-label="Favori" title="Favori">${fav ? '♥' : '♡'}</button>
      ${sourceTag}
    </div>
    <div class="card-body">
      <div class="price-row">
        <strong class="price">${formatPrice(it.priceEUR, it.transaction)}</strong>
        <span class="price-side">${livabilityDot(it)} ${energy}</span>
      </div>
      ${estChip}
      ${cardBadges(it)}
      <h3 class="card-title">${escapeHtml(PROPERTY_TYPES[it.type])} · ${escapeHtml(it.city)}</h3>
      <p class="card-loc">${escapeHtml(it.address)}, ${escapeHtml(it.country)}</p>
      <ul class="specs">
        <li>${it.surface} m²</li>
        ${it.rooms ? `<li>${it.rooms} p.</li>` : ''}
        ${it.bedrooms ? `<li>${it.bedrooms} ch.</li>` : ''}
        <li class="ppm2">${money(Math.round(it.priceEUR / it.surface), '/m²')}</li>
      </ul>
      <div class="chips">${feats}</div>
      <p class="card-foot"><span>${escapeHtml(it.source)}</span> · ${formatDate(it.createdAt)}</p>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ *
 *  Carte interactive (Leaflet) + repli
 * ------------------------------------------------------------------ */
let _map = null; let _markers = null;
function ensureMap() {
  if (_map || !window.L) return _map;
  _map = window.L.map('map', { scrollWheelZoom: true }).setView([46, 5], 4);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(_map);
  _markers = window.L.layerGroup().addTo(_map);
  return _map;
}
function updateMap() {
  if (!window.L) { renderSchematicMap(); return; }
  const m = ensureMap();
  setTimeout(() => m.invalidateSize(), 0);
  _markers.clearLayers();
  const pts = state.filtered; if (!pts.length) return;
  const bounds = [];
  pts.slice(0, 300).forEach((p) => {
    const icon = window.L.divIcon({ className: 'ir-pin-wrap', html: `<span class="ir-pin ${p.transaction}">${shortPrice(p.priceEUR)}</span>`, iconSize: [56, 24], iconAnchor: [28, 24] });
    window.L.marker([p.lat, p.lng], { icon }).addTo(_markers).on('click', () => openDetail(p.id));
    bounds.push([p.lat, p.lng]);
  });
  m.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
}
function renderSchematicMap() {
  const wrap = $('#map'); const pts = state.filtered;
  if (!pts.length) { wrap.innerHTML = '<p class="map-empty">Aucun bien à localiser.</p>'; return; }
  const lats = pts.map((p) => p.lat); const lngs = pts.map((p) => p.lng);
  const minLa = Math.min(...lats); const maxLa = Math.max(...lats); const minLn = Math.min(...lngs); const maxLn = Math.max(...lngs);
  const nx = (v) => (maxLn === minLn ? 50 : 6 + ((v - minLn) / (maxLn - minLn)) * 88);
  const ny = (v) => (maxLa === minLa ? 50 : 6 + ((maxLa - v) / (maxLa - minLa)) * 88);
  wrap.innerHTML = `<div class="map-canvas">${pts.slice(0, 200).map((p) => `<button class="pin" style="left:${nx(p.lng)}%;top:${ny(p.lat)}%" data-id="${p.id}"></button>`).join('')}</div>`;
  $$('.pin', wrap).forEach((el) => { el.onclick = () => openDetail(el.dataset.id); });
}

/* ------------------------------------------------------------------ *
 *  Fiche détail enrichie
 * ------------------------------------------------------------------ */
let _detailId = null;

function bar(label, val, invert = false) {
  const good = invert ? 100 - val : val;
  const cls = good >= 66 ? 'good' : good >= 40 ? 'mid' : 'bad';
  return `<div class="qbar"><span>${label}</span><div class="qtrack"><i class="${cls}" style="width:${val}%"></i></div></div>`;
}

function costSection(it) {
  const c = computeCost(it, state.credit);
  if (c.mode === 'rent') {
    return `<div class="ix-grid">
      <div><b>${money(c.monthlyAllIn, '/mois')}</b><span>coût tout compris</span></div>
      <div><b>${money(c.chargesYear)}</b><span>charges/an</span></div>
      <div><b>${money(c.energyYear)}</b><span>énergie/an (DPE ${it.energy || '?'})</span></div>
    </div>`;
  }
  return `
    <div class="ix-grid">
      <div><b>${money(c.acquisition)}</b><span>prix + notaire (${money(c.notary)})</span></div>
      <div><b>${money(c.ownershipYear)}/an</b><span>taxe + copro + énergie</span></div>
      <div><b>${money(c.tenYear)}</b><span>coût de possession 10 ans</span></div>
    </div>
    <div class="credit">
      <div class="credit-head"><b id="cMonthly">${money(c.monthly, '/mois')}</b><span>mensualité crédit</span></div>
      <label>Apport <output id="cDownO">${state.credit.downPct}%</output>
        <input id="cDown" type="range" min="0" max="40" step="5" value="${state.credit.downPct}"></label>
      <label>Durée <output id="cYearsO">${state.credit.years} ans</output>
        <input id="cYears" type="range" min="10" max="30" step="1" value="${state.credit.years}"></label>
      <label>Taux <output id="cRateO">${state.credit.ratePct}%</output>
        <input id="cRate" type="range" min="1" max="6" step="0.1" value="${state.credit.ratePct}"></label>
      <p class="muted small" id="cInterest">Intérêts totaux : ${money(c.totalInterest)} · emprunt ${money(c.loan)}</p>
    </div>`;
}

function wireCredit(it) {
  const upd = () => {
    state.credit = { downPct: Number($('#cDown').value), years: Number($('#cYears').value), ratePct: Number($('#cRate').value) };
    localStorage.setItem('ir.credit', JSON.stringify(state.credit));
    $('#cDownO').textContent = `${state.credit.downPct}%`;
    $('#cYearsO').textContent = `${state.credit.years} ans`;
    $('#cRateO').textContent = `${state.credit.ratePct}%`;
    const c = computeCost(it, state.credit);
    $('#cMonthly').textContent = money(c.monthly, '/mois');
    $('#cInterest').textContent = `Intérêts totaux : ${money(c.totalInterest)} · emprunt ${money(c.loan)}`;
  };
  ['cDown', 'cYears', 'cRate'].forEach((id) => { const el = $('#' + id); if (el) el.oninput = upd; });
}

function detailSectionsHtml(it) {
  const ix = it.ix;
  const n = ix.negotiation;
  const negoHtml = `
    <div class="ix-grid">
      <div><b class="lvl-${n.level}">−${n.margin}%</b><span>marge de négociation estimée</span></div>
      <div><b>${n.daysOnMarket} j</b><span>en ligne</span></div>
      <div><b>${n.alreadyDropped ? `−${n.alreadyDropped}%` : '—'}</b><span>baisse déjà appliquée</span></div>
    </div>
    ${n.drops.length ? `<p class="muted small">Historique : ${n.drops.map((d) => `−${d.pct}%`).join(' → ')}</p>` : ''}`;

  const r = ix.risks;
  const hazHtml = Object.entries(r.hazards).map(([k, v]) => `<span class="haz l${v}">${r.labels[k]} : ${RISK_LEVEL_TXT[v]}</span>`).join('');
  const riskHtml = `
    <div class="liv-big ${r.livability >= 70 ? 'good' : r.livability >= 45 ? 'mid' : 'bad'}"><b>${r.livability}</b><span>/100 qualité de vie</span></div>
    <div class="haz-row">${hazHtml}</div>
    ${bar('Air', r.quality.air)}
    ${bar('Calme', 100 - r.quality.noise)}
    ${bar('Écoles', r.quality.schools)}
    ${bar('Commerces', r.quality.shops)}
    ${bar('Transports', r.quality.transit)}
    <p class="muted small">Fibre : ${r.quality.fiber ? '✅ disponible' : '❌ non déployée'}</p>`;

  const inv = ix.invest;
  const investHtml = inv ? `
    <div class="ix-grid">
      <div><b>${money(inv.estRentMonthly, '/mois')}</b><span>loyer estimé</span></div>
      <div><b>${inv.grossYield}%</b><span>rendement brut</span></div>
      <div><b>${inv.netYield}%</b><span>rendement net</span></div>
      <div><b>${inv.trendPerYear > 0 ? '+' : ''}${inv.trendPerYear}%/an</b><span>tendance quartier</span></div>
      <div><b>${inv.timing === 'acheteur' ? 'Acheteur' : 'Vendeur'}</b><span>marché favorable au…</span></div>
    </div>` : '';

  const co = ix.copro;
  const coproHtml = co ? `
    <div class="ix-grid">
      <div><b>${co.lots}</b><span>lots</span></div>
      <div><b class="${co.unpaidPct > 12 ? 'lvl-high' : ''}">${co.unpaidPct}%</b><span>impayés</span></div>
      <div><b>${money(co.worksFund)}</b><span>fonds travaux</span></div>
      <div><b>${money(co.monthlyCharges, '/mois')}</b><span>charges</span></div>
    </div>
    <p class="${co.alert ? 'flag danger' : 'muted small'}">${co.procedures ? '⚠ Procédure(s) en cours dans la copropriété.' : 'Aucune procédure connue.'} Syndic ${co.syndic}.</p>` : '';

  const ban = ix.dpeBan;
  const banHtml = ban ? `<p class="flag ${ban.active ? 'danger' : 'warn'}">⚖️ ${ban.label}</p>` : '';
  const anom = ix.anomaly;
  const anomHtml = anom.level !== 'ok' ? `<div class="flag ${anom.level === 'danger' ? 'danger' : 'warn'}">⚠ ${anom.reasons.join(' · ')}</div>` : '';

  const note = state.notes[it.id] || '';

  const sec = (title, body, open = false) => body ? `<details class="ix-sec" ${open ? 'open' : ''}><summary>${title}</summary><div class="ix-body">${body}</div></details>` : '';

  return `
    ${banHtml}${anomHtml}
    ${sec('💶 Coût réel & crédit', costSection(it), true)}
    ${sec('🤝 Négociation', negoHtml)}
    ${sec('🌿 Risques & qualité de vie', riskHtml)}
    ${it.transaction === 'buy' ? sec('📈 Investissement locatif', investHtml) : ''}
    ${co ? sec('🏢 Copropriété', coproHtml) : ''}
    <details class="ix-sec"><summary>📝 Mes notes</summary><div class="ix-body">
      <textarea id="noteBox" class="note-box" placeholder="Vos impressions après visite…">${escapeHtml(note)}</textarea>
    </div></details>`;
}

function openDetail(id) {
  const it = state.all.find((x) => x.id === id); if (!it) return;
  _detailId = id;
  const feats = it.features.map((k) => `<span class="chip">${FEATURES[k]}</span>`).join('');
  const fav = state.favorites.has(it.id);
  const est = it.ix.estimate;
  const estBlock = est ? `<div class="est-block ${est.verdict}">
      <div><b>${est.perM2.toLocaleString('fr-FR')} €/m²</b><span>ce bien</span></div>
      <div><b>${est.refPerM2.toLocaleString('fr-FR')} €/m²</b><span>réf. marché</span></div>
      <div class="est-verdict">${est.deltaPct > 0 ? '+' : ''}${est.deltaPct}%<span>${est.verdict === 'below' ? 'sous le marché' : est.verdict === 'above' ? 'au-dessus' : 'dans le marché'}</span></div>
    </div>` : '';
  const sourcesBlock = (it.sources && it.sources.length > 1) ? `<div class="sources-block"><h4>Disponible sur ${it.sources.length} portails</h4>
      <ul>${it.sources.map((s) => `<li><span>${escapeHtml(s.source)}</span><b>${formatPrice(s.priceEUR, it.transaction)}</b></li>`).join('')}</ul></div>` : '';

  $('#detailBody').innerHTML = `
    <div class="detail-media"><img src="${propertyImage(it, 900, 520)}" alt="${escapeHtml(it.title)}"/></div>
    <div class="detail-info">
      <div class="detail-head">
        <div>
          <span class="badge ${it.transaction}">${it.transaction === 'rent' ? 'Location' : 'Vente'}</span>
          <h2>${escapeHtml(PROPERTY_TYPES[it.type])} · ${escapeHtml(it.city)}</h2>
          <p class="detail-loc">${escapeHtml(it.address)}, ${escapeHtml(it.city)}, ${escapeHtml(it.country)}</p>
        </div>
        <button class="fav big ${fav ? 'on' : ''}" id="detailFav">${fav ? '♥' : '♡'}</button>
      </div>
      <div class="detail-price"><strong>${formatPrice(it.priceEUR, it.transaction)}</strong><span>${money(Math.round(it.priceEUR / it.surface), '/m²')}</span></div>
      ${estBlock}
      <ul class="detail-specs">
        <li><b>${it.surface}</b> m²</li>
        ${it.rooms ? `<li><b>${it.rooms}</b> pièces</li>` : ''}
        ${it.bedrooms ? `<li><b>${it.bedrooms}</b> chambres</li>` : ''}
        ${it.bathrooms ? `<li><b>${it.bathrooms}</b> sdb</li>` : ''}
        ${it.energy ? `<li>DPE <b class="energy e-${it.energy}">${it.energy}</b></li>` : ''}
        ${it.year ? `<li>Année <b>${it.year}</b></li>` : ''}
      </ul>
      <div class="chips">${feats}</div>
      ${sourcesBlock}
      ${detailSectionsHtml(it)}
      <p class="detail-src">Source principale : <b>${escapeHtml(it.source)}</b> · publié ${formatDate(it.createdAt)}</p>
      <a class="btn primary block" href="${it.sourceUrl}" target="_blank" rel="noopener noreferrer">Voir l'annonce sur ${escapeHtml(it.source)}</a>
    </div>`;
  $('#detailFav').onclick = () => { toggleFav(it.id); openDetail(id); };
  if (it.transaction === 'buy') wireCredit(it);
  const nb = $('#noteBox');
  if (nb) nb.oninput = debounce(() => { state.notes[it.id] = nb.value; localStorage.setItem('ir.notes', JSON.stringify(state.notes)); }, 300);
  $('#detail').showModal();
}

/* ------------------------------------------------------------------ *
 *  Favoris & comparateur
 * ------------------------------------------------------------------ */
function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  localStorage.setItem('ir.favorites', JSON.stringify([...state.favorites]));
  $('#favCount').textContent = state.favorites.size || '';
  applyFilters();
}

function toggleCompare(id) {
  if (state.compare.has(id)) state.compare.delete(id);
  else { if (state.compare.size >= 4) { state.compare.delete([...state.compare][0]); } state.compare.add(id); }
  renderCompareBar();
  render();
}

function renderCompareBar() {
  const bar = $('#compareBar');
  const n = state.compare.size;
  bar.hidden = n === 0;
  if (n) $('#compareCount').textContent = n;
}

function openCompare() {
  const items = [...state.compare].map((id) => state.all.find((x) => x.id === id)).filter(Boolean);
  if (!items.length) return;
  const rows = [
    ['Prix', (it) => formatPrice(it.priceEUR, it.transaction)],
    ['Prix/m²', (it) => money(Math.round(it.priceEUR / it.surface))],
    ['Surface', (it) => `${it.surface} m²`],
    ['Pièces', (it) => it.rooms || '—'],
    ['DPE', (it) => it.energy || '—'],
    ['vs marché', (it) => it.ix.estimate ? `${it.ix.estimate.deltaPct > 0 ? '+' : ''}${it.ix.estimate.deltaPct}%` : '—'],
    ['Négociable', (it) => `−${it.ix.negotiation.margin}%`],
    ['Coût/an', (it) => it.transaction === 'buy' ? money(it.ix.cost.ownershipYear) : money(it.ix.cost.chargesYear + it.ix.cost.energyYear)],
    ['Mensualité', (it) => it.transaction === 'buy' ? money(it.ix.cost.monthly) : money(it.priceEUR)],
    ['Rendement', (it) => it.ix.invest ? `${it.ix.invest.grossYield}%` : '—'],
    ['Qualité de vie', (it) => `${it.ix.risks.livability}/100`],
    ['Risque max', (it) => RISK_LEVEL_TXT[it.ix.risks.worst]],
  ];
  const head = `<tr><th></th>${items.map((it) => `<th>${escapeHtml(PROPERTY_TYPES[it.type])}<br><small>${escapeHtml(it.city)}</small></th>`).join('')}</tr>`;
  const body = rows.map(([label, fn]) => `<tr><td class="rowlab">${label}</td>${items.map((it) => `<td>${fn(it)}</td>`).join('')}</tr>`).join('');
  $('#compareBody').innerHTML = `<div class="cmp-scroll"><table class="cmp-table">${head}${body}</table></div>
    <button class="btn ghost block" id="compareClear">Vider le comparateur</button>`;
  $('#compareClear').onclick = () => { state.compare.clear(); renderCompareBar(); render(); $('#compare').close(); };
  $('#compare').showModal();
}

/* ------------------------------------------------------------------ *
 *  Recherche par temps de trajet
 * ------------------------------------------------------------------ */
function addCommutePoint() {
  const place = $('#commutePlace').value;
  const coords = CITY_COORDS[place];
  if (!coords) { $('#commuteMsg').textContent = 'Choisissez une ville de la liste.'; return; }
  $('#commuteMsg').textContent = '';
  state.commute.push({ label: place, lat: coords.lat, lng: coords.lng, mode: $('#commuteMode').value, maxMin: Number($('#commuteMin').value) || 30 });
  renderCommute();
  applyFilters();
}
function renderCommute() {
  const list = $('#commuteList');
  list.innerHTML = state.commute.map((p, i) => `<div class="commute-item">
      <span>${MODES[p.mode].label} ≤ ${p.maxMin} min de <b>${escapeHtml(p.label)}</b></span>
      <button data-i="${i}" aria-label="Retirer">✕</button></div>`).join('');
  $$('#commuteList button').forEach((b) => { b.onclick = () => { state.commute.splice(Number(b.dataset.i), 1); renderCommute(); applyFilters(); }; });
}

/* ------------------------------------------------------------------ *
 *  Alertes
 * ------------------------------------------------------------------ */
function matchesForAlert(a) {
  return state.all.filter((it) => listingMatches(it, a.nf, state.favorites)).map((it) => it.id);
}
function refreshAlertBadge() {
  let totalNew = 0;
  for (const a of loadAlerts()) { const seen = new Set(a.seenIds || []); totalNew += matchesForAlert(a).filter((id) => !seen.has(id)).length; }
  const badge = $('#alertCount'); badge.textContent = totalNew || ''; badge.classList.toggle('hot', totalNew > 0);
}
function renderAlerts() {
  const alerts = loadAlerts(); const list = $('#alertList');
  if (!alerts.length) { list.innerHTML = '<p class="muted">Aucune alerte. Réglez vos filtres, puis créez-en une ci-dessus.</p>'; return; }
  list.innerHTML = alerts.map((a) => {
    const ids = matchesForAlert(a); const seen = new Set(a.seenIds || []);
    const nb = ids.filter((id) => !seen.has(id)).length;
    return `<div class="alert-item" data-id="${a.id}"><div class="alert-main"><b>${escapeHtml(a.name)}</b>
        <span class="alert-desc">${escapeHtml(describeFilters(a.nf))}</span>
        <span class="alert-meta">${ids.length} bien(s)${nb ? ` · <span class="new">${nb} nouveau(x)</span>` : ''}${a.email ? ` · ${escapeHtml(a.email)}` : ''}</span></div>
      <div class="alert-actions"><button class="btn ghost sm" data-act="seen">Marquer vues</button>
        <button class="btn ghost sm danger" data-act="del">Supprimer</button></div></div>`;
  }).join('');
  $$('.alert-item', list).forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('[data-act="del"]').onclick = () => { removeAlert(id); renderAlerts(); refreshAlertBadge(); };
    el.querySelector('[data-act="seen"]').onclick = () => { updateAlert(id, { seenIds: matchesForAlert(loadAlerts().find((a) => a.id === id)) }); renderAlerts(); refreshAlertBadge(); };
  });
}
async function createAlertFromFilters() {
  const nf = effectiveNF();
  const name = $('#alertName').value.trim() || describeFilters(nf);
  const email = $('#alertEmail').value.trim();
  const alert = { id: `al-${Date.now()}`, name, email, nf, createdAt: Date.now(), seenIds: [] };
  alert.seenIds = matchesForAlert(alert);
  addAlert(alert);
  const delivered = await deliverAlert(alert);
  $('#alertMsg').textContent = delivered ? "Alerte créée et transmise au service d'e-mail." : "Alerte créée (notifications dans l'app). Envoi e-mail : voir README.";
  $('#alertName').value = ''; $('#alertEmail').value = '';
  renderAlerts(); refreshAlertBadge();
}

/* ------------------------------------------------------------------ *
 *  UI filtres
 * ------------------------------------------------------------------ */
function buildFilterUI() {
  $('#typeFilters').innerHTML = Object.entries(PROPERTY_TYPES).map(([k, v]) => `<label class="check"><input type="checkbox" data-type="${k}"><span>${v}</span></label>`).join('');
  $('#countryFilters').innerHTML = COUNTRIES.map((c) => `<label class="check"><input type="checkbox" data-country="${escapeHtml(c)}"><span>${escapeHtml(c)}</span></label>`).join('');
  $('#featureFilters').innerHTML = Object.entries(FEATURES).map(([k, v]) => `<label class="check"><input type="checkbox" data-feature="${k}"><span>${v}</span></label>`).join('');
  $('#energyFilters').innerHTML = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((e) => `<label class="pillcheck"><input type="checkbox" data-energy="${e}"><span class="energy e-${e}">${e}</span></label>`).join('');
  $('#cityList').innerHTML = [...CITY_NAMES, ...COUNTRIES].map((c) => `<option value="${escapeHtml(c)}">`).join('');
  $('#commutePlace').innerHTML = '<option value="">Ville…</option>' + CITY_NAMES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  $('#commuteMode').innerHTML = Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  const curSel = $('#currency');
  curSel.innerHTML = Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}">${k} (${v.symbol})</option>`).join('');
  curSel.value = state.currency;
}

/* ------------------------------------------------------------------ *
 *  Écouteurs
 * ------------------------------------------------------------------ */
function wireEvents() {
  const f = state.filters;
  $('#search').addEventListener('input', debounce((e) => { f.q = e.target.value; applyFilters(); }, 220));
  $$('input[name="transaction"]').forEach((r) => r.addEventListener('change', (e) => { f.transaction = e.target.value; applyFilters(); }));
  bindChecks('[data-type]', 'type', f.types);
  bindChecks('[data-country]', 'country', f.countries);
  bindChecks('[data-feature]', 'feature', f.features);
  bindChecks('[data-energy]', 'energy', f.energy);
  ['priceMin', 'priceMax', 'surfaceMin', 'surfaceMax'].forEach((id) => {
    $('#' + id).addEventListener('input', debounce((e) => { const v = e.target.value.trim(); f[id] = v === '' ? null : Number(v); applyFilters(); }, 250));
  });
  $('#rooms').addEventListener('change', (e) => { f.rooms = Number(e.target.value); applyFilters(); });
  $('#bedrooms').addEventListener('change', (e) => { f.bedrooms = Number(e.target.value); applyFilters(); });
  $('#sort').addEventListener('change', (e) => { f.sort = e.target.value; applyFilters(); });
  $('#currency').addEventListener('change', (e) => { state.currency = e.target.value; localStorage.setItem('ir.currency', state.currency); applyFilters(); });
  $('#favToggle').addEventListener('click', () => { f.favoritesOnly = !f.favoritesOnly; $('#favToggle').classList.toggle('on', f.favoritesOnly); applyFilters(); });
  $('#resetBtn').addEventListener('click', resetFilters);
  $('#loadMore').addEventListener('click', () => { state.page++; render(); });
  $$('.view-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#filterToggle').addEventListener('click', () => document.body.classList.add('drawer-open'));
  $('#closeDrawer').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  $('#detailClose').addEventListener('click', () => $('#detail').close());
  $('#detail').addEventListener('click', (e) => { if (e.target.id === 'detail') $('#detail').close(); });
  // Alertes
  $('#alertsBtn').addEventListener('click', () => { renderAlerts(); $('#alertMsg').textContent = ''; $('#alerts').showModal(); });
  $('#alertsClose').addEventListener('click', () => $('#alerts').close());
  $('#alerts').addEventListener('click', (e) => { if (e.target.id === 'alerts') $('#alerts').close(); });
  $('#alertCreate').addEventListener('click', createAlertFromFilters);
  // Comparateur
  $('#compareOpen').addEventListener('click', openCompare);
  $('#compareClose').addEventListener('click', () => $('#compare').close());
  $('#compare').addEventListener('click', (e) => { if (e.target.id === 'compare') $('#compare').close(); });
  // Temps de trajet
  $('#commuteAdd').addEventListener('click', addCommutePoint);
}
function bindChecks(sel, attr, set) {
  $$(sel).forEach((el) => el.addEventListener('change', (e) => { const v = e.target.dataset[attr]; if (e.target.checked) set.add(v); else set.delete(v); applyFilters(); }));
}
function setView(view) {
  state.view = view; localStorage.setItem('ir.view', view);
  $$('.view-btn').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  $('#map').hidden = view !== 'map'; $('#results').hidden = view === 'map'; render();
}
function resetFilters() {
  state.filters = defaultFilters(); state.commute = [];
  $('#search').value = '';
  $$('input[type="checkbox"]').forEach((c) => { c.checked = false; });
  $$('input[type="number"]').forEach((c) => { c.value = ''; });
  $('#rooms').value = '0'; $('#bedrooms').value = '0'; $('#sort').value = 'recent';
  $('input[name="transaction"][value="all"]').checked = true;
  $('#favToggle').classList.remove('on'); renderCommute(); applyFilters();
}
function toggleTheme() {
  const next = (document.documentElement.dataset.theme || 'light') === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next; localStorage.setItem('ir.theme', next);
  $('#themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ------------------------------------------------------------------ *
 *  Démarrage
 * ------------------------------------------------------------------ */
async function init() {
  const savedTheme = localStorage.getItem('ir.theme');
  if (savedTheme) { document.documentElement.dataset.theme = savedTheme; $('#themeBtn').textContent = savedTheme === 'dark' ? '☀️' : '🌙'; }
  buildFilterUI(); wireEvents(); setView(state.view);
  $('#favCount').textContent = state.favorites.size || '';
  $('#results').innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Chargement des annonces…</p></div>';
  try {
    const { data } = await getListings(fetchAllListings);
    state.all = dedupe(data).map(enrich);
  } catch (err) { console.error(err); state.all = []; }
  refreshAlertBadge(); applyFilters();
}

init();
