/* Tests de l'étude de marché : `npm test`. */
import { stats, percentile, weightedMean, referencePrice, positioned, costOfGoods, evaluate, thresholds, analyse, DEFAULT_MARKET } from '../src/core/market.js';
import { saleAt } from '../src/core/finance.js';
import { validateComparable, validateMarketSettings } from '../src/core/validators.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };

/* ---- statistiques de base ---- */
eq('stats (3 prix)', stats([1500, 1000, 1200]), { n: 3, mean: 1233, median: 1200, min: 1000, max: 1500 });
eq('médiane paire', stats([1000, 2000, 3000, 4000]).median, 2500);
eq('liste vide', [stats([]), percentile([], 50), weightedMean([])], [null, null, null]);
eq('moyenne pondérée', weightedMean([{ price: 2000, weight: 100 }, { price: 3000, weight: 50 }]), 2333);
eq('référence = moyenne médiane/pondérée', referencePrice(2000, 2100), 2050);
eq('positionnement −5 % / 0 / +10 %', [positioned(2000, -500), positioned(2000, 0), positioned(2000, 1000)], [1900, 2000, 2200]);

/* ---- coût de revient par article ---- */
eq('coût de revient (livraison répartie)', costOfGoods({ buy: 1000, ship: 1000, qty: 3, pack: 50, other: 20 }), { shipEach: 333, cost: 1403 });
eq('coût de revient simple', costOfGoods({ buy: 1000 }).cost, 1000);

/* ---- analyse : jeu de données chiffré ---- */
const C = (price, similarity, condition = '') => ({ price, similarity, condition });
const list = [C(2000, 'Très similaire'), C(2200, 'Très similaire'), C(2400, 'Similaire'), C(1800, 'Similaire'), C(5000, 'Peu similaire'), C(0, 'Très similaire')];
const a = analyse(list, { cost: 1200 });
eq('comptage : retenues / exclues', [a.counts.used, a.counts.low, a.counts.noPrice], [4, 1, 1]);
eq('médiane, moyenne pondérée, référence', [a.median, a.weightedMean, a.reference], [2100, 2100, 2100]);
eq('3 prix recommandés', [a.prices.competitive, a.prices.balanced, a.prices.maximizing], [1995, 2100, 2310]);
eq('bénéfices nets (sans frais)', [a.rows.competitive.net, a.rows.balanced.net, a.rows.maximizing.net], [795, 900, 1110]);
eq('marge et ROI du prix compétitif', [a.rows.competitive.margin, a.rows.competitive.roi], [39.85, 66.25]);
eq('positionnement', [a.rows.competitive.vsReference, a.rows.maximizing.vsReference, a.rows.balanced.cheaperThan], [-5, 10, 2]);
eq('statistiques secondaires incluent « Peu similaire »', [a.all.n, a.all.max, a.main.max], [5, 5000, 2400]);
eq('aucune alerte pour un achat rentable', a.warnings, []);
eq('sans coût : pas de rentabilité', [analyse(list).rows.balanced.net, analyse(list).thresholds], [undefined, null]);

/* ---- poids : « Similaire » compte moins ---- */
const w = analyse([C(1000, 'Très similaire'), C(1000, 'Très similaire'), C(3000, 'Similaire')], { market: { weightSimilar: 50 } });
eq('moyenne pondérée tirée vers les très similaires', [w.median, w.weightedMean], [1000, 1400]);
eq('poids modifiable', analyse([C(1000, 'Très similaire'), C(1000, 'Très similaire'), C(3000, 'Similaire')], { market: { weightSimilar: 100 } }).weightedMean, 1667);

/* ---- données insuffisantes ---- */
const few = analyse([C(1000, 'Très similaire'), C(1200, 'Similaire')], { cost: 500 });
eq('données insuffisantes : aucune recommandation', [few.insufficient, few.prices, few.warnings[0].text], [true, null, 'Données insuffisantes']);
eq('annonces « Peu similaire » ne comptent pas', analyse([C(1000, 'Très similaire'), C(1000, 'Très similaire'), C(900, 'Peu similaire')]).insufficient, true);
eq('seuil réglable', analyse([C(1000, 'Très similaire'), C(1200, 'Similaire')], { market: { minComparables: 2 } }).insufficient, false);

/* ---- anciens comparables sans niveau = « Similaire » ---- */
eq('ancien comparable', analyse([{ price: 1000 }, { price: 1100 }, { price: 1200 }]).counts.close, 3);

/* ---- état : neuf / occasion ---- */
const mixed = [C(2000, 'Très similaire', 'Bon état'), C(2200, 'Très similaire', 'Très bon état'), C(2100, 'Très similaire', 'Bon état'), C(4000, 'Très similaire', 'Neuf avec étiquette')];
const mine = analyse(mixed, { myCondition: 'Bon état' });
eq('état connu : neuf écarté', [mine.counts.used, mine.counts.otherState, mine.main.max], [3, 1, 2200]);
const unknown = analyse(mixed);
eq('état inconnu : tout retenu + avertissement', [unknown.counts.used, unknown.warnings.length], [4, 2]);

