import { icons, createIcons } from 'lucide';

export const refreshIcons = (root = document) => createIcons({ icons, root });

export const pageHeader = (title, subtitle, actionHtml = '') =>
  `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${actionHtml}</div>`;

export const kpiCard = ({ label, value, icon, hero = false, tone = '' }) =>
  `<div class="card kpi ${hero ? 'kpi-hero' : ''}">
     <div class="kpi-top"><span>${label}</span><span class="kpi-icon"><i data-lucide="${icon}"></i></span></div>
     <div class="kpi-value ${tone}">${value}</div></div>`;

export const emptyState = (icon, title, text) =>
  `<div class="empty"><i data-lucide="${icon}"></i><strong>${title}</strong><span>${text}</span></div>`;

export function toast(message) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = message;
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- Fenêtres modales, confirmation, champs de formulaire ---------- */
import { esc } from '../utils/dom.js';

export function openModal({ title, body, wide = false, onClose }) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer"><i data-lucide="x"></i></button></div>
    <div class="modal-body">${body}</div></div>`;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { o.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  o.addEventListener('mousedown', (e) => { if (e.target === o || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(o);
  refreshIcons(o);
  o.querySelector('input,select,textarea')?.focus();
  return { root: o.querySelector('.modal'), close };
}

/* Retourne une Promise<boolean> ; Échap ou clic à côté = annuler. */
export const confirmDialog = ({ title, message, confirmLabel = 'Supprimer' }) => new Promise((resolve) => {
  let done = false;
  const fin = (v) => { if (!done) { done = true; resolve(v); } };
  const m = openModal({ title, onClose: () => fin(false), body: `<p class="muted">${message}</p>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-no>Annuler</button>
    <button type="button" class="btn btn-danger" data-yes>${confirmLabel}</button></div>` });
  m.root.querySelector('[data-yes]').onclick = () => { fin(true); m.close(); };
  m.root.querySelector('[data-no]').onclick = () => m.close();
  m.root.querySelector('[data-no]').focus();
});

const wrap = (name, label, required, full, hint, inner) =>
  `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${label}${required ? ' <span class="req">*</span>' : ''}</label>${inner}${hint ? `<small>${hint}</small>` : ''}<span class="err" data-err="${name}"></span></div>`;

export const field = ({ label, name, value = '', type = 'text', placeholder = '', hint = '', full = false, required = false, list = '', inputmode = '' }) =>
  wrap(name, label, required, full, hint, `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${list ? `list="${list}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''} autocomplete="off">`);

export const selectField = ({ label, name, value = '', options, full = false, hint = '', disabled = [], blank = '' }) =>
  wrap(name, label, false, full, hint, `<select id="f-${name}" name="${name}">${blank ? `<option value="">${blank}</option>` : ''}${options.map((o) => {
    const v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(v)}" ${v === value ? 'selected' : ''} ${disabled.includes(v) ? 'disabled' : ''}>${esc(l)}</option>`; }).join('')}</select>`);

export const textareaField = ({ label, name, value = '', full = true, hint = '' }) =>
  wrap(name, label, false, full, hint, `<textarea id="f-${name}" name="${name}">${esc(value)}</textarea>`);

/* Copie dans le presse-papiers (avec repli pour les contextes sans l'API moderne). */
export async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select();
    const ok = document.execCommand('copy'); t.remove();
    if (!ok) { toast('Copie impossible : sélectionnez le texte à la main.'); return; }
  }
  toast(`${label} copié`);
}
