/* Tests sauvegarde / restauration, exports CSV et réglages. `npm test`. */
import { validateBackup, toCsv, articlesCsv, salesCsv, comparablesCsv, BACKUP_VERSION } from '../src/core/backup.js';
import { validateSettings } from '../src/core/validators.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const good = () => ({ app: 'flipmanager', version: BACKUP_VERSION, exportedAt: '2026-11-06T10:00:00Z', data: {
  articles: [{ id: 'a1', name: 'Veste', buyPrice: 1000, fees: 200, status: 'Vendu' }, { id: 'a2', name: 'Baskets', buyPrice: 500, fees: 0, status: 'En stock' }],
  sales: [{ id: 's1', articleId: 'a1', date: '2026-11-01', price: 3000, fees: 100, expenses: 0, status: 'terminée', cost: 1200 }],
  comparables: [{ id: 'c1', study: 'Veste', name: 'Veste M', price: 2500 }], listings: [{ id: 'l1', product: 'Veste' }],
  images: [{ id: 'i1', articleId: 'a1', order: 1, type: 'image/png', data: PNG }], settings: { currency: 'EUR', goals: [100] } } });
const bad = (mut) => { const b = good(); mut(b); return validateBackup(b); };

/* ---- validation d'une sauvegarde ---- */
const ok = validateBackup(good());
eq('sauvegarde valide', [ok.errors, ok.warnings, ok.counts], [[], [], { articles: 2, sales: 1, comparables: 1, listings: 1, images: 1 }]);
eq('réglages restaurés avec id « main »', ok.data.settings, [{ currency: 'EUR', goals: [100], id: 'main' }]);
eq('sans réglages', bad((b) => { b.data.settings = null; }).data.settings, []);
eq('autre application refusée', validateBackup({ app: 'autre', version: 1, data: {} }).errors[0], 'Ce fichier n’est pas une sauvegarde FLIPMANAGER.');
eq('n’importe quoi refusé', [validateBackup(null).data, validateBackup('x').data, validateBackup([]).data], [null, null, null]);
eq('version future refusée', /Version/.test(bad((b) => { b.version = 99; }).errors[0]), true);
eq('section manquante refusée', bad((b) => { delete b.data.sales; }).errors, ['Section « sales » absente ou invalide.']);
eq('identifiant en double', /en double/.test(bad((b) => { b.data.articles[1].id = 'a1'; }).errors[0]), true);
eq('identifiant manquant', /identifiant manquant/.test(bad((b) => { delete b.data.sales[0].id; }).errors[0]), true);
eq('montant non entier refusé', /montants invalides/.test(bad((b) => { b.data.articles[0].buyPrice = 10.5; }).errors[0]), true);
eq('montant négatif refusé', /montants invalides/.test(bad((b) => { b.data.sales[0].fees = -1; }).errors[0]), true);
eq('statut de vente invalide', /statut invalide/.test(bad((b) => { b.data.sales[0].status = 'bizarre'; }).errors[0]), true);
eq('prix de comparable nul refusé', /prix invalide/.test(bad((b) => { b.data.comparables[0].price = 0; }).errors[0]), true);
eq('photo SVG refusée', /image invalide/.test(bad((b) => { b.data.images[0].data = 'data:image/svg+xml;base64,PHN2Zz4='; }).errors[0]), true);
eq('photo non base64 refusée', /image invalide/.test(bad((b) => { b.data.images[0].data = 'data:image/png;base64,<script>'; }).errors[0]), true);
eq('erreurs : données jamais renvoyées', bad((b) => { b.data.articles[0].name = ''; }).data, null);
eq('vente sans article : simple avertissement', (({ errors, warnings }) => [errors, warnings.length])(bad((b) => { b.data.sales[0].articleId = 'zz'; })), [[], 1]);
eq('erreurs limitées à 10 lignes', bad((b) => { b.data.articles = Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i, name: '', buyPrice: 0, fees: 0, status: 'En stock' })); }).errors.length, 11);

