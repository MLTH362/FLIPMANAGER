/* Calculateur de bénéfices : saisie -> finance.js -> affichage instantané. */
import { getState, saveArticle } from '../core/store.js';
import { analyse, saleAt, priceForProfit, priceSteps, scenarios } from '../core/finance.js';
import { toCents } from '../core/validators.js';
import { money, fromCents, symbol, pct } from '../utils/format.js';
import { esc } from '../utils/dom.js';
import { pageHeader, emptyState, field, selectField, toast, refreshIcons } from '../components/ui.js';

const SHIP_MODES = ['Total pour la commande', 'Montant par unité'];

export function calculatorPage(view) {
  const st = getState(), cur = st.settings.currency, sym = symbol(cur), fmt = (c) => money(c, cur);
  const tone = (c) => (c > 0 ? 'pos' : c < 0 ? 'neg' : '');
  const cr = st.settings.chargeRate, mk = st.settings.market; // frais et bénéfice minimum : mêmes réglages que l'étude de marché
  const z = (c) => (c ? fromCents(c) : '');

  view.innerHTML = pageHeader('Calculateur de bénéfices', 'Tous les résultats se mettent à jour instantanément.') + `
    <div class="calc"><form id="cf" class="card" novalidate autocomplete="off">
      ${selectField({ label: 'Charger un article', name: 'article', options: st.articles.map((a) => ({ value: a.id, label: a.name })), blank: 'Saisie libre', full: true })}
      <h3 class="sub">Achat</h3><div class="form-grid">
        ${field({ label: `Prix d’achat unitaire (${sym})`, name: 'buy', placeholder: '0,00', inputmode: 'decimal', required: true })}
        ${field({ label: 'Quantité achetée', name: 'qty', value: '1', inputmode: 'numeric', hint: 'Toutes les unités sont supposées revendues au même prix.' })}
        ${field({ label: `Livraison fournisseur (${sym})`, name: 'ship', placeholder: '0,00', inputmode: 'decimal' })}
        ${selectField({ label: 'La livraison saisie est un…', name: 'shipMode', options: SHIP_MODES })}
        ${field({ label: `Emballage, par unité (${sym})`, name: 'pack', placeholder: '0,00', inputmode: 'decimal' })}
        ${field({ label: `Autres frais, total (${sym})`, name: 'other', placeholder: '0,00', inputmode: 'decimal' })}</div>
      <h3 class="sub">Vente</h3><div class="form-grid">
        ${field({ label: `Prix de vente unitaire envisagé (${sym})`, name: 'price', placeholder: '0,00', inputmode: 'decimal', full: true })}
        ${field({ label: `Frais de vente fixes, par vente (${sym})`, name: 'feeFixed', placeholder: '0,00', inputmode: 'decimal', value: z(mk.feeFixed), hint: 'Repris de vos réglages (Étude de marché) ; modifiable ici pour tester. Vide = aucun frais.' })}
        ${field({ label: 'Frais de vente (% du prix)', name: 'feeRate', value: z(mk.feeRate), placeholder: '0', inputmode: 'decimal', hint: 'Aucun taux n’est inventé : seulement celui que vous avez renseigné.' })}
        ${field({ label: 'Cotisations ou charges (% du chiffre d’affaires)', name: 'chargeRate', value: cr ? fromCents(cr) : '', placeholder: '0', inputmode: 'decimal', full: true, hint: 'Seulement si elles s’appliquent à votre situation.' })}
        ${field({ label: `Bénéfice minimum souhaité, par unité (${sym})`, name: 'minProfit', value: z(mk.minProfit), placeholder: '0,00', inputmode: 'decimal', hint: 'Sert au prix minimum de vente.' })}
        ${field({ label: `Objectif personnalisé, par unité (${sym})`, name: 'goal', placeholder: '0,00', inputmode: 'decimal' })}
        ${field({ label: 'Autres prix à comparer', name: 'prices', placeholder: '15 ; 18,50 ; 22', full: true, hint: 'Séparés par des points-virgules (8 maximum). Les prix autour du prix saisi (±5 %, ±10 %) sont ajoutés automatiquement.' })}</div></form>
      <div id="out" style="display:grid;gap:16px;align-content:start"></div></div>`;

  const form = view.querySelector('#cf'), out = view.querySelector('#out');
  const g = (n) => form.elements[n].value.trim();
  let model = null; // dernier calcul valide

  function read() {
    const errors = {};
    const amount = (n) => { const s = g(n); if (!s) return 0; const c = toCents(s); if (Number.isNaN(c)) { errors[n] = 'Montant invalide (exemple : 12,50).'; return null; } return c; };
    const rate = (n) => { const s = g(n); if (!s) return 0; const c = toCents(s); if (Number.isNaN(c) || c > 10000) { errors[n] = 'Taux invalide (de 0 à 100, exemple : 12,3).'; return null; } return c; };
    let qty = g('qty') || '1';
    if (!/^\d+$/.test(qty) || +qty < 1 || +qty > 100000) { errors.qty = 'Entier entre 1 et 100 000.'; qty = null; } else qty = +qty;
    const inp = { qty, buy: g('buy') ? amount('buy') : null, shipMode: g('shipMode') === SHIP_MODES[1] ? 'unit' : 'total',
      ship: amount('ship'), pack: amount('pack'), other: amount('other'), feeFixed: amount('feeFixed'), feeRate: rate('feeRate'), chargeRate: rate('chargeRate') };
    const price = g('price') ? amount('price') : null, goal = g('goal') ? amount('goal') : null, minProfit = amount('minProfit');
    const prices = [];
    for (const part of g('prices').split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
      const c = toCents(part);
      if (Number.isNaN(c) || c <= 0) { errors.prices = `Prix invalide : « ${part} » (exemple : 15 ; 18,50).`; break; }
      prices.push(c);
    }
    if (prices.length > 8) errors.prices = '8 prix maximum.';
    if (inp.feeRate != null && inp.chargeRate != null && inp.feeRate + inp.chargeRate >= 10000) errors.chargeRate = 'Le total des taux doit rester inférieur à 100 %.';
    const ready = !Object.keys(errors).length && inp.buy != null && Object.values(inp).every((v) => v !== null);
    return { inp, price, goal, minProfit, prices, errors, ready };
  }

  const metric = (label, value, hint = '', cls = '') => `<div class="metric"><span>${label}</span><strong class="${cls}">${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`;

  function calc() {
    const { inp, price, goal, minProfit, prices, errors, ready } = read();
    form.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid'));
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errors[el.dataset.err] || ''; if (errors[el.dataset.err]) el.parentElement.classList.add('invalid'); });
    if (!ready) { model = null; out.innerHTML = `<div class="card">${emptyState('calculator', 'Renseignez le prix d’achat', 'Les résultats apparaissent dès que les montants sont valides.')}</div>`; refreshIcons(out); return; }

    const a = analyse(inp, price, minProfit), s = a.sale, minM = st.settings.minMargin;
    model = { inp, price };
    const goals = [...st.settings.goals, ...(goal != null && !st.settings.goals.includes(goal) ? [goal] : [])];
    const rows = goals.map((b) => { const p = priceForProfit(inp, b); const r = p == null ? null : saleAt(inp, p);
      return `<tr><td>${fmt(b)}${b === goal ? ' <span class="badge b-grey">perso</span>' : ''}</td><td class="num"><strong>${p == null ? '—' : fmt(p)}</strong></td>
        <td class="num ${tone(r?.profitUnit)}">${r ? fmt(r.profitUnit) : '—'}</td><td class="num">${r ? pct(r.margin) : '—'}</td><td class="num">${r ? pct(r.roi) : '—'}</td>
        <td class="num">${p == null ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-apply="${p}">Appliquer</button>`}</td></tr>`; }).join('');

    const all = [...new Set([...(price != null ? priceSteps(price) : []), ...prices])].sort((x, y) => x - y);
    const cmp = scenarios(inp, all).map((r) => `<tr class="${r.price === price ? 'cur' : ''}"><td>${fmt(r.price)}${r.price === price ? ' <span class="badge b-gold">saisi</span>' : ''}${a.breakEven != null && r.price < a.breakEven ? ' <span class="badge b-grey">perte</span>' : ''}</td>
        <td class="num ${tone(r.grossUnit)}">${fmt(r.grossUnit)}</td><td class="num ${tone(r.profitUnit)}">${fmt(r.profitUnit)}</td><td class="num">${pct(r.margin)}</td><td class="num">${pct(r.roi)}</td>
        <td class="num"><button type="button" class="btn btn-ghost btn-sm" data-apply="${r.price}">Appliquer</button></td></tr>`).join('');
    const warns = [];
    if (s && s.profit < 0) warns.push('À ce prix, vous perdriez de l’argent.');
    else if (s && minProfit > 0 && s.profitUnit < minProfit) warns.push(`Ce prix n’atteint pas votre bénéfice minimum souhaité (${fmt(minProfit)} par unité).`);
    if (s && minM > 0 && s.margin != null && s.margin * 100 < minM) warns.push(`Marge inférieure à votre minimum de ${pct(minM / 100)}.`);

    out.innerHTML = `
      <div class="card kpi-hero"><div class="kpi-top"><span>${s ? 'Bénéfice net estimé' : 'Seuil de rentabilité (bénéfice nul)'}</span></div>
        <div class="hero-num ${s ? tone(s.profit) : ''}">${s ? fmt(s.profit) : a.breakEven == null ? '—' : fmt(a.breakEven)}</div>
        <div class="muted">${s ? (inp.qty > 1 ? `soit ${fmt(s.profitUnit)} par unité, pour ${inp.qty} unités` : 'pour cette vente, après frais de vente et cotisations')
          : 'Saisissez un prix de vente pour estimer le bénéfice.'}</div>
        ${warns.map((w) => `<div class="warn">${w}</div>`).join('')}</div>
      <div class="card"><div class="metrics">
        ${metric('Coût total', fmt(a.totalCost), 'achat, livraison, emballage et autres frais')}
        ${metric('Coût unitaire', fmt(a.unitCost), 'coût total ÷ quantité')}
        ${metric('Chiffre d’affaires', s ? fmt(s.revenue) : '—', 'prix de vente × quantité')}
        ${metric('Bénéfice brut', s ? fmt(s.gross) : '—', 'chiffre d’affaires − coût total', s ? tone(s.gross) : '')}
        ${metric('Frais de vente', s ? fmt(s.fees) : '—')}
        ${metric('Cotisations / charges', s ? fmt(s.charges) : '—')}
        ${metric('Bénéfice net estimé', s ? fmt(s.profit) : '—', 'brut − frais de vente − cotisations', s ? tone(s.profit) : '')}
        ${metric('Marge nette', s ? pct(s.margin) : '—', 'bénéfice net ÷ chiffre d’affaires')}
        ${metric('Retour sur investissement', s ? pct(s.roi) : '—', 'bénéfice net ÷ coût total')}
        ${metric('Seuil de rentabilité', a.breakEven == null ? '—' : fmt(a.breakEven), 'prix unitaire à partir duquel vous ne perdez plus')}
        ${metric('Prix minimum de vente', a.minPrice == null ? '—' : fmt(a.minPrice), minProfit > 0 ? `pour ${fmt(minProfit)} de bénéfice net par unité` : 'définissez un bénéfice minimum souhaité')}</div>
        ${s && price != null && form.elements.article.value ? '<button type="button" class="btn btn-ghost btn-sm" id="saveprice" style="margin-top:16px"><i data-lucide="save"></i>Enregistrer ce prix dans l’article</button>' : ''}</div>
      <div class="card"><div class="card-title"><h2>Comparer plusieurs prix</h2><span>Résultats par unité</span></div>
        ${cmp ? `<table><thead><tr><th>Prix de vente</th><th class="num">Bénéfice brut</th><th class="num">Bénéfice net</th><th class="num">Marge</th><th class="num">ROI</th><th></th></tr></thead><tbody>${cmp}</tbody></table>`
          : '<p class="muted">Saisissez un prix de vente, ou une liste de prix à comparer.</p>'}</div>
      <div class="card"><div class="card-title"><h2>Simulateur d’objectifs</h2><span>Prix de vente nécessaire, par unité</span></div>
        <table><thead><tr><th>Bénéfice visé</th><th class="num">Prix à afficher</th><th class="num">Bénéfice</th><th class="num">Marge</th><th class="num">ROI</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <p class="note">Les prix affichés sont calculés avec les frais et taux saisis ci-contre, arrondis au centime supérieur. Ce sont des estimations : un prix affiché n’est pas forcément un prix payé par l’acheteur.</p></div>`;
    refreshIcons(out);
  }

  form.addEventListener('input', calc);
  form.elements.article.addEventListener('change', () => {
    const a = st.articles.find((x) => x.id === form.elements.article.value); if (!a) return;
    const split = a.feeShip !== undefined; // anciens articles : frais regroupés, repris dans « Autres frais »
    form.elements.buy.value = fromCents(a.buyPrice); form.elements.qty.value = '1'; form.elements.shipMode.value = SHIP_MODES[1];
    form.elements.ship.value = split ? z(a.feeShip) : ''; form.elements.pack.value = split ? z(a.feePack) : ''; form.elements.other.value = split ? z(a.feeOther) : z(a.fees);
    form.elements.price.value = a.targetPrice == null ? '' : fromCents(a.targetPrice);
    calc(); if (!split) toast('Les frais de cet article sont repris dans « Autres frais ».');
  });
  out.addEventListener('click', async (e) => {
    const ap = e.target.closest('[data-apply]');
    if (ap) { form.elements.price.value = fromCents(+ap.dataset.apply); calc(); return; }
    if (e.target.closest('#saveprice') && model) {
      const a = st.articles.find((x) => x.id === form.elements.article.value);
      try { await saveArticle({ ...a, targetPrice: model.price, updatedAt: new Date().toISOString() }); toast('Prix envisagé enregistré'); }
      catch (err) { console.error(err); toast('Enregistrement impossible : ' + err.message); }
    }
  });
  calc();
}
