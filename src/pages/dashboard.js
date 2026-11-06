import { saleProfit } from '../core/sales.js';
import { monthly, byCategory } from '../core/stats.js';
import { Chart, registerables } from 'chart.js';
import { getState } from '../core/store.js';
import { money, dateFr, monthKey, monthLabel } from '../utils/format.js';
import { pageHeader, kpiCard, emptyState } from '../components/ui.js';
import { esc } from '../utils/dom.js';

Chart.register(...registerables);
Chart.defaults.color = '#9AA5B8';
Chart.defaults.font.family = 'Segoe UI, system-ui, sans-serif';
Chart.defaults.borderColor = 'rgba(255,255,255,.06)';

const GOLD = '#F5BD35';
const SHADES = ['#F5BD35', '#C99A28', '#9C7620', '#6F5418', '#4A3911', '#8A93A6'];

/* Calculs du dashboard : uniquement à partir des données enregistrées (centimes entiers). */
function compute({ articles, sales }) {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const cost = (a) => (a ? a.buyPrice + a.fees : 0);
  const done = sales.filter((s) => s.status === 'terminée'); // annulées/remboursées exclues
  const profitOf = (s) => saleProfit(s, byId.get(s.articleId)); // coût figé à la vente
  const open = articles.filter((a) => ['En stock', 'En vente'].includes(a.status));
  return {
    revenue: done.reduce((t, s) => t + s.price, 0),
    realised: done.reduce((t, s) => t + profitOf(s), 0),
    estimated: open.reduce((t, a) => t + (a.targetPrice ? a.targetPrice - cost(a) : 0), 0),
    invested: articles.filter((a) => a.status !== 'Archivé' && a.status !== 'À acheter').reduce((t, a) => t + cost(a), 0),
    stockValue: open.reduce((t, a) => t + cost(a), 0),
    available: open.length,
    sold: done.length,
    listed: articles.filter((a) => a.status === 'En vente').length,
    done, byId, profitOf,
  };
}

