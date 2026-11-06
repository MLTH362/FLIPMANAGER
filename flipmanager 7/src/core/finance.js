/* Formules financières. Fonctions pures, aucun accès au DOM.
   Tous les montants sont des centimes ENTIERS ; les taux sont en centièmes de pour cent (12,30 % = 1230).
   Arrondi : au centime le plus proche (0,5 vers le haut), uniquement là où une division est inévitable
   (frais en %, cotisations, coût unitaire), comme le ferait une facture réelle.

   inp = { qty, buy, shipMode: 'total'|'unit', ship, pack, other, feeFixed, feeRate, chargeRate }
     qty        quantité achetée (entier >= 1), toutes les unités sont supposées revendues au même prix
     buy        prix d'achat par unité
     ship       livraison fournisseur : total de la commande ('total') ou par unité ('unit')
     pack       emballage par unité
     other      autres frais, total
     feeFixed   frais de vente fixes par vente      feeRate    frais de vente en % du prix
     chargeRate cotisations / charges en % du chiffre d'affaires */

export const roundDiv = (a, b) => Math.floor((2 * a + b) / (2 * b));   // a/b arrondi au plus proche
const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);                  // a,b >= 0
const pct = (a, b) => (b > 0 || b < 0 ? roundDiv(a * 10000, b) / 100 : null); // a/b en %, 2 décimales

export function costs(inp) {
  const shipTotal = inp.shipMode === 'unit' ? inp.ship * inp.qty : inp.ship;
  const totalCost = inp.buy * inp.qty + shipTotal + inp.pack * inp.qty + inp.other;
  return { shipTotal, totalCost, unitCost: roundDiv(totalCost, inp.qty) };
}

/* Résultat si chaque unité est vendue au prix `price` (centimes). */
export function saleAt(inp, price) {
  const { totalCost } = costs(inp);
  const revenue = price * inp.qty;
  const fees = (inp.feeFixed + roundDiv(price * inp.feeRate, 10000)) * inp.qty; // arrondi par vente
  const charges = roundDiv(revenue * inp.chargeRate, 10000);
  const profit = revenue - fees - charges - totalCost;
  const gross = revenue - totalCost; // bénéfice brut : avant frais de vente et cotisations
  return { revenue, gross, grossUnit: roundDiv(gross, inp.qty), fees, charges, profit, profitUnit: roundDiv(profit, inp.qty),
    margin: pct(profit, revenue),   // bénéfice / chiffre d'affaires
    roi: pct(profit, totalCost) };  // bénéfice / coût total
}

/* Prix unitaire (centimes) qui atteint un bénéfice >= targetUnit par unité, alors qu'un centime de moins ne l'atteint pas.
   null si impossible (taux >= 100 %). */
export function priceForProfit(inp, targetUnit) {
  const k = 10000 - inp.feeRate - inp.chargeRate;
  if (k <= 0) return null;
  const { totalCost } = costs(inp);
  let p = ceilDiv((totalCost + inp.qty * (inp.feeFixed + targetUnit)) * 10000, inp.qty * k); // solution exacte sans arrondis
  const goal = inp.qty * targetUnit;
  for (let i = 0; i < 50 && saleAt(inp, p).profit < goal; i++) p++;            // corrige l'effet des arrondis
  for (let i = 0; i < 50 && p > 0 && saleAt(inp, p - 1).profit >= goal; i++) p--;
  return p;
}

export const breakEven = (inp) => priceForProfit(inp, 0);

/* Prix de vente minimum = plus petit prix unitaire donnant au moins `minProfit` de bénéfice net par unité. */
export const minimumPrice = (inp, minProfit = 0) => priceForProfit(inp, minProfit);

/* Prix à tester autour d'un prix : écarts en centièmes de % (−10 %, −5 %, 0, +5 %, +10 %), sans doublon, > 0. */
export const priceSteps = (price, deltas = [-1000, -500, 0, 500, 1000]) =>
  [...new Set(deltas.map((d) => roundDiv(price * (10000 + d), 10000)))].filter((p) => p > 0).sort((a, b) => a - b);

/* Résultat pour chaque prix de la liste (comparaison côte à côte). */
export const scenarios = (inp, prices) => prices.map((price) => ({ price, ...saleAt(inp, price) }));

export function analyse(inp, price = null, minProfit = 0) {
  return { ...costs(inp), breakEven: breakEven(inp), minPrice: minimumPrice(inp, minProfit), sale: price == null ? null : saleAt(inp, price) };
}
