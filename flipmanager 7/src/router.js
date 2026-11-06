import { setActive } from './components/Sidebar.js';
import { refreshIcons } from './components/ui.js';
import { dashboardPage } from './pages/dashboard.js';
import { articlesPage } from './pages/articles.js';
import { calculatorPage } from './pages/calculator.js';
import { salesPage } from './pages/sales.js';
import { marketPage } from './pages/market.js';
import { listingsPage } from './pages/listings.js';
import { statsPage } from './pages/stats.js';
import { settingsPage } from './pages/settings.js';

export const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', page: dashboardPage },
  { id: 'articles', label: 'Mes articles', icon: 'package', page: articlesPage },
  { id: 'calculateur', label: 'Calculateur de bénéfices', icon: 'calculator', page: calculatorPage },
  { id: 'marche', label: 'Étude de marché', icon: 'search', page: marketPage },
  { id: 'annonces', label: 'Mes annonces', icon: 'file-text', page: listingsPage },
  { id: 'ventes', label: 'Mes ventes', icon: 'receipt', page: salesPage },
  { id: 'statistiques', label: 'Statistiques', icon: 'bar-chart-3', page: statsPage },
  { id: 'parametres', label: 'Paramètres', icon: 'settings', page: settingsPage },
];

let cleanup = null;
export function startRouter(view) {
  const render = () => {
    const [id, param] = (location.hash.replace('#/', '') || 'dashboard').split('/');
    const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
    cleanup?.(); // libère graphiques et URLs d'images de la page précédente
    view.innerHTML = '';
    cleanup = route.page(view, param) || null;
    setActive(route.id);
    refreshIcons(view);
    window.scrollTo(0, 0);
  };
  addEventListener('hashchange', render);
  render();
}
