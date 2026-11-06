/* Module « Paramètres » : objectifs, frais, sauvegarde complète (photos incluses), restauration et exports CSV. */
import * as db from '../core/db.js';
import { getState, saveSettings } from '../core/store.js';
import { validateSettings, CURRENCIES } from '../core/validators.js';
import { validateBackup, BACKUP_VERSION, articlesCsv, salesCsv, comparablesCsv } from '../core/backup.js';
import { dateFr, fromCents, symbol, today } from '../utils/format.js';
import { esc } from '../utils/dom.js';
import { pageHeader, confirmDialog, field, selectField, textareaField, toast, refreshIcons } from '../components/ui.js';

const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
function dataUrlToBlob(url) {
  const [head, b64] = url.split(','), bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: /^data:([^;]+)/.exec(head)[1] });
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })), a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const stores = ['articles', 'sales', 'comparables', 'listings', 'settings', 'images'];

/* Lit toute la base (photos converties en texte) et construit l'objet de sauvegarde. */
async function buildBackup() {
  const [articles, sales, comparables, listings, settings, images] = await Promise.all(stores.map((s) => db.getAll(s)));
  const imgs = await Promise.all(images.map(async ({ blob, ...rest }) => ({ ...rest, type: blob.type, data: await blobToDataUrl(blob) })));
  return { app: 'flipmanager', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: { articles, sales, comparables, listings, settings: settings.find((x) => x.id === 'main') || null, images: imgs } };
}
async function exportBackup(label = 'sauvegarde') {
  const b = await buildBackup();
  download(`flipmanager-${label}-${today()}.json`, JSON.stringify(b), 'application/json');
  return b;
}

