/* Tests « Mes articles » : coûts, statuts, recherche/filtres/tri, doublons, validation. `npm test`. */
import { articleCost, estimatedProfit, migrateArticle, findDuplicate, filterArticles, norm } from '../src/core/articles.js';
import { validateArticle } from '../src/core/validators.js';
import { STATUSES, STATUS_MIGRATION } from '../src/core/constants.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };

/* ---- coût et bénéfice estimé ---- */
const A = (o) => ({ id: o.name, category: '', condition: '', description: '', buyPrice: 1000, fees: 0, targetPrice: null, status: 'En stock', createdAt: '2026-11-01T10:00:00Z', ...o });
eq('coût = achat + frais', articleCost(A({ name: 'x', buyPrice: 1000, fees: 250 })), 1250);
eq('article absent : coût 0', articleCost(undefined), 0);
eq('bénéfice estimé', [estimatedProfit(A({ name: 'x', buyPrice: 1000, fees: 250, targetPrice: 2000 })), estimatedProfit(A({ name: 'y' }))], [750, null]);

/* ---- statuts et migration ---- */
eq('statuts du cahier des charges', STATUSES, ['À acheter', 'En stock', 'En vente', 'Vendu', 'Archivé']);
eq('anciens statuts migrés', ['À préparer', 'Disponible', 'Annonce publiée'].map((s) => migrateArticle(A({ name: 'm', status: s })).status), ['En stock', 'En stock', 'En vente']);
eq('statuts actuels : rien à migrer', STATUSES.map((s) => migrateArticle(A({ name: 'm', status: s }))), [null, null, null, null, null]);
eq('la migration conserve toutes les données', migrateArticle(A({ name: 'm', status: 'Disponible', buyPrice: 777, description: 'd' })), { ...A({ name: 'm', buyPrice: 777, description: 'd' }), status: 'En stock' });
eq('migration cible des statuts valides', Object.values(STATUS_MIGRATION).every((s) => STATUSES.includes(s)), true);

/* ---- recherche, filtres, tri ---- */
const list = [
  A({ name: 'Veste Levi’s M', category: 'Vêtements', condition: 'Bon état', buyPrice: 1500, fees: 100, targetPrice: 3500, createdAt: '2026-11-02T00:00:00Z' }),
  A({ name: 'Baskets Nike 42', category: 'Chaussures', status: 'En vente', buyPrice: 2000, fees: 300, targetPrice: 3000, createdAt: '2026-11-03T00:00:00Z', description: 'Peu portées' }),
  A({ name: 'Manette PS5', category: 'Électronique', status: 'À acheter', buyPrice: 3000, createdAt: '2026-11-01T00:00:00Z' }),
  A({ name: 'Écharpe', category: 'Vêtements', status: 'Vendu', buyPrice: 500, targetPrice: 1500, createdAt: '2026-10-01T00:00:00Z' }),
];
const names = (o) => filterArticles(list, o).map((a) => a.name);
eq('recherche sans accent ni majuscule', names({ q: 'vetement' }), ['Veste Levi’s M', 'Écharpe']);
eq('recherche : « echarpe » trouve « Écharpe »', names({ q: 'echarpe' }), ['Écharpe']);
eq('recherche dans la description', names({ q: 'portees' }), ['Baskets Nike 42']);
eq('recherche multi-mots (ET)', names({ q: 'veste bon' }), ['Veste Levi’s M']);
eq('recherche sans résultat', names({ q: 'zzz' }), []);
eq('filtre statut', names({ status: 'À acheter' }), ['Manette PS5']);
eq('filtre catégorie + tri récents', names({ category: 'Vêtements' }), ['Veste Levi’s M', 'Écharpe']);
eq('filtres combinés', names({ category: 'Vêtements', status: 'Vendu', q: 'ech' }), ['Écharpe']);
eq('tri par nom', names({ sort: 'name' }), ['Baskets Nike 42', 'Écharpe', 'Manette PS5', 'Veste Levi’s M']);
eq('tri par coût décroissant', names({ sort: 'cost' }), ['Manette PS5', 'Baskets Nike 42', 'Veste Levi’s M', 'Écharpe']);
eq('tri par bénéfice (sans prix visé en dernier)', names({ sort: 'profit' }), ['Veste Levi’s M', 'Écharpe', 'Baskets Nike 42', 'Manette PS5']);
eq('la liste d’origine n’est pas modifiée', list.map((a) => a.name), ['Veste Levi’s M', 'Baskets Nike 42', 'Manette PS5', 'Écharpe']);
eq('norm', norm('  ÉCHARPE à Été '), 'echarpe a ete');

/* ---- doublons ---- */
eq('doublon (casse et accents ignorés)', findDuplicate(list, 'ecHarpe')?.name, 'Écharpe');
eq('pas de doublon avec soi-même (modification)', findDuplicate(list, 'Écharpe', 'Écharpe'), null);
eq('nom inédit', findDuplicate(list, 'Autre'), null);

/* ---- validation ---- */
const form = { name: 'Veste', category: 'Vêtements', condition: 'Bon état', buyPrice: '15,00', feeShip: '2,50', feePack: '0,30', feeOther: '1', targetPrice: '35', supplierUrl: '', description: '', status: 'En stock' };
const v = validateArticle(form);
eq('frais détaillés : total = somme', [v.errors, v.value.feeShip, v.value.feePack, v.value.feeOther, v.value.fees], [{}, 250, 30, 100, 380]);
eq('coût de revient issu du formulaire', articleCost(v.value), 1880);
eq('frais détaillés vides = 0', validateArticle({ ...form, feeShip: '', feePack: '', feeOther: '' }).value.fees, 0);
eq('ancien formulaire (frais regroupés) toujours accepté', (({ feeShip, feePack, feeOther, ...old }) => { const r = validateArticle({ ...old, fees: '4,20' }); return [r.errors, r.value.fees, r.value.feeShip]; })(form), [{}, 420, undefined]);
eq('montant de frais invalide', Object.keys(validateArticle({ ...form, feePack: 'abc' }).errors), ['feePack']);
eq('prix de vente 0 refusé', Object.keys(validateArticle({ ...form, targetPrice: '0' }).errors), ['targetPrice']);
eq('prix de vente vide accepté', validateArticle({ ...form, targetPrice: '' }).value.targetPrice, null);
eq('nom obligatoire', Object.keys(validateArticle({ ...form, name: ' ' }).errors), ['name']);
eq('prix d’achat obligatoire', Object.keys(validateArticle({ ...form, buyPrice: '' }).errors), ['buyPrice']);
eq('statut ancien refusé à la saisie', Object.keys(validateArticle({ ...form, status: 'Disponible' }).errors), ['status']);
eq('chaque nouveau statut accepté', STATUSES.map((s) => Object.keys(validateArticle({ ...form, status: s }).errors).length), [0, 0, 0, 0, 0]);
eq('lien fournisseur invalide', Object.keys(validateArticle({ ...form, supplierUrl: 'ftp://x' }).errors), ['supplierUrl']);
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);
