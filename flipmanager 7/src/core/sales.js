/* Règles « Ventes » : coût figé au moment de la vente, bénéfice réalisé, totaux. Fonctions pures.
   Une vente terminée garde le coût de l'article tel qu'il était à la vente : modifier ensuite l'article
   (ou le supprimer) ne change plus le bénéfice déjà réalisé. */
import { articleCost } from './articles.js';

export const saleCost = (s, a) => (s.cost != null ? s.cost : articleCost(a));
/* Bénéfice final = prix vendu − frais de vente − dépenses − coût de l'article. */
export const saleProfit = (s, a) => s.price - s.fees - s.expenses - saleCost(s, a);

/* Vente à enregistrer, avec le coût figé : conservé tant que la vente reste terminée, recalculé quand elle (re)devient terminée. */
export function withCostSnapshot(sale, prev, article) {
  if (sale.status !== 'terminée') return sale;
  if (prev?.status === 'terminée' && prev.cost != null) return { ...sale, cost: prev.cost };
  if (article) return { ...sale, cost: articleCost(article) };
  return sale;
}

/* Anciennes ventes terminées sans coût figé : le coût actuel de leur article est enregistré une fois pour toutes. */
export const backfillCosts = (sales, articles) => {
  const byId = new Map(articles.map((a) => [a.id, a]));
  return sales.filter((s) => s.status === 'terminée' && s.cost == null && byId.has(s.articleId)).map((s) => ({ ...s, cost: articleCost(byId.get(s.articleId)) }));
};

/* Totaux : seules les ventes terminées comptent ; les frais saisis sur des ventes remboursées sont indiqués à part. */
export function salesSummary(sales, byId) {
  const done = sales.filter((s) => s.status === 'terminée');
  return { done, count: done.length, revenue: done.reduce((t, s) => t + s.price, 0),
    profit: done.reduce((t, s) => t + saleProfit(s, byId.get(s.articleId)), 0),
    others: sales.length - done.length,
    refundedCosts: sales.filter((s) => s.status === 'remboursée').reduce((t, s) => t + s.fees + s.expenses, 0) };
}
