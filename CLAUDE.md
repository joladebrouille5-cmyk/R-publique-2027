# Consignes pour Claude Code — RÉPUBLIQUE 2027

- Référence fonctionnelle : `docs/Cahier_des_charges_Republique_2027.pdf`. Plan et état d'avancement : `docs/PLAN_DEVELOPPEMENT.md`.
- Implémenter **une seule phase à la fois** ; rappeler ses critères d'acceptation avant de coder ; s'arrêter à la fin de la phase.
- Ne jamais simuler une fonctionnalité non implémentée ni masquer une erreur ; un écran sans moteur l'indique explicitement.
- Chaque fonctionnalité arrive avec ses tests ; lancer les tests avant tout commit.
- Le moteur (`packages/engine`) reste pur : pas de `Math.random`, `Date`, réseau, base ni DOM.
- Ne jamais inventer une donnée officielle (date, résultat, plafond, URL) : la sourcer dans `docs/SOURCES.md` ou l'étiqueter `estimation` / `hypothèse`. Les dates et paramètres de jeu vivent dans `packages/rulesets` (une modification = nouvelle version du jeu de règles).
- Toute modification de ressource passe par le registre `Ledger` du moteur (facteurs explicatifs) ; toute évolution de `GameState` incrémente `SAVE_SCHEMA_VERSION` avec une migration dans `packages/save-engine`.
- Codes géographiques toujours en chaînes de caractères (`2A`, `2B`, `01`…).
- Le navigateur ne calcule jamais l'état : `apps/web` n'importe pas `@r2027/engine`, sauf ses tests (`apps/web/src/test`, `*.test.tsx`) qui fabriquent des états réalistes avec le vrai moteur.
- Aucun secret dans Git ; variables d'environnement documentées dans `.env.example`.
- Documentation et interface en français.
- Compte rendu de fin de phase : résumé, fichiers modifiés, tests et résultats, limites, prochaine étape.

## Commandes

- Vérifications rapides : `pnpm check` (lint, format, typecheck, tests unitaires).
- Avec base : `pnpm test:integration`, `pnpm test:e2e` (exigent `DATABASE_URL_TEST`).
- Environnement cloud sans Docker : `scripts/pg-local.sh start`, puis `.env` créé depuis `.env.example` avec des URL sans mot de passe (`postgresql://postgres@localhost:5432/...`).
- Après une modification de `apps/api/prisma/schema.prisma` : `pnpm db:migrate` (crée une migration versionnée, à commiter).
- Données réelles : `pnpm data:geo` puis `pnpm data:resultats` (réseau requis, sorties dans `data/`, jamais commitées) ; sans elles, l'API sert le jeu de démonstration de `packages/data-import/demo`.
- Médias réels : `pnpm data:medias` (réseau requis) réécrit `packages/rulesets/src/medias-2027.json` et `apps/web/public/medias/` (commités) ; toute réimportation impose une nouvelle version du jeu de règles. Aucune ligne éditoriale prêtée à un média, aucune question ni aucun propos attribué à un journaliste.
- Assemblée nationale : `pnpm data:assemblee` (réseau requis) réécrit `packages/rulesets/src/assemblee-2026.json` (commité) ; toute réimportation impose une nouvelle version du jeu de règles. Effectifs par groupe seulement : aucun nom de député, aucun vote individuel attribué à un député réel (les votes du jeu sont ceux des groupes, simulés).
- Économie : `pnpm data:economie` (réseau requis) réécrit `packages/rulesets/src/economie-2026.json` (commité) ; toute réimportation impose une nouvelle version du jeu de règles. Seules les valeurs de départ sont réelles ; leur évolution est une simulation, jamais présentée comme une prévision ; les crises sont fictives et étiquetées.
- Législatives : `pnpm data:legislatives` (réseau requis) réécrit `packages/rulesets/src/legislatives-2024.json` (commité) ; toute réimportation impose une nouvelle version du jeu de règles. Voix par nuance seulement : aucun nom de candidat ; les législatives suivantes sont simulées par bloc, étiquetées comme telles, jamais présentées comme une prévision.
- Personnalités réelles : `pnpm data:personnalites` (réseau requis) réécrit `packages/rulesets/src/personnalites-2027.json` et `apps/web/public/personnalites/` (commités) ; toute réimportation impose une nouvelle version du jeu de règles. Jamais de propos ni de citation attribués à une personne réelle.
