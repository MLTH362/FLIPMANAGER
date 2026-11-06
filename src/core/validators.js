import { STATUSES, SALE_STATUSES, CONDITIONS, SIMILARITIES } from './constants.js';
import { cleanEdits } from './listing.js';

/* "12,50" -> 1250 (centimes). Analyse de texte exacte : aucun flottant. NaN si invalide. */
export function toCents(input) {
  const s = String(input).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [i, d = ''] = s.split('.');
  return parseInt(i, 10) * 100 + parseInt((d + '00').slice(0, 2), 10);
}

/* Valide le formulaire article. Retourne { errors, value }. */
export function validateArticle(f) {
  const errors = {};
  const name = (f.name || '').trim();
  if (!name) errors.name = 'Le nom est obligatoire.';
  else if (name.length > 120) errors.name = '120 caractères maximum.';

  const money = (key, required) => {
    const s = (f[key] || '').trim();
    if (!s) { if (required) errors[key] = 'Ce montant est obligatoire.'; return required ? 0 : null; }
    const c = toCents(s);
    if (Number.isNaN(c)) { errors[key] = 'Montant invalide (exemple : 12,50).'; return 0; }
    return c;
  };
  const buyPrice = money('buyPrice', true);
  // Frais détaillés (livraison attribuée, emballage, autres) : `fees` en reste le total, lu par tous les modules.
  const split = ['feeShip', 'feePack', 'feeOther'].some((k) => f[k] !== undefined);
  let fees, parts = {};
  if (split) {
    const feeShip = money('feeShip', false) ?? 0, feePack = money('feePack', false) ?? 0, feeOther = money('feeOther', false) ?? 0;
    parts = { feeShip, feePack, feeOther }; fees = feeShip + feePack + feeOther;
  } else fees = money('fees', false) ?? 0;
  const targetPrice = money('targetPrice', false);
  if (targetPrice === 0) errors.targetPrice = 'Le prix de vente envisagé doit être supérieur à 0 (ou laissez vide).';

  const boughtOn = (f.boughtOn || '').trim(); // facultatif : sert aux délais de vente
  if (boughtOn && (!/^\d{4}-\d{2}-\d{2}$/.test(boughtOn) || !realDate(boughtOn))) errors.boughtOn = 'Date invalide.';
  const url = (f.supplierUrl || '').trim();
  if (url) {
    try { if (!/^https?:$/.test(new URL(url).protocol)) throw new Error(); }
    catch { errors.supplierUrl = 'Lien invalide (il doit commencer par https://).'; }
  }
  if (!STATUSES.includes(f.status)) errors.status = 'Statut invalide.';

  return { errors, value: { name, category: (f.category || '').trim(), condition: f.condition || '',
    description: (f.description || '').trim(), buyPrice, fees, ...parts, targetPrice, boughtOn, supplierUrl: url, status: f.status } };
}

const realDate = (iso) => { const [y, m, d] = iso.split('-').map(Number), t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };

/* Valide le formulaire vente. ctx = { sales, editingId }. Retourne { errors, value }. */
export function validateSale(f, { sales = [], editingId = null } = {}) {
  const errors = {};
  const money = (key, required) => {
    const s = (f[key] || '').trim();
    if (!s) { if (required) errors[key] = 'Ce montant est obligatoire.'; return 0; }
    const c = toCents(s);
    if (Number.isNaN(c)) { errors[key] = 'Montant invalide (exemple : 12,50).'; return 0; }
    return c;
  };
  if (!f.articleId) errors.articleId = 'Choisissez un article.';
  const date = (f.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !realDate(date)) errors.date = 'Date invalide.';
  const price = money('price', true), fees = money('fees', false), expenses = money('expenses', false);
  if (!SALE_STATUSES.includes(f.status)) errors.status = 'Statut invalide.';
  else if (f.status === 'terminée') {
    if (!errors.price && price <= 0) errors.price = 'Le prix vendu doit être supérieur à 0.';
    if (sales.some((s) => s.articleId === f.articleId && s.status === 'terminée' && s.id !== editingId)) errors.status = 'Cet article a déjà une vente terminée.';
  }
  const note = (f.note || '').trim();
  if (note.length > 500) errors.note = '500 caractères maximum.';
  return { errors, value: { articleId: f.articleId, date, price, fees, expenses, status: f.status, note } };
}