export function dashboardPage(view) {
  const st = getState(), cur = st.settings.currency, m = compute(st), fmt = (c) => money(c, cur);
  const tone = (c) => (c > 0 ? 'pos' : c < 0 ? 'neg' : '');
  const name = (s) => esc(m.byId.get(s.articleId)?.name ?? 'Article supprimé');

  const mrows = monthly(st.sales, m.byId), months = mrows.map((r) => r.key); // mois consécutifs : un mois sans vente vaut 0
  const catRows = byCategory(st.articles, st.sales).filter((r) => r.sold > 0);
  const cats = {};
  st.articles.forEach((a) => { const c = a.category || 'Sans catégorie'; cats[c] = (cats[c] || 0) + 1; });
  const top = m.done.map((s) => ({ s, p: m.profitOf(s) })).sort((a, b) => b.p - a.p).slice(0, 5);
  const last = [...m.done].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  view.innerHTML = pageHeader('Dashboard', 'Vue d’ensemble de votre activité d’achat-revente.',
    '<a class="btn btn-primary" href="#/articles"><i data-lucide="plus"></i>Ajouter un article</a>') + `
    <div class="kpis">
      ${kpiCard({ label: 'Chiffre d’affaires', value: fmt(m.revenue), icon: 'wallet', hero: true })}
      ${kpiCard({ label: 'Bénéfices réalisés', value: fmt(m.realised), icon: 'circle-dollar-sign', hero: true, tone: m.realised < 0 ? 'neg' : '' })}
      ${kpiCard({ label: 'Bénéfices estimés', value: fmt(m.estimated), icon: 'hourglass', tone: tone(m.estimated) })}
      ${kpiCard({ label: 'Total investi', value: fmt(m.invested), icon: 'piggy-bank' })}
      ${kpiCard({ label: 'Valeur des articles disponibles', value: fmt(m.stockValue), icon: 'archive' })}
      ${kpiCard({ label: 'Articles disponibles', value: m.available, icon: 'package-check' })}
      ${kpiCard({ label: 'Articles vendus', value: m.sold, icon: 'badge-check' })}
      ${kpiCard({ label: 'Annonces actives', value: m.listed, icon: 'megaphone' })}
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title"><h2>Bénéfices mensuels</h2><span>Ventes terminées</span></div>
        <div class="chart-box"><canvas id="c-profit"></canvas>${months.length ? '' : emptyState('line-chart', 'Aucune vente enregistrée', 'Le graphique se remplira avec votre première vente.')}</div></div>
      <div class="card"><div class="card-title"><h2>Répartition par catégories</h2><span>Articles</span></div>
        <div class="chart-box"><canvas id="c-cats"></canvas>${Object.keys(cats).length ? '' : emptyState('pie-chart', 'Aucun article', 'Ajoutez des articles avec une catégorie.')}</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title"><h2>Ventes par mois</h2><span>Nombre de ventes</span></div>
        <div class="chart-box"><canvas id="c-sales"></canvas>${months.length ? '' : emptyState('bar-chart-3', 'Aucune donnée', 'Les ventes terminées apparaîtront ici.')}</div></div>
      <div class="card"><div class="card-title"><h2>Bénéfice par catégorie</h2><span>Ventes terminées</span></div>
        <div class="chart-box"><canvas id="c-catprofit"></canvas>${catRows.length ? '' : emptyState('bar-chart-horizontal', 'Aucune donnée', 'Ventes terminées par catégorie d’article.')}</div>
        ${catRows.length ? `<p class="note">Détails (marges, délais) dans <a class="lnk" href="#/statistiques">Statistiques</a>.</p>` : ''}</div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title"><h2>Dernières transactions</h2></div>
        ${last.length ? `<table><thead><tr><th>Article</th><th>Date</th><th class="num">Prix vendu</th><th class="num">Bénéfice</th></tr></thead><tbody>
          ${last.map((s) => `<tr><td>${name(s)}</td><td>${dateFr(s.date)}</td><td class="num">${fmt(s.price)}</td><td class="num ${tone(m.profitOf(s))}">${fmt(m.profitOf(s))}</td></tr>`).join('')}</tbody></table>`
          : emptyState('receipt', 'Aucune transaction', 'Enregistrez une vente dans « Mes ventes ».')}</div>
      <div class="card"><div class="card-title"><h2>Articles les plus rentables</h2></div>
        ${top.length ? `<table><tbody>${top.map(({ s, p }) => `<tr><td>${name(s)}</td><td class="num ${tone(p)}">${fmt(p)}</td></tr>`).join('')}</tbody></table>`
          : emptyState('trophy', 'Pas encore de classement', 'Il apparaîtra après vos premières ventes.')}</div>
    </div>`;

  const charts = [];
  const mk = (id, cfg) => { const el = view.querySelector(id); if (el) charts.push(new Chart(el, cfg)); };
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
  const labels = months.map(monthLabel);

  mk('#c-profit', { type: 'line', data: { labels, datasets: [
    { label: 'Bénéfice', data: mrows.map((r) => r.profit / 100), borderColor: GOLD, backgroundColor: 'rgba(245,189,53,.12)', fill: true, tension: .35, pointRadius: 3 },
    { label: 'Chiffre d’affaires', data: mrows.map((r) => r.revenue / 100), borderColor: '#8A93A6', borderDash: [5, 4], tension: .35, pointRadius: 2 }] },
    options: { ...base, plugins: { legend: { display: true, position: 'bottom' } } } });
  mk('#c-sales', { type: 'bar', data: { labels, datasets: [{ data: mrows.map((r) => r.count), backgroundColor: GOLD, borderRadius: 5 }] },
    options: { ...base, scales: { y: { ticks: { precision: 0 } } } } });
  mk('#c-catprofit', { type: 'bar', data: { labels: catRows.map((r) => r.category), datasets: [{ data: catRows.map((r) => r.profit / 100), backgroundColor: catRows.map((r) => (r.profit < 0 ? '#F87171' : GOLD)), borderRadius: 5 }] },
    options: { ...base, indexAxis: 'y' } });
  mk('#c-cats', { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: SHADES, borderColor: '#202938', borderWidth: 3 }] },
    options: { ...base, cutout: '68%', plugins: { legend: { display: true, position: 'bottom' } } } });

  return () => charts.forEach((c) => c.destroy());
}
