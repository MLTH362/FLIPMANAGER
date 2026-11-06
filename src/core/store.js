/* État applicatif + persistance IndexedDB. Montants en centimes entiers.
   article = { id, name, category, condition, description, buyPrice, fees, targetPrice|null,
               supplierUrl, status, createdAt, updatedAt }
   sale    = { id, articleId, date, price, fees, expenses, status: 'terminée'|'annulée'|'remboursée' } */
import * as db from './db.js';
import { DEFAULT_MARKET } from './market.js';
import { migrateArticle } from './articles.js';
import { withCostSnapshot, backfillCosts } from './sales.js';
import { STATUS_MIGRATION } from './constants.js';
import { deleteArticleImages } from './images.js';

const DEFAULT_SETTINGS = { id: 'main', budget: 0, currency: 'EUR', goals: [100, 200, 300, 500, 1000], minMargin: 0, chargeRate: 0, monthlyGoal: 0, lastBackupAt: '', market: { ...DEFAULT_MARKET } };
const state = { articles: [], sales: [], comparables: [], listings: [], settings: { ...DEFAULT_SETTINGS } };
const subs = new Set();

export const getState = () => state;
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
export const emit = () => subs.forEach((fn) => fn(state));

export async function initStore() {
  const [articles, sales, comparables, listings, settings] = await Promise.all([db.getAll('articles'), db.getAll('sales'), db.getAll('comparables'), db.getAll('listings'), db.getAll('settings')]);
  const old = articles.filter((a) => STATUS_MIGRATION[a.status]); // anciens noms de statut : renommés une fois, puis enregistrés
  if (old.length) { try { await db.batch(old.map((a) => ({ store: 'articles', put: migrateArticle(a) }))); } catch (e) { console.error('Migration des statuts impossible', e); } }
  state.articles = articles.map((a) => migrateArticle(a) || a);
  const fix = backfillCosts(sales, state.articles); // anciennes ventes : coût de l'article figé une fois
  if (fix.length) { try { await db.batch(fix.map((s) => ({ store: 'sales', put: s }))); } catch (e) { console.error('Migration des coûts impossible', e); } }
  const fixed = new Map(fix.map((s) => [s.id, s]));
  state.sales = sales.map((s) => fixed.get(s.id) || s); state.comparables = comparables; state.listings = listings;
  const saved = settings.find((s) => s.id === 'main') || {};
  state.settings = { ...DEFAULT_SETTINGS, ...saved, market: { ...DEFAULT_MARKET, ...(saved.market || {}) } }; // anciennes bases : valeurs par défaut ajoutées
  navigator.storage?.persist?.(); // demande au navigateur de ne pas purger les données
  emit();
}

/* Écrit d'abord en base : l'état mémoire n'est modifié que si l'écriture a réussi. */
export async function saveArticle(article) {
  await db.put('articles', article);
  const i = state.articles.findIndex((a) => a.id === article.id);
  if (i >= 0) state.articles[i] = article; else state.articles.push(article);
  emit();
}

/* Un article avec des ventes ne peut pas être supprimé (son coût sert au bénéfice réalisé) ; sinon l'article et ses photos sont supprimés. */
export async function removeArticle(id) {
  if (state.sales.some((s) => s.articleId === id)) throw new Error('cet article a des ventes enregistrées (les supprimer fausserait vos bénéfices).');
  await deleteArticleImages(id);
  await db.remove('articles', id);
  state.articles = state.articles.filter((a) => a.id !== id);
  emit();
}

/* Statut de l'article déduit de la vente : terminée -> Vendu ; annulée/remboursée -> l'article revient en stock. */
function articleAfter(sale, art) {
  if (!art) return null;
  const status = sale.status === 'terminée' ? 'Vendu' : art.status === 'Vendu' ? 'En stock' : art.status;
  return status === art.status ? null : { ...art, status, updatedAt: new Date().toISOString() };
}

/* Vente + mise à jour de l'article dans une seule transaction : aucun état intermédiaire possible. */
export async function saveSale(input) {
  const art0 = state.articles.find((a) => a.id === input.articleId);
  const sale = withCostSnapshot(input, state.sales.find((x) => x.id === input.id), art0); // coût de l'article figé à la vente
  const art = articleAfter(sale, art0);
  await db.batch([{ store: 'sales', put: sale }, ...(art ? [{ store: 'articles', put: art }] : [])]);
  const i = state.sales.findIndex((x) => x.id === sale.id);
  if (i >= 0) state.sales[i] = sale; else state.sales.push(sale);
  if (art) state.articles = state.articles.map((a) => (a.id === art.id ? art : a));
  emit();
}

export async function removeSale(id) {
  const sale = state.sales.find((x) => x.id === id), art0 = state.articles.find((a) => a.id === sale?.articleId);
  const art = sale?.status === 'terminée' && art0?.status === 'Vendu' ? { ...art0, status: 'En stock', updatedAt: new Date().toISOString() } : null;
  await db.batch([{ store: 'sales', del: id }, ...(art ? [{ store: 'articles', put: art }] : [])]);
  state.sales = state.sales.filter((x) => x.id !== id);
  if (art) state.articles = state.articles.map((a) => (a.id === art.id ? art : a));
  emit();
}

/* ---------- Étude de marché ---------- */
export async function saveComparable(c) {
  await db.put('comparables', c);
  const i = state.comparables.findIndex((x) => x.id === c.id);
  if (i >= 0) state.comparables[i] = c; else state.comparables.push(c);
  emit();
}

export async function removeComparables(ids) {
  await db.batch(ids.map((id) => ({ store: 'comparables', del: id })));
  state.comparables = state.comparables.filter((c) => !ids.includes(c.id));
  emit();
}

/* Réglages de l'étude de marché (écrits en base avant de modifier l'état). */
export async function saveMarketSettings(market) {
  const next = { ...state.settings, market: { ...DEFAULT_MARKET, ...market } };
  await db.put('settings', next);
  state.settings = next;
  emit();
}

/* Réglages généraux (+ éventuellement une partie des réglages de l'étude de marché), écrits en base avant l'état. */
export async function saveSettings(general, marketPatch = {}) {
  const next = { ...state.settings, ...general, market: { ...state.settings.market, ...marketPatch } };
  await db.put('settings', next);
  state.settings = next;
  emit();
}

/* ---------- Brouillons d'annonces ---------- */
export async function saveListing(l) {
  await db.put('listings', l);
  const i = state.listings.findIndex((x) => x.id === l.id);
  if (i >= 0) state.listings[i] = l; else state.listings.push(l);
  emit();
}

export async function removeListing(id) {
  await db.remove('listings', id);
  state.listings = state.listings.filter((x) => x.id !== id);
  emit();
}