/* Valide un comparable d'étude de marché. Retourne { errors, value }. */
export function validateComparable(f) {
  const errors = {};
  const study = (f.study || '').trim(), name = (f.name || '').trim(), url = (f.url || '').trim();
  if (!study) errors.study = 'Indiquez le produit étudié.'; else if (study.length > 80) errors.study = '80 caractères maximum.';
  if (!name) errors.name = 'Le nom du produit est obligatoire.'; else if (name.length > 120) errors.name = '120 caractères maximum.';
  let price = 0;
  const ps = (f.price || '').trim();
  if (!ps) errors.price = 'Le prix affiché est obligatoire.';
  else { price = toCents(ps); if (Number.isNaN(price)) { errors.price = 'Montant invalide (exemple : 12,50).'; price = 0; } else if (price <= 0) errors.price = 'Le prix doit être supérieur à 0.'; }
  if (url) { try { if (!/^https?:$/.test(new URL(url).protocol)) throw new Error(); } catch { errors.url = 'Lien invalide (il doit commencer par https://).'; } }
  const date = (f.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !realDate(date)) errors.date = 'Date invalide.';
  if (f.condition && !CONDITIONS.includes(f.condition)) errors.condition = 'État invalide.';
  const similarity = f.similarity || 'Similaire';
  if (!SIMILARITIES.includes(similarity)) errors.similarity = 'Niveau de similarité invalide.';
  const comment = (f.comment || '').trim();
  if (comment.length > 500) errors.comment = '500 caractères maximum.';
  return { errors, value: { study, name, url, price, condition: f.condition || '', similarity, date, comment } };
}

/* Réglages de l'étude de marché. Pourcentages saisis en % (« -5 », « 12,5 »), stockés en centièmes de % (−500, 1250). */
export function validateMarketSettings(f) {
  const errors = {};
  const signed = (k, min, max, label) => {
    const s = String(f[k] ?? '').trim().replace(',', '.').replace(/\s/g, '') || '0', neg = s.startsWith('-');
    const c = toCents(neg ? s.slice(1) : s);
    if (Number.isNaN(c) || (neg ? -c : c) < min || (neg ? -c : c) > max) { errors[k] = `${label} : entre ${min / 100} et ${max / 100} %.`; return 0; }
    return neg ? -c : c;
  };
  const money = (k) => { const s = String(f[k] ?? '').trim(); if (!s) return 0; const c = toCents(s); if (Number.isNaN(c)) { errors[k] = 'Montant invalide (exemple : 1,50).'; return 0; } return c; };
  const int = (k, min, max, label) => { const s = String(f[k] ?? '').trim(); if (!/^\d+$/.test(s) || +s < min || +s > max) { errors[k] = `${label} : entier entre ${min} et ${max}.`; return min; } return +s; };
  const value = {
    posCompetitive: signed('posCompetitive', -9000, 100000, 'Écart compétitif'), posBalanced: signed('posBalanced', -9000, 100000, 'Écart équilibré'),
    posMaximizing: signed('posMaximizing', -9000, 100000, 'Écart maximal'), weightSimilar: int('weightSimilar', 0, 100, 'Poids'),
    minComparables: int('minComparables', 1, 50, 'Minimum de comparables'), feeFixed: money('feeFixed'), feeRate: signed('feeRate', 0, 9999, 'Frais de vente'), minProfit: money('minProfit') };
  if (!errors.posCompetitive && !errors.posBalanced && value.posCompetitive > value.posBalanced) errors.posCompetitive = 'Le prix compétitif doit rester inférieur ou égal à l’équilibré.';
  if (!errors.posMaximizing && !errors.posBalanced && value.posMaximizing < value.posBalanced) errors.posMaximizing = 'Le prix maximal doit rester supérieur ou égal à l’équilibré.';
  return { errors, value };
}

