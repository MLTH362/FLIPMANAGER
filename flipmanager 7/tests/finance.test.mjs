/* Tests des formules : `npm test`. Exemples calculés à la main + test de propriété sur 5 000 cas aléatoires. */
import { costs, saleAt, priceForProfit, breakEven, analyse, minimumPrice, priceSteps, scenarios } from '../src/core/finance.js';
import { toCents } from '../src/core/validators.js';

let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', name, ok ? '' : `obtenu ${JSON.stringify(got)} attendu ${JSON.stringify(want)}`); };
const base = { qty: 1, buy: 0, shipMode: 'total', ship: 0, pack: 0, other: 0, feeFixed: 0, feeRate: 0, chargeRate: 0 };

// 1. Cas simple : achat 10 €, vente 20 € -> bénéfice 10 €, marge 50 %, ROI 100 %
let i = { ...base, buy: 1000 }, s = saleAt(i, 2000);
eq('simple: bénéfice', s.profit, 1000); eq('simple: marge', s.margin, 50); eq('simple: ROI', s.roi, 100);

// 2. Marge et ROI sont bien distincts : achat 10 €, vente 40 € -> marge 75 %, ROI 300 %
s = saleAt(i, 4000); eq('marge ≠ ROI', [s.margin, s.roi], [75, 300]);

// 3. Lot de 3 : achat 5 €, livraison 6 € (total), emballage 0,50 €/u, autres 0,90 €, vente 12 €/u
i = { ...base, qty: 3, buy: 500, ship: 600, pack: 50, other: 90 };
eq('lot: coût total', costs(i).totalCost, 2340); eq('lot: coût unitaire', costs(i).unitCost, 780);
s = saleAt(i, 1200); eq('lot: bénéfice', s.profit, 1260); eq('lot: marge', s.margin, 35); eq('lot: ROI', s.roi, 53.85);
eq('lot: bénéfice/unité', s.profitUnit, 420);

// 4. Livraison par unité (2 € x 3 = 6 €) équivaut à 6 € au total
eq('livraison par unité', costs({ ...i, shipMode: 'unit', ship: 200 }).totalCost, 2340);

// 5. Frais de vente (0,70 € + 5 %) et cotisations 12,30 % : prix 30 €, achat 10 €
i = { ...base, buy: 1000, feeFixed: 70, feeRate: 500, chargeRate: 1230 };
s = saleAt(i, 3000); eq('frais+charges', [s.fees, s.charges, s.profit], [220, 369, 1411]);

// 6. Prix cible : achat 10 €, aucun frais -> 1 € de bénéfice = 11,00 €
i = { ...base, buy: 1000 };
eq('prix cible 1 €', priceForProfit(i, 100), 1100); eq('prix minimum', breakEven(i), 1000);
// avec 12,30 % de charges : 11,40 € -> charges 1,40 € (140,22 c arrondi à 140) -> bénéfice exactement 0 ; 11,39 € donne -0,01 €
eq('prix min avec charges', breakEven({ ...i, chargeRate: 1230 }), 1140);
eq('11,39 € insuffisant', saleAt({ ...i, chargeRate: 1230 }, 1139).profit, -1);
eq('taux >= 100 %', priceForProfit({ ...i, feeRate: 6000, chargeRate: 4000 }, 100), null);

// 7. Saisie exacte des montants
eq('toCents', [toCents('12,50'), toCents('0,1'), toCents('1 234,05')], [1250, 10, 123405]);

// 8. Propriété : le prix renvoyé est le plus petit qui atteint la cible (5 000 cas aléatoires)
const r = (n) => Math.floor(Math.random() * n);
let bad = 0;
for (let k = 0; k < 5000; k++) {
  const inp = { qty: 1 + r(20), buy: r(20000), shipMode: r(2) ? 'unit' : 'total', ship: r(3000), pack: r(300), other: r(1000),
    feeFixed: r(150), feeRate: r(2000), chargeRate: r(3000) };
  const target = r(2000), p = priceForProfit(inp, target), goal = inp.qty * target;
  if (saleAt(inp, p).profit < goal || (p > 0 && saleAt(inp, p - 1).profit >= goal)) bad++;
}
eq('propriété prix minimal (5000 cas)', bad, 0);

