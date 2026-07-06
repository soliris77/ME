# Comment appliquer ces changements dans ton Repl

## Ce qui a changé

Avant : la section "Apprendre à trader" était une seule page (`/apprendre`) avec
5 onglets gérés en `useState` côté client. Pour Google, ça veut dire **une
seule URL indexable**, peu importe la richesse du contenu.

Après : chaque onglet a sa propre URL, et chaque pattern de chandelier /
stratégie / terme de glossaire a sa propre page individuelle avec un titre et
une description uniques. Total : **54 URLs indexables** au lieu d'une seule.

- `/apprendre/bases`
- `/apprendre/chandeliers` + `/apprendre/chandeliers/:slug` (8 pages, ex: `/apprendre/chandeliers/marteau-hammer`)
- `/apprendre/strategies` + `/apprendre/strategies/:slug` (4 pages)
- `/apprendre/risques`
- `/apprendre/glossaire` + `/apprendre/glossaire/:slug` (36 pages)

Chaque page a un `<title>` et une meta description distincts (via le hook
`usePageMeta` qui existait déjà dans le code mais n'était jamais appelé —
je l'ai câblé). Chaque page détail a aussi des liens internes vers du contenu
connexe (autres patterns, autres stratégies, termes de la même catégorie),
ce qui aide le maillage interne pour le SEO.

## Fichiers

- `artifacts/wealthsimple-tracker/src/pages/Learn.tsx` — refactorisé pour lire
  l'onglet actif depuis l'URL au lieu d'un état local, et appeler `usePageMeta`.
- `artifacts/wealthsimple-tracker/src/pages/learn/CandleDetail.tsx` (nouveau)
- `artifacts/wealthsimple-tracker/src/pages/learn/StrategyDetail.tsx` (nouveau)
- `artifacts/wealthsimple-tracker/src/pages/learn/GlossaryDetail.tsx` (nouveau)
- `artifacts/wealthsimple-tracker/src/App.tsx` — nouvelles routes ajoutées
- `artifacts/wealthsimple-tracker/public/sitemap.xml` (nouveau) — **remplace
  `REPLACE_WITH_YOUR_DOMAIN` par ton vrai domaine avant de déployer**
- `artifacts/wealthsimple-tracker/public/robots.txt` — référence le sitemap
- `artifacts/wealthsimple-tracker/src/data/learnContent.ts`,
  `src/hooks/use-page-meta.ts` — inclus au cas où (ils existaient déjà dans ton
  zip mais n'étaient pas commités dans git ; si tu les as déjà, aucun souci à
  les écraser, le contenu est identique)

## À faire après avoir copié les fichiers

```
pnpm run typecheck
```

Aucune nouvelle erreur ne devrait provenir des fichiers ci-dessus.

## ⚠️ Trouvaille importante : bug de typecheck préexistant, pas lié à ce travail

En testant, j'ai trouvé que `pnpm run typecheck` échoue déjà sur ton projet
actuel (avant même mes changements), avec des erreurs `queryKey` manquant
dans `Dashboard.tsx`, `Watchlist.tsx`, `Search.tsx`, `QuoteDetail.tsx` et
`LiveTicker.tsx`. J'ai vérifié via `git diff` que ces erreurs existent déjà
dans ton code committé — je ne les ai pas causées, mais ton build actuel
n'est probablement pas 100% type-safe. Je n'ai pas touché à ça (hors scope
de la tâche "Apprendre à trader"), mais tu voudras probablement régler ça
avant un futur déploiement.

## Autre trouvaille

Ton zip contenait déjà deux fichiers non commités et jamais branchés :
`CandlePatternPage.tsx` et `GlossaryTermPage.tsx` — une tentative précédente
de faire exactement ce que je viens de finir. Je les ai supprimés (remplacés
par les versions dans `pages/learn/`) pour éviter le code mort dupliqué.
