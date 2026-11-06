/* Étude de marché : statistiques de prix, référence de marché, trois stratégies et rentabilité.
   Fonctions pures ; montants en centimes entiers ; taux en centièmes de pour cent (5 % = 500).
   Les prix saisis sont des prix AFFICHÉS par des vendeurs, pas des prix réellement payés. */
import { roundDiv, saleAt, priceForProfit } from './finance.js';
import { CONDITIONS } from './constants.js';

export const DEFAULT_MARKET = {
  posCompetitive: -500,   // prix compétitif : 5 % sous la référence
  posBalanced: 0,         // prix équilibré : à la référence
  posMaximizing: 1000,    // prix maximisant le bénéfice : 10 % au-dessus
  weightSimilar: 50,      // poids (en %) d'une annonce « Similaire » ; « Très similaire » = 100 %
  minComparables: 3,      // en dessous : « Données insuffisantes »
  feeFixed: 0, feeRate: 0, // frais de vente : AUCUN par défaut, à renseigner par l'utilisateur
  minProfit: 0,           // bénéfice minimum souhaité, par article
};
export const PROFIT_STEPS = [100, 200, 300, 500, 1000]; // 1, 2, 3, 5 et 10 €
const CLOSE_TO_MARKET = 90; // coût >= 90 % de la référence : achat probablement peu intéressant

const sorted = (prices) => [...prices].sort((a, b) => a - b);

/* Percentile p (0-100) par interpolation linéaire, en arithmétique entière, arrondi au centime. */
export function percentile(prices, p) {
  const a = sorted(prices), n = a.length;
  if (!n) return null;
  const rank = p * (n - 1), lo = Math.floor(rank / 100), rem = rank % 100, hi = Math.min(lo + 1, n - 1);
  return roundDiv(a[lo] * (100 - rem) + a[hi] * rem, 100);
}

export function stats(prices) {
  const a = sorted(prices), n = a.length;
  if (!n) return null;
  const sum = a.reduce((t, x) => t + x, 0);
  return { n, mean: roundDiv(sum, n), median: percentile(a, 50), min: a[0], max: a[n - 1] };
}

/* Moyenne pondérée : items = [{ price, weight }] (poids entiers). */
export function weightedMean(items) {
  const w = items.reduce((t, x) => t + x.weight, 0);
  return w > 0 ? roundDiv(items.reduce((t, x) => t + x.price * x.weight, 0), w) : null;
}

/* Prix de référence = moyenne de la médiane et de la moyenne pondérée. */
export const referencePrice = (median, wMean) => (median == null || wMean == null ? null : roundDiv(median + wMean, 2));

/* Prix à partir de la référence et d'un écart en centièmes de % (−500 = −5 %). */
export const positioned = (ref, pos) => roundDiv(ref * (10000 + pos), 10000);

export const conditionGroup = (c) => (!c ? 'unknown' : String(c).startsWith('Neuf') ? 'new' : 'used');
const validPrice = (c) => Number.isInteger(c.price) && c.price > 0;

/* Coût de revient PAR ARTICLE = achat + livraison attribuée + emballage + autres dépenses.
   La livraison de la commande est répartie sur les `qty` exemplaires (arrondie au centime). */
export function costOfGoods({ buy = 0, ship = 0, qty = 1, pack = 0, other = 0 }) {
  const shipEach = roundDiv(ship, Math.max(1, qty));
  return { shipEach, cost: buy + shipEach + pack + other };
}

const feeInput = (cost, m) => ({ qty: 1, buy: cost, shipMode: 'total', ship: 0, pack: 0, other: 0, feeFixed: m.feeFixed, feeRate: m.feeRate, chargeRate: 0 });

/* Résultat de vente à un prix donné, pour un coût de revient donné. */
export function evaluate(price, cost, m = DEFAULT_MARKET) {
  const r = saleAt(feeInput(cost, m), price);
  return { price, profitBeforeFees: price - cost, fees: r.fees, net: r.profit, margin: r.margin, roi: r.roi };
}

/* Seuils de prix : rentabilité, prix minimum (bénéfice minimum souhaité) et prix pour 1/2/3/5/10 €. */
export function thresholds(cost, m = DEFAULT_MARKET) {
  const inp = feeInput(cost, m);
  return { breakEven: priceForProfit(inp, 0), minPrice: priceForProfit(inp, m.minProfit),
    steps: PROFIT_STEPS.map((gain) => ({ gain, price: priceForProfit(inp, gain) })) };
}

