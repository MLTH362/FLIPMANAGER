/* Module « Statistiques » : bénéfices par mois, catégories, marges moyennes et délais de vente.
   Tout vient des ventes terminées enregistrées (calculs dans core/stats.js). */
import { Chart, registerables } from 'chart.js';
import { getState } from '../core/store.js';
import { monthly, byCategory, overview } from '../core/stats.js';
import { money, pct, monthLabel, today } from '../utils/format.js';
import { esc } from '../utils/dom.js';
import { pageHeader, kpiCard, emptyState } from '../components/ui.js';

Chart.register(...registerables);
const GOLD = '#F5BD35', GREY = '#8A93A6', RED = '#F87171';

export function statsPage(view) {
  const st = getState(), fmt = (c) => money(c, st.settings.currency), tone = (c) => (c > 0 ? 'pos' : c < 0 ? 'neg' : '');
  const byId = new Map(st.articles.map((a) => [a.id, a]));
  const o = overview(st.articles, st.sales), rows = monthly(st.sales, byId), cats = byCategory(st.articles, st.sales);
  const sign = (v) => (v > 0 ? '+' : '') + fmt(v);

  if (!o.count) {
    view.innerHTML = pageHeader('Statistiques', 'Évolution des bénéfices, marges et délais.') +
      `<div class="card">${emptyState('bar-chart-3', 'Aucune vente terminée', 'Les statistiques apparaîtront dès votre première vente dans « Mes ventes ». Aucune donnée n’est simulée.')}</div>`;
    return;
  }
  const goal = st.settings.monthlyGoal, thisMonth = rows.find((r) => r.key === today().slice(0, 7)), done = thisMonth ? thisMonth.profit : 0;
  const delayNote = o.avgDelay == null ? 'Délais indisponibles : aucune date exploitable.'
    : `Délai calculé sur ${o.delayCount} vente${o.delayCount > 1 ? 's' : ''} sur ${o.count}, depuis la date d’achat (ou, à défaut, la date d’ajout de l’article).`;

  view.innerHTML = pageHeader('Statistiques', 'Évolution des bénéfices, marges et délais.') + `
    <div class="kpis">
      ${kpiCard({ label: 'Bénéfice total', value: fmt(o.profit), icon: 'circle-dollar-sign', hero: true, tone: o.profit < 0 ? 'neg' : '' })}
      ${kpiCard({ label: 'Marge moyenne', value: pct(o.margin), icon: 'percent', hero: true })}
      ${kpiCard({ label: 'ROI global', value: pct(o.roi), icon: 'trending-up' })}
      ${kpiCard({ label: 'Bénéfice moyen par vente', value: fmt(o.avgProfit), icon: 'scale', tone: o.avgProfit < 0 ? 'neg' : '' })}
      ${kpiCard({ label: 'Panier moyen', value: fmt(o.avgBasket), icon: 'shopping-basket' })}
      ${kpiCard({ label: 'Délai moyen de vente', value: o.avgDelay == null ? '—' : `${o.avgDelay.toLocaleString('fr-FR')} j`, icon: 'timer' })}
      ${kpiCard({ label: 'Meilleur mois', value: o.bestMonth ? `${monthLabel(o.bestMonth.key)} · ${fmt(o.bestMonth.profit)}` : '—', icon: 'trophy' })}
      ${goal > 0 ? kpiCard({ label: 'Objectif du mois', value: `${fmt(done)} / ${fmt(goal)}`, icon: 'target', tone: done < 0 ? 'neg' : '' }) : kpiCard({ label: 'Objectif du mois', value: 'Non défini', icon: 'target' })}
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title"><h2>Bénéfice et chiffre d’affaires par mois</h2><span>Ventes terminées</span></div><div class="chart-box"><canvas id="c-month"></canvas></div></div>
      <div class="card"><div class="card-title"><h2>Évolution du bénéfice cumulé</h2></div><div class="chart-box"><canvas id="c-cum"></canvas></div></div>
    </div>
    <div class="card" style="margin-bottom:16px"><div class="card-title"><h2>Détail par mois</h2><span>Marge = bénéfice ÷ chiffre d’affaires</span></div>
      <div style="overflow-x:auto"><table><thead><tr><th>Mois</th><th class="num">Ventes</th><th class="num">Chiffre d’affaires</th><th class="num">Bénéfice</th><th class="num">Marge</th><th class="num">Variation</th><th class="num">Cumulé</th></tr></thead><tbody>
        ${[...rows].reverse().map((r) => `<tr><td>${monthLabel(r.key)}</td><td class="num">${r.count}</td><td class="num">${fmt(r.revenue)}</td><td class="num ${tone(r.profit)}">${fmt(r.profit)}</td>
          <td class="num">${pct(r.margin)}</td><td class="num ${tone(r.change)}">${r.change == null ? '—' : sign(r.change)}</td><td class="num">${fmt(r.cumProfit)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-title"><h2>Comparaison des catégories</h2><span>Triées par bénéfice</span></div>
      <div class="chart-box" style="height:${Math.max(180, cats.filter((c) => c.sold).length * 38 + 60)}px"><canvas id="c-cat"></canvas></div>
      <div style="overflow-x:auto;margin-top:16px"><table><thead><tr><th>Catégorie</th><th class="num">Articles</th><th class="num">En stock</th><th class="num">Vendus</th><th class="num">Chiffre d’affaires</th><th class="num">Bénéfice</th><th class="num">Marge</th><th class="num">ROI</th><th class="num">Délai moyen</th></tr></thead><tbody>
        ${cats.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.articles}</td><td class="num">${c.inStock}</td><td class="num">${c.sold}</td><td class="num">${c.sold ? fmt(c.revenue) : '—'}</td>
          <td class="num ${tone(c.profit)}">${c.sold ? fmt(c.profit) : '—'}</td><td class="num">${pct(c.margin)}</td><td class="num">${pct(c.roi)}</td><td class="num">${c.avgDelay == null ? '—' : `${c.avgDelay.toLocaleString('fr-FR')} j`}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">${delayNote} Les marges sont pondérées par le chiffre d’affaires (bénéfice total ÷ chiffre d’affaires total de la catégorie). Seules les ventes terminées sont comptées : les ventes annulées ou remboursées n’influencent rien.</p></div>`;

  const charts = [], mk = (id, cfg) => { const el = view.querySelector(id); if (el) charts.push(new Chart(el, cfg)); };
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }, labels = rows.map((r) => monthLabel(r.key));
  mk('#c-month', { data: { labels, datasets: [
    { type: 'bar', label: 'Bénéfice', data: rows.map((r) => r.profit / 100), backgroundColor: rows.map((r) => (r.profit < 0 ? RED : GOLD)), borderRadius: 5 },
    { type: 'line', label: 'Chiffre d’affaires', data: rows.map((r) => r.revenue / 100), borderColor: GREY, borderDash: [5, 4], tension: .3, pointRadius: 2 }] },
    options: { ...base, plugins: { legend: { display: true, position: 'bottom' } } } });
  mk('#c-cum', { type: 'line', data: { labels, datasets: [{ data: rows.map((r) => r.cumProfit / 100), borderColor: GOLD, backgroundColor: 'rgba(245,189,53,.12)', fill: true, tension: .3, pointRadius: 3 }] }, options: base });
  const sold = cats.filter((c) => c.sold);
  mk('#c-cat', { type: 'bar', data: { labels: sold.map((c) => c.category), datasets: [{ data: sold.map((c) => c.profit / 100), backgroundColor: sold.map((c) => (c.profit < 0 ? RED : GOLD)), borderRadius: 5 }] }, options: { ...base, indexAxis: 'y' } });
  return () => charts.forEach((c) => c.destroy());
}
