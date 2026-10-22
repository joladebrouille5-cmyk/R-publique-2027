# Architecture — RÉPUBLIQUE 2027

> Statut : **proposition de la phase 0**, à valider avant la phase 1.
> Référence fonctionnelle : [`Cahier_des_charges_Republique_2027.pdf`](./Cahier_des_charges_Republique_2027.pdf) (v1.2, 20 octobre 2026).
> Documents liés : [Plan de développement](./PLAN_DEVELOPPEMENT.md) · [Modèle de données](./MODELE_DONNEES.md) · [Sources](./SOURCES.md) · [Risques](./RISQUES.md).

Les numéros `§x` renvoient aux sections du cahier des charges.

---

## 1. Principes directeurs

| Principe | Conséquence technique |
|---|---|
| Simulation **persistante, explicable, testable** (résumé exécutif) | Le moteur est une bibliothèque TypeScript pure, sans accès réseau, base ou navigateur (§11). L'API (serveur) et l'application Android (moteur local, phase 8) l'exécutent derrière le même contrat ; l'interface ne l'exécute jamais. |
| **Déterminisme** : même sauvegarde + mêmes actions ⇒ même état (§11) | Générateur pseudo-aléatoire à graine, aucun `Math.random()` ni `Date.now()` dans le moteur, calcul autoritaire **côté serveur uniquement**. |
| Réel, estimé, sondé, simulé et fictif sont **distingués** (§1.1, §3.3, §8, critère 16) | Chaque donnée affichable porte un champ `nature` (`reel`, `estimation`, `sondage`, `projection`, `simule`, `fictif`) et, si réel, une référence `DataSource`. |
| Règles électorales et institutionnelles **explicites et versionnées** (§2, §6) | Jeux de règles en fichiers de données versionnés (`packages/rulesets`), jamais de dates ou plafonds codés en dur dans la logique. |
| **Pas d'API externe obligatoire** (§7, §14, critère 14) | Pas de fond de carte payant, pas de LLM requis ; un jeu de données de démonstration permet de jouer hors ligne (§10). |
| Une explication de variation repose sur les **facteurs réellement utilisés** (§13) | Chaque calcul d'opinion produit une décomposition de facteurs stockée avec le résultat ; l'UI affiche cette décomposition, rien d'autre. |

---

## 2. Vue d'ensemble

```
┌──────────────────────────── Navigateur (PC / mobile) ────────────────────────────┐
│ apps/web : React + TS strict + Vite + React Router + TanStack Query + Zustand     │
│            Tailwind CSS · MapLibre GL JS (carte métropole + 5 encarts DROM)       │
│  - n'exécute PAS la simulation ; affiche l'état renvoyé par l'API                 │
│  - stockage navigateur = cache / mode démo uniquement (§12)                       │
└───────────────▲──────────────────────────────────────────────▲───────────────────┘
                │ REST JSON (validé par Zod)                    │ fichiers statiques
                │                                               │ (géométries, tuiles)
┌───────────────┴──────────────────────────┐   ┌──────────────┴───────────────────┐
│ apps/api : Fastify + Zod + Prisma         │   │ data/geo (généré par data-import)│
│  - sessions, limitation de débit          │   └──────────────────────────────────┘
│  - orchestration : charge l'état, appelle │
│    le moteur, persiste, journalise        │
└───────┬───────────────────────┬───────────┘
        │ appels de fonctions    │ Prisma
┌───────▼───────────────┐  ┌────▼─────────────────────────────┐
│ packages/engine (pur) │  │ PostgreSQL (migrations versionnées)│
│ packages/save-engine  │  └──────────────────────────────────┘
│ packages/shared       │
└───────────────────────┘
        ▲
┌───────┴─────────────────────────────────────────────┐
│ packages/data-import (CLI) : INSEE, Intérieur, IGN… │
│ → métadonnées d'import, empreintes, données démo     │
└─────────────────────────────────────────────────────┘
```

Phase 8 : l'application Android remplace la flèche « REST JSON » par un appel de fonction vers `packages/local-api`, qui exécute le même moteur sur l'appareil et enregistre les parties dans IndexedDB (§14).

---

## 3. Structure du dépôt (monorepo pnpm)

pnpm 10 est installé ; les *workspaces* pnpm permettent de partager les types entre moteur, API et interface sans publication de paquets.

```
.
├── apps/
│   ├── web/                    # module « ui » (§11)
│   │   ├── src/routes/         # écrans §13 (accueil, campagne, carte, candidats…)
│   │   ├── src/features/map/   # carte MapLibre, encarts DROM, recherche, fiche territoriale
│   │   ├── src/components/     # composants partagés (tableaux filtrables, graphiques…)
│   │   ├── src/stores/         # Zustand (état d'UI uniquement : sélection, filtres)
│   │   └── e2e/                # tests Playwright (bureau + petit écran)
│   └── api/                    # module « api » (§11)
│       ├── src/routes/         # REST : games, saves, actions, elections, map, data
│       ├── src/services/       # orchestration moteur ⇄ persistance
│       ├── prisma/schema.prisma
│       └── prisma/migrations/  # migrations versionnées, commitées
├── packages/
│   ├── engine/                 # moteur pur, aucune dépendance d'E/S
│   │   └── src/
│   │       ├── core/           # RNG à graine, calendrier, pipeline hebdomadaire, journal
│   │       ├── campaign/       # campaign-engine : actions, ressources, parrainages, finances
│   │       ├── election/       # election-engine : scores latents, sondages, deux tours
│   │       ├── ai/             # ai-engine : décisions des adversaires, graphe d'alliances
│   │       ├── event/          # event-engine : événements, crises, médias, débats
│   │       ├── government/     # government-engine : gouvernement, feuille de route
│   │       ├── parliament/     # parliament-engine : groupes, votes, législatives
│   │       ├── economy/        # economy-engine : indicateurs macro et sociaux
│   │       └── territory/      # territory-engine : hiérarchie, agrégations
│   ├── rulesets/               # jeux de règles versionnés et sourcés (dates, catalogue d'actions et d'événements)
│   ├── save-engine/            # sérialisation, export/import JSON versionné, migrations de sauvegarde
│   ├── data-import/            # CLI d'import des sources officielles (§10)
│   └── shared/                 # schémas Zod, types DTO, constantes d'énumération
├── data/
│   ├── raw/                    # téléchargements bruts — IGNORÉ par Git
│   ├── processed/              # sorties d'import (volumineuses) — IGNORÉ ou stockage externe
│   └── demo/                   # petit jeu de démonstration hors ligne — COMMITÉ
├── docs/
└── docker/ , .github/workflows/
```

