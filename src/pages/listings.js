/* Module « Mes annonces » : brouillons d'annonces + assistant de rédaction avec boutons « copier ». */
import { getState, saveListing, removeListing, saveArticle } from '../core/store.js';
import { generate, effectiveTitle as makeTitle } from '../core/listing.js';
import { analyse } from '../core/market.js';
import { validateListing } from '../core/validators.js';
import { CONDITIONS } from '../core/constants.js';
import { money, dateFr, fromCents, symbol } from '../utils/format.js';
import { esc, uid } from '../utils/dom.js';
import { badge } from './articles.js';
import { pageHeader, emptyState, confirmDialog, field, selectField, textareaField, toast, copyText, refreshIcons } from '../components/ui.js';

export const listingsPage = (view, param) => (param ? editorPage(view, param) : listPage(view));

/* ===================== Liste des brouillons ===================== */
function listPage(view) {
  const st = getState(), fmt = (c) => money(c, st.settings.currency);
  view.innerHTML = pageHeader('Mes annonces', 'Préparez vos annonces, puis copiez chaque élément.',
    '<a class="btn btn-primary" href="#/annonces/nouveau"><i data-lucide="plus"></i>Nouvelle annonce</a>') + '<div class="card" id="box"></div>';
  const box = view.querySelector('#box');

  const draw = () => {
    const list = [...st.listings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    box.innerHTML = !list.length ? emptyState('file-text', 'Aucune annonce', 'Cliquez sur « Nouvelle annonce » pour préparer votre première annonce.')
      : `<table class="clickable"><thead><tr><th>Annonce</th><th>Article</th><th class="num">Prix conseillé</th><th>Statut de l’article</th><th>Modifiée le</th><th></th></tr></thead><tbody>
        ${list.map((l) => { const a = st.articles.find((x) => x.id === l.articleId), canPublish = a && a.status === 'En stock';
          return `<tr data-id="${l.id}"><td><strong>${esc(makeTitle(l)) || '—'}</strong></td><td class="muted">${a ? esc(a.name) : '—'}</td>
            <td class="num">${l.price == null ? '—' : fmt(l.price)}</td><td>${a ? badge(a.status) : '<span class="muted">—</span>'}</td><td>${dateFr(l.updatedAt.slice(0, 10))}</td>
            <td class="row-actions">${canPublish ? '<button class="icon-btn" data-act="pub" aria-label="Marquer comme publiée" title="Marquer l’annonce comme publiée"><i data-lucide="megaphone"></i></button>' : ''}
            <button class="icon-btn" data-act="del" aria-label="Supprimer"><i data-lucide="trash-2"></i></button></td></tr>`; }).join('')}</tbody></table>`;
    refreshIcons(box);
  };

  box.onclick = async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const l = st.listings.find((x) => x.id === tr.dataset.id), act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) { location.hash = `#/annonces/${l.id}`; return; }
    if (act === 'pub') {
      const a = st.articles.find((x) => x.id === l.articleId);
      try { await saveArticle({ ...a, status: 'En vente', updatedAt: new Date().toISOString() }); toast('Article marqué « En vente »'); draw(); }
      catch (err) { console.error(err); toast('Mise à jour impossible : ' + err.message); }
    } else if (await confirmDialog({ title: 'Supprimer cette annonce ?', message: `Le brouillon « ${esc(makeTitle(l))} » sera supprimé définitivement. L’article n’est pas modifié.` })) {
      try { await removeListing(l.id); toast('Annonce supprimée'); draw(); } catch (err) { console.error(err); toast('Suppression impossible : ' + err.message); }
    }
  };
  draw();
}