// 9. Bénéfice brut / net, marge et ROI (achat 10 €, frais 0,70 € + 5 %, cotisations 12,30 %, vente 30 €)
i = { ...base, buy: 1000, feeFixed: 70, feeRate: 500, chargeRate: 1230 };
s = saleAt(i, 3000);
eq('brut = CA − coût', [s.revenue, s.gross, s.grossUnit], [3000, 2000, 2000]);
eq('net = brut − frais − cotisations', s.gross - s.fees - s.charges, s.profit);
eq('marge nette et ROI', [s.margin, s.roi], [47.03, 141.1]);
// lot de 3 sans frais : brut = net
i = { ...base, qty: 3, buy: 500, ship: 600, pack: 50, other: 90 };
s = saleAt(i, 1200); eq('lot : brut = net sans frais', [s.gross, s.grossUnit, s.profit], [1260, 420, 1260]);
// vente à perte : achat 10 €, vente 8 €
s = saleAt({ ...base, buy: 1000 }, 800); eq('perte', [s.gross, s.profit, s.margin, s.roi], [-200, -200, -25, -20]);

// 10. Prix minimum de vente (achat 20 €, frais 0,70 € + 5 %)
i = { ...base, buy: 2000, feeFixed: 70, feeRate: 500 };
eq('prix minimum pour 3 € de bénéfice', [minimumPrice(i, 300), saleAt(i, 2495).profit, saleAt(i, 2494).profit], [2495, 300, 299]);
eq('seuil de rentabilité', [breakEven(i), saleAt(i, 2179).profit, saleAt(i, 2178).profit], [2179, 0, -1]);
eq('analyse : seuil + prix minimum + vente', (({ breakEven: b, minPrice, sale }) => [b, minPrice, sale.profit])(analyse(i, 3000, 300)), [2179, 2495, 3000 - (70 + 150) - 2000]);
eq('prix minimum sans bénéfice souhaité = seuil', analyse(i).minPrice, analyse(i).breakEven);
eq('prix minimum impossible (taux ≥ 100 %)', minimumPrice({ ...i, feeRate: 10000 }, 100), null);
const need = [100, 200, 300, 500, 1000].map((g) => minimumPrice(i, g));
eq('prix pour 1, 2, 3, 5, 10 € (croissants)', [need, need.every((p, k) => k === 0 || p > need[k - 1])], [need, true]);

// 11. Comparaison de prix
eq('prix autour de 20 €', priceSteps(2000), [1800, 1900, 2000, 2100, 2200]);
eq('petits prix sans doublon', [priceSteps(3), priceSteps(1)], [[3], [1]]);
eq('écarts personnalisés', priceSteps(1000, [-2000, 0]), [800, 1000]);
i = { ...base, buy: 1000 };
eq('scénarios', scenarios(i, [800, 1000, 2000]).map((x) => [x.price, x.profit, x.margin]), [[800, -200, -25], [1000, 0, 0], [2000, 1000, 50]]);

// 12. Propriétés (3 000 cas) : net = brut − frais − cotisations ; brut croissant ; net croissant à (quantité + 1) centimes près
//     (les frais sont arrondis par vente, comme sur une facture : un centime de plus au prix peut déplacer l'arrondi des frais)
let bad2 = 0;
for (let k = 0; k < 3000; k++) {
  const inp = { qty: 1 + r(20), buy: r(20000), shipMode: r(2) ? 'unit' : 'total', ship: r(3000), pack: r(300), other: r(1000), feeFixed: r(150), feeRate: r(2000), chargeRate: r(3000) };
  const p = 1 + r(60000), a1 = saleAt(inp, p), a2 = saleAt(inp, p + 1 + r(500));
  if (a1.profit !== a1.gross - a1.fees - a1.charges || a2.profit < a1.profit - (inp.qty + 1) || a2.gross < a1.gross) bad2++;
}
eq('net = brut − frais − cotisations ; brut et net croissants avec le prix (3000 cas)', bad2, 0);
console.log(fail ? `\n${fail} test(s) en échec` : '\nTous les tests passent');
process.exit(fail ? 1 : 0);
