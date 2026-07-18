import {
  CURRENCIES, PROPERTY_TYPES, FEATURES, COUNTRIES, CITY_NAMES,
} from './data.js';
import { fetchAllListings } from './sources/index.js';
import { getListings } from './cache.js';
import { dedupe } from './dedupe.js';
import { estimate } from './estimator.js';
import { listingMatches, describeFilters } from './filters.js';
import { loadAlerts, addAlert, removeAlert, updateAlert, deliverAlert } from './alerts.js';

/* ------------------------------------------------------------------ *
 *  État
 * ------------------------------------------------------------------ */
const state = {
  all: [],
  filtered: [],
  currency: localStorage.getItem('ir.currency') || 'EUR',
  view: localStorage.getItem('ir.view') || 'grid',
  favorites: new Set(JSON.parse(localStorage.getItem('ir.favorites') || '[]')),
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

/** Convertit les filtres UI en objet normalisé (bornes de prix en EUR). */
function normalizeFilters(f) {
  const rate = CURRENCIES[state.currency].rate;
  return {
    q: f.q.trim().toLowerCase(),
    transaction: f.transaction,
    types: [...f.types], countries: [...f.countries],
    features: [...f.features], energy: [...f.energy],
    priceMinEUR: f.priceMin == null ? null : f.priceMin / rate,
    priceMaxEUR: f.priceMax == null ? null : f.priceMax / rate,
    surfaceMin: f.surfaceMin, surfaceMax: f.surfaceMax,
    rooms: f.rooms, bedrooms: f.bedrooms, favoritesOnly: f.favoritesOnly,
  };
}

/* ------------------------------------------------------------------ *
 *  Utilitaires
 * ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const toCurrency = (eur) => eur * CURRENCIES[state.currency].rate;

function formatPrice(eur, transaction) {
  const c = CURRENCIES[state.currency];
  const str = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(toCurrency(eur)));
  return `${str} ${c.symbol}${transaction === 'rent' ? '/mois' : ''}`;
}

function shortPrice(eur) {
  const v = toCurrency(eur);
  const s = CURRENCIES[state.currency].symbol;
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
  const h1 = item.hue;
  const h2 = (item.hue + 40) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='hsl(${h1} 55% 58%)'/>
      <stop offset='1' stop-color='hsl(${h2} 60% 40%)'/>
    </linearGradient></defs>
    <rect width='100%' height='100%' fill='url(#g)'/>
    <g fill='rgba(255,255,255,.16)'>
      <path d='M${w * 0.5 - 70} ${h * 0.62} l70 -55 l70 55 v70 h-140 z'/>
      <rect x='${w * 0.5 - 22}' y='${h * 0.66}' width='44' height='46' fill='rgba(0,0,0,.12)'/>
    </g>
    <circle cx='${w * 0.82}' cy='${h * 0.22}' r='34' fill='rgba(255,255,255,.22)'/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function estimateChip(it) {
  const est = estimate(it);
  if (!est) return '';
  const sign = est.deltaPct > 0 ? '+' : '';
  const label = est.verdict === 'below' ? 'sous le marché'
    : est.verdict === 'above' ? 'au-dessus' : 'dans le marché';
  return `<span class="est ${est.verdict}" title="Réf. marché ${est.refPerM2.toLocaleString('fr-FR')} €/m²">${sign}${est.deltaPct}% · ${label}</span>`;
}

/* ------------------------------------------------------------------ *
 *  Filtrage + tri
 * ------------------------------------------------------------------ */
function applyFilters() {
  const nf = normalizeFilters(state.filters);
  state.filtered = state.all.filter((it) => listingMatches(it, nf, state.favorites));

  const f = state.filters;
  state.filtered.sort((a, b) => {
    switch (f.sort) {
      case 'price-asc': return a.priceEUR - b.priceEUR;
      case 'price-desc': return b.priceEUR - a.priceEUR;
      case 'surface': return b.surface - a.surface;
      case 'ppm2': return (a.priceEUR / a.surface) - (b.priceEUR / b.surface);
      default: return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  state.page = 1;
  render();
}

/* ------------------------------------------------------------------ *
 *  Rendu
 * ------------------------------------------------------------------ */
function render() {
  const count = state.filtered.length;
  $('#resultCount').textContent = count ? `${count} bien${count > 1 ? 's' : ''}` : 'Aucun résultat';

  if (state.view === 'map') { $('#loadMore').hidden = true; updateMap(); return; }

  const results = $('#results');
  results.classList.toggle('list', state.view === 'list');

  if (!count) {
    results.innerHTML = `<div class="empty-state">
      <p>Aucun bien ne correspond à vos filtres.</p>
      <button class="btn" id="clearFromEmpty">Réinitialiser les filtres</button>
    </div>`;
    $('#clearFromEmpty').onclick = resetFilters;
    $('#loadMore').hidden = true;
    return;
  }

  const shown = state.filtered.slice(0, state.page * state.perPage);
  results.innerHTML = shown.map(cardHtml).join('');
  $$('.card', results).forEach((el) => {
    el.querySelector('.fav').onclick = (e) => { e.stopPropagation(); toggleFav(el.dataset.id); };
    el.onclick = () => openDetail(el.dataset.id);
  });
  $('#loadMore').hidden = shown.length >= count;
}

function cardHtml(it) {
  const fav = state.favorites.has(it.id);
  const feats = it.features.slice(0, 3).map((k) => `<span class="chip">${FEATURES[k]}</span>`).join('');
  const badge = it.transaction === 'rent' ? 'Location' : 'Vente';
  const energy = it.energy ? `<span class="energy e-${it.energy}">${it.energy}</span>` : '';
  const sourceTag = it.sourcesCount > 1
    ? `<span class="source-tag multi">Vu sur ${it.sourcesCount} sites</span>`
    : `<span class="source-tag">${escapeHtml(it.source)}</span>`;
  return `
  <article class="card" data-id="${it.id}" tabindex="0">
    <div class="card-media">
      <img loading="lazy" src="${propertyImage(it)}" alt="${escapeHtml(it.title)}" />
      <span class="badge ${it.transaction}">${badge}</span>
      <button class="fav ${fav ? 'on' : ''}" aria-label="Favori" title="Ajouter aux favoris">${fav ? '♥' : '♡'}</button>
      ${sourceTag}
    </div>
    <div class="card-body">
      <div class="price-row">
        <strong class="price">${formatPrice(it.priceEUR, it.transaction)}</strong>
        ${energy}
      </div>
      ${estimateChip(it)}
      <h3 class="card-title">${escapeHtml(PROPERTY_TYPES[it.type])} · ${escapeHtml(it.city)}</h3>
      <p class="card-loc">${escapeHtml(it.address)}, ${escapeHtml(it.country)}</p>
      <ul class="specs">
        <li>${it.surface} m²</li>
        ${it.rooms ? `<li>${it.rooms} p.</li>` : ''}
        ${it.bedrooms ? `<li>${it.bedrooms} ch.</li>` : ''}
        <li class="ppm2">${formatPrice(Math.round(it.priceEUR / it.surface), 'buy')}/m²</li>
      </ul>
      <div class="chips">${feats}</div>
      <p class="card-foot"><span>${escapeHtml(it.source)}</span> · ${formatDate(it.createdAt)}</p>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ *
 *  Carte interactive (Leaflet) + repli schématique
 * ------------------------------------------------------------------ */
let _map = null;
let _markers = null;

function ensureMap() {
  if (_map || !window.L) return _map;
  _map = window.L.map('map', { scrollWheelZoom: true }).setView([46, 5], 4);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(_map);
  _markers = window.L.layerGroup().addTo(_map);
  return _map;
}

function updateMap() {
  if (!window.L) { renderSchematicMap(); return; }
  const m = ensureMap();
  setTimeout(() => m.invalidateSize(), 0);
  _markers.clearLayers();
  const pts = state.filtered;
  if (!pts.length) return;
  const bounds = [];
  pts.slice(0, 300).forEach((p) => {
    const icon = window.L.divIcon({
      className: 'ir-pin-wrap',
      html: `<span class="ir-pin ${p.transaction}">${shortPrice(p.priceEUR)}</span>`,
      iconSize: [56, 24],
      iconAnchor: [28, 24],
    });
    const mk = window.L.marker([p.lat, p.lng], { icon }).addTo(_markers);
    mk.on('click', () => openDetail(p.id));
    bounds.push([p.lat, p.lng]);
  });
  m.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
}

/** Repli si Leaflet indisponible (ex. hors ligne). */
function renderSchematicMap() {
  const wrap = $('#map');
  const pts = state.filtered;
  if (!pts.length) { wrap.innerHTML = '<p class="map-empty">Aucun bien à localiser.</p>'; return; }
  const lats = pts.map((p) => p.lat); const lngs = pts.map((p) => p.lng);
  const minLa = Math.min(...lats); const maxLa = Math.max(...lats);
  const minLn = Math.min(...lngs); const maxLn = Math.max(...lngs);
  const nx = (v) => (maxLn === minLn ? 50 : 6 + ((v - minLn) / (maxLn - minLn)) * 88);
  const ny = (v) => (maxLa === minLa ? 50 : 6 + ((maxLa - v) / (maxLa - minLa)) * 88);
  const pins = pts.slice(0, 200).map((p) => `<button class="pin" style="left:${nx(p.lng)}%;top:${ny(p.lat)}%" data-id="${p.id}"></button>`).join('');
  wrap.innerHTML = `<div class="map-canvas">${pins}</div>`;
  $$('.pin', wrap).forEach((el) => { el.onclick = () => openDetail(el.dataset.id); });
}

/* ------------------------------------------------------------------ *
 *  Fiche détail (modale)
 * ------------------------------------------------------------------ */
function openDetail(id) {
  const it = state.all.find((x) => x.id === id);
  if (!it) return;
  const feats = it.features.map((k) => `<span class="chip">${FEATURES[k]}</span>`).join('');
  const fav = state.favorites.has(it.id);
  const est = estimate(it);
  const estBlock = est ? `
    <div class="est-block ${est.verdict}">
      <div><b>${est.perM2.toLocaleString('fr-FR')} €/m²</b><span>ce bien</span></div>
      <div><b>${est.refPerM2.toLocaleString('fr-FR')} €/m²</b><span>réf. marché</span></div>
      <div class="est-verdict">${est.deltaPct > 0 ? '+' : ''}${est.deltaPct}%<span>${est.verdict === 'below' ? 'sous le marché' : est.verdict === 'above' ? 'au-dessus du marché' : 'dans le marché'}</span></div>
    </div>
    <p class="est-note">Référence de marché indicative — à brancher sur l'open data DVF pour des valeurs réelles par quartier.</p>` : '';

  const sourcesBlock = (it.sources && it.sources.length > 1) ? `
    <div class="sources-block">
      <h4>Disponible sur ${it.sources.length} portails</h4>
      <ul>${it.sources.map((s) => `<li><span>${escapeHtml(s.source)}</span><b>${formatPrice(s.priceEUR, it.transaction)}</b></li>`).join('')}</ul>
    </div>` : '';

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
      <div class="detail-price">
        <strong>${formatPrice(it.priceEUR, it.transaction)}</strong>
        <span>${formatPrice(Math.round(it.priceEUR / it.surface), 'buy')}/m²</span>
      </div>
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
      <p class="detail-src">Source principale : <b>${escapeHtml(it.source)}</b> · publié ${formatDate(it.createdAt)}</p>
      <a class="btn primary block" href="${it.sourceUrl}" target="_blank" rel="noopener noreferrer">Voir l'annonce sur ${escapeHtml(it.source)}</a>
    </div>`;
  $('#detailFav').onclick = () => { toggleFav(it.id); openDetail(id); };
  $('#detail').showModal();
}

/* ------------------------------------------------------------------ *
 *  Favoris
 * ------------------------------------------------------------------ */
function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('ir.favorites', JSON.stringify([...state.favorites]));
  $('#favCount').textContent = state.favorites.size || '';
  applyFilters();
}

/* ------------------------------------------------------------------ *
 *  Alertes
 * ------------------------------------------------------------------ */
function matchesForAlert(alert) {
  return state.all.filter((it) => listingMatches(it, alert.nf, state.favorites)).map((it) => it.id);
}

function refreshAlertBadge() {
  let totalNew = 0;
  for (const a of loadAlerts()) {
    const seen = new Set(a.seenIds || []);
    totalNew += matchesForAlert(a).filter((id) => !seen.has(id)).length;
  }
  const badge = $('#alertCount');
  badge.textContent = totalNew || '';
  badge.classList.toggle('hot', totalNew > 0);
}

function renderAlerts() {
  const alerts = loadAlerts();
  const list = $('#alertList');
  if (!alerts.length) {
    list.innerHTML = '<p class="muted">Aucune alerte enregistrée. Réglez vos filtres, puis créez-en une ci-dessus.</p>';
    return;
  }
  list.innerHTML = alerts.map((a) => {
    const ids = matchesForAlert(a);
    const seen = new Set(a.seenIds || []);
    const nb = ids.filter((id) => !seen.has(id)).length;
    return `<div class="alert-item" data-id="${a.id}">
      <div class="alert-main">
        <b>${escapeHtml(a.name)}</b>
        <span class="alert-desc">${escapeHtml(describeFilters(a.nf))}</span>
        <span class="alert-meta">${ids.length} bien(s)${nb ? ` · <span class="new">${nb} nouveau(x)</span>` : ''}${a.email ? ` · ${escapeHtml(a.email)}` : ''}</span>
      </div>
      <div class="alert-actions">
        <button class="btn ghost sm" data-act="seen">Marquer vues</button>
        <button class="btn ghost sm danger" data-act="del">Supprimer</button>
      </div>
    </div>`;
  }).join('');

  $$('.alert-item', list).forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('[data-act="del"]').onclick = () => { removeAlert(id); renderAlerts(); refreshAlertBadge(); };
    el.querySelector('[data-act="seen"]').onclick = () => {
      const a = loadAlerts().find((x) => x.id === id);
      updateAlert(id, { seenIds: matchesForAlert(a) });
      renderAlerts(); refreshAlertBadge();
    };
  });
}

async function createAlertFromFilters() {
  const nf = normalizeFilters(state.filters);
  const name = $('#alertName').value.trim() || describeFilters(nf);
  const email = $('#alertEmail').value.trim();
  const alert = { id: `al-${Date.now()}`, name, email, nf, createdAt: Date.now(), seenIds: [] };
  // Les biens présents à la création sont considérés « déjà vus » : seuls les futurs comptent.
  alert.seenIds = matchesForAlert(alert);
  addAlert(alert);
  const delivered = await deliverAlert(alert);
  $('#alertMsg').textContent = delivered
    ? "Alerte créée et transmise au service d'e-mail."
    : "Alerte créée (notifications dans l'app). Envoi e-mail : voir README.";
  $('#alertName').value = '';
  $('#alertEmail').value = '';
  renderAlerts();
  refreshAlertBadge();
}

/* ------------------------------------------------------------------ *
 *  Construction du panneau de filtres
 * ------------------------------------------------------------------ */
function buildFilterUI() {
  $('#typeFilters').innerHTML = Object.entries(PROPERTY_TYPES)
    .map(([k, v]) => `<label class="check"><input type="checkbox" data-type="${k}"><span>${v}</span></label>`).join('');
  $('#countryFilters').innerHTML = COUNTRIES
    .map((c) => `<label class="check"><input type="checkbox" data-country="${escapeHtml(c)}"><span>${escapeHtml(c)}</span></label>`).join('');
  $('#featureFilters').innerHTML = Object.entries(FEATURES)
    .map(([k, v]) => `<label class="check"><input type="checkbox" data-feature="${k}"><span>${v}</span></label>`).join('');
  $('#energyFilters').innerHTML = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    .map((e) => `<label class="pillcheck"><input type="checkbox" data-energy="${e}"><span class="energy e-${e}">${e}</span></label>`).join('');

  $('#cityList').innerHTML = [...CITY_NAMES, ...COUNTRIES].map((c) => `<option value="${escapeHtml(c)}">`).join('');

  const curSel = $('#currency');
  curSel.innerHTML = Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}">${k} (${v.symbol})</option>`).join('');
  curSel.value = state.currency;
}

/* ------------------------------------------------------------------ *
 *  Écouteurs
 * ------------------------------------------------------------------ */
function wireEvents() {
  const f = state.filters;

  $('#search').addEventListener('input', debounce((e) => { f.q = e.target.value; applyFilters(); }, 200));

  $$('input[name="transaction"]').forEach((r) => r.addEventListener('change', (e) => { f.transaction = e.target.value; applyFilters(); }));

  bindChecks('[data-type]', 'type', f.types);
  bindChecks('[data-country]', 'country', f.countries);
  bindChecks('[data-feature]', 'feature', f.features);
  bindChecks('[data-energy]', 'energy', f.energy);

  ['priceMin', 'priceMax', 'surfaceMin', 'surfaceMax'].forEach((id) => {
    $('#' + id).addEventListener('input', debounce((e) => {
      const v = e.target.value.trim();
      f[id] = v === '' ? null : Number(v);
      applyFilters();
    }, 250));
  });

  $('#rooms').addEventListener('change', (e) => { f.rooms = Number(e.target.value); applyFilters(); });
  $('#bedrooms').addEventListener('change', (e) => { f.bedrooms = Number(e.target.value); applyFilters(); });
  $('#sort').addEventListener('change', (e) => { f.sort = e.target.value; applyFilters(); });

  $('#currency').addEventListener('change', (e) => {
    state.currency = e.target.value;
    localStorage.setItem('ir.currency', state.currency);
    applyFilters();
  });

  $('#favToggle').addEventListener('click', () => {
    f.favoritesOnly = !f.favoritesOnly;
    $('#favToggle').classList.toggle('on', f.favoritesOnly);
    applyFilters();
  });

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
}

function bindChecks(sel, attr, set) {
  $$(sel).forEach((el) => el.addEventListener('change', (e) => {
    const val = e.target.dataset[attr];
    if (e.target.checked) set.add(val); else set.delete(val);
    applyFilters();
  }));
}

function setView(view) {
  state.view = view;
  localStorage.setItem('ir.view', view);
  $$('.view-btn').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  $('#map').hidden = view !== 'map';
  $('#results').hidden = view === 'map';
  render();
}

function resetFilters() {
  state.filters = defaultFilters();
  $('#search').value = '';
  $$('input[type="checkbox"]').forEach((c) => { c.checked = false; });
  $$('input[type="number"]').forEach((c) => { c.value = ''; });
  $('#rooms').value = '0'; $('#bedrooms').value = '0'; $('#sort').value = 'recent';
  $('input[name="transaction"][value="all"]').checked = true;
  $('#favToggle').classList.remove('on');
  applyFilters();
}

function toggleTheme() {
  const next = (document.documentElement.dataset.theme || 'light') === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ir.theme', next);
  $('#themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------------------------------------------ *
 *  Démarrage
 * ------------------------------------------------------------------ */
async function init() {
  const savedTheme = localStorage.getItem('ir.theme');
  if (savedTheme) {
    document.documentElement.dataset.theme = savedTheme;
    $('#themeBtn').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  }
  buildFilterUI();
  wireEvents();
  setView(state.view);
  $('#favCount').textContent = state.favorites.size || '';

  $('#results').innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Chargement des annonces…</p></div>';
  try {
    const { data } = await getListings(fetchAllListings);
    state.all = dedupe(data);
  } catch (err) {
    console.error(err);
    state.all = [];
  }
  refreshAlertBadge();
  applyFilters();
}

init();