Les douze modules du §11 sont tous représentés : les neuf moteurs sont des dossiers de `packages/engine` (frontières contrôlées par une règle d'import lint), `data-import`, `save-engine`, `ui` (= `apps/web`) et `api` (= `apps/api`) sont des paquets séparés.

**Règle de dépendance** : `engine` ← `save-engine` ← `api` ; `shared` est importable partout ; `web` n'importe jamais `engine` (sauf types et tests). Vérifiée en CI (règle de lint). Phase 8 : `engine` ← `save-engine` ← `local-api` ← `mobile` ; `mobile` réutilise les écrans de `web` et remplace seulement leur transport d'API (voir §14).

---

## 4. Moteur de simulation (`packages/engine`)

### 4.1 Contrat

```ts
advanceWeek(
  state: GameState,            // état complet, sérialisable, versionné
  playerActions: GameAction[], // actions validées du joueur pour la semaine
  ctx: { ruleset: Ruleset; data: ReferenceData; engineVersion: string }
): {
  state: GameState;            // nouvel état (l'ancien n'est jamais muté)
  events: GameEvent[];         // événements résolus
  log: SimulationLogEntry[];   // journal explicable (facteurs, tirages)
  report: WeeklyReport;        // bilan hebdomadaire (§2, étape 12)
}
```

La fonction est **pure** : aucune horloge, aucun réseau, aucune base. L'aléa provient uniquement de `state.rng`.

### 4.2 Pipeline hebdomadaire (§2) — ordre stable et documenté

| # | Étape (§2) | Module | Notes |
|---|---|---|---|
| 1 | Valider les actions | campaign / event | Actions refusées avec motif (budget, temps, prérequis, action inconnue, cible manquante ou inconnue, **plafond légal de dépenses**) ; annonces et retraits du programme (dépendances, incompatibilités, nombre maximal, temps de préparation) ; réponses obligatoires aux décisions en attente. **Actif depuis la phase 2 ; cibles et programme en phase 5.** |
| 2 | Consommer les ressources | campaign | Coût exact des actions retenues, inscrit aussi comme **dépense électorale** au compte de campagne (`FinanceBook` : toute variation du budget est une recette d'une origine donnée ou une dépense). Argent en **centimes entiers**, temps et militants en unités entières, notoriété et popularité en centièmes de point. **Actif.** |
| 3 | Calculer les décisions adverses | ai | Analyse de la situation, priorité motivée, actions ciblées ; même catalogue, mêmes coûts, même validation que le joueur (§4.5). **Actif depuis la phase 3 ; complet en phase 5.** |
| 4 | Mettre à jour alliances et relations | ai | Graphe confiance / proximité / rivalité / historique (§7) ; ralliements avant le premier tour, décidés par l'IA ou proposés par le joueur (le candidat sollicité décide). **Actif depuis la phase 5.** |
| 5 | Résoudre les événements | event / campaign | Décisions de la semaine passée, débats télévisés de la semaine (menés à leur terme, effets par le registre, phase 10), effets des actions (immédiats ou programmés : promesses de parrainage dans le département ciblé, dons triés selon la loi, emprunts, préparation du débat), risques des actions, nouveaux événements (conditions, probabilité, délai entre occurrences, choix, §8). **Actif.** |
| 6 | Mettre à jour médias et opinion | election | Couverture de chaque candidat par chaque média (exposition, tonalité) et notoriété gagnée ; érosion de la notoriété, retour de la popularité vers une référence, attrition des militants (paramètres de jeu). **Actif ; médias depuis la phase 5.** |
| 7 | Calculer indicateurs économiques et sociaux | economy | Actif surtout pendant le quinquennat. *Inactif jusqu'à la phase 6.* |
| 8 | Mettre à jour intentions de vote | election | Scores latents par groupe d'électeurs (par territoire en phase 4), intentions attendues et décomposition des facteurs, puis sondages simulés des instituts dont c'est la semaine. **Actif depuis la phase 3** (campagne et entre-deux-tours). |
| 9 | Vérifier échéances | core / election | Parrainages de la semaine (promesses → intentions → présentations reçues → validées ou invalidées) et, à la clôture, liste des candidats arrêtée (candidats sous le seuil écartés) ; avance forfaitaire ; dépouillement du scrutin qui tombe dans la semaine (premier tour, puis second tour), statuts des candidats, consignes de vote, changement de phase ; puis passage à la semaine suivante : temps remis à la capacité hebdomadaire, effets différés appliqués, échéances des 4 semaines signalées. Après chaque tour, remboursement forfaitaire prévisionnel ; après le second tour, la partie se bloque explicitement (« fin de la présidentielle ») jusqu'à la phase 6. **Actif.** |
| 10 | Générer le journal | core | Entrées immuables. |
| 11 | Sauvegarder | *(API)* | Le moteur renvoie l'état ; l'API persiste (sauvegarde auto hebdomadaire, §12). |
| 12 | Afficher le bilan hebdomadaire | *(UI)* | `report` renvoyé par le moteur. |

Consulter un écran ne déclenche **jamais** `advanceWeek` (§2). Seul `POST /games/:id/advance` fait avancer le temps.

### 4.3 Déterminisme et aléa

- PRNG *sfc32* implémenté dans le dépôt, vérifié contre une implémentation C de référence (`packages/engine/scripts/sfc32-reference.c`) ; SHA-256 pur vérifié sur les vecteurs FIPS 180-4.
- **Flux dérivés** (depuis la phase 2) : chaque tirage provient d'un générateur dérivé de (graine, semaine, contexte) — par exemple (graine, semaine 4, action n° 2, « meeting ») — par SHA-256. L'état du générateur n'est donc pas stocké dans `GameState`, et ajouter un module ou une action n'altère pas les autres tirages.
- Itérations toujours dans un **ordre trié explicite** (codes territoriaux, identifiants), jamais l'ordre d'insertion d'un objet ou d'un `Map` alimenté par la base.
- Le calcul faisant foi s'exécute **uniquement dans Node.js** (serveur et tests) : les fonctions `Math.exp`/`Math.log` peuvent différer d'un moteur JavaScript à l'autre, donc le navigateur ne recalcule jamais l'état.
- Chaque partie stocke `seed`, `engineVersion`, `rulesetVersion`, `saveSchemaVersion` (§12).
- Tests de propriétés (fast-check) : même graine et mêmes actions ⇒ même partie ; sauvegarde puis reprise à chaque semaine ⇒ même partie ; deux parties de même graine jouées via l'API ⇒ mêmes empreintes.
- **Comptabilité exacte** : toute modification de ressource passe par un registre (`core/ledger.ts`) qui enregistre ses facteurs ; la somme des facteurs vaut exactement la variation, écrêtement aux bornes compris (testé par propriétés).

### 4.4 Moteur électoral (§5)

**Grandeurs distinctes** (§5.1) : `inscrits`, `votants`, `abstentions`, `blancs`, `nuls`, `exprimes`, `voix[candidat]`, et les pourcentages (des inscrits et des exprimés). Invariants testés : `votants = blancs + nuls + exprimes`, `inscrits = votants + abstentions`, `Σ voix = exprimes`, tout ≥ 0.

**Score latent** (§5.1) : pour chaque territoire *t* et candidat *c*,

```
u(t,c) = w·[affinité(t,c), crédibilité(c), programme(t,c), dynamique(c),
            médias(c), implantation(t,c), alliances(c)] + ε(t,c)
p(t,·) = softmax(u(t,·) / température)        // 0 ≤ p ≤ 1, Σ p = 1
```

Les poids `w` et la température sont des paramètres du *ruleset* (difficulté exclue : §1.3 interdit que la difficulté modifie le décompte). L'**affinité** initiale vient de la base électorale historique (résultats 2022 par commune, voir [SOURCES](./SOURCES.md)) et de profils territoriaux agrégés.

**Participation** : modèle séparé par territoire (historique + mobilisation + abstention différentielle par électorat).

**Conversion en voix entières** : répartition par la **méthode du plus fort reste** sur les exprimés de chaque commune ⇒ la somme des voix d'une commune est exactement égale à ses exprimés ; les totaux départementaux, régionaux et nationaux sont **des sommes d'entiers** des communes (§3.3, critère 7). Aucun total national n'est calculé indépendamment.

**Sondages** (§5.2) : tirage d'un échantillon simulé (taille *n*, méthode quotas/aléatoire, biais d'institut) à partir des intentions agrégées, avec intervalle de confiance publié ; popularité et intentions sont deux séries distinctes.

**Deux tours** (§5.3) : qualification des deux premiers du 1er tour (sauf cas prévus par le *ruleset* : désistement, majorité absolue au 1er tour) ; matrice de reports partiels par électorat et consignes de soutien ; abstention différentielle ; effet du débat d'entre-deux-tours. Un soutien ne transfère jamais 100 % des voix (test de propriété).

**Implémentation de la phase 3** (`packages/engine/src/election`) — en attendant les territoires de la phase 4, l'électorat est découpé en **9 groupes d'électeurs nationaux** (part, position sur les axes économique et sociétal, participation de base : hypothèses de jeu du *ruleset*) ; les inscrits sont ceux proclamés au second tour de 2022 (48 752 339, statut `estimation`), répartis entre groupes au plus fort reste.

- Score latent d'un candidat auprès d'un groupe = somme exacte de facteurs nommés : proximité idéologique (−α · distance), notoriété (β · ln), popularité, dynamique (variation de popularité sur 3 semaines), incertitude (tirage dérivé de la graine), et au second tour consignes de vote (proportionnelles au poids de l'éliminé dans le groupe) et débat. Probabilités par softmax.
- Participation par groupe : base × (1 + effet de proximité du candidat le plus proche), bornée ; au second tour, abstention différentielle des groupes éloignés des deux finalistes, et blancs plus nombreux quand aucun finaliste n'est proche. Participation, blancs et nuls calés sur l'ordre de grandeur de 2022 (note du *ruleset*).
- Dépouillement : votants, blancs, nuls en entiers par groupe ; voix au plus fort reste ; **national = somme exacte des groupes** (`territory/aggregate.ts`, réutilisé en phase 4 pour communes → départements → régions → national).
- Premier tour : élu si majorité absolue des exprimés, sinon les deux premiers (égalité parfaite départagée par identifiant, de façon déterministe). Les adversaires éliminés donnent une consigne au finaliste le plus proche s'il l'est assez ; le joueur éliminé choisit (décision obligatoire). Une consigne ne transfère qu'une partie des électeurs (testé).
- Sondages : deux instituts fictifs à périodicité fixe ; échantillon multinomial de taille *n* tiré des intentions attendues décalées d'un biais d'institut constant ; marge à 95 % calculée comme pour un échantillon aléatoire ; hypothèse de second tour entre les deux premiers ; cote de popularité distincte.
- Les intentions « vraies » du modèle restent internes (décomposition des facteurs visible) ; le joueur voit les sondages, puis les résultats.

**Phase 4 — géographie électorale** (`packages/engine/src/territory`) : l'unité de vote devient la **commune** (et chaque territoire hors carte). La base territoriale, fournie au moteur par l'API, donne pour chaque unité ses inscrits (2022, second tour), l'affinité de chacun des 9 groupes (part locale ÷ part nationale, d'après le premier tour 2022 et la répartition « candidat 2022 → groupes » du jeu de règles, lissée pour les petites communes) et un facteur de participation locale (borné). Le comportement de chaque groupe (participation, blancs, nuls, probabilités) est calculé une fois par tour puis appliqué à chaque commune en nombres entiers ; départements, régions et national sont des sommes exactes. Sans import, une base de démonstration **fictive** (Ain, Corse, Somme, DROM détaillés ; autres départements en bloc) est utilisée et affichée comme telle.

**Phase 5 — facteurs de campagne** (`election/distribution.ts`) : le score latent reçoit quatre facteurs nommés de plus, visibles dans la décomposition : « Programme » (attrait des propositions pour les groupes qui y sont sensibles), « Crédibilité » (coût total soutenable, faisabilité, revirements), « Médias » (indice de couverture pondéré par l'audience et la crédibilité des organes) et « Ralliement de X » (une partie des électeurs proches d'un candidat rallié). Le débat d'entre-deux-tours est décomposé en préparation, maîtrise, cohérence et réponse (poids 0,35 / 0,25 / 0,2 / 0,2, bornés entre 0 et 1, publiés dans le résultat). La difficulté n'intervient dans aucun de ces calculs (testé par propriété).

### 4.5 IA des adversaires (§7)

Boucle par adversaire : *analyser → générer les actions candidates → estimer coût/bénéfice → sélectionner → exécuter → mettre à jour la stratégie*. Implémentation par **fonction d'utilité** pondérée par le profil (idéologie, style, tolérance au risque) avec tirage softmax pour éviter les comportements robotiques. Aucun LLM dans la décision ; un module de narration optionnel (désactivé par défaut) ne peut produire que du texte et n'a pas d'accès en écriture à l'état.

**Phase 3** (`packages/engine/src/ai/opponents.ts`) : 7 adversaires fictifs (style prudent / équilibré / offensif, tolérance au risque) ; chaque semaine, chacun choisit jusqu'à N actions abordables (N et budget selon la difficulté) ; valeur d'une action = gains attendus pondérés par ses besoins − risque pondéré par sa prudence − part du budget ; tirage softmax. Les actions passent par la même validation et le même registre que celles du joueur, et agissent aussi en mode observateur.

**Phase 5** (`ai/opponents.ts`, `ai/relations.ts`) : chaque adversaire a un **objectif** (victoire, qualification, visibilité) et analyse chaque semaine sa situation (présentations projetées à la clôture, trésorerie, débat à préparer, notoriété, militants, intentions de vote). Il en tire une **priorité motivée** (parrainages, financement, débat, notoriété, mobilisation, popularité), publiée dans le bilan et l'écran Candidats, qui pondère la valeur des actions avec son objectif ; il ne retient que des actions qu'il peut payer sous le plafond légal ; il choisit la **cible** la plus utile (département où il lui manque le plus de présentations, média dont les priorités rejoignent son programme) et ne demande un emprunt que si la banque peut l'accorder. La difficulté ne change que le budget de départ des adversaires, leur nombre d'actions par semaine et la « température » du tirage (§1.3). Un adversaire sans espoir de qualification, proche d'un candidat mieux placé et en confiance, peut se rallier à lui dans les 10 semaines qui précèdent le premier tour ; le joueur n'est jamais rallié d'office.

**Phase 5 ter — médias réels** (`campaign/medias.ts`) : les organes fictifs laissent place aux **26 organes réels** du jeu de règles (données importées et sourcées, `mediasReels`). Chaque semaine, chaque organe expose les candidats selon leur notoriété et leurs actions ; à la télévision et à la radio, l'exposition est multipliée par la **propension** du parti du candidat sur ce service (temps de parole de l'Arcom, bornée par le jeu de règles ; 1 pour un candidat sans parti suivi), la presse écrite traitant tous les candidats de la même façon. Le poids d'un organe = part mesurée dans son type × poids du type (hypothèse) ; crédibilité identique pour tous ; tonalité tirée des seuls facteurs du jeu (aucun programme prêté à une personnalité réelle adverse : facteur neutre). L'action « Invité d'une émission politique » (cible `emission`, joueur et IA, mêmes règles) expose sur la chaîne de l'émission et, pour une part (`partCodiffusion`), sur ses autres diffuseurs ; les interviews de la semaine sont gardées dans l'état (`medias.interviews`). L'IA choisit l'organe ou l'émission qui maximise l'audience touchée compte tenu de l'exposition mesurée de son parti.

