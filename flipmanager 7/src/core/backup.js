/* Sauvegarde complète (JSON, photos incluses) et exports CSV. Fonctions pures : la lecture/écriture IndexedDB et les
   photos (Blob <-> texte) sont gérées par la page Paramètres. */
import { SALE_STATUSES } from './constants.js';
import { articleCost, estimatedProfit } from './articles.js';
import { saleCost, saleProfit } from './sales.js';
import { fromCents } from '../utils/format.js';

export const BACKUP_VERSION = 1;
const LISTS = ['articles', 'sales', 'comparables', 'listings', 'images'];
const isInt = Number.isInteger, isStr = (v) => typeof v === 'string';
const IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/; // pas de SVG : il peut contenir du script

/* Contrôle un fichier de sauvegarde avant toute restauration. Renvoie { errors, warnings, counts, data }. */
export function validateBackup(obj) {
  const errors = [], warnings = [];
  const fail = (e) => ({ errors: [e], warnings, counts: null, data: null });
  if (!obj || typeof obj !== 'object' || obj.app !== 'flipmanager') return fail('Ce fichier n’est pas une sauvegarde FLIPMANAGER.');
  if (!isInt(obj.version) || obj.version < 1 || obj.version > BACKUP_VERSION) return fail(`Version de sauvegarde non prise en charge (${obj.version ?? 'inconnue'}).`);
  const d = obj.data;
  if (!d || typeof d !== 'object') return fail('La sauvegarde ne contient pas de données.');
  for (const k of LISTS) if (!Array.isArray(d[k])) errors.push(`Section « ${k} » absente ou invalide.`);
  if (errors.length) return { errors, warnings, counts: null, data: null };

  const check = (list, label, fn) => {
    const ids = new Set();
    list.forEach((r, i) => {
      if (!r || typeof r !== 'object' || !isStr(r.id) || !r.id) { errors.push(`${label} n°${i + 1} : identifiant manquant.`); return; }
      if (ids.has(r.id)) errors.push(`${label} n°${i + 1} : identifiant en double.`);
      ids.add(r.id);
      const problem = fn(r); if (problem) errors.push(`${label} « ${r.name ?? r.id} » : ${problem}`);
    });
    return ids;
  };
  const money = (v, min = 0) => isInt(v) && v >= min;
  const artIds = check(d.articles, 'Article', (a) => (!isStr(a.name) || !a.name.trim() ? 'nom manquant.' : !money(a.buyPrice) || !money(a.fees) ? 'montants invalides.' : !isStr(a.status) ? 'statut manquant.' : ''));
  check(d.sales, 'Vente', (s) => (!isStr(s.articleId) || !isStr(s.date) ? 'article ou date manquant.' : !money(s.price) || !money(s.fees) || !money(s.expenses) ? 'montants invalides.' : !SALE_STATUSES.includes(s.status) ? 'statut invalide.' : s.cost != null && !money(s.cost) ? 'coût invalide.' : ''));
  check(d.comparables, 'Comparable', (c) => (!isStr(c.study) || !isStr(c.name) ? 'étude ou nom manquant.' : !money(c.price, 1) ? 'prix invalide.' : ''));
  check(d.listings, 'Annonce', (l) => (!isStr(l.product) ? 'produit manquant.' : ''));
  check(d.images, 'Photo', (p) => (!isStr(p.articleId) ? 'article manquant.' : !isStr(p.data) || !IMG.test(p.data) ? 'image invalide (formats acceptés : PNG, JPEG, WebP, GIF).' : ''));
  let settings = null;
  if (d.settings != null) { if (typeof d.settings !== 'object' || Array.isArray(d.settings)) errors.push('Réglages invalides.'); else settings = { ...d.settings, id: 'main' }; }

  const lost = (list, key) => list.filter((r) => r[key] && !artIds.has(r[key])).length;
  if (lost(d.sales, 'articleId')) warnings.push(`${lost(d.sales, 'articleId')} vente(s) liée(s) à un article absent de la sauvegarde.`);
  if (lost(d.images, 'articleId')) warnings.push(`${lost(d.images, 'articleId')} photo(s) liée(s) à un article absent de la sauvegarde.`);
  const counts = Object.fromEntries(LISTS.map((k) => [k, d[k].length]));
  if (errors.length > 10) errors.splice(10, errors.length, `… et ${errors.length - 10} autre(s) erreur(s).`);
  return { errors, warnings, counts, data: errors.length ? null : { ...Object.fromEntries(LISTS.map((k) => [k, d[k]])), settings: settings ? [settings] : [] } };
}

/* ---------------- CSV (séparateur « ; », virgule décimale : s'ouvre directement dans Excel en français) ---------------- */
const amount = (c) => (c == null ? '' : (c < 0 ? '-' : '') + fromCents(Math.abs(c)));
const cell = (v, text) => {
  let s = v == null ? '' : String(v);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise les formules (injection CSV) dans les textes saisis
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows, cols) => '\uFEFF' + [cols.map((c) => cell(c.h)).join(';'), ...rows.map((r) => cols.map((c) => cell(c.v(r), c.text)).join(';'))].join('\r\n') + '\r\n';

export const articlesCsv = (articles) => toCsv(articles, [
  { h: 'Nom', v: (a) => a.name, text: true }, { h: 'Catégorie', v: (a) => a.category, text: true }, { h: 'État', v: (a) => a.condition }, { h: 'Statut', v: (a) => a.status },
  { h: 'Prix d’achat', v: (a) => amount(a.buyPrice) }, { h: 'Frais', v: (a) => amount(a.fees) }, { h: 'Coût de revient', v: (a) => amount(articleCost(a)) },
  { h: 'Prix de vente envisagé', v: (a) => amount(a.targetPrice) }, { h: 'Bénéfice estimé', v: (a) => amount(estimatedProfit(a)) },
  { h: 'Date d’achat', v: (a) => a.boughtOn }, { h: 'Ajouté le', v: (a) => (a.createdAt || '').slice(0, 10) }]);

export const salesCsv = (sales, byId) => toCsv([...sales].sort((a, b) => a.date.localeCompare(b.date)), [
  { h: 'Date', v: (s) => s.date }, { h: 'Article', v: (s) => byId.get(s.articleId)?.name ?? 'Article supprimé', text: true }, { h: 'Statut', v: (s) => s.status },
  { h: 'Prix vendu', v: (s) => amount(s.price) }, { h: 'Frais de vente', v: (s) => amount(s.fees) }, { h: 'Dépenses', v: (s) => amount(s.expenses) },
  { h: 'Coût de l’article', v: (s) => amount(saleCost(s, byId.get(s.articleId))) }, { h: 'Bénéfice réalisé', v: (s) => (s.status === 'terminée' ? amount(saleProfit(s, byId.get(s.articleId))) : '') }]);

export const comparablesCsv = (list) => toCsv([...list].sort((a, b) => a.study.localeCompare(b.study, 'fr') || a.price - b.price), [
  { h: 'Étude', v: (c) => c.study, text: true }, { h: 'Produit', v: (c) => c.name, text: true }, { h: 'Prix affiché', v: (c) => amount(c.price) },
  { h: 'Similarité', v: (c) => c.similarity || 'Similaire' }, { h: 'État', v: (c) => c.condition }, { h: 'Consulté le', v: (c) => c.date }, { h: 'Lien', v: (c) => c.url, text: true }]);
