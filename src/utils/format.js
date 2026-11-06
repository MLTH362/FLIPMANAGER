/* Montants stockés en centimes entiers ; formatage via Intl (jamais de calcul en flottant). */
export const money = (cents, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format((cents || 0) / 100);
export const dateFr = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); // date seule : lue en heure locale
  return (m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(iso)).toLocaleDateString('fr-FR');
};
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const monthKey = (iso) => iso.slice(0, 7); // "2026-11"
export const monthLabel = (key) =>
  new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
/* Centimes -> texte de saisie ("1250" -> "12,50"), sans passer par un flottant. */
export const fromCents = (c) => (c == null ? '' : `${Math.trunc(c / 100)},${String(Math.abs(c % 100)).padStart(2, '0')}`);
export const symbol = (currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency').value;
export const pct = (v) => (v == null ? '—' : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`);