export function settingsPage(view) {
  const st = getState(), S = st.settings, M = S.market, sym = symbol(S.currency), z = (c) => (c ? fromCents(c) : '');
  view.innerHTML = pageHeader('Paramètres', 'Objectifs, frais, sauvegardes et exports.') + `
    <form id="sf" class="card" style="margin-bottom:16px" novalidate autocomplete="off"><div class="card-title"><h2>Objectifs et frais</h2><span>Utilisés par le calculateur, l’étude de marché et les statistiques</span></div>
      <div class="form-grid">
        ${selectField({ label: 'Devise', name: 'currency', value: S.currency, options: CURRENCIES })}
        ${field({ label: `Objectif de bénéfice mensuel (${sym})`, name: 'monthlyGoal', value: z(S.monthlyGoal), placeholder: '0,00', inputmode: 'decimal', hint: 'Facultatif. Suivi dans les statistiques.' })}
        ${field({ label: `Objectifs de bénéfice par article (${sym})`, name: 'goals', value: S.goals.map((g) => fromCents(g)).join(' ; '), full: true, hint: 'Séparés par des points-virgules (10 maximum). Proposés dans le simulateur d’objectifs du calculateur.' })}
        ${field({ label: `Frais de vente fixes par vente (${sym})`, name: 'feeFixed', value: z(M.feeFixed), placeholder: '0,00', inputmode: 'decimal', hint: 'Seulement ceux qui s’appliquent réellement à vous. Vide = aucun frais.' })}
        ${field({ label: 'Frais de vente en % du prix', name: 'feeRate', value: z(M.feeRate), placeholder: '0', inputmode: 'decimal' })}
        ${field({ label: 'Cotisations ou charges (% du chiffre d’affaires)', name: 'chargeRate', value: z(S.chargeRate), placeholder: '0', inputmode: 'decimal' })}
        ${field({ label: 'Marge nette minimale souhaitée (%)', name: 'minMargin', value: z(S.minMargin), placeholder: '0', inputmode: 'decimal', hint: 'Avertit dans le calculateur si la marge est inférieure.' })}
        ${field({ label: `Bénéfice minimum souhaité par article (${sym})`, name: 'minProfit', value: z(M.minProfit), placeholder: '0,00', inputmode: 'decimal', hint: 'Sert au prix minimum de vente.' })}</div>
      <p class="note">Les écarts de prix (−5 % / +10 %), la pondération et le minimum de comparables se règlent dans <a class="lnk" href="#/marche">Étude de marché</a>.</p>
      <div class="modal-actions"><button type="submit" class="btn btn-primary" id="ssave">Enregistrer les paramètres</button></div></form>
    <div class="card" style="margin-bottom:16px"><div class="card-title"><h2>Sauvegarde complète</h2><span>${S.lastBackupAt ? `Dernier export : ${dateFr(S.lastBackupAt.slice(0, 10))}` : 'Aucun export effectué'}</span></div>
      <p class="muted">Vos données sont enregistrées uniquement dans ce navigateur. Exportez-les régulièrement : le fichier contient articles, photos, ventes, études de marché, annonces et paramètres.</p>
      <div class="metrics"><div class="metric"><span>Articles</span><strong id="n-articles">${st.articles.length}</strong></div><div class="metric"><span>Ventes</span><strong>${st.sales.length}</strong></div>
        <div class="metric"><span>Comparables</span><strong>${st.comparables.length}</strong></div><div class="metric"><span>Annonces</span><strong>${st.listings.length}</strong></div></div>
      <div class="toolbar" style="margin-top:16px"><button class="btn btn-primary" id="export"><i data-lucide="download"></i>Exporter une sauvegarde (.json)</button>
        <label class="btn btn-ghost" for="import"><i data-lucide="upload"></i>Importer une sauvegarde</label><input type="file" id="import" accept="application/json,.json" hidden></div>
      <div id="importmsg" aria-live="polite"></div>
      <p class="note">L’import remplace toutes les données actuelles. Une sauvegarde de sécurité de vos données actuelles est téléchargée automatiquement juste avant.</p></div>
    <div class="card"><div class="card-title"><h2>Exports CSV</h2><span>Pour Excel ou LibreOffice</span></div>
      <div class="toolbar"><button class="btn btn-ghost" data-csv="articles"><i data-lucide="file-spreadsheet"></i>Articles</button><button class="btn btn-ghost" data-csv="sales"><i data-lucide="file-spreadsheet"></i>Ventes</button>
        <button class="btn btn-ghost" data-csv="comparables"><i data-lucide="file-spreadsheet"></i>Études de marché</button></div>
      <p class="note">Séparateur « ; », virgule décimale, encodage UTF-8. Les photos ne sont incluses que dans la sauvegarde .json.</p></div>`;

  const form = view.querySelector('#sf');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { errors, value } = validateSettings(Object.fromEntries(new FormData(form)));
    form.querySelectorAll('.field').forEach((el) => el.classList.remove('invalid'));
    form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errors[el.dataset.err] || ''; if (errors[el.dataset.err]) el.parentElement.classList.add('invalid'); });
    const first = Object.keys(errors)[0]; if (first) { form.querySelector(`[name="${first}"]`).focus(); return; }
    const { market, ...general } = value, btn = form.querySelector('#ssave'); btn.disabled = true;
    try { await saveSettings(general, market); toast('Paramètres enregistrés'); settingsPage(view); } catch (err) { console.error(err); toast('Enregistrement impossible : ' + err.message); btn.disabled = false; }
  };

  view.querySelector('#export').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { const b = await exportBackup(); await saveSettings({ lastBackupAt: b.exportedAt }); toast(`Sauvegarde exportée (${b.data.articles.length} articles, ${b.data.images.length} photos)`); settingsPage(view); }
    catch (err) { console.error(err); toast('Export impossible : ' + err.message); e.currentTarget.disabled = false; }
  };

  const msg = view.querySelector('#importmsg'), showErr = (list) => { msg.innerHTML = `<div class="alert alert-bad" style="margin-top:12px"><strong>Import refusé : vos données n’ont pas été modifiées.</strong><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`; };
  view.querySelector('#import').onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = ''; msg.innerHTML = ''; if (!file) return;
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { showErr(['Fichier illisible : ce n’est pas un fichier JSON valide.']); return; }
    const r = validateBackup(parsed);
    if (r.errors.length) { showErr(r.errors); return; }
    const c = r.counts, now = getState();
    const ok = await confirmDialog({ title: 'Remplacer toutes vos données ?', confirmLabel: 'Remplacer et importer',
      message: `La sauvegarde contient ${c.articles} article(s), ${c.sales} vente(s), ${c.comparables} comparable(s), ${c.listings} annonce(s) et ${c.images} photo(s). Vos données actuelles (${now.articles.length} article(s), ${now.sales.length} vente(s)) seront remplacées. Une sauvegarde de sécurité sera téléchargée avant.${r.warnings.length ? ' Avertissements : ' + esc(r.warnings.join(' ')) : ''}` });
    if (!ok) return;
    try {
      await exportBackup('avant-import'); // filet de sécurité : si cela échoue, rien n'est remplacé
      const data = { ...r.data, images: r.data.images.map(({ data: url, type, ...rest }) => ({ ...rest, blob: dataUrlToBlob(url) })) };
      await db.replaceAll(data); // une seule transaction : tout ou rien
      toast('Sauvegarde importée'); setTimeout(() => { location.hash = '#/dashboard'; location.reload(); }, 600);
    } catch (err) { console.error(err); showErr([`Import impossible : ${err.message}. Vos données n’ont pas été modifiées.`]); }
  };

  view.querySelectorAll('[data-csv]').forEach((b) => { b.onclick = () => {
    const s = getState(), byId = new Map(s.articles.map((a) => [a.id, a])), k = b.dataset.csv;
    const csv = k === 'articles' ? articlesCsv(s.articles) : k === 'sales' ? salesCsv(s.sales, byId) : comparablesCsv(s.comparables);
    download(`flipmanager-${{ articles: 'articles', sales: 'ventes', comparables: 'etudes-de-marche' }[k]}-${today()}.csv`, csv, 'text/csv;charset=utf-8');
  }; });
  refreshIcons(view);
}