**Phase 5 bis — personnalités réelles** (`core/createGame.ts`) : une partie peut opposer au joueur les **personnalités réelles** retenues (fiches sourcées du jeu de règles) au lieu des adversaires fictifs, et le joueur peut en incarner une (mode « candidat réel »). Une personnalité devient un acteur ordinaire (mêmes règles, même IA) dont les moyens de départ découlent des niveaux de sa fiche (notoriété 1 à 3, organisation grande à aucune) convertis par les paramètres `personnalitesReelles` du jeu de règles ; style, goût du risque, objectif et popularité de départ sont identiques pour toutes. Le jeu ne leur prête **aucun programme** : pour une personnalité réelle adverse, les facteurs « Programme » et « Crédibilité » sont neutres. La difficulté agit comme ailleurs (budget des adversaires, pression sur le joueur), jamais sur le décompte.

### 4.6 Quinquennat (§9)

- **Gouvernement** : Premier ministre, ministres (compétence, loyauté, popularité), feuille de route.
- **Parlement** : `parliament-engine` avec groupes, sièges, discipline de vote, coalitions, amendements, procédures (dont 49.3 si inclus au *ruleset*). Un texte rejeté ne modifie jamais l'état (test de propriété).
- **Législatives** (`presidency/legislatives.ts`, étape 8 du quinquennat) : moteur distinct de la présidentielle. Base : résultats réels de 2024 dans les 577 circonscriptions (voix par nuance regroupées en cinq blocs, jeu de règles). Dissolution (action du président, art. 12) ou fin de législature ; premier tour : voix de 2024 modulées par l'écart national de chaque bloc (élan présidentiel, popularité du président, aléa tiré par `stream(graine, semaine, 'legislatives', …)`) et un aléa local ; élu avec la majorité absolue des exprimés et 25 % des inscrits ; second tour entre les blocs ayant 12,5 % des inscrits (sinon les deux premiers), reports selon la proximité des blocs ; sièges des blocs répartis entre leurs groupes au plus fort reste, alignements recalculés, cohabitation détectée, gouvernement renouvelé. Règles citées et paramètres étiquetés dans le *ruleset* ([SOURCES §3.3](./SOURCES.md)).
- **Économie** : modèle agrégé simple, explicable (croissance, inflation, chômage, dette, déficit, pouvoir d'achat, confiance, tensions sociales), avec retards d'effet des réformes.
- **Contenu approfondi** (phase 7, `presidency/consequences.ts`) : scénario de départ (écarts sur les moyens, choc et fragilités au premier quinquennat, fréquences) ; conséquences durables enregistrées dans l'état et appliquées à l'étape 7 par les registres (facteur `durable`) ; probabilité d'une crise multipliée par le scénario et les fragilités en cours ; crises de saison.
- **Fin de mandat** (`presidency/cycle.ts`, étape 9 du quinquennat) : le lundi de la campagne suivante, bilan arrêté et archivé avec la présidentielle, puis nouvelle campagne avec le même moteur — critère 17. Le calendrier de campagne d'un cycle ultérieur est celui du jeu de règles transposé de semaines entières par `cycleRuleset` (`@r2027/shared`), appliqué par `advanceWeek` et par l'interface (même fonction, aucune divergence) ; dates étiquetées hypothèses.

---

### 4.7 Débats télévisés (phase 10)

Module `election/debats.ts`, pur comme le reste du moteur. Les séances (débat à cinq, débat de tous les candidats, débat d'entre-deux-tours) sont décrites par le jeu de règles (`debats`) et datées par des échéances `hypothese`, transposées par `cycleRuleset` pour 2032 et 2037.

- **Programmation** (`scheduleDebates`, idempotente) : au début de la semaine de l'échéance, la séance est créée avec ses invités (cinq premiers du dernier sondage, tous les candidats, ou les deux qualifiés), le refus éventuel d'un favori IA (tirage `stream(graine, semaine, 'debat', id, 'refus')`) et, si le joueur est sur le plateau, les trois cartes de la première séquence. Moins de deux présents : la séance est close d'emblée (débat annulé, seule la chaise vide est sanctionnée).
- **Coups** : qualité `q = (1 − w) · compétence + w · u`, où la compétence pondère préparation, maîtrise et cohérence du programme, `w` la part du hasard et `u` un tirage propre au débat, à la séquence, à la position et à l'acteur. Une attaque vise un fait de la partie (`angleHolds`) : vrai, la cible perd et l'attaquant gagne selon `q` ; faux, elle se retourne toujours contre l'attaquant. Riposte, hauteur et petite phrase suivent les paramètres `approbation` du jeu de règles. L'IA choisit ses cartes selon son style, sa difficulté et la répétition récente.
- **Demandes du joueur** (`playDebate`, sans effet de bord sur l'état reçu) : `ouvrir`, `refuser` (chaise vide avant le premier coup), `jouer` (carte de la séquence en cours, avec cible et angle pour une attaque ; numéro de séquence contrôlé : `sequence_perimee`) et `finir` (fin simulée, les cartes du joueur étant alors choisies comme pour l'IA).
- **Résolution** (étape 5, `resolveWeekDebates`) : séances menées à leur terme, sondage flash (`softmax` de l'approbation finale réparti au plus fort reste), prestation de −1 à +1, puis effets par le **registre** (source `debat`) : popularité, notoriété, dynamique, chaise vide. Le facteur de vote « Débats télévisés » (`debateVoteFactors`) vaut `voteT1 · prestation · persistance^semaines` au premier tour ; au second, la prestation du débat d'entre-deux-tours alimente `elections.debate`. Les tests bornent l'écart d'intentions dû à un débat (≤ 2 points au premier tour, ≤ 3 au second).
- **Répliques** : modèles du jeu de règles pour le joueur et les candidats fictifs ; `null` pour une personnalité réelle.

## 5. Carte électorale interactive (§3) — conception détaillée

C'est la fonctionnalité centrale du cahier des charges ; elle est conçue dès la phase 0 car elle conditionne le format des données territoriales.

### 5.1 Séparation des couches (§3.2)

| Couche | Contenu | Format | Chargement |
|---|---|---|---|
| Géométries | contours communes / départements / régions, métropole + 5 DROM | tuiles vectorielles (PMTiles) **ou** GeoJSON simplifiés par département (décision au spike de phase 4) | statique, différé selon le zoom |
| Métadonnées | code INSEE, nom, parent, population, millésime COG | JSON indexé par code | une fois, mis en cache |
| Résultats | voix, participation, vainqueur par code et par (scrutin, tour, scénario) | JSON compact servi par l'API | à la demande (filtre actif) |
| Affichage | style MapLibre, palettes, motifs « réel / sondage / projection / simulé » | code | — |

La jointure géométrie ⇄ résultats se fait **côté client par `feature-state`** (identifiant = code INSEE via `promoteId`) : changer de tour, de candidat ou de scénario ne recharge pas les géométries.

### 5.2 Métropole et encarts DROM

- **Carte principale** : métropole (dont Corse — codes `2A`/`2B`, chaînes et non nombres), zoom, déplacement, sélection, rendu vectoriel. Unité communale = les **34 875 communes du COG 2026** ; Paris, Lyon et Marseille sont représentées par leur commune parente, car les résultats 2022 par commune n'ont qu'une ligne par ville (les arrondissements sont exclus de la couche communale).
- **Encarts DROM** : Guadeloupe (971), Martinique (972), Guyane (973), La Réunion (974), Mayotte (976). Chaque encart est une **instance MapLibre indépendante** avec ses propres limites (`maxBounds`), ses communes sélectionnables et la même source de résultats. Ce ne sont pas des points (cf. guide, étape 6).
  - **PC** : bandeau de 5 mini-cartes interactives sous ou à côté de la carte principale.
  - **Mobile** : bandeau de vignettes ; toucher une vignette ouvre l'encart en plein écran. Une seule carte DROM active à la fois sur mobile pour limiter les contextes WebGL et la mémoire.
- **Territoires hors carte** : Français établis hors de France et collectivités d'outre-mer (Saint-Pierre-et-Miquelon, Saint-Barthélemy, Saint-Martin, Wallis-et-Futuna, Polynésie française, Nouvelle-Calédonie) votent à la présidentielle. Ils apparaissent dans une **liste « Hors carte »** avec leurs résultats, et sont inclus dans l'agrégation nationale si le périmètre du scrutin les inclut (§3.1, §3.3). Le périmètre est un paramètre explicite du *ruleset*.

### 5.3 Fonctions

| Exigence (§3.2) | Réalisation prévue |
|---|---|
| Recherche nom ou code | Index client (nom normalisé sans accents, code INSEE, code postal non utilisé car ambigu) ; une commune DROM ouvre son encart puis centre la vue. |
| Fiche territoriale | Nom, code, inscrits, votants, participation, voix, %, vainqueur, nature des données (badge), source et millésime. Panneau latéral (PC) / feuille dépliable (mobile). |
| Filtres | Tour 1 / tour 2 ; candidat (carte de score) ou vainqueur ; nature : historique / sondage / projection / simulé. |
| Comparaison | Deux candidats (écart), deux tours (évolution), deux scénarios (différence) : palette divergente. |
| Niveaux | Région / département / commune selon le zoom ou un sélecteur explicite. |
| Accessibilité | Navigation clavier (recherche, liste, sélection), légende textuelle, **tableau alternatif** filtrable synchronisé avec la carte, motifs en plus des couleurs. |
| Mobile | Gestes tactiles natifs MapLibre, légende compacte repliable, fiche en *bottom sheet*. |
| Distinction réel / simulé (§3.3) | Badge et motif de hachure pour sondage / projection / simulé ; titre de carte indiquant toujours la nature. |

### 5.4 Pipeline géographique (`packages/data-import`)

1. Télécharger les contours communaux du millésime retenu — proposition : IGN ADMIN EXPRESS COG CARTO 2026, Licence Ouverte 2.0 (décision D8, détails dans [SOURCES §2.2](./SOURCES.md#22-contours-communaux)) ; enregistrer URL, date, licence, empreinte SHA-256, version de l'importeur.
2. Valider contre le Code officiel géographique (COG) INSEE du même millésime : **chaque commune du COG a exactement une géométrie** et inversement ; sinon l'import échoue (aucune attribution silencieuse, §3.1).
3. Simplifier à plusieurs niveaux (ex. `mapshaper`, disponible sur npm) ; dériver départements et régions par fusion des communes pour garantir l'emboîtement exact.
4. Générer les tuiles (PMTiles via `tippecanoe`, à installer ou exécuter via Docker en CI) **ou** des fichiers GeoJSON/TopoJSON par département chargés à la demande. Choix arrêté au spike de phase 4 après mesure (taille transférée, temps de rendu sur mobile).

**Réalisé en phase 4** (`pnpm data:geo`, `pnpm data:geo --demo`, `pnpm data:resultats`) :

| Étape | Réalisation |
|---|---|
| Téléchargement | Reprenable (en-tête Range), métadonnées à côté de chaque fichier (`.meta.json` : URL, date, taille, SHA-256) ; empreinte revérifiée à chaque import. |
| COG 2026 | `v_commune_2026.csv` (communes, `TYPECOM = COM`), départements, régions, collectivités d'outre-mer ; codes gardés en chaînes. |
| Contours | GeoPackage ADMIN EXPRESS COG CARTO 2026 lu avec `node:sqlite` (en-tête GeoPackage et WKB décodés par le dépôt), extraction de l'archive par `7zip-bin`. |
| Contrôle | Une géométrie par commune du COG et inversement ; les deux communes de Saint-Pierre-et-Miquelon (collectivité hors carte) sont écartées explicitement ; toute autre différence fait échouer l'import. |
| Simplification | mapshaper : communes à 100 m (formes conservées) ; aperçu national à 1 000 m ; départements et régions **fusionnés à partir des communes**. |
| Sorties | `data/processed/geo/cog-2026/` : `manifest.json` (sources, effectifs, emprises, population, liste hors carte), `france.topo.json` (régions et départements, 112 Ko), `communes/<département>.topo.json` (101 fichiers), `index.json` (recherche). Import reproductible à l'octet près. |
| Démonstration | `packages/data-import/demo/cog-2026/` (1,1 Mo, commité) : aperçu national complet et communes de l'Ain, de la Corse, de la Somme (phase 9 : Amiens et les 771 communes du département) et des cinq DROM, soit 1 651 communes. |
| Résultats 2022 | Fichiers communaux de l'Intérieur (Windows-1252, blocs répétés), contrôles ligne à ligne, **somme égale à l'unité aux totaux proclamés** (deux tours), passage COG 2022 → 2026 par le fichier des mouvements (65 fusions exactes, 10 communes ventilées au prorata de la population et étiquetées « estimation », 6 communes sans électeurs), territoires hors carte isolés. Sortie `data/processed/resultats/presidentielle-2022/` (non commitée, Q8). |
5. Raccorder les résultats historiques au COG courant via les tables de passage INSEE (fusions de communes, changements de code) ; une scission est ventilée au prorata de la population et marquée `estimation`.

### 5.5 Contraintes connues

- Aucun fond de carte tiers n'est requis : la carte choroplèthe se suffit à elle-même (critère 14 « sans clé API payante »). Un fond OSM optionnel pourra être ajouté plus tard si sa licence et son hébergement le permettent.
- Les codes du ministère de l'Intérieur pour l'outre-mer et l'étranger diffèrent des codes INSEE (`ZA`…`ZM` pour les DROM, `ZZ` pour l'étranger, `ZN`, `ZP`, `ZS`, `ZW`, `ZX` pour les COM — vérifié sur les fichiers 2022, voir [SOURCES §3.1](./SOURCES.md#31-présidentielle-2022-par-commune-ministère-de-lintérieur-datagouvfr)) : une table de correspondance explicite et testée est requise ([RISQUES](./RISQUES.md) R-03).
- Les tours de 2027 ont lieu le **samedi** dans plusieurs territoires d'outre-mer : la date de scrutin est portée par territoire dans le *ruleset*.

---

## 6. API REST (`apps/api`)

Toutes les entrées et sorties sont validées par des schémas Zod partagés (`packages/shared`).

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/session` | Session anonyme (cookie signé). *Phase 1.* |
| `GET/POST` | `/api/games` | Lister les parties du joueur / créer une partie (mode, difficulté, date de départ, graine ; candidat du joueur — prénom, nom, parti, positionnement, parcours, profil de départ — obligatoire en mode personnalisé, interdit en observateur). *Phases 1 et 3.* |
| `GET` | `/api/games/:id` | État courant ; une partie d'un ancien format est migrée à la lecture. *Phases 1–2.* |
| `POST` | `/api/games` (phase 5 bis) | Création étendue : `personnaliteId` (mode « candidat réel », obligatoire et réservé à ce mode) et `adversaires` (`fictifs` par défaut, ou `reels`) ; personnalité inconnue ⇒ `422 personnalite_inconnue`. |
| `POST` | `/api/games/:id/advance` | Avancer d'une semaine avec, dans le corps, les actions programmées (et leur cible : département ou média, phase 5), les réponses aux décisions, les annonces et retraits du programme (`programme: { ajouter, retirer }`) et les propositions de ralliement (`alliances: { proposer }`). **Idempotent** : en-tête `Idempotency-Key` obligatoire + `expectedWeek` ; même clé et même requête ⇒ même réponse (`idempotent-replay: true`), même clé et autre requête ⇒ `422`, semaine différente ⇒ `409`. *Phase 2.* **Avance rapide** (phase 6) : `semaines` (1 à 52, sans action ni changement de programme) résout plusieurs semaines d'affilée et s'arrête avant toute décision obligatoire, après un scrutin, un changement de phase, un événement majeur ou un blocage ; la réponse porte le bilan de la dernière semaine et `avanceRapide` (`demandees`, `resolues`, `arret`), chaque semaine étant journalisée comme une progression ordinaire. |
| `POST` | `/api/games/:id/debats/:debatId` | Débat télévisé de la semaine : `{ action: 'ouvrir' \| 'refuser' \| 'finir' \| 'jouer', sequence?, carte?, cible?, angle? }` ; renvoie la partie à jour (version incrémentée sauf pour `ouvrir` d'une séance déjà programmée). Erreurs : `404 debat_introuvable`, `409 debat_termine`, `409 sequence_perimee`, `409 progression_bloquee`, `422 carte_invalide`, `422 debat_non_invite`. Même contrat dans `@r2027/local-api`. *Phase 10.* |
| `GET` | `/api/games/:id/journal?limit&before` | Journal paginé (semaines résolues avec bilan complet, événements techniques). *Phase 2.* |
| `GET/POST` | `/api/games/:id/saves` | Lister (manuelles, automatiques, avant événement, import) / créer une sauvegarde manuelle (5 emplacements). *Phase 1.* |
| `POST` | `/api/games/:id/saves/:saveId/restore` | Reprendre depuis une sauvegarde (migrée si ancien format). *Phases 1–2.* |
| `GET` | `/api/games/:id/export` | Export JSON versionné (`republique-2027/partie`, format 1), en pièce jointe. *Phase 2.* |
| `POST` | `/api/games/import` | Import dans une **nouvelle** partie ; empreinte vérifiée avant migration, schéma, cohérence ; jamais d'écrasement. *Phase 2.* |
| `GET` | `/api/rulesets/:clé` | Jeu de règles d'une partie (calendrier sourcé, catalogue d'actions et d'événements, électorat, adversaires, instituts). *Phase 2.* |
| `GET` | `/api/rulesets/courant` | Jeu de règles des nouvelles parties (profils de départ du formulaire de création). *Phase 3.* |
| `GET` | `/api/geo/manifeste` | Référentiel cartographique (sources, effectifs, départements, régions, hors carte). *Phase 4.* |
| `GET` | `/api/geo/fichiers/*` | Fichiers TopoJSON et index du manifeste (liste blanche), compressés si le client l'accepte. *Phase 4.* |
| `GET` | `/api/geo/recherche?q=` | Recherche d'une commune, d'un département ou d'une région par nom (sans accents) ou code. *Phase 4.* |
| `GET` | `/api/games/:id/resultats/:tour/communes?departement=` | Résultats simulés des communes d'un département, recalculés à l'identique ; `409 base_differente` si la base électorale a changé. *Phase 4.* |
| `GET` | `/api/geo/historique`, `/api/geo/historique/:tour/apercu`, `/api/geo/historique/:tour/communes?departement=` | Résultats officiels 2022 s'ils ont été importés localement ; sinon statut « indisponible » avec la raison. *Phase 4.* |
| `GET` | `/api/games/:id/polls` | Sondages simulés. *Phase 3 : les sondages et résultats font partie de l'état de la partie (`GET /api/games/:id`) et sont aussi journalisés (`sondage_publie`, `resultat_scrutin`) ; une route dédiée viendra avec les volumes communaux de la phase 4.* |
| `GET` | `/api/data-sources` | Provenance des données affichées. |
| `GET` | `/api/health` | Santé (base joignable, versions). |

**Concurrence** : chaque `Game` a un numéro de version ; une mise à jour concurrente échoue en `409` plutôt que d'écraser.

---

## 7. Persistance et sauvegardes (§12)

- **Données de référence** (territoires, base électorale historique, médias, sources, imports) : tables relationnelles partagées entre parties.
- **État dynamique d'une partie** : instantané `GameState` (JSON validé par Zod, `jsonb`) à chaque semaine + journaux immuables `GameAction`, `GameEvent`, `SimulationLog`. Les entités dynamiques du §12 (candidats, alliances, gouvernement, projets de loi…) vivent dans cet instantané ; celles qui doivent être interrogées ou agrégées (résultats électoraux, sondages, indicateurs) sont **projetées** dans des tables dédiées. Le détail entité par entité est dans [MODELE_DONNEES.md](./MODELE_DONNEES.md).
- **Opinion territoriale** : l'instantané ne stocke pas de valeur par commune (≈ 420 000 nombres par semaine). Il garde l'opinion nationale et départementale plus des modificateurs communaux creux ; la valeur d'une commune est dérivée de façon déterministe de sa base historique (voir [MODELE_DONNEES.md §3](./MODELE_DONNEES.md#3-volume--ce-que-linstantané-ne-contient-pas)).
- **Résultats communaux** : ~35 000 communes × ~12 candidats × 2 tours ≈ 840 000 valeurs par élection et par partie ; stockés en bloc compact par (élection, tour, département) plutôt qu'une ligne par (commune, candidat), avec agrégats départementaux / régionaux / nationaux en lignes.
- **Sauvegarde automatique** chaque semaine (les 8 plus récentes sont conservées) et avant tout événement majeur ou scrutin (« Avant le premier tour ») ; **manuelle** sur 5 emplacements ; **export/import JSON versionné** avec empreinte et migrations de sauvegarde (`save-engine` : format 1 de la phase 1 → format 2 de la phase 2 → format 3 de la phase 3 → format 4 de la phase 4 → format 5 de la phase 5).
- **Progression** : chaque `POST /advance` réussi (une semaine, ou plusieurs en avance rapide) est enregistré dans `game_advance` (clé d'idempotence, empreinte de la requête, réponse) ; la même transaction écrit l'état, les actions, les événements, les 12 étapes du journal de simulation et la sauvegarde automatique, avec verrou optimiste sur la version de la partie.
- Protection contre l'import corrompu : validation complète **avant** écriture, transaction, aucune écriture partielle.
- Stockage navigateur (IndexedDB) : aucun pour la version web ; dans l'application Android (phase 8), IndexedDB est le stockage des parties sur l'appareil (mêmes enregistrements que les tables `game`, `game_save`, `game_event` et `game_advance`, écrits dans une seule transaction par requête), voir §14.

---

## 8. Interface (`apps/web`, §13)

Écrans (routes) : accueil / création de partie, tableau de bord de campagne, carte électorale, candidats, programme, finances, sondages, gouvernement, Parlement, économie, crises, journal, sauvegardes.

- **TanStack Query** pour les données serveur (cache, invalidation après `advance`) ; **Zustand** limité à l'état d'interface (filtres de carte, sélection, thème).
- Thème clair/sombre, mise en page responsive (mobile d'abord), tableaux filtrables, notifications, infobulles, navigation clavier.
- Chaque variation affichée (« +2 pts ») propose un détail des facteurs issu du `SimulationLog`.
- Phase 4 : écran **Carte électorale** (MapLibre GL 6, chargé à la demande) : métropole et cinq encarts DROM (instances indépendantes ; sur téléphone, vignettes qui ouvrent l'encart en plein écran), niveaux région / département / commune (communes des départements visibles chargées à la demande), sources « partie, tour 1 ou 2 (simulé) », « présidentielle 2022 (officiel) » si importée, ou « géographie seule », couleurs « candidat en tête » (3 couleurs au plus + « autre »), « participation », « score d'un candidat » (dégradé) ou « écart entre deux candidats » (palette divergente), option « motifs » (hachures à 45° et 135°, croisillons : l'identité ne repose pas sur la teinte seule), recherche, fiche, tableau équivalent filtrable, liste hors carte ; audit axe-core sans violation WCAG 2.1 AA.
- Phase 5 : écrans **Programme** (17 domaines repliables, fiche de chaque proposition : coût, délai, faisabilité, niveau de confiance, électeurs sensibles, dépendances et incompatibilités ; annonce ou retrait ajoutés au plan de la semaine ; programmes des adversaires) et **Finances** (compte de campagne : recettes par origine, dépenses, trésorerie = recettes − dépenses, jauge du plafond, emprunts, dons refusés avec leur motif, remboursement prévisionnel, règles officielles avec leur source) ; tableau de bord enrichi (parrainages par étape et départements couverts, compte de campagne, cible de chaque action ciblée, programme et ralliements prévus) ; écran Candidats enrichi (statuts « écarté » et « retiré », priorité motivée de chaque adversaire, parrainages, relations avec proposition de ralliement, couverture des médias) ; décomposition du débat dans Résultats ; bilan hebdomadaire avec programme, parrainages, finances, relations, ralliements et stratégies adverses. Le plan de la semaine (actions, programme, ralliements) est conservé par partie et par semaine dans un magasin Zustand ; le serveur revalide tout.
- Phase 5 ter : écran **Médias** (émissions politiques et interviews simulées de la semaine, organes par type avec logo crédité, mesure d'audience sourcée, temps de parole de l'Arcom et exposition mesurée des partis des candidats, couverture simulée, section « sources et méthode » avec exclusions et crédits des logos) ; plan d'actions : médias groupés par type, émissions avec chaîne et présentateurs. Les logos (SVG d'origine contrôlés ou WebP) sont servis par l'interface (`apps/web/public/medias`), les données par l'API avec le jeu de règles.
- Phase 5 bis : création de partie avec le choix d'une personnalité réelle (fiches illustrées, candidature datée et sa source, position et sa méthode, crédits des photos, candidatures non intégrées) et du jeu d'adversaires ; écran Candidats avec badge « Personnalité réelle — simulée », photo, fiche sourcée et section « sources et méthode » ; rappel de simulation en tête de chaque écran d'une partie concernée ; carte des positions lisible avec de nombreux candidats (marques confondues pour une même position, étiquette du joueur seule au-delà de huit candidats, tableau des positions). Les photos (WebP, 240 px, sous licence libre) sont servies par l'interface (`apps/web/public/personnalites`), les fiches par l'API avec le jeu de règles.
- Phase 3 : création du candidat (positionnement sur deux axes, électorats les plus proches, profil de départ) ; écrans **Candidats** (carte des positionnements, statuts, facteurs du vote), **Sondages** (dernier sondage avec marge, évolution, fiche technique complète) et **Résultats** (deux tours, participation, blancs, nuls, détail par groupe d'électeurs). Les graphiques sont des barres et un nuage de points en SVG/CSS, sans bibliothèque : votre candidat dans la couleur d'accent, les autres en gris ; la valeur est toujours écrite dans un tableau voisin. Badges « Fictif », « Sondage simulé », « Résultat simulé ».
- Phase 9 : écran **Soirée électorale** (`/parties/:id/soiree/:tour`, hors du menu, chargé à la demande comme la carte) ouvert automatiquement après la semaine d'un scrutin et depuis Résultats. Le déroulé vient du module pur `soiree` de `@r2027/shared` (aucun aléa ni horloge : hachage de la graine, du tour et du code INSEE ; le même module est testé avec le vrai moteur) : 9 tranches de 20 h à minuit, rythme de chaque département, part dépouillée, communes révélées quand leur tirage passe sous l'avancement de leur département, estimation simulée qui converge vers le résultat. L'interface ne fait qu'afficher des fractions exactes du `RoundResult` déjà calculé par le moteur (et des résultats communaux servis par l'API) ; elle ne calcule aucun état. Une seule instance MapLibre (départements, puis communes du département suivi) ; éclat des territoires qui viennent d'être dépouillés par transition de l'opacité d'un contour (GPU), immobile si le mouvement réduit est demandé ; bandeau défilant en `transform` (compositeur), masqué aux lecteurs d'écran, doublé d'une annonce polie et du classement.
- Phase 10 : écran **Débat en direct** (`/parties/:id/debat/:debatId`, chargé à la demande) : pupitres (approbation, temps de parole), courbe d'approbation, trois cartes par séquence, formulaire d'attaque (cible, angle), chronomètre facultatif de 30 s, « Simuler la fin du débat », sondage flash, déroulé et relecture accélérée (immédiate si le mouvement réduit est demandé). Chaque clic envoie une demande à `POST /api/games/:id/debats/:debatId` ; la courbe et les temps de parole ne sont que des sommes des coups renvoyés par le moteur. Panneau « Débats télévisés » au tableau de bord (entrer sur le plateau, chaise vide confirmée, préparation des débats à venir, débat annulé) et section des débats tenus dans Résultats.

---

## 9. Sécurité (§14)

- Validation serveur de toutes les entrées (Zod) ; tailles maximales (import JSON plafonné).
- Sessions : cookie signé `HttpOnly`, `Secure`, `SameSite=Lax` ; une partie n'est accessible qu'à son propriétaire (contrôle systématique `game.userId === session.userId`).
- Limitation de débit (`@fastify/rate-limit`), en-têtes de sécurité (`@fastify/helmet`).
- Secrets uniquement en variables d'environnement ; `.env.example` sans valeur sensible ; `.env` ignoré par Git.
- Journaux sans données personnelles ; aucun profilage individuel d'électeurs : toutes les données électorales sont agrégées au minimum à la commune.
- Licences des données et dépendances vérifiées (`pnpm licenses list` en CI).
- **Phase 8 — API** : utilisateur créé seulement à la première écriture (une lecture sans session ne crée rien et ne voit rien), limite propre aux écritures coûteuses (`RATE_LIMIT_WRITE_MAX`, 60 par minute et par IP : création, import, progression), corps contenant un caractère NUL refusé (400 au lieu d'une erreur PostgreSQL), en production secret d'exemple refusé et cookie `Secure` (`start` fixe `NODE_ENV=production`), `TRUST_PROXY` en nombre d'intermédiaires ou en liste d'adresses, pagination du journal par curseur (date, identifiant) sans saut d'entrées de même horodatage, avance rapide qui rend la main à la boucle d'événements entre deux semaines (52 semaines de calcul ne bloquent plus les autres joueurs ; dans l'application, l'interface reste fluide), CSP du paquet web construit identique à celle de l'application Android. Limite connue : croissance de `game_advance` (R-45).
- **Phase 8** : `pnpm audit` sans vulnérabilité connue (correctifs forcés dans `pnpm-workspace.yaml` pour des dépendances indirectes d'outils de développement : adm-zip et fflate via mapshaper, uuid via la CLI Capacitor) ; empreinte du `gradle-wrapper.jar` vérifiée en CI (`gradle/actions/wrapper-validation`).
- **Application Android** : aucune permission (pas même `INTERNET` : aucune donnée ne peut sortir de l'application), trafic en clair interdit, contenu servi depuis l'APK (`https://localhost`), politique de sécurité du contenu stricte (`script-src 'self'`, `connect-src 'self'`, aucun script en ligne ni distant ; workers et images `blob:` pour MapLibre), partage limité au dossier `cache/exports` (FileProvider non exporté), clé de signature hors du dépôt (variables d'environnement ou secrets GitHub). Les entrées de l'interface sont validées par les mêmes schémas Zod que sur le serveur ; un fichier importé corrompu ou incohérent est refusé (l'empreinte SHA-256 détecte une altération accidentelle ; ce n'est pas une signature : sans classement en ligne, retoucher sa propre partie n'a pas d'enjeu). Sauvegarde Android (`allowBackup`) conservée : les parties ne contiennent ni secret ni donnée personnelle hormis le nom de candidat choisi.

---

## 10. Tests (§15)

| Niveau | Outil | Cible |
|---|---|---|
| Unitaires | Vitest | coûts, ressources, calendrier, probabilités, votes, agrégations, reports, économie, institutions, sauvegardes, migrations |
| Propriétés | Vitest + fast-check | voix ≥ 0, Σ p = 1, Σ voix = exprimés, totaux = agrégations, règles du second tour, ressources suffisantes, réforme rejetée non appliquée, historique immuable, déterminisme |
| Intégration | Vitest + Fastify `inject` + PostgreSQL réel | campagne, parrainages, deux tours, gouvernement, réformes, crises, législatives, fin de quinquennat, poursuite, export / import |
| Bout en bout | Playwright (Chromium, viewport bureau + mobile) | création, action, progression, carte (sélection, DROM, filtres), sondages, sauvegarde, reprise, élection, petit écran |
| Performance | scripts de mesure | chargement, `advance`, calcul électoral, rendu carte, mémoire ; seuils fixés **après** mesure (§15) |

Le moteur se teste sans navigateur, base ni API externe (§11).

---

## 11. Déploiement (§11, guide étape 8)

- Image Docker multi-étapes (API servant aussi les fichiers statiques du front et des géométries), PostgreSQL persistant, HTTPS par le reverse proxy de l'hébergeur.
- `docker compose` pour le développement local (API + PostgreSQL).
- CI GitHub Actions : lint, typecheck, tests unitaires/propriétés, intégration (service PostgreSQL), Playwright, build Docker.
- Sauvegardes automatiques de la base (`pg_dump` planifié) + procédure de restauration testée (critère de phase 7/8).
- Hébergeur : **à choisir** (Node.js + PostgreSQL) — décision ouverte, voir [PLAN](./PLAN_DEVELOPPEMENT.md#5-questions-ouvertes).
- **Application Android (phase 8)** : APK construit par le workflow `.github/workflows/android.yml` (artefact téléchargeable, APK de publication signé si les secrets de signature sont configurés) ou en local (Android Studio, JDK 21) ; aucun serveur requis (§14).
- Cloudflare Workers (relié au dépôt le 21/10/2026, Worker `republique-2027`) : **interface seule**. `wrangler.jsonc` publie `apps/web/dist` (repli sur `index.html` pour les routes) ; `cloudflare/worker.js` répond aux requêtes `/api/*` par une erreur 503 explicite (`api_non_deployee`), car l'API Fastify et PostgreSQL ne s'exécutent pas sur Workers. Node.js fixé par `.node-version` (`engine-strict`).

---

## 12. Versions de la pile (figées en phase 1, le 20/10/2026)

Versions exactes dans les `package.json` et `pnpm-lock.yaml`. Écarts volontaires avec la dernière version publiée :

| Paquet | Version retenue | Dernière publiée | Raison |
|---|---|---|---|
| typescript | 6.0.3 | 7.0.2 | `typescript-eslint` 8.72 exige TypeScript < 6.1. |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.1 | 8.0.0-rc.23 (`latest`) | L'étiquette `latest` pointe vers une *release candidate*. |
| @playwright/test | 1.56.1 | 1.64.1 | Correspond au Chromium préinstallé (révision 1194) ; la CI installe la même révision. |
| jsdom | 29.1.1 | 30.1.3 | La 30 exige Node ≥ 22.22.2. |
| @types/node | 22.20.5 | 26.6.5 | Aligné sur Node 22. |

Autres versions : react 19.3.1, react-router 8.5.0 (exige Node ≥ 22.22), vite 8.3.4, @vitejs/plugin-react 6.1.2, tailwindcss 4.3.3, @tanstack/react-query 5.104.5, zustand 5.0.15, fastify 5.12.7, @fastify/cookie 11.1.3, @fastify/helmet 13.2.0, @fastify/rate-limit 11.2.1, zod 4.6.7, vitest 5.0.5, @testing-library/react 16.3.3, eslint 10.13.0, prettier 3.9.10, esbuild 0.28.2, tsx 4.23.15.

Prévues pour les phases suivantes (non installées) : maplibre-gl 6.15.0, pmtiles 4.5.0, fast-check 4.10.2, mapshaper 0.7.91.

## 13. Décisions d'architecture à valider

| # | Décision proposée | Alternative écartée | Raison |
|---|---|---|---|
| D1 | Monorepo pnpm (apps + packages) | dépôts séparés | Types partagés moteur ⇄ API ⇄ UI, une seule CI. |
| D2 | Moteur pur exécuté côté serveur uniquement | moteur dans le navigateur | Déterminisme (§11), sauvegarde serveur faisant foi (§12). |
| D3 | État de partie = instantané JSON versionné + journaux immuables + projections relationnelles | toutes les entités du §12 en tables normalisées | Rejouabilité, migrations de sauvegarde simples, volume maîtrisé. |
| D4 | Voix entières par plus fort reste, agrégats = sommes | arrondis indépendants par niveau | Garantit l'égalité exacte des totaux (§3.3). |
| D5 | Encarts DROM = instances MapLibre indépendantes | DROM déplacés sur la carte principale | Exigence « mini-cartes interactives indépendantes » (§3.2). |
| D6 | Pas de fond de carte externe | fond de carte d'un service tiers | Pas de clé API (critère 14), hors ligne. |
| D7 | **Décidé (phase 4)** : TopoJSON par département chargé à la demande, aperçu national des départements et régions | GeoJSON national unique ; PMTiles (non mesurées : `tippecanoe` indisponible ici) | Mesure sur téléphone émulé : premier rendu 1,6 s, 0,43 Mo, 11,5 Mo de mémoire, contre 21 s, 8 Mo et 268 Mo pour le fichier national ([MESURES_CARTE.md](./MESURES_CARTE.md)). |
| D8 | **Appliqué (phase 4)** : contours IGN ADMIN EXPRESS COG CARTO 2026 (Licence Ouverte 2.0), simplifiés par nos soins | contours Etalab (ODbL) | Pas d'obligation de partage à l'identique ; mêmes géométries IGN pour la métropole et les DROM. |
| D9 | Référentiel territorial en **fichiers versionnés par millésime** (manifeste, TopoJSON, index) chargés en mémoire par l'API | tables `Territory` en base | Données statiques, reproductibles, servies telles quelles à la carte ; aucune importation en base à maintenir par environnement. |
| D10 | Résultats communaux d'une partie **recalculés à la demande** (comportement des groupes enregistré dans l'état, base électorale identifiée par une empreinte) ; agrégats départementaux et régionaux dans l'état | blocs de résultats communaux en base | ~500 000 nombres par tour évités dans chaque sauvegarde ; export/import inchangés ; résultat identique garanti par test, refus explicite si la base électorale a changé. |
| D13 | **Phase 8** (décision de l'utilisateur, Q9) : application Android **hors ligne** ; le moteur s'exécute sur l'appareil dans `@r2027/local-api`, qui réimplémente le contrat de l'API au-dessus d'IndexedDB ; l'interface est inchangée (transport remplaçable) | enveloppe Android connectée à un serveur hébergé | Aucun hébergeur choisi (Q6) ; jeu jouable partout sans réseau ni compte ; même moteur, mêmes schémas, même format d'export : une partie passe de l'application au serveur et inversement. D2 reste vrai pour la version web. |
| D12 | **Phase 5 ter** : médias réels **commités** dans `packages/rulesets` (`medias-2027.json`, empreinte vérifiée) et logos commités dans `apps/web/public/medias` ; aucune ligne éditoriale modélisée, exposition par parti tirée des temps de parole mesurés | ligne éditoriale paramétrée par organe ; données chargées à l'exécution | Faits mesurés et datés plutôt qu'une appréciation du jeu sur des médias réels ; partie reproductible hors ligne ; aucune requête du navigateur vers des services tiers. |
| D11 | **Phase 5 bis** : fiches des personnalités réelles **commitées** dans `packages/rulesets` (empreinte vérifiée : une réimportation impose une nouvelle version du jeu de règles) et photos commitées dans `apps/web/public` | fiches et photos chargées à l'exécution depuis Wikipédia, Wikidata et Commons | Partie reproductible et jouable hors ligne ; chaque fait vérifié à l'import, daté et sourcé ; aucune requête du navigateur vers des services tiers (vie privée, disponibilité). |

---

## 14. Application Android hors ligne (phase 8)

```
apps/mobile (Vite + Capacitor 8) ── WebView Android, https://localhost servi depuis l'APK
 ├─ écrans de apps/web (mountApp), transport d'API remplacé (setApiTransport)
 │    requête { méthode, URL, en-têtes, corps } ─► copie JSON ─► LocalApi.handle ─► copie JSON
 ├─ plateforme « local » : export par la feuille de partage (Filesystem + Share), avertissement
 │    si Android n'accorde pas le stockage persistant (navigator.storage.persist)
 └─ packages/local-api
      ├─ LocalApi : mêmes routes, codes d'erreur et schémas que l'API Fastify (parties,
      │    progression idempotente, avance rapide, sauvegardes automatiques et manuelles,
      │    journal paginé, export/import avec empreinte, résultats communaux, carte, règles)
      ├─ IndexedDbStore : base « republique-2027 », tables games, saves, events, advances ;
      │    toutes les écritures d'une requête dans une seule transaction (tout ou rien)
      └─ LocalGeo : référentiel de démonstration COG 2026 embarqué (import.meta.glob),
           base électorale de démonstration fictive (comme l'API sans import local)
```

- **Même contrat** : les tests de `local-api` rejouent les scénarios de l'API (idempotence, clé réutilisée, semaine périmée, avance rapide arrêtée avant une décision, rotation des sauvegardes automatiques, import refusé si modifié) ; l'interface vérifie chaque réponse avec les schémas de `@r2027/shared`, quelle que soit sa provenance.
- **Rétention** : seules les réponses des 10 dernières progressions sont gardées pour l'idempotence (chaque réponse contient l'état complet) ; une requête plus ancienne rejouée reçoit « semaine périmée ». Base IndexedDB en version 2 (index des progressions par partie et par date), montée de version testée depuis la version 1.
- **Requêtes sérialisées** : une file d'attente traite les requêtes une à une (pas d'écriture concurrente sur une même partie) ; horodatages strictement croissants.
- **Ce qui diffère du serveur** : pas de session (l'appareil n'a qu'un joueur), pas de limitation de débit, pas de résultats réels de 2022 (licence non précisée, Q8), référentiel limité à la démonstration (Ain, Corse, Somme, DROM).
- **Construction** : `pnpm --filter @r2027/mobile build` puis `npx cap sync android` et Gradle ; le workflow `.github/workflows/android.yml` produit l'APK et l'essaie sur un émulateur Android 14 en mode avion. Commandes détaillées : [apps/mobile/README.md](../apps/mobile/README.md).
