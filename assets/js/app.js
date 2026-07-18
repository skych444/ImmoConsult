import {
  CURRENCIES, PROPERTY_TYPES, FEATURES, COUNTRIES, CITY_NAMES,
} from './data.js';
import { fetchAllListings } from './sources/index.js';

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

/* ------------------------------------------------------------------ *
 *  Utilitaires
 * ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toCurrency(eur) {
  const c = CURRENCIES[state.currency];
  return eur * c.rate;
}

function formatPrice(eur, transaction) {
  const c = CURRENCIES[state.currency];
  const val = toCurrency(eur);
  const str = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(val));
  const suffix = transaction === 'rent' ? '/mois' : '';
  return `${str} ${c.symbol}${suffix}`;
}

function formatDate(iso) {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 30) return `il y a ${d} j`;
  return `il y a ${Math.round(d / 30)} mois`;
}

/** Image placeholder SVG (data URI) — évite toute ressource externe. */
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

/* ------------------------------------------------------------------ *
 *  Filtrage + tri
 * ------------------------------------------------------------------ */
function applyFilters() {
  const f = state.filters;
  const q = f.q.trim().toLowerCase();

  state.filtered = state.all.filter((it) => {
    if (f.favoritesOnly && !state.favorites.has(it.id)) return false;
    if (f.transaction !== 'all' && it.transaction !== f.transaction) return false;
    if (f.types.size && !f.types.has(it.type)) return false;
    if (f.countries.size && !f.countries.has(it.country)) return false;
    if (f.rooms && it.rooms < f.rooms) return false;
    if (f.bedrooms && it.bedrooms < f.bedrooms) return false;

    const price = toCurrency(it.priceEUR);
    if (f.priceMin != null && price < f.priceMin) return false;
    if (f.priceMax != null && price > f.priceMax) return false;
    if (f.surfaceMin != null && it.surface < f.surfaceMin) return false;
    if (f.surfaceMax != null && it.surface > f.surfaceMax) return false;

    if (f.features.size && ![...f.features].every((x) => it.features.includes(x))) return false;
    if (f.energy.size && !f.energy.has(it.energy)) return false;

    if (q) {
      const hay = `${it.title} ${it.city} ${it.country} ${it.address} ${it.source}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dir = { 'price-asc': 1, 'price-desc': -1 };
  state.filtered.sort((a, b) => {
    switch (f.sort) {
      case 'price-asc': return (a.priceEUR - b.priceEUR) * dir['price-asc'];
      case 'price-desc': return (a.priceEUR - b.priceEUR) * dir['price-desc'];
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
  const results = $('#results');
  const count = state.filtered.length;
  $('#resultCount').textContent = count
    ? `${count} bien${count > 1 ? 's' : ''}`
    : 'Aucun résultat';

  results.classList.toggle('list', state.view === 'list');
  results.classList.toggle('map-hidden', true);

  if (!count) {
    results.innerHTML = `<div class="empty-state">
      <p>Aucun bien ne correspond à vos filtres.</p>
      <button class="btn" id="clearFromEmpty">Réinitialiser les filtres</button>
    </div>`;
    $('#clearFromEmpty').onclick = resetFilters;
    $('#loadMore').hidden = true;
    renderMap();
    return;
  }

  const shown = state.filtered.slice(0, state.page * state.perPage);
  results.innerHTML = shown.map(cardHtml).join('');
  $$('.card').forEach((el) => {
    el.querySelector('.fav').onclick = (e) => { e.stopPropagation(); toggleFav(el.dataset.id); };
    el.onclick = () => openDetail(el.dataset.id);
  });
  $('#loadMore').hidden = shown.length >= count;
  renderMap();
}

function cardHtml(it) {
  const fav = state.favorites.has(it.id);
  const feats = it.features.slice(0, 3).map((k) => `<span class="chip">${FEATURES[k]}</span>`).join('');
  const badge = it.transaction === 'rent' ? 'Location' : 'Vente';
  const energy = it.energy ? `<span class="energy e-${it.energy}">${it.energy}</span>` : '';
  return `
  <article class="card" data-id="${it.id}" tabindex="0">
    <div class="card-media">
      <img loading="lazy" src="${propertyImage(it)}" alt="${escapeHtml(it.title)}" />
      <span class="badge ${it.transaction}">${badge}</span>
      <button class="fav ${fav ? 'on' : ''}" aria-label="Favori" title="Ajouter aux favoris">${fav ? '♥' : '♡'}</button>
      <span class="source-tag">${escapeHtml(it.source)}</span>
    </div>
    <div class="card-body">
      <div class="price-row">
        <strong class="price">${formatPrice(it.priceEUR, it.transaction)}</strong>
        ${energy}
      </div>
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

/* ---- Mini-carte schématique (sans dépendance, hors ligne) --------- */
function renderMap() {
  const wrap = $('#map');
  if (!wrap || wrap.hidden) return;
  const pts = state.filtered;
  if (!pts.length) { wrap.innerHTML = '<p class="map-empty">Aucun bien à localiser.</p>'; return; }
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats);
  const minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
  const nx = (v) => maxLn === minLn ? 50 : 6 + ((v - minLn) / (maxLn - minLn)) * 88;
  const ny = (v) => maxLa === minLa ? 50 : 6 + ((maxLa - v) / (maxLa - minLa)) * 88;
  const pins = pts.slice(0, 200).map((p) => `
    <button class="pin" style="left:${nx(p.lng)}%;top:${ny(p.lat)}%" data-id="${p.id}"
      title="${escapeHtml(p.city)} — ${formatPrice(p.priceEUR, p.transaction)}"></button>`).join('');
  wrap.innerHTML = `<div class="map-canvas">${pins}<span class="map-note">Aperçu schématique — brancher Leaflet/Mapbox pour une vraie carte</span></div>`;
  $$('.pin', wrap).forEach((el) => { el.onclick = () => openDetail(el.dataset.id); });
}

/* ------------------------------------------------------------------ *
 *  Fiche détail (modale)
 * ------------------------------------------------------------------ */
function openDetail(id) {
  const it = state.all.find((x) => x.id === id);
  if (!it) return;
  const modal = $('#detail');
  const feats = it.features.map((k) => `<span class="chip">${FEATURES[k]}</span>`).join('');
  const fav = state.favorites.has(it.id);
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
      <ul class="detail-specs">
        <li><b>${it.surface}</b> m²</li>
        ${it.rooms ? `<li><b>${it.rooms}</b> pièces</li>` : ''}
        ${it.bedrooms ? `<li><b>${it.bedrooms}</b> chambres</li>` : ''}
        ${it.bathrooms ? `<li><b>${it.bathrooms}</b> sdb</li>` : ''}
        ${it.energy ? `<li>DPE <b class="energy e-${it.energy}">${it.energy}</b></li>` : ''}
        ${it.year ? `<li>Année <b>${it.year}</b></li>` : ''}
      </ul>
      <div class="chips">${feats}</div>
      <p class="detail-src">Source : <b>${escapeHtml(it.source)}</b> · publié ${formatDate(it.createdAt)}</p>
      <a class="btn primary block" href="${it.sourceUrl}" target="_blank" rel="noopener noreferrer">
        Voir l'annonce sur ${escapeHtml(it.source)}
      </a>
    </div>`;
  $('#detailFav').onclick = () => { toggleFav(it.id); openDetail(id); };
  modal.showModal();
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

  const dl = $('#cityList');
  dl.innerHTML = [...CITY_NAMES, ...COUNTRIES].map((c) => `<option value="${escapeHtml(c)}">`).join('');

  const curSel = $('#currency');
  curSel.innerHTML = Object.entries(CURRENCIES)
    .map(([k, v]) => `<option value="${k}">${k} (${v.symbol})</option>`).join('');
  curSel.value = state.currency;
}

/* ------------------------------------------------------------------ *
 *  Écouteurs
 * ------------------------------------------------------------------ */
function wireEvents() {
  const f = state.filters;

  $('#search').addEventListener('input', debounce((e) => { f.q = e.target.value; applyFilters(); }, 200));

  $$('input[name="transaction"]').forEach((r) => r.addEventListener('change', (e) => {
    f.transaction = e.target.value; applyFilters();
  }));

  bindChecks('[data-type]', 'type', f.types);
  bindChecks('[data-country]', 'country', f.countries);
  bindChecks('[data-feature]', 'feature', f.features);
  bindChecks('[data-energy]', 'energy', f.energy);

  const numeric = { priceMin: 'priceMin', priceMax: 'priceMax', surfaceMin: 'surfaceMin', surfaceMax: 'surfaceMax' };
  Object.keys(numeric).forEach((id) => {
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

  // Vue grille / liste / carte
  $$('.view-btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // Thème
  $('#themeBtn').addEventListener('click', toggleTheme);

  // Tiroir filtres (mobile)
  $('#filterToggle').addEventListener('click', () => document.body.classList.add('drawer-open'));
  $('#closeDrawer').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('drawer-open'));

  // Modale
  $('#detailClose').addEventListener('click', () => $('#detail').close());
  $('#detail').addEventListener('click', (e) => { if (e.target.id === 'detail') $('#detail').close(); });
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
  const map = $('#map');
  map.hidden = view !== 'map';
  $('#results').hidden = view === 'map';
  if (view === 'map') { $('#loadMore').hidden = true; renderMap(); } else render();
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
  const cur = document.documentElement.dataset.theme || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ir.theme', next);
  $('#themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
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
    state.all = await fetchAllListings();
  } catch (err) {
    console.error(err);
    state.all = [];
  }
  applyFilters();
}

init();