/* ===================== Assistant de rédaction ===================== */
function editorPage(view, param) {
  const st = getState(), cur = st.settings.currency, sym = symbol(cur);
  const existing = param === 'nouveau' ? null : st.listings.find((l) => l.id === param);
  if (param !== 'nouveau' && !existing) {
    view.innerHTML = pageHeader('Annonce introuvable', 'Ce brouillon n’existe plus.', '<a class="btn btn-ghost" href="#/annonces">Retour aux annonces</a>');
    return;
  }
  const d = existing || { articleId: '' };
  const studies = [...new Set(st.comparables.map((c) => c.study))];

  view.innerHTML = `<a class="back" href="#/annonces"><i data-lucide="arrow-left"></i>Mes annonces</a>` +
    pageHeader(existing ? 'Modifier l’annonce' : 'Nouvelle annonce', 'Le texte est construit uniquement à partir de ce que vous saisissez.') + `
    <div class="callout"><i data-lucide="shield-check"></i><div>Relisez chaque élément : il doit correspondre exactement à l’objet vendu. Rien n’est ajouté ni inventé, et « Aucun défaut » n’est écrit que si vous cochez la case.</div></div>
    <div class="calc"><form id="lf" class="card" novalidate autocomplete="off"><div class="form-grid">
      ${selectField({ label: 'Article lié (facultatif)', name: 'articleId', value: d.articleId, options: st.articles.map((a) => ({ value: a.id, label: a.name })), blank: 'Aucun article', full: true, hint: 'Reprend le nom, l’état, la description et le prix prévu, sans écraser ce que vous avez déjà saisi.' })}
      ${field({ label: 'Produit', name: 'product', value: d.product, required: true, full: true, placeholder: 'Ex. Veste en jean' })}
      ${field({ label: 'Marque', name: 'brand', value: d.brand })}${field({ label: 'Taille', name: 'size', value: d.size })}
      ${field({ label: 'Couleur', name: 'color', value: d.color })}${field({ label: 'Matière', name: 'material', value: d.material })}
      ${selectField({ label: 'État réel du produit', name: 'condition', value: d.condition, options: CONDITIONS, blank: 'Non précisé', full: true })}
      ${textareaField({ label: 'Défauts ou remarques sur l’état', name: 'flaws', value: d.flaws, hint: 'Taches, usure, pièces manquantes… Soyez précis.' })}
      <div class="field full"><label class="check"><input type="checkbox" name="noDefects" ${d.noDefects ? 'checked' : ''}> Aucun défaut constaté</label><span class="err" data-err="noDefects"></span></div>
      ${textareaField({ label: 'Autres caractéristiques', name: 'extraLines', value: d.extraLines, hint: 'Une par ligne, au format « Libellé : valeur ».' })}
      ${textareaField({ label: 'Informations complémentaires', name: 'info', value: d.info, hint: 'Ajouté tel quel à la fin de la description.' })}
      ${field({ label: 'Mots-clés supplémentaires', name: 'keywords', value: d.keywords, full: true, hint: 'Séparés par des virgules.' })}
      ${field({ label: `Prix conseillé (${sym})`, name: 'price', value: d.price != null ? fromCents(d.price) : '', placeholder: '0,00', inputmode: 'decimal' })}
      ${selectField({ label: 'Reprendre le prix équilibré d’une étude', name: 'study', options: studies, blank: studies.length ? 'Choisir une étude' : 'Aucune étude de marché' })}
      </div><div class="modal-actions"><a class="btn btn-ghost" href="#/annonces">Fermer</a><button type="submit" class="btn btn-primary" id="save"><i data-lucide="save"></i>Enregistrer le brouillon</button></div></form>
      <div id="out" style="display:grid;gap:16px;align-content:start"></div></div>`;

  const form = view.querySelector('#lf'), out = view.querySelector('#out');
  const edits = { ...(existing?.edits || {}) }; // textes modifiés à la main : prioritaires sur le texte généré
  const raw = () => ({ ...Object.fromEntries(new FormData(form)), noDefects: form.elements.noDefects.checked, edits });
  const LABELS = { title: 'Titre', description: 'Description', characteristics: 'Caractéristiques', condition: 'État du produit', keywords: 'Mots-clés' };
  const head = (key, text) => `<h2>${LABELS[key]}${key in edits ? ' <span class="badge b-gold">modifié</span>' : ''}</h2><span>${text.length} caractères</span>
    ${key in edits ? `<button type="button" class="btn btn-ghost btn-sm" data-reset="${key}"><i data-lucide="rotate-ccw"></i>Rétablir le texte généré</button>` : ''}
    <button type="button" class="btn btn-ghost btn-sm" data-copy="${key}"><i data-lucide="copy"></i>Copier</button>`;
  const current = (key) => out.querySelector(`[data-edit="${key}"]`)?.value ?? '';

  function drawOut() {
    const g = generate(raw()), price = form.elements.price.value.trim();
    const priceTxt = price && /^\d+([.,]\d{1,2})?$/.test(price.replace(/\s/g, '')) ? `${price.replace('.', ',')} ${sym}` : '';
    const block = (key) => { const text = key in edits ? edits[key] : g[key];
      return `<div class="card outblock" data-key="${key}"><div class="card-title">${head(key, text)}</div>
        <textarea class="outedit" data-edit="${key}" rows="${Math.min(14, Math.max(3, text.split('\n').length + 1))}" placeholder="Rien à afficher : ce champ est vide. Vous pouvez aussi écrire ici." aria-label="${LABELS[key]}">${esc(text)}</textarea></div>`; };
    out.innerHTML = `<div class="toolbar"><button type="button" class="btn btn-primary btn-sm" data-copyall><i data-lucide="copy"></i>Copier l’annonce complète</button>
        <span class="muted">Titre + description + mots-clés. Modifiez les textes ci-dessous avant de copier : rien n’est publié automatiquement.</span></div>
      ${block('title')}${block('description')}${block('characteristics')}${block('condition')}
      <div class="card outblock"><div class="card-title"><h2>Prix conseillé</h2><span></span><button type="button" class="btn btn-ghost btn-sm" data-copy="price" ${priceTxt ? '' : 'disabled'}><i data-lucide="copy"></i>Copier</button></div>
        ${priceTxt ? `<pre class="out" data-price>${esc(priceTxt)}</pre>` : '<p class="muted">Rien à afficher : ce champ est vide.</p>'}</div>
      ${block('keywords')}`;
    refreshIcons(out);
  }
  out.addEventListener('input', (e) => { // modification manuelle d'un texte généré
    const key = e.target.dataset?.edit; if (!key) return;
    const value = e.target.value, had = key in edits;
    if (value === generate(raw())[key]) delete edits[key]; else edits[key] = value;
    const card = e.target.closest('.outblock');
    if (had !== (key in edits)) { card.querySelector('.card-title').innerHTML = head(key, value); refreshIcons(card); }
    else card.querySelector('.card-title span').textContent = `${value.length} caractères`;
  });
  out.addEventListener('click', (e) => {
    const reset = e.target.closest('[data-reset]'), copy = e.target.closest('[data-copy]');
    if (reset) { delete edits[reset.dataset.reset]; drawOut(); }
    else if (copy) { const k = copy.dataset.copy; copyText(k === 'price' ? out.querySelector('[data-price]')?.textContent || '' : current(k), k === 'price' ? 'Prix' : LABELS[k]); }
    else if (e.target.closest('[data-copyall]')) {
      const all = ['title', 'description', 'keywords'].map((k) => current(k).trim()).filter(Boolean);
      if (!all.length) { toast('Rien à copier : l’annonce est vide.'); return; }
      copyText(all.join('\n\n'), 'Annonce complète');
    }
  });

  const fillIfEmpty = (name, v) => { if (v && !form.elements[name].value.trim()) form.elements[name].value = v; };
  form.elements.articleId.addEventListener('change', () => {
    const a = st.articles.find((x) => x.id === form.elements.articleId.value); if (!a) return;
    fillIfEmpty('product', a.name); fillIfEmpty('info', a.description); fillIfEmpty('keywords', a.category); fillIfEmpty('price', a.targetPrice != null ? fromCents(a.targetPrice) : '');
    if (a.condition && !form.elements.condition.value) form.elements.condition.value = a.condition;
    drawOut();
  });
  form.elements.study.addEventListener('change', () => {
    const list = st.comparables.filter((c) => c.study === form.elements.study.value);
    if (!list.length) return;
    const r = analyse(list, { market: st.settings.market });
    if (r.insufficient) { toast('Données insuffisantes dans cette étude : prix non repris.'); return; }
    form.elements.price.value = fromCents(r.prices.balanced); drawOut();
  });
  form.addEventListener('input', drawOut);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const { errors, value } = validateListing(raw());
    form.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid'));
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errors[el.dataset.err] || ''; if (errors[el.dataset.err]) el.parentElement.classList.add('invalid'); });
    const first = Object.keys(errors)[0];
    if (first) { form.querySelector(`[name="${first}"]`).focus(); return; }
    const btn = form.querySelector('#save'); btn.disabled = true;
    try {
      const now = new Date().toISOString(), id = existing?.id || uid();
      await saveListing({ ...(existing || {}), ...value, id, createdAt: existing?.createdAt || now, updatedAt: now });
      toast('Brouillon enregistré');
      if (!existing) location.hash = `#/annonces/${id}`; else btn.disabled = false;
    } catch (err) { console.error(err); toast('Enregistrement impossible : ' + err.message); btn.disabled = false; }
  };
  drawOut();
}
