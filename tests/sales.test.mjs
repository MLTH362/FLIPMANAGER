/* Tests « Ventes » : coût figé, bénéfice réalisé, annulations/remboursements. `npm test`. */
import { saleCost, saleProfit, withCostSnapshot, backfillCosts, salesSummary } from '../src/core/sales.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };

const art = (o = {}) => ({ id: 'a1', buyPrice: 1000, fees: 200, ...o }); // coût 12,00 €
const sale = (o = {}) => ({ id: 's1', articleId: 'a1', price: 3000, fees: 200, expenses: 100, status: 'terminée', ...o });

/* ---- bénéfice réalisé ---- */
eq('bénéfice = prix − frais − dépenses − coût', saleProfit(sale({ cost: 1200 }), art()), 1500);
eq('sans coût figé : coût actuel de l’article', saleCost(sale(), art({ buyPrice: 2000 })), 2200);
eq('article absent et pas de coût figé : coût 0', saleCost(sale(), undefined), 0);

/* ---- coût figé à la vente ---- */
const s1 = withCostSnapshot(sale(), undefined, art());
eq('nouvelle vente terminée : coût figé', s1.cost, 1200);
const pricier = art({ buyPrice: 5000 });
eq('modifier l’article ensuite ne change pas le bénéfice', [saleProfit(s1, art()), saleProfit(s1, pricier)], [1500, 1500]);
eq('article supprimé : bénéfice inchangé', saleProfit(s1, undefined), 1500);
eq('modification de la vente : coût conservé', withCostSnapshot({ ...s1, price: 3500 }, s1, pricier).cost, 1200);
eq('vente annulée : pas de coût figé', 'cost' in withCostSnapshot(sale({ status: 'annulée' }), undefined, art()), false);
const back = withCostSnapshot({ ...s1, status: 'terminée' }, { ...s1, status: 'annulée', cost: undefined }, pricier);
eq('annulée puis terminée : coût recalculé', back.cost, 5200);
eq('terminée sans article ni coût : inchangée', withCostSnapshot(sale(), undefined, undefined), sale());

/* ---- anciennes ventes ---- */
const all = [sale({ id: 'x1' }), sale({ id: 'x2', cost: 999 }), sale({ id: 'x3', status: 'annulée' }), sale({ id: 'x4', articleId: 'zz' }), sale({ id: 'x5', status: 'remboursée' })];
eq('coût figé seulement pour les terminées sans coût dont l’article existe', backfillCosts(all, [art()]).map((s) => [s.id, s.cost]), [['x1', 1200]]);
eq('sans rien à corriger', backfillCosts([sale({ cost: 1 })], [art()]), []);

/* ---- totaux : annulations et remboursements ne faussent rien ---- */
const byId = new Map([['a1', art()]]);
const mix = [sale({ id: 'a', cost: 1200 }), sale({ id: 'b', price: 2000, fees: 0, expenses: 0, cost: 1200 }),
  sale({ id: 'c', status: 'annulée', price: 9999 }), sale({ id: 'd', status: 'remboursée', price: 8888, fees: 150, expenses: 50 })];
const t = salesSummary(mix, byId);
eq('chiffre d’affaires : terminées seulement', [t.count, t.revenue], [2, 5000]);
eq('bénéfice : terminées seulement', t.profit, 1500 + 800);
eq('annulées / remboursées comptées à part', [t.others, t.refundedCosts], [2, 200]);
eq('aucune vente', salesSummary([], byId), { done: [], count: 0, revenue: 0, profit: 0, others: 0, refundedCosts: 0 });
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);
