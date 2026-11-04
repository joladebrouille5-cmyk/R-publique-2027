# Phase 24 — Rééquilibrage de la présidentielle : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un banc d'essai d'équilibrage reproductible, puis des corrections mesurées par lui : départ « Sondages actuels » sourcé pour les personnalités réelles, candidat personnalisé jouable, programme visible, avantage du centre réduit par des règles générales, anomalie « naïf < passif » expliquée, parrainages des petits candidats documentés, essai Android adapté.

**Architecture:** banc pur `packages/engine/src/sim/` (stratégies, scénarios, agrégats) lancé par `pnpm sim:equilibrage` et en version courte dans `pnpm check` ; socle électoral calibré à la création (`packages/engine/src/election/socle.ts`), stocké dans l'état (format 24) et ajouté par `campaignFactors` et `secondRoundFactors` ; données de sondages saisies et sourcées dans `packages/rulesets/src/sondages-2027.json` ; règles partagées du programme suggéré dans `@r2027/shared`.

**Tech Stack:** TypeScript strict, Zod, Vitest, tsx (script du banc), React 19, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-reequilibrage-design.md` (et le brief de l'utilisateur, qui fait foi).

## Global Constraints

- Moteur pur : pas de `Math.random`, `Date`, réseau, base ni DOM ; tirages par `stream(seed, …)` ; banc déterministe graine par graine (`equilibrage-<scénario>-<n>`).
- Paramètres de jeu dans `packages/rulesets`, version `22.0.0`, étiquetés `statut: 'hypothese'` ; sondages = données sourcées, jamais inventées ; personnalité non testée = « non testée », socle minimal 0,5 %.
- Variations de ressources par le `Ledger` (facteur « Rattrapage de notoriété ») ; facteurs d'utilité nommés « Socle électoral (sondages au JJ/MM/AAAA) ».
- Format de sauvegarde 24 et migration 23 → 24 ; moteur 0.24.0 ; application 1.16.0.
- Neutralité : même formule pour toutes les personnalités ; aucun malus ciblé ; aucun programme prêté ni propos attribué ; coefficients `ia` inchangés.
- `apps/web` n'importe pas `@r2027/engine` (sauf tests) ; tout champ de création ajouté à `apps/api` l'est à `packages/local-api` (mêmes codes d'erreur).
- Étiquette d'interface fixe : « Simulation : point de départ issu des sondages publiés, la suite est simulée ».

## Review Focus

1. **Partie avec adversaires fictifs** (aucune personnalité réelle) : le choix « Sondages actuels » n'est pas proposé, aucun socle — test dans la tâche 3.
2. **Joueur qui incarne une personnalité réelle** en « Sondages actuels » : il reçoit son socle comme les autres (même formule), et son propre socle apparaît dans « Pourquoi ça bouge ? » — test dans la tâche 3.
3. **Présidentielle suivante (2032)** : le socle des sondages de 2026 ne s'applique plus (cycle 2027 seulement) — test dans la tâche 3.
4. **Partie migrée du format 23** : `depart: 'equitable'`, aucun socle, aucune variation des intentions — test dans la tâche 2.
5. **Programme suggéré pour un candidat déjà doté de propositions** : la suggestion ne propose que des propositions absentes du programme, dans la limite du jeu de règles — test dans la tâche 5.

---

### Task 1: Banc d'essai d'équilibrage et référence

**Files:**
- Create: `packages/engine/src/sim/equilibrage.ts` (stratégies, scénarios, partie, agrégats), `packages/engine/src/sim/equilibrage.test.ts` (version courte), `scripts/sim-equilibrage.ts` (lanceur), `docs/equilibrage/reference-phase-24-avant.md` (résumé de référence, commité)
- Modify: `package.json` (`"sim:equilibrage": "tsx scripts/sim-equilibrage.ts"`), `.gitignore` (`data/sim/` s'il n'est pas déjà couvert par `data/`)

**Interfaces:**
- Produces: `type Strategy = 'passif' | 'naif' | 'ia'` ; `type Scenario = { id: string; parties: number; create: (seed: string) => GameState; strategy: Strategy; programme: boolean }` ; `SCENARIOS: Record<string, (n: number) => Scenario>` avec `observateur-fictifs`, `observateur-reels-equitable`, `personnalise-<niveau>-<strategie>[-programme]`, `miroir-gauche`, `miroir-droite`, `incarne-<personnaliteId>`, `inverse-boussole-pilier` (et `observateur-reels-sondages` ajouté à la tâche 3) ; `playShortGame(start: GameState, strategy: Strategy, programme: boolean, ruleset: Ruleset): GameOutcome` (`{ winner, qualified: string[], t1Shares: Record<id, number>, sansParrainages: string[], playerRank: number | null }`) ; `summarize(outcomes: GameOutcome[]): ScenarioSummary` (par candidat : victoires, 2nd tour, sans parrainages, score moyen au 1er tour ; rang médian du joueur) ; `formatSummary(id, summary): string` (français).
- Stratégie `ia` : cloner l'état, passer `joueur` en `kind: 'adversaire'`, `style: 'equilibre'`, `toleranceRisque: 0.4`, `objectif: 'victoire'`, appeler `planOpponentActions` et garder le plan de `joueur`. `naif` : parrainages (deux `elus-locaux` ciblés tant que les présentations sont ouvertes) + `meeting` + `interview@france-inter`. Programme (option) : annonce progressive du programme suggéré (tâche 5 ; d'ici là, copie du programme de Boussole, comme dans le brief).

- [ ] **Step 1: Tests** — `equilibrage.test.ts` : même graine → même `GameOutcome` ; `passif` ne joue aucune action ; `ia` produit un plan non vide validé ; `summarize` d'un jeu de résultats fabriqué donne les pourcentages et le rang médian attendus.
- [ ] **Step 2: Échec attendu, puis implémenter, puis vert** — `pnpm exec vitest run --project engine packages/engine/src/sim`.
- [ ] **Step 3: Référence** — `pnpm sim:equilibrage --parties 300` sur tous les scénarios **avant toute modification** ; écrire le résumé dans `docs/equilibrage/reference-phase-24-avant.md` (JSONL dans `data/sim/`, hors Git).
- [ ] **Step 4: Commit.**

### Task 2: Schémas, jeu de règles 22.0.0, format 24, données des sondages

**Files:**
- Create: `packages/rulesets/src/sondages-2027.json`, `packages/shared/src/sondages.ts`
- Modify: `packages/shared/src/game.ts` (`player.depart`, `socle` ; gel `GameStateV23Schema` ; format 24), `packages/shared/src/ruleset.ts` (blocs `sondagesReels`, `rattrapageNotoriete`), `packages/shared/src/api.ts` (`depart` à la création), `packages/rulesets/src/presidentielle-2027.json` (22.0.0), `packages/rulesets/src/index.ts`, `packages/save-engine/src/versions.ts` (migration 23 → 24), `packages/engine/src/core/versions.ts` (0.24.0), `docs/SOURCES.md` (§ sondages)
- Test: `packages/rulesets/src/index.test.ts`, `packages/save-engine/src/versions.test.ts`, `packages/shared/src/sondages.test.ts`

**Interfaces:**
- Produces: `PollSurveySchema` (`{ id, institut, commanditaire, terrain: { debut, fin }, echantillon, hypothese, intentions: Record<personnaliteId, centièmes>, source: url }`) et `DuelSchema` (`{ enqueteId, a, b, partA (centièmes) }`) ; `pollAverage(data, personnaliteIds: string[]): { date: string, cibles: Record<id, { valeur: number, statut: 'testee' | 'non-testee' }> }` (5 dernières enquêtes, hypothèse avec le plus de personnalités en commun, non testée = 50 centièmes, renormalisé à 10 000) ; `GameState.player.depart: 'sondages' | 'equitable'` ; `GameState.socle: { date: string, t1: Record<actorId, number>, t2: Record<actorId, number> } | null` ; `SAVE_SCHEMA_VERSION = 24`.
- Données : saisies depuis les sources du brief, vérifiées (Ipsos joignable ; TF1 Info par `curl` ; sinon presse ou liste Wikipédia en révision figée) ; une enquête non vérifiable est laissée de côté.

- [ ] **Step 1: Tests** — jeu de règles 22.0.0, bloc `sondagesReels` avec empreinte du fichier, chaque enquête a source, dates, échantillon ; `pollAverage` : moyenne des 5 dernières, « non testée » à 0,5 %, somme 10 000 ; migration 23 → 24 sur la fixture réelle : `depart: 'equitable'`, `socle: null`, rien d'autre.
- [ ] **Step 2: Échec, implémenter, vert** — `pnpm exec vitest run --project rulesets --project save-engine --project shared`, puis typecheck de tout le dépôt.
- [ ] **Step 3: Commit.**

### Task 3: Socle électoral « Sondages actuels » (priorité 2.4)

**Files:**
- Create: `packages/engine/src/election/socle.ts`, `packages/engine/src/election/socle.test.ts`
- Modify: `packages/engine/src/core/createGame.ts` (calibrage à la création), `packages/engine/src/election/distribution.ts` (`campaignFactors`, `secondRoundFactors`), `packages/engine/src/sim/equilibrage.ts` (scénario `observateur-reels-sondages`), API et moteur local (champ `depart`, refus `depart_sans_personnalites` si aucun réel), `apps/web` (étape « Le terrain » : choix et étiquette)

**Interfaces:**
- Consumes: `pollAverage` (tâche 2).
- Produces: `calibrateSocle(state: GameState, ruleset: Ruleset): NonNullable<GameState['socle']>` — décalages t1 par ajustement itératif (`décalage += ln(cible / simulé)`, au plus 40 itérations, arrêt à ± 0,5 point), t2 ajustés sur les duels sourcés (même méthode sur les seconds tours simulés) ; `socleFactors(state, contenderId, round): UtilityFactor[]` — `[{ label: 'Socle électoral (sondages au JJ/MM/AAAA)', value }]`, valeur × `decroissance ^ semaines` (paramètre `hypothese`), cycle 2027 seulement.

- [ ] **Step 1: Tests** — en semaine 0, intentions simulées de chaque personnalité testée à ± 2 points de la moyenne ; seconds tours de semaine 0 à ± 4 points des duels ; facteur visible pour le joueur réel (Review Focus 2) ; aucun socle avec adversaires fictifs, refus de l'API et du moteur local (Review Focus 1) ; aucun socle en 2032 (Review Focus 3) ; déterminisme.
- [ ] **Step 2: Échec, implémenter, vert** — engine, intégration API, local-api, web.
- [ ] **Step 3: Banc** — `pnpm sim:equilibrage observateur-reels-sondages --parties 300` et `incarne-*` : régler la décroissance jusqu'aux critères (Le Pen qualifiée ≥ 85 %, Mélenchon 2e qualifié le plus fréquent, Le Pen gagne 55 à 85 %, Philippe / Glucksmann / Mélenchon incarnés ≥ 5 %).
- [ ] **Step 4: Commit.**

### Task 4: Candidat personnalisé jouable (2.1)

**Files:**
- Modify: `packages/rulesets/src/presidentielle-2027.json` (`jeu.ressourcesInitiales`, `rattrapageNotoriete`), `packages/engine/src/campaign/actions.ts` (rattrapage), tests du moteur

**Interfaces:**
- Produces: facteur de registre « Rattrapage de notoriété » sur les gains de notoriété des actions : `+ gain × coef × max(0, (seuil − notoriété) / seuil)` (paramètres `hypothese`, tous les candidats).

- [ ] **Step 1: Tests** — rattrapage appliqué sous le seuil, nul au-dessus, somme exacte des facteurs ; ressources de départ du jeu de règles.
- [ ] **Step 2: Échec, implémenter, vert.**
- [ ] **Step 3: Banc** — `personnalise-*-ia-programme` × 5 niveaux, 300 parties : Découverte 35–60 %, Standard 15–30 %, Expert 5–15 %, Légende 1–8 %, strictement décroissant ; coefficients `ia` inchangés.
- [ ] **Step 4: Commit.**

### Task 5: Programme visible et programme de départ suggéré (2.2)

**Files:**
- Create: `packages/shared/src/programme-suggere.ts` (+ test)
- Modify: `apps/web/src/screens/Dashboard.tsx` (alerte), écran Programme (bouton « Programme de départ suggéré »), `packages/engine/src/sim/equilibrage.ts` (programme suggéré)

**Interfaces:**
- Produces: `suggestedProgramme(position: Position, current: string[], ruleset: Ruleset): string[]` — propositions les plus proches du positionnement, une par domaine d'abord, absentes de `current`, jusqu'au minimum `programme.minimumRecommande` (paramètre `hypothese`, N) ; `programmeEffect(state, actorId, ruleset): number` — effet estimé en points d'intention, lu dans `state.opinion.breakdown` (facteurs « Programme » et « Crédibilité ») ; ajout par `programme.ajouter` du plan de la semaine.

- [ ] **Step 1: Tests** — suggestion déterministe, sans doublon (Review Focus 5) ; alerte visible sous N propositions avec l'effet estimé, absente au-delà ; le bouton ajoute les propositions au plan.
- [ ] **Step 2: Échec, implémenter, vert.**
- [ ] **Step 3: Banc** — sans programme en Standard : au moins 5 points de victoires de moins qu'avec.
- [ ] **Step 4: Commit.**

### Task 6: Avantage structurel du centre (2.3)

**Files:**
- Modify: `packages/engine/src/election/model.ts` (piste retenue), `packages/rulesets/src/presidentielle-2027.json` (paramètres, note `modele`), `docs/equilibrage/pistes-centre.md`

**Interfaces:**
- Produces: au plus les pistes nécessaires parmi (a) `proximite × min(distance, saturation)` ou forme qui sature, (b) facteur « Fidélité de camp » pour le candidat le plus proche du groupe, (c) abstention différentielle quand aucun candidat n'est proche, (d) ressources de départ de Boussole ; chaque piste derrière un paramètre (valeur neutre = comportement actuel).

- [ ] **Step 1: Démonstration** — `inverse-boussole-pilier` (ressources échangées) : part de l'avantage due à la position et aux ressources, chiffrée dans `pistes-centre.md`.
- [ ] **Step 2: Tests** — chaque piste à sa valeur neutre ne change rien ; à sa valeur retenue, test unitaire de la formule.
- [ ] **Step 3: Banc, piste par piste** — observateur fictifs : aucun candidat > 45 %, au moins 4 vainqueurs, au moins 3 qualifiés différents dans plus de 10 % des parties ; réels « Départ équitable » : aucun > 55 % ; miroirs : écart ≤ 3 points ; noter les pistes écartées avec leurs chiffres.
- [ ] **Step 4: Commit.**

### Task 7: Anomalie « naïf < passif », parrainages, essai Android (2.5, 2.6, annexe)

**Files:**
- Modify: selon le diagnostic (`packages/engine/src/campaign/prestations.ts` ou `actions.ts`, débriefing `apps/web/src/components/WeeklyDebrief.tsx`), paramètres de parrainage si ajustés, `apps/mobile/scripts/essai-android.mjs`, `docs/equilibrage/diagnostics.md`

- [ ] **Step 1: Diagnostic** — banc `personnalise-decouverte-naif` contre `-passif`, facteurs de la semaine ; écrire la cause dans `diagnostics.md`.
- [ ] **Step 2: Test puis correction** — si défaut : test qui reproduit, correction, vert ; si voulu (lassitude) : test du débriefing qui l'affiche.
- [ ] **Step 3: Parrainages** — taux d'échec d'Étincelle et de Zemmour au banc ; documenter ou ajuster (test des paramètres).
- [ ] **Step 4: Essai Android** — script adapté à l'assistant de création (nom de la partie à la dernière étape) ; vérifié avec le paquet local si possible.
- [ ] **Step 5: Commit.**

### Task 8: Vérifications, documentation, APK 1.16.0

**Files:**
- Modify: `docs/PLAN_DEVELOPPEMENT.md` (phase 24, proposition de l'événement « Cour de cassation »), `docs/RISQUES.md` (R-12), `docs/SOURCES.md`, `docs/MODELE_DONNEES.md` (format 24), `docs/ARCHITECTURE.md`, `README.md`, `apps/mobile/README.md`, `apps/mobile/package.json` (1.16.0), `apps/mobile/android/app/build.gradle` (17 / 1.16.0), `docs/equilibrage/reference-phase-24-apres.md`

- [ ] **Step 1: Banc complet après** — `pnpm sim:equilibrage --parties 300` ; tableau avant / après.
- [ ] **Step 2: Vérifications** — `pnpm check`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:mobile`.
- [ ] **Step 3: APK** — sync, build, `aapt2` (1.16.0, 17, mêmes permissions), `apksigner`.
- [ ] **Step 4: Revue finale, commit, push, compte rendu** (tableau avant / après, valeurs retenues, pistes écartées, fichiers, tests, limites, prochaine étape).
