/* Module « Étude de marché » : comparables saisis à la main, statistiques, référence de marché,
   3 stratégies de prix et rentabilité. Aucune donnée n'est lue sur Vinted : l'utilisateur recopie
   lui-même les annonces qu'il consulte. Les calculs sont dans core/market.js. */
import { getState, saveComparable, removeComparables, saveMarketSettings } from '../core/store.js';
import { analyse, costOfGoods, DEFAULT_MARKET } from '../core/market.js';
import { validateComparable, validateMarketSettings, toCents } from '../core/validators.js';
import { CONDITIONS, SIMILARITIES } from '../core/constants.js';
import { money, dateFr, fromCents, symbol, today, pct } from '../utils/format.js';
import { esc, uid } from '../utils/dom.js';
import { pageHeader, kpiCard, emptyState, openModal, confirmDialog, field, selectField, textareaField, toast, refreshIcons } from '../components/ui.js';

let selected = null;      // étude affichée : conservée quand on change de page
const manual = new Map(); // prix ajustés à la main, par étude (non enregistrés : simple essai)
const SIM_BADGE = { 'Très similaire': 'b-green', Similaire: 'b-outline', 'Peu similaire': 'b-dim' };
const STRATS = [['competitive', 'Compétitif', 'Prix compétitif', 'Vendre plus facilement et rapidement'],
  ['balanced', 'Équilibré', 'Prix équilibré', 'Compromis entre attractivité et bénéfice'],
  ['maximizing', 'Bénéfice maximal', 'Prix maximisant le bénéfice', 'Meilleure marge, vente probablement plus lente']];
const pl = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const signedPct = (v) => `${v > 0 ? '+' : ''}${pct(v)}`;
const signedText = (c) => (c < 0 ? '-' : '') + fromCents(Math.abs(c)); // centièmes de % → saisie

function showErrors(root, errors) {
  root.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid'));
  root.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errors[el.dataset.err] || ''; if (errors[el.dataset.err]) el.parentElement.classList.add('invalid'); });
}