/* Analyse complète d'une étude.
   list = comparables ; opts = { market, myCondition, cost|null, overrides: {competitive?, balanced?, maximizing?} } */
export function analyse(list, { market = DEFAULT_MARKET, myCondition = '', cost = null, overrides = {} } = {}) {
  const m = { ...DEFAULT_MARKET, ...market };
  const sim = (c) => c.similarity || 'Similaire'; // anciens comparables sans niveau : « Similaire »
  const myGroup = conditionGroup(myCondition);
  const counts = { total: list.length, noPrice: 0, low: 0, otherState: 0, veryClose: 0, close: 0 };
  const valid = list.filter((c) => (validPrice(c) ? true : (counts.noPrice++, false)));
  const main = [];
  for (const c of valid) {
    if (sim(c) === 'Peu similaire') { counts.low++; continue; }
    const g = conditionGroup(c.condition);
    if (myGroup !== 'unknown' && g !== 'unknown' && g !== myGroup) { counts.otherState++; continue; }
    if (sim(c) === 'Très similaire') counts.veryClose++; else counts.close++;
    main.push({ price: c.price, weight: sim(c) === 'Très similaire' ? 100 : m.weightSimilar, condition: c.condition });
  }
  const mainStats = stats(main.map((x) => x.price));
  const allStats = stats(valid.map((c) => c.price)); // statistiques secondaires : tout, « Peu similaire » compris
  const warnings = [];
  const groups = new Set(main.map((x) => conditionGroup(x.condition)));
  const ranks = main.filter((x) => x.condition).map((x) => CONDITIONS.indexOf(x.condition));
  if ((groups.has('new') && groups.has('used')) || (ranks.length > 1 && Math.max(...ranks) - Math.min(...ranks) >= 3))
    warnings.push({ level: 'warn', text: 'Les annonces retenues ont des états très différents (neuf et occasion, ou écart important) : la référence est moins fiable.' });
  if (myGroup === 'unknown' && groups.has('new') && groups.has('used'))
    warnings.push({ level: 'warn', text: 'Indiquez l’état de votre article pour écarter les annonces d’un état incompatible.' });

  const base = { counts: { ...counts, used: main.length }, main: mainStats, all: allStats, median: null, weightedMean: null, reference: null,
    insufficient: main.length < m.minComparables, prices: null, rows: null, thresholds: null, warnings, market: m };
  if (base.insufficient) { warnings.unshift({ level: 'bad', text: 'Données insuffisantes' }); return base; }

  const median = mainStats.median, wMean = weightedMean(main), reference = referencePrice(median, wMean);
  const auto = { competitive: positioned(reference, m.posCompetitive), balanced: positioned(reference, m.posBalanced), maximizing: positioned(reference, m.posMaximizing) };
  const prices = Object.fromEntries(Object.keys(auto).map((k) => [k, Number.isInteger(overrides[k]) && overrides[k] > 0 ? overrides[k] : auto[k]]));
  const pos = (p) => roundDiv((p - reference) * 10000, reference) / 100; // écart à la référence, en %
  const rows = {};
  for (const k of Object.keys(prices)) {
    const p = prices[k];
    rows[k] = { price: p, auto: auto[k], manual: p !== auto[k], vsReference: pos(p), cheaperThan: main.filter((x) => x.price > p).length,
      ...(cost == null ? {} : evaluate(p, cost, m)) };
  }
  let th = null;
  if (cost != null) {
    th = thresholds(cost, m);
    for (const [k, label] of [['competitive', 'compétitif'], ['balanced', 'équilibré'], ['maximizing', 'maximisant le bénéfice']]) {
      if (th.breakEven != null && prices[k] < th.breakEven) warnings.push({ level: 'bad', text: `Le prix ${label} est sous le seuil de rentabilité : vous perdriez de l’argent.` });
    }
    if (m.minProfit > 0 && rows.competitive.net < m.minProfit) warnings.push({ level: 'warn', text: 'Le prix compétitif n’atteint pas votre bénéfice minimum souhaité.' });
    if (cost >= reference) warnings.push({ level: 'bad', text: 'Votre coût de revient atteint ou dépasse la référence du marché : l’achat n’est probablement pas intéressant.' });
    else if (cost * 100 >= reference * CLOSE_TO_MARKET) warnings.push({ level: 'warn', text: 'Votre coût de revient est très proche des prix du marché : l’achat n’est probablement pas intéressant.' });
  }
  return { ...base, median, weightedMean: wMean, reference, prices, rows, thresholds: th };
}
