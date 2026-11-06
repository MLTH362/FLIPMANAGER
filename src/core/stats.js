/* Statistiques : mois, catégories, marges et délais de vente. Fonctions pures, uniquement à partir des données enregistrées.
   Seules les ventes terminées comptent. Marge = bénéfice ÷ chiffre d'affaires ; ROI = bénéfice ÷ coût ; montants en centimes. */
import { roundDiv } from './finance.js';
import { saleProfit, saleCost } from './sales.js';

const pct = (a, b) => (b > 0 ? roundDiv(a * 10000, b) / 100 : null);
const utc = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);
const avg = (list) => (list.length ? Math.round((list.reduce((t, x) => t + x, 0) / list.length) * 10) / 10 : null);
export const NO_CATEGORY = 'Sans catégorie';
export const OPEN_STATUSES = ['En stock', 'En vente'];

/* Date de départ du délai : date d'achat si renseignée, sinon date d'ajout de l'article. */
export const startDate = (a) => a?.boughtOn || (a?.createdAt ? a.createdAt.slice(0, 10) : null);
/* Jours entre l'achat (ou l'ajout) et la vente ; null si la donnée manque ou est incohérente (vente avant le départ). */
export function saleDelay(s, a) {
  const from = startDate(a); if (!from) return null;
  const d = daysBetween(from, s.date); return d >= 0 ? d : null;
}

/* Mois consécutifs de first à last inclus ('2026-09' … '2026-11'). */
export function monthKeysBetween(first, last) {
  const out = []; let [y, m] = first.split('-').map(Number); const [ey, em] = last.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } }
  return out;
}

/* Une ligne par mois, sans trous (un mois sans vente vaut 0), avec bénéfice cumulé et variation du bénéfice. */
export function monthly(sales, byId) {
  const done = sales.filter((s) => s.status === 'terminée');
  if (!done.length) return [];
  const keys = done.map((s) => s.date.slice(0, 7)).sort();
  let cum = 0, prev = null;
  return monthKeysBetween(keys[0], keys[keys.length - 1]).map((key) => {
    const g = done.filter((s) => s.date.slice(0, 7) === key);
    const revenue = g.reduce((t, s) => t + s.price, 0), profit = g.reduce((t, s) => t + saleProfit(s, byId.get(s.articleId)), 0);
    cum += profit;
    const row = { key, count: g.length, revenue, profit, margin: pct(profit, revenue), cumProfit: cum, change: prev == null ? null : profit - prev };
    prev = profit; return row;
  });
}

/* Comparaison des catégories, de la plus rentable à la moins rentable. */
export function byCategory(articles, sales) {
  const byId = new Map(articles.map((a) => [a.id, a])), rows = new Map();
  const row = (c) => { if (!rows.has(c)) rows.set(c, { category: c, articles: 0, inStock: 0, sold: 0, revenue: 0, profit: 0, cost: 0, delays: [] }); return rows.get(c); };
  for (const a of articles) { const r = row(a.category || NO_CATEGORY); r.articles++; if (OPEN_STATUSES.includes(a.status)) r.inStock++; }
  for (const s of sales.filter((x) => x.status === 'terminée')) {
    const a = byId.get(s.articleId), r = row(a?.category || NO_CATEGORY), d = saleDelay(s, a);
    r.sold++; r.revenue += s.price; r.profit += saleProfit(s, a); r.cost += saleCost(s, a); if (d != null) r.delays.push(d);
  }
  return [...rows.values()].map(({ cost, delays, ...r }) => ({ ...r, margin: pct(r.profit, r.revenue), roi: pct(r.profit, cost), avgDelay: avg(delays), delayCount: delays.length }))
    .sort((a, b) => b.profit - a.profit || a.category.localeCompare(b.category, 'fr'));
}

/* Chiffres clés globaux. */
export function overview(articles, sales) {
  const byId = new Map(articles.map((a) => [a.id, a])), done = sales.filter((s) => s.status === 'terminée');
  const revenue = done.reduce((t, s) => t + s.price, 0), profit = done.reduce((t, s) => t + saleProfit(s, byId.get(s.articleId)), 0);
  const cost = done.reduce((t, s) => t + saleCost(s, byId.get(s.articleId)), 0);
  const months = monthly(sales, byId), delays = done.map((s) => saleDelay(s, byId.get(s.articleId))).filter((d) => d != null);
  const pick = (cmp) => months.reduce((b, m) => (b == null || cmp(m, b) ? m : b), null);
  return { count: done.length, revenue, profit, margin: pct(profit, revenue), roi: pct(profit, cost),
    avgProfit: done.length ? roundDiv(profit, done.length) : null, avgBasket: done.length ? roundDiv(revenue, done.length) : null,
    avgDelay: avg(delays), delayCount: delays.length, bestMonth: pick((m, b) => m.profit > b.profit), worstMonth: pick((m, b) => m.profit < b.profit) };
}