/* Valide un brouillon d'annonce. Retourne { errors, value }. */
export function validateListing(f) {
  const errors = {}, t = (k) => (f[k] || '').trim();
  const max = (k, n, label) => { if (t(k).length > n) errors[k] = `${label} : ${n} caractères maximum.`; };
  if (!t('product')) errors.product = 'Le nom du produit est obligatoire.';
  max('product', 120, 'Produit'); ['brand', 'size', 'color', 'material'].forEach((k) => max(k, 60, 'Champ'));
  max('flaws', 500, 'Remarques'); max('extraLines', 1000, 'Caractéristiques'); max('info', 1500, 'Informations'); max('keywords', 300, 'Mots-clés');
  if (f.condition && !CONDITIONS.includes(f.condition)) errors.condition = 'État invalide.';
  let price = null;
  if (t('price')) { price = toCents(t('price')); if (Number.isNaN(price)) { errors.price = 'Montant invalide (exemple : 12,50).'; price = null; } else if (price <= 0) errors.price = 'Le prix doit être supérieur à 0.'; }
  const noDefects = f.noDefects === 'on' || f.noDefects === true;
  if (noDefects && t('flaws')) errors.noDefects = 'Décochez cette case si vous décrivez des défauts.';
  return { errors, value: { articleId: f.articleId || '', product: t('product'), brand: t('brand'), size: t('size'), color: t('color'), material: t('material'),
    condition: f.condition || '', flaws: t('flaws'), noDefects, extraLines: t('extraLines'), info: t('info'), keywords: t('keywords'), price, edits: cleanEdits(f.edits) } };
}

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD'];

/* Réglages généraux : objectifs de bénéfice, frais de vente, cotisations. Taux saisis en %, stockés en centièmes de %. */
export function validateSettings(f) {
  const errors = {}, t = (k) => String(f[k] ?? '').trim();
  const money = (k, label) => { if (!t(k)) return 0; const c = toCents(t(k)); if (Number.isNaN(c) || c > 100000000) { errors[k] = `${label} : montant invalide (exemple : 12,50).`; return 0; } return c; };
  const rate = (k, label) => { if (!t(k)) return 0; const c = toCents(t(k)); if (Number.isNaN(c) || c > 9999) { errors[k] = `${label} : entre 0 et 99,99 %.`; return 0; } return c; };
  if (!CURRENCIES.includes(f.currency)) errors.currency = 'Devise non prise en charge.';
  const goals = [];
  for (const part of t('goals').split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const c = toCents(part);
    if (Number.isNaN(c) || c <= 0 || c > 100000000) { errors.goals = `Objectif invalide : « ${part} » (exemple : 1 ; 2,50 ; 5).`; break; }
    goals.push(c);
  }
  const uniq = [...new Set(goals)].sort((a, b) => a - b);
  if (!errors.goals && (!uniq.length || uniq.length > 10)) errors.goals = 'Entre 1 et 10 objectifs, séparés par des points-virgules.';
  const value = { currency: f.currency, goals: uniq, monthlyGoal: money('monthlyGoal', 'Objectif mensuel'), minMargin: rate('minMargin', 'Marge minimale'), chargeRate: rate('chargeRate', 'Cotisations'),
    market: { feeFixed: money('feeFixed', 'Frais fixes'), feeRate: rate('feeRate', 'Frais de vente'), minProfit: money('minProfit', 'Bénéfice minimum') } };
  if (!errors.feeRate && !errors.chargeRate && value.market.feeRate + value.chargeRate >= 10000) errors.chargeRate = 'Frais de vente + cotisations doivent rester sous 100 %.';
  return { errors, value };
}
