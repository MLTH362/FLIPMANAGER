/* Module « Mes ventes » : enregistrement, modification, annulation, remboursement, suppression. */
import { getState, saveSale, removeSale } from '../core/store.js';
import { validateSale } from '../core/validators.js';
import { SALE_STATUSES } from '../core/constants.js';
import { toCents } from '../core/validators.js';
import { money, dateFr, fromCents, symbol, today } from '../utils/format.js';
import { esc, uid } from '../utils/dom.js';
import { pageHeader, kpiCard, emptyState, openModal, confirmDialog, field, selectField, textareaField, toast, refreshIcons } from '../components/ui.js';

const BADGE = { 'terminée': 'b-green', 'annulée': 'b-dim', 'remboursée': 'b-grey' };
import { saleCost, saleProfit as profitOf, salesSummary } from '../core/sales.js';

export function salesPage(view) {
  const st = getState(), fmt = (c) => money(c, st.settings.currency);
  const f = { q: '', status: '' };
  const tone = (c) => (c > 0 ? 'pos' : c < 0 ? 'neg' : '');

  view.innerHTML = pageHeader('Mes ventes', 'Enregistrez vos ventes, annulations et remboursements.',
    '<button class="btn btn-primary" id="add"><i data-lucide="plus"></i>Enregistrer une vente</button>') + `
    <div class="kpis" id="kp"></div>
    <div class="card"><div class="toolbar">
      <div class="search"><i data-lucide="search"></i><input id="q" type="search" placeholder="Rechercher un article" aria-label="Rechercher"></div>
      <select id="st" aria-label="Filtrer par statut"><option value="">Tous les statuts</option>${SALE_STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
      <span class="count" id="count"></span></div><div id="tbl"></div><p class="note" id="note"></p></div>`;

  const draw = () => {
    const byId = new Map(st.articles.map((a) => [a.id, a]));
    const sum = salesSummary(st.sales, byId), done = sum.done, real = sum.profit; // annulées et remboursées exclues des totaux
    view.querySelector('#note').textContent = `Le coût de l’article est figé à la vente : modifier l’article ensuite ne change pas le bénéfice déjà réalisé. Les ventes annulées ou remboursées ne comptent ni dans le chiffre d’affaires ni dans le bénéfice.${sum.refundedCosts ? ` Frais et dépenses saisis sur les ventes remboursées : ${fmt(sum.refundedCosts)} (non déduits).` : ''}`;
    view.querySelector('#kp').innerHTML =
      kpiCard({ label: 'Ventes terminées', value: done.length, icon: 'badge-check' }) +
      kpiCard({ label: 'Chiffre d’affaires', value: fmt(sum.revenue), icon: 'wallet', hero: true }) +
      kpiCard({ label: 'Bénéfice réalisé', value: fmt(real), icon: 'circle-dollar-sign', hero: true, tone: real < 0 ? 'neg' : '' }) +
      kpiCard({ label: 'Annulées ou remboursées', value: st.sales.length - done.length, icon: 'undo-2' });

    const q = f.q.toLowerCase();
    const items = st.sales.filter((s) => (!f.status || s.status === f.status) && (!q || (byId.get(s.articleId)?.name || 'article supprimé').toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    view.querySelector('#count').textContent = `${items.length} vente${items.length > 1 ? 's' : ''}`;
    const box = view.querySelector('#tbl');
    box.innerHTML = !items.length
      ? (st.sales.length ? emptyState('search-x', 'Aucun résultat', 'Modifiez la recherche ou le filtre.') : emptyState('receipt', 'Aucune vente', 'Cliquez sur « Enregistrer une vente » quand un article est vendu.'))
      : `<table><thead><tr><th>Date</th><th>Article</th><th class="num">Prix vendu</th><th class="num">Frais</th><th class="num">Dépenses</th><th class="num">Coût article</th><th class="num">Bénéfice final</th><th>Statut</th><th></th></tr></thead><tbody>
        ${items.map((s) => { const a = byId.get(s.articleId), ok = s.status === 'terminée', p = profitOf(s, a); return `<tr data-id="${s.id}" ${ok ? '' : 'class="dim"'}>
          <td>${dateFr(s.date)}</td><td>${a ? `<a class="lnk" href="#/articles/${a.id}">${esc(a.name)}</a>` : '<span class="muted">Article supprimé</span>'}</td>
          <td class="num">${fmt(s.price)}</td><td class="num">${fmt(s.fees)}</td><td class="num">${fmt(s.expenses)}</td><td class="num">${fmt(saleCost(s, a))}</td>
          <td class="num ${ok ? tone(p) : ''}">${ok ? fmt(p) : '—'}</td><td><span class="badge ${BADGE[s.status]}">${s.status}</span></td>
          <td class="row-actions"><button class="icon-btn" data-act="edit" aria-label="Modifier"><i data-lucide="pencil"></i></button>
            <button class="icon-btn" data-act="del" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></td></tr>`; }).join('')}</tbody></table>`;
    refreshIcons(view);
  };

  view.querySelector('#add').onclick = () => openSaleForm(null, draw);
  view.querySelector('#q').oninput = (e) => { f.q = e.target.value; draw(); };
  view.querySelector('#st').onchange = (e) => { f.status = e.target.value; draw(); };
  view.querySelector('#tbl').onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act, tr = e.target.closest('tr[data-id]');
    if (!act || !tr) return;
    const sale = st.sales.find((s) => s.id === tr.dataset.id);
    if (act === 'edit') return openSaleForm(sale, draw);
    const a = st.articles.find((x) => x.id === sale.articleId);
    const back = sale.status === 'terminée' && a?.status === 'Vendu';
    const ok = await confirmDialog({ title: 'Supprimer cette vente ?',
      message: `La vente du ${dateFr(sale.date)} sera supprimée définitivement.${back ? ` L’article « ${esc(a.name)} » redeviendra « En stock ».` : ''} Pour la garder dans l’historique sans l’inclure dans les statistiques, passez-la plutôt en « annulée ».` });
    if (!ok) return;
    try { await removeSale(sale.id); toast('Vente supprimée'); draw(); } catch (err) { console.error(err); toast('Suppression impossible : ' + err.message); }
  };
  draw();
}

/* ---------- Formulaire ---------- */
function openSaleForm(sale, onSaved) {
  const st = getState(), cur = st.settings.currency, sym = symbol(cur);
  const s = sale || { date: today(), status: 'terminée' };
  const options = sale
    ? [{ value: sale.articleId, label: st.articles.find((a) => a.id === sale.articleId)?.name || 'Article supprimé' }]
    : st.articles.filter((a) => !['Vendu', 'Archivé', 'À acheter'].includes(a.status)).map((a) => ({ value: a.id, label: a.name }));
  if (!options.length) { toast('Il faut d’abord un article « En stock » ou « En vente » dans « Mes articles ».'); return; }

  const m = openModal({ title: sale ? 'Modifier la vente' : 'Enregistrer une vente', wide: true, body: `<form id="sf" novalidate><div class="form-grid">
    ${selectField({ label: 'Article', name: 'articleId', value: s.articleId, options, full: true, blank: sale ? '' : 'Choisir un article' })}
    ${field({ label: 'Date de la vente', name: 'date', value: s.date, type: 'date', required: true })}
    ${selectField({ label: 'Statut de la transaction', name: 'status', value: s.status, options: SALE_STATUSES })}
    ${field({ label: `Prix vendu (${sym})`, name: 'price', value: s.price != null ? fromCents(s.price) : '', placeholder: '0,00', inputmode: 'decimal', required: true })}
    ${field({ label: `Frais de vente éventuels (${sym})`, name: 'fees', value: s.fees ? fromCents(s.fees) : '', placeholder: '0,00', inputmode: 'decimal', hint: 'Seulement les frais réellement constatés.' })}
    ${field({ label: `Dépenses liées (${sym})`, name: 'expenses', value: s.expenses ? fromCents(s.expenses) : '', placeholder: '0,00', inputmode: 'decimal', hint: 'Expédition, emballage, etc.', full: true })}
    ${textareaField({ label: 'Note (facultatif)', name: 'note', value: s.note })}
    <div class="field full"><div class="preview" id="pv"></div></div></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-primary" id="save">Enregistrer</button></div></form>` });

  const form = m.root.querySelector('#sf'), pv = m.root.querySelector('#pv');
  const val = (n) => { const v = form.elements[n].value.trim(); return v ? toCents(v) : 0; };
  const preview = () => {
    const a = st.articles.find((x) => x.id === form.elements.articleId.value), price = form.elements.price.value.trim() ? toCents(form.elements.price.value) : NaN;
    const fees = val('fees'), exp = val('expenses');
    if (!a || [price, fees, exp].some(Number.isNaN)) { pv.textContent = ''; return; }
    const sv = { price, fees, expenses: exp, cost: sale?.status === 'terminée' ? sale.cost : undefined }, p = profitOf(sv, a);
    pv.innerHTML = form.elements.status.value === 'terminée'
      ? `Bénéfice final : <strong class="${p > 0 ? 'pos' : p < 0 ? 'neg' : ''}">${money(p, cur)}</strong> <span class="muted">(coût de l’article : ${money(saleCost(sv, a), cur)})</span>`
      : '<span class="muted">Cette transaction n’est pas comptée dans les chiffres et statistiques.</span>';
  };
  form.addEventListener('input', preview);
  form.elements.articleId.addEventListener('change', () => {
    const a = st.articles.find((x) => x.id === form.elements.articleId.value);
    if (!sale && a?.targetPrice != null && !form.elements.price.value) form.elements.price.value = fromCents(a.targetPrice);
    preview();
  });
  preview();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const { errors, value } = validateSale(Object.fromEntries(new FormData(form)), { sales: st.sales, editingId: sale?.id });
    form.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid'));
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errors[el.dataset.err] || ''; if (errors[el.dataset.err]) el.parentElement.classList.add('invalid'); });
    const first = Object.keys(errors)[0];
    if (first) { form.querySelector(`[name="${first}"]`).focus(); return; }
    const btn = form.querySelector('#save'); btn.disabled = true;
    try {
      const now = new Date().toISOString();
      await saveSale({ ...(sale || {}), ...value, id: sale?.id || uid(), createdAt: sale?.createdAt || now, updatedAt: now });
      toast(sale ? 'Vente modifiée' : 'Vente enregistrée'); m.close(); onSaved?.();
    } catch (err) { console.error(err); toast('Enregistrement impossible : ' + err.message); btn.disabled = false; }
  };
}
