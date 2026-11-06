/* Module « Mes articles » : liste, formulaire (ajout/modification), fiche détaillée. */
import { getState, saveArticle, removeArticle } from '../core/store.js';
import { listImages, getAllImages, saveImage, deleteImage, compress } from '../core/images.js';
import { validateArticle } from '../core/validators.js';
import { STATUSES, CONDITIONS, CATEGORIES } from '../core/constants.js';
import { articleCost as cost, estimatedProfit, filterArticles, findDuplicate, SORTS } from '../core/articles.js';
import { toCents } from '../core/validators.js';
import { saleProfit } from '../core/sales.js';
import { money, dateFr, fromCents, symbol } from '../utils/format.js';
import { esc, uid } from '../utils/dom.js';
import { pageHeader, emptyState, openModal, confirmDialog, field, selectField, textareaField, toast, refreshIcons } from '../components/ui.js';

const BADGE = { 'À acheter': 'b-grey', 'En stock': 'b-outline', 'En vente': 'b-gold', 'Vendu': 'b-green', 'Archivé': 'b-dim' };
export const badge = (s) => `<span class="badge ${BADGE[s] || 'b-grey'}">${esc(s)}</span>`;
const MAX_PHOTOS = 10;

export const articlesPage = (view, id) => (id ? detailPage(view, id) : listPage(view));

