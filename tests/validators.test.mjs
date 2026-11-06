/* Tests de validation des ventes : `npm test`. */
import { validateSale } from '../src/core/validators.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };
const base = { articleId: 'a1', date: '2026-11-05', price: '25,90', fees: '', expenses: '1,5', status: 'terminée', note: '' };

let r = validateSale(base); eq('vente valide', [r.errors, r.value.price, r.value.fees, r.value.expenses], [{}, 2590, 0, 150]);
eq('date inexistante', Object.keys(validateSale({ ...base, date: '2026-02-30' }).errors), ['date']);
eq('article manquant', Object.keys(validateSale({ ...base, articleId: '' }).errors), ['articleId']);
eq('prix = 0 refusé si terminée', Object.keys(validateSale({ ...base, price: '0' }).errors), ['price']);
eq('prix = 0 accepté si annulée', validateSale({ ...base, price: '0', status: 'annulée' }).errors, {});
eq('montant invalide', Object.keys(validateSale({ ...base, expenses: 'abc' }).errors), ['expenses']);
const sales = [{ id: 's1', articleId: 'a1', status: 'terminée' }];
eq('doublon terminée refusé', Object.keys(validateSale(base, { sales }).errors), ['status']);
eq('modification de la même vente OK', validateSale(base, { sales, editingId: 's1' }).errors, {});
eq('annulée possible malgré une terminée', validateSale({ ...base, status: 'annulée' }, { sales }).errors, {});
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);
