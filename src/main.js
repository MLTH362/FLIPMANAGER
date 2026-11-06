import './styles/app.css';
import { renderSidebar } from './components/Sidebar.js';
import { startRouter } from './router.js';
import { initStore } from './core/store.js';
import { toast } from './components/ui.js';

renderSidebar(document.getElementById('sidebar'));
try {
  await initStore();
} catch (err) {
  console.error(err);
  toast('Stockage local indisponible : les données ne seront pas conservées (navigation privée ?).');
}
startRouter(document.getElementById('view'));