/* ===================== Liste ===================== */
function listPage(view) {
  const st = getState(), fmt = (c) => money(c, st.settings.currency);
  const f = { q: '', status: '', category: '', sort: 'recent' };
  let thumbs = new Map(), alive = true;
  const freeUrls = () => { thumbs.forEach((u) => URL.revokeObjectURL(u)); thumbs = new Map(); };

  view.innerHTML = pageHeader('Mes articles', 'Gérez vos articles, leurs photos et leurs coûts.',
    '<button class="btn btn-primary" id="add"><i data-lucide="plus"></i>Ajouter un article</button>') + `
    <div class="card"><div class="toolbar">
      <div class="search"><i data-lucide="search"></i><input id="q" type="search" placeholder="Rechercher (nom, catégorie, description…)" aria-label="Rechercher"></div>
      <select id="st" aria-label="Filtrer par statut"><option value="">Tous les statuts</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
      <select id="cat" aria-label="Filtrer par catégorie"></select>
      <select id="sort" aria-label="Trier">${SORTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <span class="count" id="count"></span></div><div id="tbl"></div></div>`;

  const draw = () => {
    const cats = [...new Set(st.articles.map((a) => a.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    if (f.category && !cats.includes(f.category)) f.category = ''; // la catégorie filtrée n'existe plus
    view.querySelector('#cat').innerHTML = `<option value="">Toutes les catégories</option>${cats.map((c) => `<option ${c === f.category ? 'selected' : ''} value="${esc(c)}">${esc(c)}</option>`).join('')}`;
    const items = filterArticles(st.articles, f);
    view.querySelector('#count').textContent = `${items.length} article${items.length > 1 ? 's' : ''}`;
    const box = view.querySelector('#tbl');
    if (!items.length) {
      box.innerHTML = st.articles.length ? emptyState('search-x', 'Aucun résultat', 'Modifiez la recherche ou les filtres.')
        : emptyState('package-plus', 'Aucun article', 'Cliquez sur « Ajouter un article » pour commencer.');
    } else {
      box.innerHTML = `<table class="clickable"><thead><tr><th>Article</th><th>Catégorie</th><th>Statut</th><th class="num">Coût total</th><th class="num">Prix envisagé</th><th class="num">Bénéfice estimé</th><th></th></tr></thead><tbody>
        ${items.map((a) => { const est = estimatedProfit(a); return `<tr data-id="${a.id}">
          <td><div class="cell-name">${thumbs.has(a.id) ? `<img class="thumb" src="${thumbs.get(a.id)}" alt="">` : '<span class="thumb"><i data-lucide="image"></i></span>'}${esc(a.name)}</div></td>
          <td class="muted">${esc(a.category) || '—'}</td><td>${badge(a.status)}</td>
          <td class="num">${fmt(cost(a))}</td><td class="num">${a.targetPrice == null ? '—' : fmt(a.targetPrice)}</td>
          <td class="num ${est > 0 ? 'pos' : est < 0 ? 'neg' : ''}">${est == null ? '—' : fmt(est)}</td>
          <td class="row-actions"><button class="icon-btn" data-act="edit" aria-label="Modifier"><i data-lucide="pencil"></i></button>
            <button class="icon-btn" data-act="del" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></td></tr>`; }).join('')}</tbody></table>`;
    }
    refreshIcons(box);
  };

  const loadThumbs = async () => {
    try {
      const all = await getAllImages();
      if (!alive) return;
      freeUrls();
      for (const r of all) if (!thumbs.has(r.articleId)) thumbs.set(r.articleId, URL.createObjectURL(r.blob));
      draw();
    } catch (e) { console.error(e); }
  };
  const refresh = () => { draw(); loadThumbs(); };

  view.querySelector('#add').onclick = () => openArticleForm(null, refresh);
  view.querySelector('#q').oninput = (e) => { f.q = e.target.value; draw(); };
  view.querySelector('#st').onchange = (e) => { f.status = e.target.value; draw(); };
  view.querySelector('#cat').onchange = (e) => { f.category = e.target.value; draw(); };
  view.querySelector('#sort').onchange = (e) => { f.sort = e.target.value; draw(); };
  view.querySelector('#tbl').onclick = async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const a = st.articles.find((x) => x.id === tr.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'edit') openArticleForm(a, refresh);
    else if (act === 'del') { if (await askDelete(a)) { refresh(); } }
    else location.hash = `#/articles/${a.id}`;
  };
  draw(); loadThumbs();
  return () => { alive = false; freeUrls(); };
}

/* Confirmation + suppression ; prévient si des ventes sont liées. */
async function askDelete(a) {
  const st = getState(), n = st.sales.filter((s) => s.articleId === a.id).length, nl = st.listings.filter((l) => l.articleId === a.id).length;
  if (n) { // supprimer un article vendu ferait disparaître son coût : le bénéfice réalisé serait faussé
    if (await confirmDialog({ title: 'Suppression impossible', confirmLabel: 'Voir mes ventes',
      message: `« ${esc(a.name)} » a ${n} vente(s) enregistrée(s) : le supprimer fausserait vos bénéfices. Supprimez d’abord ces ventes, ou conservez l’article (statut « Archivé »).` })) location.hash = '#/ventes';
    return false;
  }
  const ok = await confirmDialog({ title: 'Supprimer cet article ?',
    message: `« ${esc(a.name)} » et ses photos seront supprimés définitivement.${nl ? ` ${nl} brouillon(s) d’annonce liés resteront, sans article associé.` : ''}` });
  if (!ok) return false;
  try { await removeArticle(a.id); toast('Article supprimé'); return true; }
  catch (e) { console.error(e); toast('Suppression impossible : ' + e.message); return false; }
}

/* ===================== Formulaire ajout / modification ===================== */
async function openArticleForm(article, onSaved) {
  const a = article || { status: 'En stock' }, cur = getState().settings.currency, sym = symbol(cur), fmt = (c) => money(c, cur);
  const artId = article?.id || uid(); // fixé une fois : un nouvel essai après une erreur ne crée jamais de doublon
  let createdAt = article?.createdAt || null, dupAsked = false;
  const z = (c) => (c ? fromCents(c) : ''), split = a.feeShip !== undefined; // anciens articles : frais regroupés dans « Autres dépenses »
  let photos = [], removed = [], order = Date.now();
  if (article) photos = (await listImages(a.id)).map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob) }));

  const m = openModal({ title: article ? 'Modifier l’article' : 'Ajouter un article', wide: true,
    onClose: () => photos.forEach((p) => URL.revokeObjectURL(p.url)),
    body: `<form id="af" novalidate><div class="form-grid">
      ${field({ label: 'Nom de l’article', name: 'name', value: a.name, required: true, full: true })}
      ${field({ label: 'Catégorie', name: 'category', value: a.category, list: 'cats' })}
      <datalist id="cats">${CATEGORIES.map((c) => `<option value="${c}">`).join('')}</datalist>
      ${selectField({ label: 'État', name: 'condition', value: a.condition, options: CONDITIONS, blank: 'Non précisé' })}
      ${field({ label: `Prix d’achat (${sym})`, name: 'buyPrice', value: fromCents(a.buyPrice), placeholder: '0,00', required: true, inputmode: 'decimal' })}
      ${field({ label: `Livraison attribuée à cet article (${sym})`, name: 'feeShip', value: split ? z(a.feeShip) : '', placeholder: '0,00', inputmode: 'decimal', hint: 'Part de la livraison fournisseur (à diviser si vous achetez plusieurs exemplaires).' })}
      ${field({ label: `Emballage (${sym})`, name: 'feePack', value: split ? z(a.feePack) : '', placeholder: '0,00', inputmode: 'decimal' })}
      ${field({ label: `Autres dépenses (${sym})`, name: 'feeOther', value: split ? z(a.feeOther) : z(a.fees), placeholder: '0,00', inputmode: 'decimal', hint: 'Nettoyage, réparation, etc.' })}
      ${field({ label: `Prix de vente envisagé (${sym})`, name: 'targetPrice', value: fromCents(a.targetPrice), placeholder: '0,00', inputmode: 'decimal', hint: 'Facultatif. Sert à estimer le bénéfice.' })}
      ${selectField({ label: 'Statut', name: 'status', value: a.status, options: STATUSES, disabled: a.status === 'Vendu' ? [] : ['Vendu'], hint: '« Vendu » se règle en enregistrant une vente. « À acheter » n’entre pas dans vos investissements.' })}
      <div class="field full"><div class="preview" id="costsum"></div></div>
      ${field({ label: 'Date d’achat', name: 'boughtOn', value: a.boughtOn, type: 'date', hint: 'Facultatif : sert à mesurer les délais de vente (sinon, date d’ajout).' })}
      ${field({ label: 'Lien de référence fournisseur', name: 'supplierUrl', value: a.supplierUrl, type: 'url', placeholder: 'https://…' })}
      ${textareaField({ label: 'Description', name: 'description', value: a.description })}
      <div class="field full uploader"><label>Photos (${MAX_PHOTOS} maximum)</label>
        <label class="drop"><i data-lucide="image-plus"></i>Ajouter des photos<input type="file" id="files" accept="image/*" multiple></label>
        <div class="thumbs" id="thumbs"></div></div>
    </div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" class="btn btn-primary" id="save">Enregistrer</button></div></form>` });

  const form = m.root.querySelector('#af'), box = m.root.querySelector('#thumbs');
  const drawThumbs = () => {
    box.innerHTML = photos.map((p, i) => `<div class="ph-item"><img src="${p.url}" alt="Photo ${i + 1}"><button type="button" data-rm="${i}" aria-label="Retirer la photo"><i data-lucide="x"></i></button></div>`).join('');
    refreshIcons(box);
  };
  drawThumbs();
  const costsum = m.root.querySelector('#costsum'), amt = (n) => { const v = form.elements[n].value.trim(); return v ? toCents(v) : 0; };
  const sum = () => { // aperçu du coût de revient et du bénéfice estimé, calculé en direct
    const [b, s, p, o] = ['buyPrice', 'feeShip', 'feePack', 'feeOther'].map(amt), t = form.elements.targetPrice.value.trim() ? toCents(form.elements.targetPrice.value) : null;
    if ([b, s, p, o, t].some(Number.isNaN)) { costsum.textContent = ''; return; }
    const c = b + s + p + o;
    costsum.innerHTML = `Coût de revient : <strong>${fmt(c)}</strong>${t ? ` · Bénéfice estimé avant frais de vente : <strong class="${t - c < 0 ? 'neg' : 'pos'}">${fmt(t - c)}</strong>` : ''}`;
  };
  form.addEventListener('input', sum); sum();
  box.onclick = (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [p] = photos.splice(+b.dataset.rm, 1);
    if (!p.isNew) removed.push(p.id);
    URL.revokeObjectURL(p.url); drawThumbs();
  };
  m.root.querySelector('#files').onchange = async (e) => {
    for (const file of e.target.files) {
      if (photos.length >= MAX_PHOTOS) { toast(`${MAX_PHOTOS} photos maximum par article`); break; }
      if (!file.type.startsWith('image/')) { toast(`« ${file.name} » n’est pas une image`); continue; }
      try { const blob = await compress(file); photos.push({ id: uid(), blob, url: URL.createObjectURL(blob), isNew: true }); }
      catch { toast(`Impossible de lire « ${file.name} »`); }
    }
    e.target.value = ''; drawThumbs();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const { errors, value } = validateArticle(Object.fromEntries(new FormData(form)));
    form.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid'));
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errors[el.dataset.err] || ''; if (errors[el.dataset.err]) el.parentElement.classList.add('invalid'); });
    const first = Object.keys(errors)[0];
    if (first) { form.querySelector(`[name="${first}"]`).focus(); return; }
    if (!dupAsked && findDuplicate(getState().articles, value.name, artId)) { // avertissement sans fenêtre supplémentaire : un second clic confirme
      dupAsked = true;
      const el = form.querySelector('[data-err="name"]'); el.textContent = 'Un article du même nom existe déjà. Cliquez à nouveau sur Enregistrer pour le créer quand même.';
      el.parentElement.classList.add('invalid'); form.querySelector('[name="name"]').focus(); return;
    }

    const btn = form.querySelector('#save'); btn.disabled = true;
    try {
      const now = new Date().toISOString();
      const art = { ...(article || {}), ...value, id: artId, createdAt: createdAt || now, updatedAt: now };
      createdAt = art.createdAt;
      await saveArticle(art);
      while (removed.length) { await deleteImage(removed[0]); removed.shift(); }
      for (const p of photos.filter((x) => x.isNew)) { await saveImage({ id: p.id, articleId: art.id, blob: p.blob, order: order++ }); p.isNew = false; }
      toast(article ? 'Article modifié' : 'Article ajouté');
      m.close(); onSaved?.(art);
    } catch (err) { console.error(err); toast('Enregistrement impossible : ' + err.message); btn.disabled = false; }
  };
}

