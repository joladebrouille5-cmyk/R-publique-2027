# Phase 23 — Candidatures à la présidentielle suivante : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** à la fin du quinquennat, le joueur se représente ou passe la main à un successeur, les autres candidats se représentent ou se retirent, de nouveaux candidats entrent, et le bilan du quinquennat pèse sur les intentions du président sortant et de son camp.

**Architecture:** un module moteur pur `packages/engine/src/presidency/succession.ts` (décision du joueur, successeurs, tirages des candidatures, entrants, facteur de bilan), appelé par `advancePresidencyWeek` (décision) et `openNextCampaign` (application) ; le facteur de bilan s'ajoute dans `campaignFactors` (`election/distribution.ts`). Paramètres dans le jeu de règles 21.0.0 (`succession`), état au format 23 (`state.succession`), aucune route nouvelle.

**Tech Stack:** TypeScript strict, Zod, Vitest, Fastify (API), moteur local, React 19, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-presidentielle-suivante-candidatures-design.md`

## Global Constraints

- Moteur pur : pas de `Math.random`, `Date`, réseau, base ni DOM ; tirages par `stream(state.meta.seed, …)`.
- Toute variation de ressource d'un acteur existant par le `Ledger` (facteurs nommés) ; un acteur créé reçoit ses moyens de départ à sa création, comme à `createGame`.
- Paramètres dans `packages/rulesets` : version `21.0.0`, bloc `succession` étiqueté `statut: 'hypothese'` avec une `note`.
- Format de sauvegarde 23 avec migration 22 → 23 ; moteur `0.23.0`.
- Jamais de propos ni de citation prêtés à une personne réelle : annonces au conditionnel du jeu (« Candidature simulée : … »), motif de jeu chiffré.
- Aucune route nouvelle ; `apps/web` n'importe pas `@r2027/engine` (sauf tests) ; interface en français.

## Review Focus

1. **Observateur** (pas de candidat joueur) : aucune décision `candidature`, la succession des autres s'applique — test dans la tâche 4.
2. **Président joueur au terme de deux mandats** : pas d'option « se représenter », défaut = premier successeur — test dans la tâche 4.
3. **Champ dépeuplé** (tous les tirages au retrait) : la présidentielle compte toujours au moins deux candidats déclarés grâce aux familles sans candidat — test dans la tâche 3.
4. **Successeur déjà acteur** (ancien candidat devenu ministre) : le joueur le reprend, aucun doublon d'acteur — test dans la tâche 4.
5. **Cycle suivant (2037)** : la succession s'applique de nouveau (successeur d'un successeur, identifiants d'entrants uniques) — test dans la tâche 4.

---

### Task 1: Schémas, jeu de règles 21.0.0, format 23

**Files:**
- Modify: `packages/shared/src/game.ts` (genre `candidature`, `SuccessionSchema`, gel `GameStateV22Schema`, `GameStateSchema` format 23)
- Modify: `packages/shared/src/politics.ts` (`figureId` facultatif ; une personnalité réelle renvoie à exactement une fiche)
- Modify: `packages/shared/src/ruleset.ts` (bloc `succession`)
- Modify: `packages/rulesets/src/presidentielle-2027.json` (`version` `21.0.0`, bloc `succession`), `packages/rulesets/src/index.ts` (`CURRENT_RULESET_KEY`)
- Modify: `packages/save-engine/src/versions.ts` (migration 22 → 23), `packages/engine/src/core/versions.ts` (`0.23.0`), `packages/engine/src/core/createGame.ts` (`succession: null`)
- Test: `packages/rulesets/src/index.test.ts`, `packages/save-engine/src/versions.test.ts`, `packages/shared/src/*.test.ts` (identité)

**Interfaces:**
- Produces: `DECISION_KINDS` contient `'candidature'` ; `SuccessionSchema = { annee: number, choixJoueur: string | null, annonces: SuccessionAnnouncement[], bilan: Record<actorId, { facteur: number, role: 'sortant' | 'heritier' | 'ministre' }> }` ; `SuccessionAnnouncement = { actorId: string, choix: 'candidat' | 'retrait' | 'entree' | 'successeur', motif: string }` ; `GameState.succession: Succession | null` ; `CandidateIdentity.figureId?: string` (`^figure-[a-z0-9-]+$`) ; `Ruleset.succession` (valeurs ci-dessous) ; `SAVE_SCHEMA_VERSION = 23`.
- Valeurs du bloc `succession` (spec §1–§5) : `delaiDecisionSemaines: 4`, `maxCandidats: 12`, `maxSuccesseurs: 4`, `representation: { sortant: { base: 0.5, pente: 1.5, pivot: 3000, min: 0.1, max: 0.95 }, finaliste: 0.85, elimine: { base: 0.25, pente: 2, min: 0.15, max: 0.8 }, autre: 0.3 }`, `ministreSeuilPopularite: 4500`, `ministreProbabilite: 0.35`, `distanceMinistre: 0.25`, `distanceFamille: 0.35`, `transmissionMilitants: 0.6`, `entrants: { budgetCentimes: 200000000, militants: 300, notoriete: [1500, 3000, 4500], notorieteProfil: 1200, popularite: 3000 }`, `bilan: { pivotPopularite: 3500, poidsPopularite: 1.2, poidsNote: 0.3, poidsChomage: 0.15, max: 0.6, heritier: 0.5, ministre: 0.25 }`, `statut: 'hypothese'`, `note` (texte court).

- [ ] **Step 1: Tests** — jeu de règles : version `21.0.0`, bloc `succession` présent, `statut` `hypothese`, probabilités dans [0, 1], `maxSuccesseurs` ≤ `maxCandidats` ; identité : `nature: 'reel'` avec `figureId` et sans `personnaliteId` acceptée, avec les deux refusée, `figureId` sur un candidat fictif refusé ; migration : un état réel du format 22 (fixture existante du format 22 ou état fabriqué par le moteur 0.22 puis figé) passe au format 23 avec `succession: null`, empreinte recalculée, `rulesetVersion` courant.
- [ ] **Step 2: Échec attendu** — `pnpm exec vitest run --project rulesets --project save-engine --project shared`.
- [ ] **Step 3: Implémenter** les schémas (format 22 figé tel qu'aujourd'hui), le bloc du jeu de règles, la migration `migrateV22ToV23`, `succession: null` à la création, version du moteur.
- [ ] **Step 4: Vert** — mêmes projets, puis `pnpm --filter @r2027/web exec tsc -p tsconfig.json --noEmit` (l'interface doit déclarer le genre `candidature` : entrée provisoire dans `DECISION_KINDS` de `DecisionsPanel.tsx`, finalisée à la tâche 6).
- [ ] **Step 5: Commit**

### Task 2: Le poids du bilan sur les intentions

**Files:**
- Create: `packages/engine/src/presidency/succession.ts`, `packages/engine/src/presidency/succession.test.ts`
- Modify: `packages/engine/src/election/distribution.ts` (`campaignFactors`)

**Interfaces:**
- Produces: `recordScore(review: QuinquennatReview, ruleset: Ruleset): number` — `B` borné à ±`bilan.max` ; `recordFactors(state: GameState, contenderId: string): UtilityFactor[]` — `[{ label: 'Bilan du quinquennat', value: state.succession.bilan[id].facteur }]` ou `[]`.
- Formule (spec §5) : `B = poidsPopularite × (popularitéFinale − pivotPopularite) / 10 000 + poidsNote × ((note ?? 10) − 10) / 10 − poidsChomage × (chômageFin − chômageDébut) / 100`, valeurs en centièmes comme dans `QuinquennatReview`.

- [ ] **Step 1: Tests** — popularité 3500, note 10, chômage stable → 0 ; popularité 5500, note 16, chômage −1 point → `1,2 × 0,2 + 0,3 × 0,6 + 0,15 × 1 = 0,57` ; popularité 1000, note 4, chômage +2 → borné à −0,6 ; note manquante → 10 ; `recordFactors` sans `succession` → `[]` ; avec un acteur au bilan → facteur « Bilan du quinquennat » et la somme des facteurs d'utilité du candidat égale son score (contrôle existant de `utilityFactors`).
- [ ] **Step 2: Échec attendu** — `pnpm exec vitest run --project engine packages/engine/src/presidency/succession.test.ts`.
- [ ] **Step 3: Implémenter** `recordScore`, `recordFactors`, et ajouter `...recordFactors(state, contender.id)` à `campaignFactors`.
- [ ] **Step 4: Vert**, puis `pnpm exec vitest run --project engine` (aucune autre partie ne change : sans `succession`, aucun facteur).
- [ ] **Step 5: Commit**

### Task 3: Les autres candidats décident ; les entrants

**Files:**
- Modify: `packages/engine/src/presidency/succession.ts`, `packages/engine/src/presidency/cycle.ts` (`openNextCampaign`)
- Test: `packages/engine/src/presidency/succession.test.ts`, `packages/engine/src/presidency/cycle.test.ts`

**Interfaces:**
- Consumes: `recordScore` (tâche 2).
- Produces: `runProbability(actorId: string, state: GameState, ruleset: Ruleset, context: { presidentId: string, termLimited: boolean, previous: PresidentialArchive | null }): number` ; `applySuccession(state: GameState, ruleset: Ruleset, ledger: Ledger, step: number, review: QuinquennatReview, context): ReportEvent[]` — appelée par `openNextCampaign` après l'archivage, avant les moyens de départ ; écrit `state.succession` (`annee`, `annonces`, `bilan`) ; crée les acteurs entrants avec les identifiants `entrant-<annee>-<figure|profil id>` ; `createEntrantActor(source: { nature: 'figure' | 'profil', ref: string }, state: GameState, ruleset: Ruleset, asPlayer: boolean): Actor`.
- Probabilités (spec §2) : sortant éligible `clamp(base + pente × (popularité − pivot)/10 000, min, max)` ; inéligible 0 ; finaliste battu `finaliste` ; éliminé `clamp(base + pente × part, min, max)` avec la part des exprimés au premier tour archivé ; écarté ou retiré `autre`. Tirage : `stream(seed, 'candidature', annee, actorId).nextFloat() < p`.
- Entrants (spec §3), dans l'ordre et jusqu'à `maxCandidats` : héritier du camp sortant (Premier ministre en fin de quinquennat, sinon ministre à la plus forte popularité prêtée dans `quinquennat.suivi`, s'il n'est pas déjà candidat) ; ministre ambitieux (popularité prêtée ≥ `ministreSeuilPopularite`, tirage `ministreProbabilite`, aucun candidat à moins de `distanceMinistre`) ; profil fictif le plus proche de chaque groupe d'électeurs sans candidat à moins de `distanceFamille`. Rôles du bilan : sortant `B`, héritier `heritier × B`, autre membre du dernier gouvernement candidat `ministre × B`.
- Textes des annonces (copie fixe) : retrait « Candidature simulée : {nom} ne se présente pas à la présidentielle {annee} » ; candidat « Candidature simulée : {nom} se représente » ; entrée « Candidature simulée : {nom} entre dans la course » ; `description` = « Motif du jeu : {motif}. », `nature: 'simule'`.

- [ ] **Step 1: Tests** (états réels du moteur jusqu'à l'ouverture de la campagne de 2032, président IA) — probabilités aux bornes (sortant à 10 % et 80 % de popularité, éliminé à 1 % et 40 %) ; président au terme de deux mandats : `ineligible`, pas de tirage ; déterminisme : même graine → mêmes annonces ; un retiré a le statut `retire` et une annonce `retrait` ; héritier créé quand le sortant ne se représente pas (graine choisie pour) avec le rôle `heritier` et le facteur `0,5 × B` ; au plus 12 candidats déclarés ; champ dépeuplé (probabilités forcées à 0 par un jeu de règles modifié dans le test) → au moins deux candidats déclarés ; un entrant figure a `nature: 'reel'`, `figureId`, aucun programme ; annonces sans guillemets de propos (aucun « » » dans les libellés).
- [ ] **Step 2: Échec attendu**, puis **implémenter**, puis vert : `pnpm exec vitest run --project engine`.
- [ ] **Step 3: Commit**

### Task 4: Le choix du joueur et la passation

**Files:**
- Modify: `packages/engine/src/presidency/succession.ts`, `packages/engine/src/presidency/week.ts`
- Test: `packages/engine/src/presidency/succession.test.ts`

**Interfaces:**
- Produces: `successorOptions(state: GameState, ruleset: Ruleset): { id: string, source: { nature: 'acteur' | 'figure' | 'profil', ref: string }, label: string, description: string }[]` (au plus `maxSuccesseurs`, identifiants `successeur-<nature>-<ref>`) ; `requestCandidacy(state: GameState, ruleset: Ruleset): void` — ajoute la décision `candidature` (id `candidature-<annee>`) la semaine où `date ≥ ouverture − delaiDecisionSemaines × 7 jours` si le joueur a un candidat et si `state.succession?.annee !== annee` ou `choixJoueur === null` ; options `se-representer` (si éligible) puis les successeurs ; `defaultOptionId` `se-representer` sinon le premier successeur ; réponse : `week.ts` ajoute `'candidature'` aux genres institutionnels et écrit `state.succession = { annee, choixJoueur: optionId, annonces: [], bilan: {} }`.
- Passation dans `applySuccession` : `successeur-acteur-<id>` → cet acteur devient `kind: 'joueur'` ; sinon `createEntrantActor(…, asPlayer: true)` ; `state.player.actorId` ← successeur ; militants : `ledger.apply(successeur, 'militants', [{ label: 'Passation de la campagne : militants du camp', value: round(transmissionMilitants × militants du prédécesseur) }])` ; prédécesseur → `kind: 'adversaire'`, `status: 'retire'` ; annonce `successeur` « Vous passez la main : {nom} porte votre camp en {annee} » ; si le joueur présidait, rôle `heritier`.

- [ ] **Step 1: Tests** — président joueur : décision créée quatre semaines avant l'ouverture, pas avant ; options = `se-representer` + Premier ministre + ministres (≤ 4) ; président joueur au terme de deux mandats : pas de `se-representer`, défaut = premier successeur ; observateur : aucune décision ; passation vers une figure : nouvel acteur joueur `reel`/`figureId`, ancien `retire`, militants transmis (60 %) par le registre ; passation vers un acteur existant : aucun nouvel acteur ; joueur battu en 2027 : successeurs de son parti et profils proches ; 2037 : deuxième succession, identifiants uniques.
- [ ] **Step 2: Échec attendu**, **implémenter**, vert : `pnpm exec vitest run --project engine`.
- [ ] **Step 3: Commit**

### Task 5: API et moteur local

**Files:**
- Test: `apps/api/src/**/*.integration.test.ts` (fichier existant du quinquennat), `packages/local-api/src/*.test.ts`

**Interfaces:**
- Consumes: décision `candidature` (tâches 1 et 4) ; aucune route nouvelle.

- [ ] **Step 1: Tests** — intégration : partie du président joueur avancée jusqu'à la décision (avance rapide arrêtée avant), réponse « successeur » envoyée avec la semaine, ouverture de la campagne avec le successeur comme joueur, état relu valide au format 23 ; moteur local : même scénario, même état final pour la même graine.
- [ ] **Step 2: Lancer** — `pnpm test:integration` et `pnpm exec vitest run --project local-api` ; corriger ce qui casse (validation des options, avance rapide).
- [ ] **Step 3: Commit**

### Task 6: Interface

**Files:**
- Modify: `apps/web/src/screens/dashboard/DecisionsPanel.tsx` (genre `candidature` : badge « Présidentielle {annee} », ton `simule`, bandeau), `apps/web/src/screens/dashboard/DecisionSpotlight.tsx` (cartes de successeurs : portrait, nom, parti, étiquette réelle/fictive)
- Modify: `apps/web/src/components/WeeklyReportView.tsx` (section « Candidatures {annee} » d'après `state.succession.annonces`), `apps/web/src/screens/Candidates.tsx` (badges « Nouveau en {annee} », « Ne se présente pas »), `apps/web/src/portraits.ts` (photo de la figure pour `figureId`)
- Test: `apps/web/src/screens/*.test.tsx` (états réels du moteur), `apps/web/e2e/mandat.spec.ts` ou nouveau `apps/web/e2e/succession.spec.ts`

- [ ] **Step 1: Tests de composants** — la décision montre une carte par option avec le nom et l'étiquette « personnalité réelle — candidature simulée » ou « personnage fictif » ; le bilan d'ouverture liste les annonces (se représente, ne se présente pas, entre, vous passez la main) ; Candidats : badges ; portrait d'une figure entrante = sa photo libre.
- [ ] **Step 2: Échec attendu**, **implémenter**, vert : `pnpm exec vitest run --project web`.
- [ ] **Step 3: E2E** (bureau et téléphone) : président joueur importé, avance rapide jusqu'à la décision, passation à un successeur, ouverture de la campagne, le bandeau montre le successeur, Candidats montre les badges, axe-core ; `pnpm exec playwright test` du fichier.
- [ ] **Step 4: Commit**

### Task 7: Documentation, vérifications, APK 1.15.0

**Files:**
- Modify: `docs/PLAN_DEVELOPPEMENT.md` (phase 23), `docs/SOURCES.md` (paramètres `succession` : hypothèses), `docs/ARCHITECTURE.md`, `docs/MODELE_DONNEES.md` (format 23), `docs/RISQUES.md`, `README.md`, `apps/mobile/README.md`, `apps/mobile/package.json` (1.15.0), `apps/mobile/android/app/build.gradle` (16 / 1.15.0)

- [ ] **Step 1: Vérifications** — `pnpm check`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:mobile`.
- [ ] **Step 2: APK** — `android:sync`, `assembleDebug`, `aapt2 dump badging` (1.15.0, 16, mêmes permissions), `apksigner verify`.
- [ ] **Step 3: Revue finale, commit, push, compte rendu.**