export function marketPage(view) {
  const st = getState(), cur = st.settings.currency, sym = symbol(cur), fmt = (c) => money(c, cur);
  const tone = (c) => (c > 0 ? 'pos' : c < 0 ? 'neg' : '');
  const studies = () => [...new Set(st.comparables.map((c) => c.study))].sort((a, b) => a.localeCompare(b, 'fr'));
  const items = () => st.comparables.filter((c) => c.study === selected);
  const mk = () => st.settings.market, S = mk();

  view.innerHTML = pageHeader('Étude de marché', 'Comparez des annonces que vous avez consultées pour choisir votre prix.',
    '<button class="btn btn-primary" id="add"><i data-lucide="plus"></i>Ajouter un comparable</button>') + `
    <div class="callout"><i data-lucide="info"></i><div><strong>Les prix saisis sont des prix affichés</strong>, pas forcément des prix réellement payés.
      Saisie manuelle : FLIPMANAGER ne lit pas Vinted et ne contourne aucune protection.</div></div>
    <div id="empty"></div>
    <div id="content" hidden>
      <div class="toolbar"><label for="study" class="muted">Produit étudié</label><select id="study"></select>
        <button class="btn btn-ghost btn-sm" id="delstudy"><i data-lucide="trash-2"></i>Supprimer cette étude</button><span class="count" id="count"></span></div>
      <div class="kpis kpis-auto" id="stats"></div>
      <div id="explain"></div>
      <div class="card" style="margin-bottom:16px" id="costbox"><div class="card-title"><h2>Mon coût de revient</h2><span>Par article</span></div>
        <div class="toolbar"><select id="costart" aria-label="Reprendre les informations d’un article"><option value="">Reprendre un article de « Mes articles »</option>
          ${st.articles.map((a) => `<option value="${a.id}">${esc(a.name)} (${fmt(a.buyPrice + a.fees)})</option>`).join('')}</select></div>
        <div class="form-grid form-grid-3">
          ${field({ label: `Prix d’achat (${sym})`, name: 'c_buy', placeholder: '0,00', inputmode: 'decimal' })}
          ${field({ label: `Livraison fournisseur, total commande (${sym})`, name: 'c_ship', placeholder: '0,00', inputmode: 'decimal' })}
          ${field({ label: 'Quantité dans la commande', name: 'c_qty', value: '1', inputmode: 'numeric' })}
          ${field({ label: `Emballage par article (${sym})`, name: 'c_pack', placeholder: '0,00', inputmode: 'decimal' })}
          ${field({ label: `Autres dépenses par article (${sym})`, name: 'c_other', placeholder: '0,00', inputmode: 'decimal' })}
          ${selectField({ label: 'État de mon article', name: 'c_cond', options: CONDITIONS, blank: 'Non précisé', hint: 'Écarte les annonces neuves/occasion incompatibles.' })}</div>
        <p class="note" id="costline"></p></div>
      <div id="results"></div>
      <details class="card" style="margin-bottom:16px" id="setbox"><summary><strong>Réglages de l’étude</strong> <span class="muted">— pourcentages, pondération, frais de vente, bénéfice minimum</span></summary>
        <form id="setform" novalidate style="margin-top:14px"><div class="form-grid form-grid-3">
          ${field({ label: 'Écart du prix compétitif (%)', name: 'posCompetitive', value: signedText(S.posCompetitive), inputmode: 'decimal' })}
          ${field({ label: 'Écart du prix équilibré (%)', name: 'posBalanced', value: signedText(S.posBalanced), inputmode: 'decimal' })}
          ${field({ label: 'Écart du prix maximal (%)', name: 'posMaximizing', value: signedText(S.posMaximizing), inputmode: 'decimal' })}
          ${field({ label: 'Poids d’une annonce « Similaire » (%)', name: 'weightSimilar', value: String(S.weightSimilar), inputmode: 'numeric', hint: '« Très similaire » compte pour 100 %.' })}
          ${field({ label: 'Minimum d’annonces comparables', name: 'minComparables', value: String(S.minComparables), inputmode: 'numeric', hint: 'En dessous : « Données insuffisantes ».' })}
          ${field({ label: `Bénéfice minimum souhaité (${sym})`, name: 'minProfit', value: S.minProfit ? fromCents(S.minProfit) : '', placeholder: '0,00', inputmode: 'decimal' })}
          ${field({ label: `Frais de vente fixes (${sym})`, name: 'feeFixed', value: S.feeFixed ? fromCents(S.feeFixed) : '', placeholder: '0,00', inputmode: 'decimal', hint: 'Aucun frais n’est supposé : renseignez uniquement ceux qui s’appliquent réellement à vous.' })}
          ${field({ label: 'Frais de vente en % du prix', name: 'feeRate', value: S.feeRate ? signedText(S.feeRate) : '', placeholder: '0', inputmode: 'decimal' })}</div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" id="setreset">Valeurs par défaut</button><button type="submit" class="btn btn-primary">Enregistrer les réglages</button></div></form></details>
      <div class="card"><div class="card-title"><h2>Comparables</h2></div><div id="tbl"></div></div></div>`;

  const $ = (s) => view.querySelector(s), g = (n) => view.querySelector(`[name="${n}"]`).value.trim();

  /* Lit les champs de coût : { cost, line } ou { cost: null } si le prix d'achat n'est pas renseigné. */
  function readCost() {
    const errs = {}, amt = (n) => { const s = g(n); if (!s) return 0; const c = toCents(s); if (Number.isNaN(c)) { errs[n] = 'Montant invalide (exemple : 12,50).'; return 0; } return c; };
    const buy = amt('c_buy'), ship = amt('c_ship'), pack = amt('c_pack'), other = amt('c_other');
    let qty = g('c_qty') || '1';
    if (!/^\d+$/.test(qty) || +qty < 1 || +qty > 100000) { errs.c_qty = 'Entier entre 1 et 100 000.'; qty = 1; } else qty = +qty;
    showErrors($('#costbox'), errs);
    if (Object.keys(errs).length || !g('c_buy')) return { cost: null, line: Object.keys(errs).length ? '' : 'Renseignez le prix d’achat pour calculer bénéfices, marge et ROI.' };
    const r = costOfGoods({ buy, ship, qty, pack, other });
    return { cost: r.cost, line: `Coût de revient par article : <strong>${fmt(r.cost)}</strong> = achat ${fmt(buy)} + livraison attribuée ${fmt(r.shipEach)} + emballage ${fmt(pack)} + autres ${fmt(other)}.` };
  }

  function drawResults() {
    const list = items(), { cost, line } = readCost(), ov = manual.get(selected) || {};
    $('#costline').innerHTML = line;
    const a = analyse(list, { market: mk(), myCondition: g('c_cond'), cost, overrides: ov }), c = a.counts;
    const alerts = a.warnings.map((w) => `<div class="alert alert-${w.level}">${esc(w.text)}</div>`).join('');
    const all = a.all ? `Toutes annonces avec prix valide (peu similaires comprises) : ${pl(a.all.n, 'annonce')}, de ${fmt(a.all.min)} à ${fmt(a.all.max)}, moyenne ${fmt(a.all.mean)}, médiane ${fmt(a.all.median)}.` : '';
    const excl = [c.low && `${pl(c.low, 'annonce')} peu similaire${c.low > 1 ? 's' : ''}`, c.otherState && `${pl(c.otherState, 'annonce')} d’un état incompatible avec le vôtre`, c.noPrice && `${pl(c.noPrice, 'annonce')} sans prix valide`].filter(Boolean);
    $('#stats').innerHTML = a.insufficient || !a.main
      ? kpiCard({ label: 'Annonces retenues', value: String(c.used), icon: 'list-checks', hero: true }) + (a.all ? kpiCard({ label: 'Fourchette (toutes annonces)', value: `${fmt(a.all.min)} – ${fmt(a.all.max)}`, icon: 'arrows-left-right' }) : '')
      : kpiCard({ label: 'Référence de marché', value: fmt(a.reference), icon: 'target', hero: true }) + kpiCard({ label: 'Prix médian', value: fmt(a.median), icon: 'align-center-vertical' }) +
        kpiCard({ label: 'Moyenne pondérée', value: fmt(a.weightedMean), icon: 'scale' }) + kpiCard({ label: 'Prix moyen', value: fmt(a.main.mean), icon: 'sigma' }) +
        kpiCard({ label: 'Minimum', value: fmt(a.main.min), icon: 'arrow-down-to-line' }) + kpiCard({ label: 'Maximum', value: fmt(a.main.max), icon: 'arrow-up-to-line' });
    $('#explain').innerHTML = a.insufficient
      ? `<div class="alert alert-bad" style="margin-bottom:16px"><strong>Données insuffisantes</strong> : ${pl(c.used, 'annonce')} exploitable${c.used > 1 ? 's' : ''} (très similaires ou similaires), ${mk().minComparables} minimum requises. Plutôt qu’une recommandation trompeuse, aucun prix n’est proposé : ajoutez des comparables.${excl.length ? `<br>Écartées : ${excl.join(', ')}.` : ''}</div>`
      : `<div class="callout"><i data-lucide="calculator"></i><div><strong>Référence retenue : ${fmt(a.reference)}</strong> — moyenne de la médiane (${fmt(a.median)}) et de la moyenne pondérée (${fmt(a.weightedMean)}),
        calculées sur ${pl(c.used, 'annonce')} : ${c.veryClose} très similaire${c.veryClose > 1 ? 's' : ''} (poids 100 %) et ${c.close} similaire${c.close > 1 ? 's' : ''} (poids ${mk().weightSimilar} %).
        ${excl.length ? `Exclues du calcul principal : ${excl.join(', ')}. ` : ''}<span class="muted">${all}</span></div></div>`;
    if (a.insufficient) { $('#results').innerHTML = ''; refreshIcons(view); return; }

    const R = a.rows, has = cost != null, dash = '—';
    const cell = (f) => STRATS.map(([k]) => `<td class="num">${f(R[k], k)}</td>`).join('');
    const sgn = (v) => `<span class="${tone(v)}">${fmt(v)}</span>`;
    const just = (r, k) => `Référence ${fmt(a.reference)} ${signedPct(mk()[{ competitive: 'posCompetitive', balanced: 'posBalanced', maximizing: 'posMaximizing' }[k]] / 100)} = ${fmt(r.auto)}${r.manual ? `, ajusté à ${fmt(r.price)}` : ''}.${has ? ` Coût ${fmt(cost)} → bénéfice net ${fmt(r.net)}.` : ''}`;
    const th = a.thresholds;
    $('#results').innerHTML = `${alerts}<div class="card" style="margin-bottom:16px"><div class="card-title"><h2>Trois stratégies de prix</h2><span>Estimations, jamais une garantie de vente</span></div>
      <div style="overflow-x:auto"><table class="cmp"><thead><tr><th>Indicateur</th>${STRATS.map(([, t, , d]) => `<th class="num" title="${esc(d)}">${t}</th>`).join('')}</tr></thead><tbody>
        <tr><td>Prix conseillé <small class="muted">(modifiable)</small></td>${STRATS.map(([k]) => `<td class="num"><input class="price-in" data-strat="${k}" inputmode="decimal" aria-label="Prix ${k}" value="${fromCents(R[k].price)}"> ${sym}</td>`).join('')}</tr>
        <tr><td>Bénéfice avant frais</td>${cell((r) => (has ? sgn(r.profitBeforeFees) : dash))}</tr>
        <tr><td>Bénéfice net estimé</td>${cell((r) => (has ? sgn(r.net) : dash))}</tr>
        <tr><td>Marge nette</td>${cell((r) => (has ? pct(r.margin) : dash))}</tr>
        <tr><td>ROI</td>${cell((r) => (has ? pct(r.roi) : dash))}</tr>
        <tr><td>Positionnement marché</td>${cell((r) => `${signedPct(r.vsReference)}<br><small class="muted">moins cher que ${r.cheaperThan} annonce${r.cheaperThan > 1 ? 's' : ''} sur ${c.used}</small>`)}</tr>
        <tr><td>Justification</td>${STRATS.map(([k]) => `<td class="just">${just(R[k], k)}</td>`).join('')}</tr></tbody></table></div>
      <div class="toolbar" style="margin:12px 0 0">${Object.keys(ov).length ? '<button class="btn btn-ghost btn-sm" id="resetprices">Rétablir les prix calculés</button>' : ''}</div>
      <p class="note">Ce sont des estimations, pas des prédictions : l’application ne garantit jamais qu’un article sera vendu à ce prix.
        ${mk().feeFixed || mk().feeRate ? 'Frais de vente appliqués selon vos réglages.' : 'Aucun frais de vente n’est appliqué : renseignez-les dans les réglages pour obtenir un bénéfice net réaliste.'}
        Pour les cotisations, utilisez le <a class="lnk" href="#/calculateur">calculateur</a>.</p></div>
      ${th ? `<div class="card" style="margin-bottom:16px"><div class="card-title"><h2>Prix minimum et seuils</h2><span>Pour un coût de revient de ${fmt(cost)}</span></div>
        <div class="metrics"><div class="metric"><span>Prix à partir duquel vous ne perdez plus d’argent</span><strong>${th.breakEven == null ? dash : fmt(th.breakEven)}</strong></div>
          <div class="metric"><span>Prix minimum (bénéfice minimum souhaité : ${fmt(mk().minProfit)})</span><strong>${th.minPrice == null ? dash : fmt(th.minPrice)}</strong></div></div>
        <table style="margin-top:14px"><thead><tr><th>Bénéfice net visé</th>${th.steps.map((s) => `<th class="num">${fmt(s.gain)}</th>`).join('')}</tr></thead>
          <tbody><tr><td>Prix nécessaire</td>${th.steps.map((s) => `<td class="num">${s.price == null ? dash : fmt(s.price)}</td>`).join('')}</tr></tbody></table>
        <p class="note">Les frais en pourcentage sont pris en compte exactement : le prix est résolu avec le pourcentage, il n’est pas simplement majoré d’un montant fixe.</p></div>` : ''}`;
    refreshIcons(view);
  }

  function draw() {
    const all = studies();
    $('#empty').innerHTML = all.length ? '' : `<div class="card">${emptyState('search', 'Aucun comparable', 'Ajoutez les annonces similaires que vous avez consultées pour obtenir des prix de référence.')}</div>`;
    $('#content').hidden = !all.length;
    if (!all.length) { selected = null; refreshIcons(view); return; }
    if (!all.includes(selected)) selected = all[0];
    $('#study').innerHTML = all.map((s) => `<option ${s === selected ? 'selected' : ''} value="${esc(s)}">${esc(s)}</option>`).join('');
    const list = items(), last = list.map((c) => c.date).sort().at(-1);
    $('#count').textContent = `${pl(list.length, 'comparable')} · dernier relevé le ${dateFr(last)}`;
    drawResults();
    $('#tbl').innerHTML = `<table><thead><tr><th>Produit</th><th class="num">Prix affiché</th><th>Similarité</th><th>État</th><th>Consulté le</th><th>Commentaire</th><th></th></tr></thead><tbody>
      ${[...list].sort((a, b) => a.price - b.price).map((c) => `<tr data-id="${c.id}" class="${c.similarity === 'Peu similaire' ? 'dim' : ''}"><td>${esc(c.name)}</td><td class="num">${fmt(c.price)}</td>
        <td><span class="badge ${SIM_BADGE[c.similarity || 'Similaire']}">${c.similarity || 'Similaire'}</span></td><td class="muted">${esc(c.condition) || '—'}</td><td>${dateFr(c.date)}</td>
        <td class="muted cell-clip">${esc(c.comment) || '—'}</td><td class="row-actions">
        ${c.url ? `<a class="icon-btn" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir l’annonce"><i data-lucide="external-link"></i></a>` : ''}
        <button class="icon-btn" data-act="edit" aria-label="Modifier"><i data-lucide="pencil"></i></button><button class="icon-btn" data-act="del" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}</tbody></table>`;
    refreshIcons(view);
  }

  $('#add').onclick = () => openForm(null, draw);
  $('#study').onchange = (e) => { selected = e.target.value; draw(); };
  $('#costbox').oninput = drawResults;
  $('#costbox').onchange = drawResults;
  $('#costart').onchange = (e) => {
    const a = st.articles.find((x) => x.id === e.target.value); if (!a) return;
    const set = (n, v) => { view.querySelector(`[name="${n}"]`).value = v; };
    const z = (c) => (c ? fromCents(c) : ''), split = a.feeShip !== undefined; // anciens articles : frais regroupés dans « Autres »
    set('c_buy', fromCents(a.buyPrice)); set('c_qty', '1'); set('c_cond', a.condition || '');
    set('c_ship', split ? z(a.feeShip) : ''); set('c_pack', split ? z(a.feePack) : ''); set('c_other', split ? z(a.feeOther) : z(a.fees));
    drawResults();
  };
  $('#results').onchange = (e) => {
    const k = e.target.dataset?.strat; if (!k) return;
    const ov = { ...(manual.get(selected) || {}) }, v = e.target.value.trim();
    if (!v) delete ov[k]; else { const c = toCents(v); if (Number.isNaN(c) || c <= 0) { toast('Prix invalide (exemple : 24,90).'); drawResults(); return; } ov[k] = c; }
    manual.set(selected, ov); drawResults();
  };
  $('#results').onclick = (e) => { if (e.target.closest('#resetprices')) { manual.delete(selected); drawResults(); } };
  const setForm = $('#setform');
  setForm.onsubmit = async (e) => {
    e.preventDefault();
    const { errors, value } = validateMarketSettings(Object.fromEntries(new FormData(setForm)));
    showErrors(setForm, errors);
    const first = Object.keys(errors)[0]; if (first) { setForm.querySelector(`[name="${first}"]`).focus(); return; }
    try { await saveMarketSettings(value); manual.clear(); toast('Réglages enregistrés'); drawResults(); } catch (err) { console.error(err); toast('Enregistrement impossible : ' + err.message); }
  };
  $('#setreset').onclick = async () => {
    try { await saveMarketSettings({ ...DEFAULT_MARKET }); toast('Valeurs par défaut rétablies'); marketPage(view); } catch (err) { console.error(err); toast('Action impossible : ' + err.message); }
  };
  $('#delstudy').onclick = async () => {
    const ids = items().map((c) => c.id);
    if (!(await confirmDialog({ title: 'Supprimer cette étude ?', message: `L’étude « ${esc(selected)} » et ses ${ids.length} comparable(s) seront supprimées définitivement.` }))) return;
    try { await removeComparables(ids); manual.delete(selected); toast('Étude supprimée'); draw(); } catch (err) { console.error(err); toast('Suppression impossible : ' + err.message); }
  };
  $('#tbl').onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act, tr = e.target.closest('tr[data-id]'); if (!act || !tr) return;
    const c = st.comparables.find((x) => x.id === tr.dataset.id);
    if (act === 'edit') return openForm(c, draw);
    if (!(await confirmDialog({ title: 'Supprimer ce comparable ?', message: `« ${esc(c.name)} » sera supprimé définitivement.` }))) return;
    try { await removeComparables([c.id]); toast('Comparable supprimé'); draw(); } catch (err) { console.error(err); toast('Suppression impossible : ' + err.message); }
  };
  draw();
}

function openForm(c, onSaved) {
  const st = getState(), sym = symbol(st.settings.currency), a = c || { study: selected || '', date: today() };
  const m = openModal({ title: c ? 'Modifier le comparable' : 'Ajouter un comparable', wide: true, body: `<form id="mf" novalidate><div class="form-grid">
    ${field({ label: 'Produit étudié', name: 'study', value: a.study, required: true, list: 'studies', full: true, hint: 'Regroupe les comparables d’un même produit (ex. « Veste Levi’s taille M »).' })}
    <datalist id="studies">${[...new Set(st.comparables.map((x) => x.study))].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    ${field({ label: 'Nom du produit comparable', name: 'name', value: a.name, required: true, full: true })}
    ${field({ label: `Prix affiché (${sym})`, name: 'price', value: a.price ? fromCents(a.price) : '', placeholder: '0,00', inputmode: 'decimal', required: true })}
    ${selectField({ label: 'Similarité avec mon article', name: 'similarity', value: a.similarity || 'Similaire', options: SIMILARITIES, hint: 'Les « peu similaires » sont exclues du calcul principal.' })}
    ${selectField({ label: 'État', name: 'condition', value: a.condition, options: CONDITIONS, blank: 'Non précisé' })}
    ${field({ label: 'Date de consultation', name: 'date', value: a.date, type: 'date', required: true })}
    ${field({ label: 'Lien de l’annonce', name: 'url', value: a.url, type: 'url', placeholder: 'https://…', full: true })}
    ${textareaField({ label: 'Commentaire', name: 'comment', value: a.comment })}</div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-primary" id="save">Enregistrer</button></div></form>` });
  const form = m.root.querySelector('#mf');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { errors, value } = validateComparable(Object.fromEntries(new FormData(form)));
    showErrors(form, errors);
    const first = Object.keys(errors)[0];
    if (first) { form.querySelector(`[name="${first}"]`).focus(); return; }
    const btn = form.querySelector('#save'); btn.disabled = true;
    try {
      const now = new Date().toISOString();
      await saveComparable({ ...(c || {}), ...value, id: c?.id || uid(), createdAt: c?.createdAt || now, updatedAt: now });
      selected = value.study; toast(c ? 'Comparable modifié' : 'Comparable ajouté'); m.close(); onSaved?.();
    } catch (err) { console.error(err); toast('Enregistrement impossible : ' + err.message); btn.disabled = false; }
  };
}
