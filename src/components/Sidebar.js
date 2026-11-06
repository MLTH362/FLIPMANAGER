import { icons, createIcons } from 'lucide';
import { ROUTES } from '../router.js';

export function renderSidebar(el) {
  el.innerHTML = `
    <div class="brand">
      <div class="brand-mark"><i data-lucide="trending-up"></i></div>
      <div><div class="brand-name">FLIPMANAGER</div><div class="brand-sub">Achat-revente</div></div>
    </div>
    <nav class="nav">
      ${ROUTES.map((r) => (r.id === 'parametres' ? '<div class="sep"></div>' : '') +
        `<a href="#/${r.id}" data-route="${r.id}"><i data-lucide="${r.icon}"></i>${r.label}</a>`).join('')}
    </nav>
    <div class="side-foot"><span class="dot"></span>Données stockées sur cet ordinateur</div>`;
  createIcons({ icons });
}

export function setActive(id) {
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === id));
}