/* ===================== Fiche détaillée ===================== */
function detailPage(view, id) {
  let urls = [], alive = true;
  const free = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };

  const draw = async () => {
    const st = getState(), fmt = (c) => money(c, st.settings.currency);
    const a = st.articles.find((x) => x.id === id);
    if (!a) {
      view.innerHTML = pageHeader('Article introuvable', 'Cet article n’existe plus.', '<a class="btn btn-ghost" href="#/articles">Retour aux articles</a>');
      return;
    }
    const sold = a.status === 'Vendu', est = a.targetPrice == null ? null : a.targetPrice - cost(a);
    const sales = st.sales.filter((s) => s.articleId === a.id).sort((x, y) => y.date.localeCompare(x.date));
    const profit = (s) => saleProfit(s, a); // coût figé à la vente
    const tone = (c) => (c > 0 ? 'pos' : c < 0 ? 'neg' : '');

    view.innerHTML = `<a class="back" href="#/articles"><i data-lucide="arrow-left"></i>Mes articles</a>` +
      pageHeader(esc(a.name), `${badge(a.status)} <span class="muted">Ajouté le ${dateFr(a.createdAt)}</span>`,
        `<div class="head-actions"><select id="status" aria-label="Statut">${STATUSES.map((s) => `<option ${s === a.status ? 'selected' : ''} ${s === 'Vendu' && !sold ? 'disabled' : ''}>${s}</option>`).join('')}</select>
         <button class="btn btn-ghost" id="edit"><i data-lucide="pencil"></i>Modifier</button>
         <button class="btn btn-danger" id="del"><i data-lucide="trash-2"></i>Supprimer</button></div>`) + `
      <div class="detail"><div class="card"><div class="gallery-main" id="main"><i data-lucide="image"></i></div><div class="gallery-thumbs" id="gt"></div></div>
      <div style="display:grid;gap:16px">
        <div class="card"><div class="card-title"><h2>Informations</h2></div><dl class="info">
          <dt>Catégorie</dt><dd>${esc(a.category) || '—'}</dd><dt>État</dt><dd>${esc(a.condition) || '—'}</dd>
          <dt>Date d’achat</dt><dd>${a.boughtOn ? dateFr(a.boughtOn) : '—'}</dd><dt>Fournisseur</dt><dd>${a.supplierUrl ? `<a href="${esc(a.supplierUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.supplierUrl)}</a>` : '—'}</dd>
          <dt>Description</dt><dd style="white-space:pre-wrap">${esc(a.description) || '—'}</dd></dl></div>
        <div class="card"><div class="card-title"><h2>Historique financier</h2></div><table><tbody>
          <tr><td>Prix d’achat</td><td class="num">${fmt(a.buyPrice)}</td></tr>
          ${a.feeShip === undefined ? `<tr><td>Frais associés</td><td class="num">${fmt(a.fees)}</td></tr>`
            : `<tr><td>Livraison attribuée</td><td class="num">${fmt(a.feeShip)}</td></tr><tr><td>Emballage</td><td class="num">${fmt(a.feePack)}</td></tr><tr><td>Autres dépenses</td><td class="num">${fmt(a.feeOther)}</td></tr>`}
          <tr class="total"><td>Coût total</td><td class="num">${fmt(cost(a))}</td></tr>
          <tr><td>Prix de vente envisagé</td><td class="num">${a.targetPrice == null ? '—' : fmt(a.targetPrice)}</td></tr>
          <tr class="total"><td>Bénéfice estimé</td><td class="num ${tone(est)}">${est == null ? '—' : fmt(est)}</td></tr></tbody></table>
          <p class="note">Estimation avant frais de vente éventuels : ceux-ci sont saisis à l’enregistrement d’une vente.${a.status === 'À acheter' ? ' Cet article n’est pas encore acheté : il n’est pas compté dans vos investissements ni dans la valeur du stock.' : ''}</p></div>
        <div class="card"><div class="card-title"><h2>Ventes</h2></div>${sales.length ? `<table><thead><tr><th>Date</th><th class="num">Prix vendu</th><th>Statut</th><th class="num">Bénéfice</th></tr></thead><tbody>
          ${sales.map((s) => `<tr><td>${dateFr(s.date)}</td><td class="num">${fmt(s.price)}</td><td>${esc(s.status)}</td><td class="num ${s.status === 'terminée' ? tone(profit(s)) : ''}">${s.status === 'terminée' ? fmt(profit(s)) : '—'}</td></tr>`).join('')}</tbody></table>`
          : emptyState('receipt', 'Aucune vente', 'Aucune vente enregistrée pour cet article.')}</div>
      </div></div>`;
    refreshIcons(view);

    view.querySelector('#edit').onclick = () => openArticleForm(a, draw);
    view.querySelector('#del').onclick = async () => { if (await askDelete(a)) location.hash = '#/articles'; };
    const sel = view.querySelector('#status');
    sel.disabled = sold;
    sel.onchange = async () => {
      try { await saveArticle({ ...a, status: sel.value, updatedAt: new Date().toISOString() }); toast('Statut mis à jour'); draw(); }
      catch (e) { console.error(e); toast('Mise à jour impossible : ' + e.message); sel.value = a.status; }
    };

    try {
      const imgs = await listImages(a.id);
      if (!alive || !imgs.length) return;
      free(); urls = imgs.map((r) => URL.createObjectURL(r.blob));
      const main = view.querySelector('#main'), gt = view.querySelector('#gt');
      const show = (i) => { main.innerHTML = `<img src="${urls[i]}" alt="Photo ${i + 1} de ${esc(a.name)}">`; gt.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', i === j)); };
      gt.innerHTML = urls.map((u, i) => `<button type="button" aria-label="Photo ${i + 1}"><img src="${u}" alt=""></button>`).join('');
      gt.onclick = (e) => { const b = e.target.closest('button'); if (b) show([...gt.children].indexOf(b)); };
      show(0);
    } catch (e) { console.error(e); }
  };
  draw();
  return () => { alive = false; free(); };
}
