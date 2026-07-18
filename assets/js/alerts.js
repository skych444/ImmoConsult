/**
 * Alertes / recherches sauvegardées.
 *
 * Les alertes sont stockées dans le navigateur. À chaque visite,
 * l'application recompte les biens correspondants et signale les nouveaux
 * (badge). L'ENVOI d'e-mails réels nécessite un back-end : configurez
 * `window.IMMOCONSULT_ALERT_ENDPOINT` avec l'URL d'une fonction serverless
 * qui reçoit l'alerte et déclenche l'e-mail via votre fournisseur
 * (Resend, SendGrid, Mailgun…). Sans back-end, les alertes restent locales.
 */
const KEY = 'ir.alerts.v1';

export function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function persist(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ } }

export function addAlert(alert) {
  const list = loadAlerts();
  list.unshift(alert);
  persist(list);
  return list;
}
export function removeAlert(id) {
  const list = loadAlerts().filter((a) => a.id !== id);
  persist(list);
  return list;
}
export function updateAlert(id, patch) {
  const list = loadAlerts().map((a) => (a.id === id ? { ...a, ...patch } : a));
  persist(list);
  return list;
}

/**
 * Transmet l'alerte à un back-end d'e-mail si configuré. Renvoie true si une
 * livraison a été tentée, false si le mode est purement local.
 */
export async function deliverAlert(alert) {
  const endpoint = typeof window !== 'undefined' && window.IMMOCONSULT_ALERT_ENDPOINT;
  if (!endpoint) return false;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: alert.email, name: alert.name, filters: alert.nf }),
    });
    return true;
  } catch (e) {
    console.warn('Livraison alerte échouée', e);
    return false;
  }
}
