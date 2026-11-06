/* Tests du générateur d'annonces : `npm test`. Objectif principal : ne jamais inventer d'information. */
import { generate, parseLines, keywords, cleanEdits, texts, effectiveTitle } from '../src/core/listing.js';
import { validateListing } from '../src/core/validators.js';
let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : `obtenu ${JSON.stringify(got)}`); };

const min = generate({ product: 'Veste en jean' });
eq('minimum : titre', min.title, 'Veste en jean');
eq('minimum : description', min.description, 'Veste en jean.');
eq('minimum : rien d\'inventé', [min.characteristics, min.condition], ['', '']);
eq('jamais "undefined"/"null"', /undefined|null/.test(JSON.stringify(generate({ product: 'X', brand: null, size: undefined }))), false);

const full = generate({ product: 'Veste en jean', brand: "Levi's", size: 'M', color: 'Bleu', material: 'Coton', condition: 'Très bon état',
  flaws: 'Petite tache sur la manche', extraLines: 'Longueur : 60 cm\nBoutons métal', info: 'Portée deux fois.', keywords: 'denim, vintage, jean' });
eq('titre complet', full.title, "Veste en jean Levi's - Taille M - Bleu");
eq('description complète', full.description,
  "Veste en jean Levi's, taille M, couleur Bleu, matière Coton.\n\nÉtat : Très bon état\nRemarques : Petite tache sur la manche\n\n• Longueur : 60 cm\n• Boutons métal\n\nPortée deux fois.");
eq('caractéristiques', full.characteristics, "Marque : Levi's\nTaille : M\nCouleur : Bleu\nMatière : Coton\nLongueur : 60 cm\nBoutons métal");
eq('mots-clés (sans doublon, jean une seule fois)', full.keywords, "Veste, jean, Levi's, Bleu, Coton, M, denim, vintage");

eq('« aucun défaut » seulement si coché', [generate({ product: 'A', condition: 'Bon état' }).condition, generate({ product: 'A', noDefects: true }).condition],
  ['État : Bon état', 'Aucun défaut constaté.']);
eq('défauts prioritaires sur la case', generate({ product: 'A', flaws: 'rayure', noDefects: true }).condition, 'Remarques : rayure');
eq('parseLines', parseLines('Taille: M\n\nsans libellé\nA : '), [{ label: 'Taille', value: 'M' }, { label: '', value: 'sans libellé' }]);
eq('mots-clés limités à 20', keywords({ product: 'a', keywords: Array.from({ length: 40 }, (_, i) => 'mot' + i).join(',') }).length, 20);

eq('validation : produit obligatoire', Object.keys(validateListing({ product: ' ' }).errors), ['product']);
eq('validation : case + défauts contradictoires', Object.keys(validateListing({ product: 'A', noDefects: 'on', flaws: 'trou' }).errors), ['noDefects']);
eq('validation : prix', [validateListing({ product: 'A', price: '19,9' }).value.price, Object.keys(validateListing({ product: 'A', price: 'x' }).errors)], [1990, ['price']]);

/* ---- textes modifiés à la main ---- */
const d0 = { product: 'Veste en jean', brand: 'Levi', size: 'M' };
eq('sans modification : texte généré', texts(d0), generate(d0));
eq('titre modifié prioritaire, le reste reste généré', [texts({ ...d0, edits: { title: 'Mon titre' } }).title, texts({ ...d0, edits: { title: 'Mon titre' } }).description], ['Mon titre', generate(d0).description]);
eq('texte vidé à la main respecté', texts({ ...d0, edits: { keywords: '' } }).keywords, '');
eq('titre effectif', [effectiveTitle(d0), effectiveTitle({ ...d0, edits: { title: 'X' } })], ['Veste en jean Levi - Taille M', 'X']);
eq('modifications nettoyées (clés inconnues, types, longueur)', cleanEdits({ title: 'a', evil: 'b', description: 5, keywords: 'k'.repeat(6000) }).keywords.length, 5000);
eq('clés inconnues et mauvais types ignorés', Object.keys(cleanEdits({ title: 'a', evil: 'b', description: 5 })), ['title']);
eq('modifications conservées à la validation', validateListing({ product: 'A', edits: { description: 'Ma description', x: 'y' } }).value.edits, { description: 'Ma description' });
eq('validation sans modification', validateListing({ product: 'A' }).value.edits, {});
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent'); process.exit(fail ? 1 : 0);