/* ---- CSV ---- */
eq('CSV : BOM, séparateur ; et fin de ligne', toCsv([{ a: 'x', b: 'y' }], [{ h: 'A', v: (r) => r.a }, { h: 'B', v: (r) => r.b }]), '\uFEFFA;B\r\nx;y\r\n');
eq('CSV : guillemets, point-virgule et saut de ligne', toCsv([{ a: 'a;b', b: 'dit "ok"\nfin' }], [{ h: 'A', v: (r) => r.a }, { h: 'B', v: (r) => r.b }]), '\uFEFFA;B\r\n"a;b";"dit ""ok""\nfin"\r\n');
eq('CSV : formules neutralisées dans les textes', toCsv([{ a: '=1+1', b: '-5' }], [{ h: 'A', v: (r) => r.a, text: true }, { h: 'B', v: (r) => r.b }]), "\uFEFFA;B\r\n'=1+1;-5\r\n");
const arts = [{ id: 'a1', name: 'Veste;neuve', category: '@x', condition: 'Bon état', status: 'Vendu', buyPrice: 1000, fees: 250, targetPrice: 3000, boughtOn: '2026-10-01', createdAt: '2026-10-02T10:00:00Z' }];
eq('CSV articles', articlesCsv(arts).split('\r\n')[1], '"Veste;neuve";\'@x;Bon état;Vendu;10,00;2,50;12,50;30,00;17,50;2026-10-01;2026-10-02');
const byId = new Map(arts.map((a) => [a.id, a]));
const sl = [{ id: 's', articleId: 'a1', date: '2026-11-01', price: 3000, fees: 100, expenses: 50, status: 'terminée', cost: 1250 }, { id: 't', articleId: 'zz', date: '2026-10-01', price: 500, fees: 0, expenses: 0, status: 'annulée' }];
eq('CSV ventes (triées, bénéfice des terminées seulement)', salesCsv(sl, byId).split('\r\n').slice(1, 3), ['2026-10-01;Article supprimé;annulée;5,00;0,00;0,00;0,00;', '2026-11-01;"Veste;neuve";terminée;30,00;1,00;0,50;12,50;16,00'.replace('"Veste;neuve"', '"Veste;neuve"')]);
eq('CSV bénéfice négatif', salesCsv([{ ...sl[0], price: 1000 }], byId).split('\r\n')[1].split(';').slice(-1)[0], '-4,00');
eq('CSV comparables (similarité par défaut)', comparablesCsv([{ study: 'E', name: 'N', price: 1990, date: '2026-11-01' }]).split('\r\n')[1], 'E;N;19,90;Similaire;;2026-11-01;');

/* ---- réglages ---- */
const f = { currency: 'EUR', goals: '5 ; 1 ; 2,50 ; 1', monthlyGoal: '300', minMargin: '20', chargeRate: '12,3', feeFixed: '0,70', feeRate: '5', minProfit: '2' };
const v = validateSettings(f);
eq('réglages valides (objectifs triés, sans doublon)', [v.errors, v.value.goals, v.value.monthlyGoal, v.value.minMargin, v.value.chargeRate], [{}, [100, 250, 500], 30000, 2000, 1230]);
eq('frais de vente', v.value.market, { feeFixed: 70, feeRate: 500, minProfit: 200 });
eq('champs vides = 0', (({ value }) => [value.monthlyGoal, value.market.feeRate])(validateSettings({ ...f, monthlyGoal: '', feeRate: '' })), [0, 0]);
eq('devise inconnue', Object.keys(validateSettings({ ...f, currency: 'XYZ' }).errors), ['currency']);
eq('objectif invalide', Object.keys(validateSettings({ ...f, goals: '1 ; abc' }).errors), ['goals']);
eq('aucun objectif / trop d’objectifs', [Object.keys(validateSettings({ ...f, goals: ' ' }).errors), Object.keys(validateSettings({ ...f, goals: Array.from({ length: 11 }, (_, i) => i + 1).join(';') }).errors)], [['goals'], ['goals']]);
eq('taux hors limites', Object.keys(validateSettings({ ...f, minMargin: '100', feeRate: '150' }).errors).sort(), ['feeRate', 'minMargin']);
eq('frais + cotisations ≥ 100 %', Object.keys(validateSettings({ ...f, feeRate: '60', chargeRate: '40' }).errors), ['chargeRate']);
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);
