/* Règles « Mes articles » : coût, migration des statuts, recherche/filtres/tri et doublons. Fonctions pures. */
import { STATUS_MIGRATION } from './constants.js';

/* Coût de revient d'un article = prix d'achat + frais (livraison attribuée + emballage + autres). */
export const articleCost = (a) => (a ? a.buyPrice + a.fees : 0);
export const estimatedProfit = (a) => (a.targetPrice == null ? null : a.targetPrice - articleCost(a));

/* Renvoie l'article avec le nouveau nom de statut, ou null s'il n'y a rien à migrer. */
export const migrateArticle = (a) => (STATUS_MIGRATION[a.status] ? { ...a, status: STATUS_MIGRATION[a.status] } : null);

/* Texte sans accents ni majuscules, pour une recherche tolérante (« vetement » trouve « Vêtements »). */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const findDuplicate = (articles, name, ignoreId = null) => articles.find((a) => a.id !== ignoreId && norm(a.name) === norm(name)) || null;

export const SORTS = [['recent', 'Plus récents'], ['name', 'Nom (A → Z)'], ['cost', 'Coût décroissant'], ['profit', 'Bénéfice estimé décroissant']];

/* Filtre (tous les mots recherchés doivent apparaître dans nom, catégorie, état, description ou statut) puis trie. */
export function filterArticles(list, { q = '', status = '', category = '', sort = 'recent' } = {}) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const out = list.filter((a) => (!status || a.status === status) && (!category || a.category === category)
    && (!words.length || words.every((w) => norm(`${a.name} ${a.category} ${a.condition} ${a.description} ${a.status}`).includes(w))));
  const by = {
    recent: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
    name: (a, b) => a.name.localeCompare(b.name, 'fr'),
    cost: (a, b) => articleCost(b) - articleCost(a),
    profit: (a, b) => (estimatedProfit(b) ?? -Number.MAX_SAFE_INTEGER) - (estimatedProfit(a) ?? -Number.MAX_SAFE_INTEGER),
  };
  return out.sort(by[sort] || by.recent);
}
