# 🏠 ImmoConsult

**Agrégateur immobilier multi-sources** — regroupe des biens en **vente** et en
**location** issus de plusieurs portails sur une seule interface, moderne,
responsive et riche en filtres.

> ⚡ 100 % statique · fonctionne directement sur **GitHub Pages** · aucun
> serveur requis pour la démo · thème clair/sombre automatique.

![Aperçu](docs/preview-grid.png)

---

## ✨ Fonctionnalités

- **Recherche plein-texte** (ville, pays, mot-clé) avec autocomplétion.
- **Filtres avancés** : transaction (achat/location), type de bien, pays, prix
  min/max, surface, nombre de pièces et de chambres, équipements (piscine,
  terrasse, parking, vue mer…), classe énergie (DPE A→G).
- **Tri** : plus récents, prix croissant/décroissant, surface, **prix au m²**.
- **Multi-devises** (€, $, £, CHF, AED) avec conversion à la volée.
- **3 vues** : grille, liste et **carte** schématique.
- **Favoris** persistants (stockés dans le navigateur).
- **Fiche détail** complète en modale.
- **Responsive** : tiroir de filtres sur mobile, design fluide.
- **Architecture d'adaptateurs** : chaque source est un module isolé, facile à
  brancher ou débrancher.

---

## ⚖️ Sources de données — à lire avant tout

L'agrégation **automatique** (scraping) des grands portails
(SeLoger, Leboncoin, Bien'ici, Idealista, Rightmove, Zillow…) est **presque
toujours interdite** par leurs conditions d'utilisation et activement bloquée
techniquement. Ce projet est donc conçu pour ne consommer que des sources
**autorisées** :

| Source | Comment y accéder légalement |
| --- | --- |
| **API partenaires** | Programmes pro (ex. SeLoger Pro, flux XML agences, Apimo, Ubiflow) sur contrat. |
| **Flux publics** | Certaines agences/portails exposent des flux XML/JSON publics. |
| **Open data** | En France, **DVF** (Demandes de Valeurs Foncières, [data.gouv.fr](https://www.data.gouv.fr/)) donne les **prix de vente réels**. À l'international : registres cadastraux ouverts. |
| **Vos propres mandats** | Si vous êtes agence/réseau, vos annonces vous appartiennent. |

Le jeu de données livré est **entièrement fictif** et sert uniquement de
démonstration visuelle.

---

## 🔌 Brancher une vraie source

Chaque source est un module dans `assets/js/sources/` qui expose ce contrat :

```js
export const maSource = {
  id: 'ma-source',
  label: 'Ma source',
  enabled: true,
  async fetchListings(signal) {
    const res = await fetch('https://mon-proxy.example/immo', { signal });
    const raw = await res.json();
    return raw.map(normalize); // -> tableau au schéma normalisé (voir data.js)
  },
};
```

Puis on l'ajoute au registre `assets/js/sources/index.js`. Le reste de
l'application (filtres, tri, affichage) fonctionne sans modification, car
toutes les annonces partagent le **même schéma normalisé** (voir le
commentaire en tête de `assets/js/data.js`).

> 🔐 **Ne mettez jamais** une clé d'API secrète dans ce code : il est public.
> Passez par un petit **proxy serverless** (Cloudflare Worker, Vercel/Netlify
> Function) qui garde la clé côté serveur, applique la mise en cache et le
> respect des quotas, et que le front appelle.

---

## 🚀 Déploiement sur GitHub Pages

Un workflow (`.github/workflows/deploy.yml`) publie le site automatiquement à
chaque push sur `main`.

1. **Settings → Pages → Build and deployment → Source : GitHub Actions.**
2. Poussez sur `main`. Le site sera servi sur
   `https://<votre-nom>.github.io/ImmoConsult/`.

---

## 🛠️ Développement local

Le site utilise des **modules ES**, il faut donc un serveur HTTP (pas `file://`) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

---

## 🗂️ Structure

```
index.html                  Page + structure
assets/css/styles.css       Design (clair/sombre, responsive)
assets/js/app.js            Logique : filtres, tri, favoris, rendu, carte
assets/js/data.js           Schéma + jeu de données de démonstration
assets/js/sources/          Adaptateurs de sources (registre + démo)
.github/workflows/deploy.yml  Déploiement GitHub Pages
```

---

## 🧭 Pistes d'évolution

Voir la section « Idées d'amélioration » dans les notes du projet : back-end
d'agrégation, cache et déduplication des annonces, vraie carte interactive,
alertes e-mail, estimation de prix, comparateur, i18n, etc.

---

## 📄 Licence

MIT — voir [LICENSE](LICENSE).
