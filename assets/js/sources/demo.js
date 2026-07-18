import { DEMO_LISTINGS } from '../data.js';

/**
 * Adaptateur de démonstration.
 * Il implémente le contrat commun attendu par le registre (voir index.js) :
 *   - id           identifiant unique
 *   - label        nom affiché
 *   - enabled      activé par défaut ?
 *   - fetchListings(signal) -> Promise<Listing[]>  (schéma normalisé)
 *
 * Un vrai adaptateur remplacerait simplement fetchListings() par un appel
 * réseau vers l'API partenaire / le flux de la source, puis normaliserait
 * la réponse au même schéma que data.js.
 */
export const demoSource = {
  id: 'demo',
  label: 'Démonstration',
  enabled: true,
  async fetchListings() {
    // Simule une latence réseau pour rendre l'UI réaliste.
    await new Promise((r) => setTimeout(r, 300));
    return DEMO_LISTINGS;
  },
};
