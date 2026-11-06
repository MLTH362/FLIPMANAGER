/* Tests des statistiques : mois, catégories, marges, délais. `npm test`. */
import { daysBetween, saleDelay, monthKeysBetween, monthly, byCategory, overview } from '../src/core/stats.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };

const articles = [
  { id: 'a1', category: 'Vêtements', buyPrice: 1000, fees: 0, createdAt: '2026-09-01T08:00:00Z', status: 'Vendu' },
  { id: 'a2', category: 'Vêtements', buyPrice: 1500, fees: 500, createdAt: '2026-09-20T08:00:00Z', boughtOn: '2026-09-10', status: 'Vendu' },
  { id: 'a3', category: 'Chaussures', buyPrice: 3000, fees: 0, createdAt: '2026-10-01T08:00:00Z', status: 'Vendu' },
  { id: 'a4', category: '', buyPrice: 500, fees: 0, createdAt: '2026-10-05T08:00:00Z', status: 'En stock' },
  { id: 'a5', category: 'Chaussures', buyPrice: 800, fees: 0, createdAt: '2026-10-06T08:00:00Z', status: 'En vente' },
];
const S = (o) => ({ fees: 0, expenses: 0, status: 'terminée', ...o });
const sales = [
  S({ id: 's1', articleId: 'a1', date: '2026-09-11', price: 2500, fees: 100, cost: 1000 }),   // bénéfice 1400, 10 jours
  S({ id: 's2', articleId: 'a2', date: '2026-11-02', price: 3000, expenses: 100, cost: 2000 }), // bénéfice 900, 53 jours (depuis l'achat)
  S({ id: 's3', articleId: 'a3', date: '2026-11-05', price: 2000, cost: 3000 }),                // bénéfice −1000, 35 jours
  S({ id: 's4', articleId: 'a4', date: '2026-10-10', price: 9999, status: 'annulée' }),
  S({ id: 's5', articleId: 'a5', date: '2026-10-12', price: 7777, status: 'remboursée', fees: 300 }),
];
const byId = new Map(articles.map((a) => [a.id, a]));

/* ---- dates ---- */
eq('jours entre deux dates', [daysBetween('2026-09-01', '2026-09-11'), daysBetween('2026-10-25', '2026-11-02'), daysBetween('2026-03-28', '2026-03-30')], [10, 8, 2]);
eq('délai depuis l’ajout', saleDelay(sales[0], articles[0]), 10);
eq('délai depuis la date d’achat si renseignée', saleDelay(sales[1], articles[1]), 53);
eq('vente avant l’ajout : délai inconnu', saleDelay({ date: '2026-08-01' }, articles[0]), null);
eq('article inconnu : délai inconnu', saleDelay(sales[0], undefined), null);
eq('mois consécutifs (changement d’année)', monthKeysBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);

/* ---- mois ---- */
const m = monthly(sales, byId);
eq('mois sans trou, ventes terminées seulement', m.map((x) => [x.key, x.count, x.revenue, x.profit]), [['2026-09', 1, 2500, 1400], ['2026-10', 0, 0, 0], ['2026-11', 2, 5000, -100]]);
eq('marges mensuelles', m.map((x) => x.margin), [56, null, -2]);
eq('bénéfice cumulé', m.map((x) => x.cumProfit), [1400, 1400, 1300]);
eq('variation du bénéfice', m.map((x) => x.change), [null, -1400, -100]);
eq('aucune vente terminée', monthly([sales[3], sales[4]], byId), []);

/* ---- catégories ---- */
const c = byCategory(articles, sales);
eq('catégories triées par bénéfice', c.map((x) => [x.category, x.sold, x.revenue, x.profit]), [['Vêtements', 2, 5500, 2300], ['Sans catégorie', 0, 0, 0], ['Chaussures', 1, 2000, -1000]]);
eq('marge et ROI par catégorie', [c[0].margin, c[0].roi, c[2].margin, c[2].roi], [41.82, 76.67, -50, -33.33]);
eq('délai moyen par catégorie', [c[0].avgDelay, c[0].delayCount, c[2].avgDelay, c[1].avgDelay], [31.5, 2, 35, null]);
eq('articles et stock par catégorie', c.map((x) => [x.articles, x.inStock]), [[2, 0], [1, 1], [2, 1]]);
eq('vente d’un article inconnu : sans catégorie', byCategory([], [S({ id: 'z', articleId: 'zz', date: '2026-11-01', price: 1000, cost: 400 })]).map((x) => [x.category, x.profit]), [['Sans catégorie', 600]]);

/* ---- chiffres clés ---- */
const o = overview(articles, sales);
eq('chiffres clés', [o.count, o.revenue, o.profit, o.margin, o.roi], [3, 7500, 1300, 17.33, 21.67]);
eq('bénéfice et panier moyens', [o.avgProfit, o.avgBasket], [433, 2500]);
eq('délai moyen', [o.avgDelay, o.delayCount], [32.7, 3]);
eq('meilleur et pire mois', [o.bestMonth.key, o.worstMonth.key], ['2026-09', '2026-11']);
eq('sans vente', (({ count, revenue, margin, avgDelay, bestMonth }) => [count, revenue, margin, avgDelay, bestMonth])(overview(articles, [])), [0, 0, null, null, null]);
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);
