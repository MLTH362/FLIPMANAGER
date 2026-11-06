# FLIPMANAGER

Outil de gestion de revente (achat → étude de marché → rentabilité → stock → annonces → ventes → statistiques).
Application web locale : les données restent dans votre navigateur (IndexedDB). Aucune publication ni lecture automatique de Vinted.

## Lancer

```
npm install
npm run dev      # développement
npm run build    # version de production
npm test         # 8 suites de tests (calculs, validations, sauvegardes…)
```

## Modules

| Page | Rôle |
|---|---|
| Dashboard | Chiffre d'affaires, bénéfices, investissements, stock, graphiques mensuels et par catégorie |
| Mes articles | Statuts À acheter / En stock / En vente / Vendu / Archivé, photos, coûts détaillés |
| Calculateur | Bénéfice brut et net, marge, ROI, prix minimum, comparaison de plusieurs prix |
| Étude de marché | Référence (médiane + moyenne pondérée), 3 stratégies de prix, alertes de sécurité |
| Mes annonces | Titres, descriptions et mots-clés modifiables avant copie |
| Mes ventes | Coût figé à la vente, annulations et remboursements |
| Statistiques | Mois, catégories, marges moyennes, délais de vente |
| Paramètres | Objectifs, frais, sauvegarde complète (photos incluses), import, CSV |

## Règles

- Montants en centimes entiers ; taux en centièmes de pour cent.
- Aucun frais Vinted n'est supposé : seuls les frais saisis sont appliqués.
- Seules les ventes terminées comptent dans les chiffres.
- Les prix recommandés sont des estimations, jamais une garantie de vente.
- Sauvegardez régulièrement (Paramètres → Exporter une sauvegarde).

## Organisation

`src/core` : logique pure et testée (finance, market, articles, sales, stats, backup, listing, validators) et base de données.
`src/pages` : une page par module. `tests` : un fichier par domaine.