/* ---- frais, prix minimum et seuils ---- */
const fees = { ...DEFAULT_MARKET, feeFixed: 70, feeRate: 1000, minProfit: 200 };
const t = thresholds(1000, fees);
eq('prix minimum (frais en % résolus exactement)', t.minPrice, 1411);
eq('minimal : atteint le bénéfice, un centime de moins non', [saleAt({ qty: 1, buy: 1000, shipMode: 'total', ship: 0, pack: 0, other: 0, feeFixed: 70, feeRate: 1000, chargeRate: 0 }, t.minPrice).profit >= 200, evaluate(t.minPrice - 1, 1000, fees).net < 200], [true, true]);
eq('seuil de rentabilité', evaluate(t.breakEven, 1000, fees).net >= 0 && evaluate(t.breakEven - 1, 1000, fees).net < 0, true);
eq('prix pour 1, 2, 3, 5, 10 €', t.steps.map((s) => s.gain), [100, 200, 300, 500, 1000]);
eq('chaque palier atteint son gain', t.steps.every((s) => evaluate(s.price, 1000, fees).net >= s.gain && evaluate(s.price - 1, 1000, fees).net < s.gain), true);
eq('aucun frais par défaut', [DEFAULT_MARKET.feeFixed, DEFAULT_MARKET.feeRate], [0, 0]);
eq('bénéfice avant frais ≠ net', [evaluate(2000, 1000, fees).profitBeforeFees, evaluate(2000, 1000, fees).net], [1000, 730]);

/* ---- alertes de sécurité ---- */
const texts = (r) => r.warnings.map((x) => x.text).join(' | ');
eq('coût au-dessus du marché', /probablement pas intéressant/.test(texts(analyse(list, { cost: 2200 }))), true);
eq('coût proche du marché (≥ 90 %)', analyse(list, { cost: 1950 }).warnings.some((x) => x.level === 'warn' && /très proche/.test(x.text)), true);
eq('prix sous le seuil de rentabilité', analyse(list, { cost: 2000 }).warnings.some((x) => x.level === 'bad' && /compétitif est sous le seuil/.test(x.text)), true);
eq('bénéfice minimum non atteint (compétitif)', analyse(list, { cost: 1200, market: { minProfit: 900 } }).warnings.some((x) => /bénéfice minimum/.test(x.text)), true);

/* ---- ajustement manuel ---- */
const man = analyse(list, { cost: 1200, overrides: { balanced: 2500 } });
eq('prix ajusté à la main', [man.rows.balanced.price, man.rows.balanced.manual, man.rows.balanced.auto, man.rows.balanced.net, man.rows.competitive.manual], [2500, true, 2100, 1300, false]);

/* ---- propriétés (3000 cas) ---- */
let bad = 0; const r = (n) => Math.floor(Math.random() * n), SIM = ['Très similaire', 'Similaire', 'Peu similaire'];
for (let k = 0; k < 3000; k++) {
  const l = Array.from({ length: 3 + r(12) }, () => C(1 + r(50000), SIM[r(3)])), x = analyse(l, { cost: r(20000) });
  if (x.insufficient) { if (x.prices !== null || x.counts.used >= 3) bad++; continue; }
  if (!(x.main.min <= x.reference && x.reference <= x.main.max && x.prices.competitive <= x.prices.balanced && x.prices.balanced <= x.prices.maximizing)) bad++;
}
eq('référence dans [min, max] et prix ordonnés (3000 cas)', bad, 0);

/* ---- validation ---- */
const ok = { study: 'Veste', name: 'Veste noire M', url: 'https://x.fr/a', price: '24,90', condition: 'Bon état', date: '2026-11-05', comment: '' };
eq('comparable valide (similarité par défaut)', [validateComparable(ok).errors, validateComparable(ok).value.price, validateComparable(ok).value.similarity], [{}, 2490, 'Similaire']);
eq('similarité invalide', Object.keys(validateComparable({ ...ok, similarity: 'Identique' }).errors), ['similarity']);
eq('prix nul refusé', Object.keys(validateComparable({ ...ok, price: '0' }).errors), ['price']);
eq('champs obligatoires', Object.keys(validateComparable({ ...ok, study: '', name: '', price: '' }).errors), ['study', 'name', 'price']);
eq('lien invalide', Object.keys(validateComparable({ ...ok, url: 'javascript:alert(1)' }).errors), ['url']);
const okS = { posCompetitive: '-5', posBalanced: '0', posMaximizing: '10', weightSimilar: '50', minComparables: '3', feeFixed: '', feeRate: '', minProfit: '2' };
eq('réglages valides', [validateMarketSettings(okS).errors, validateMarketSettings(okS).value], [{}, { ...DEFAULT_MARKET, minProfit: 200 }]);
eq('réglages : virgule décimale et négatif', validateMarketSettings({ ...okS, posCompetitive: '-7,5' }).value.posCompetitive, -750);
eq('réglages : compétitif > équilibré refusé', Object.keys(validateMarketSettings({ ...okS, posCompetitive: '3' }).errors), ['posCompetitive']);
eq('réglages : valeurs absurdes refusées', Object.keys(validateMarketSettings({ ...okS, weightSimilar: '150', feeRate: '100', minComparables: 'abc' }).errors).sort(), ['feeRate', 'minComparables', 'weightSimilar']);
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);
