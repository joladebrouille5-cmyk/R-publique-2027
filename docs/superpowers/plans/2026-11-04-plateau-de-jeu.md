# Phase 25 — Le plateau : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** faire du jeu un plateau de jeu de société sur la carte de France : implantation par département (nouvelle règle du moteur), cartes d'action posées sur les départements avec combos, verdict hebdomadaire spectaculaire, tous les autres écrans en panneaux de « boîte de jeu », identité visuelle « Feutrine ».

**Architecture:** le moteur gagne un module pur `campaign/implantation.ts` (départ, gains, combos, érosion, registre) et deux effets électoraux (facteur national, multiplicateur territorial et projection par département) ; les règles que l'interface doit montrer avant validation (`implantationTier`, `weekCombos`, `departmentInscrits`, `militantsByDepartment`, `startingImplantation`) vivent dans `@r2027/shared`. L'interface remplace le QG et les cinq espaces par un écran `Plateau` (plateau SVG + main + cartes posées + verdict) ; les écrans existants sont rendus tels quels dans des panneaux en carton ouverts depuis la boîte de jeu.

**Tech Stack:** TypeScript strict, Zod, Vitest, React 19, Tailwind 4, topojson-client (déjà présent), Playwright, Capacitor.

**Spec:** `docs/superpowers/specs/2026-11-04-plateau-de-jeu-design.md`

## Global Constraints

- Moteur pur : pas de `Math.random`, `Date`, réseau, base ni DOM ; tirages par `stream(seed, …)`.
- Jeu de règles **23.0.0** ; blocs `implantation` et `combos`, champs `famille` et `cibleFacultative` des actions, tous `statut: 'hypothese'`.
- Format de sauvegarde **25**, migration 24 → 25 ; moteur **0.25.0** ; application **1.17.0** (`versionCode` 18).
- Codes de département en chaînes (`'01'`, `'2A'`, `'971'`), clés de `parrainages.reservoir.departements` (101 départements).
- Paliers : Terre inconnue 0–4, Présence 5–24, Ancrage 25–49, Bastion 50–74, Fief 75–100.
- Gains : porte-à-porte +8, rencontre d'élus +10, recrutement +6, meeting +12, grand meeting +20 (+5 aux autres départements de la région), tournée +6 dans tous les départements de la région ; déplacement du président +8 ; plafond 100 ; départ 30 dans les régions d'implantation (réels et fictifs), 0 pour le candidat personnalisé ; érosion −1 par semaine au-dessus du départ, sauf où une carte a été posée.
- Combos : série +25 % (2ᵉ carte de la famille), +50 % (3ᵉ et suivantes) ; bastion ×1,5 (2 cartes ou plus, même département) ; tour de région +5 (3 départements distincts d'une région).
- Effet électoral : facteur « Implantation » = 0,5 × (moyenne pondérée par les inscrits − 15) / 100 ; multiplicateur territorial `(1 + 0,6 × I_d/100) / (1 + 0,6 × Ī/100)` puis renormalisation.
- `apps/web` n'importe pas `@r2027/engine` (sauf tests) ; aucune route nouvelle ; moteur local à l'identique de l'API.
- Toute variation d'implantation porte ses facteurs nommés (« Meeting », « Bastion ×1,5 », « Tour de région », « Érosion »), publiés dans `report.implantation`.
- Interface en français, couleur jamais seule (palier écrit et chiffre), contraste ≥ 4,5:1 sur feutrine et sur carton, cibles ≥ 44 px, mouvement réduit respecté, alternative au glisser.
- Aucune permission Android nouvelle ; jamais de propos prêté à une personne réelle ; projection par département étiquetée « projection simulée », jamais « sondage ».

## Review Focus

1. **Départements d'outre-mer et Corse** (`971`–`976`, `2A`, `2B`) : présents sur le plateau (encarts), jouables, implantation lue et écrite sous leur code en chaîne — test dans la tâche 6.
2. **Carte Terrain sans département** (adversaire IA, ancien client, banc) : acceptée, effets nationaux seuls, aucun gain d'implantation ni combo de lieu — test dans la tâche 2.
3. **Partie migrée du format 24 en pleine campagne** : implantation de départ recalculée (0 pour un candidat personnalisé, 30 dans les régions d'une personnalité ou d'un fictif), projection vide jusqu'à la semaine suivante, aucune variation des intentions — test dans la tâche 1.
4. **Huit cartes dans le même département** : un seul bastion (×1,5 une fois), série plafonnée à +50 %, implantation plafonnée à 100 — test dans la tâche 2.
5. **Verdict avec mouvement réduit, ou accéléré d'un toucher** : tout le bilan affiché d'un coup, même contenu que la séquence animée, bouton « Semaine suivante » atteignable au clavier — test dans la tâche 8.

---

### Task 1: Schémas, jeu de règles 23.0.0, format 25 et règles partagées

**Files:**
- Create: `packages/shared/src/implantation.ts`, `packages/shared/src/implantation.test.ts` (tests avec un jeu de règles minimal fabriqué), `packages/engine/src/campaign/implantation-rules.test.ts` (mêmes règles sur le vrai jeu de règles)
- Modify: `packages/shared/src/ruleset.ts` (blocs `implantation`, `combos`, champs d'action), `packages/shared/src/game.ts` (`GameStateV24Schema` figé, format 25), `packages/shared/src/report.ts`, `packages/shared/src/index.ts`, `packages/rulesets/src/presidentielle-2027.json` (22.0.0 → 23.0.0), `packages/rulesets/src/index.ts`, `packages/engine/src/core/versions.ts`, `packages/engine/src/core/createGame.ts`, `packages/save-engine/src/versions.ts` (+ tests), tests aux attentes de format

**Interfaces:**
- Produces (`@r2027/shared`) :
  - `IMPLANTATION_TIERS` et `implantationTier(value: number): { id: 'inconnue' | 'presence' | 'ancrage' | 'bastion' | 'fief'; libelle: string; min: number }`.
  - `departmentInscrits(ruleset: Ruleset): Record<string, number>` — somme des inscrits de `legislatives2024.circonscriptions` par département (donnée officielle déjà sourcée) ; poids des moyennes et répartition des militants.
  - `startingImplantation(actor: { kind: string; candidate: { nature: string }; implantation: readonly string[] }, ruleset: Ruleset): Record<string, number>` — 101 clés ; `implantation.depart` (30) dans les départements des régions de `actor.implantation`, 0 ailleurs et partout pour `candidate.nature === 'personnalise'`.
  - `weightedImplantation(map: Record<string, number>, inscrits: Record<string, number>): number` — moyenne pondérée (0–100).
  - `militantsByDepartment(militants: number, map: Record<string, number>, inscrits: Record<string, number>): Record<string, number>` — plus fort reste, au prorata de `implantation × inscrits` ; sans implantation, au prorata des inscrits ; somme = `militants`.
  - `weekCombos(plan: readonly PlannedAction[], ruleset: Ruleset): WeekCombos` avec `WeekCombos = { series: { index: number; famille: Famille; rang: number; taux: number }[]; bastions: string[]; toursDeRegion: string[] }` — ordre des cartes = ordre du plan ; une carte sans famille ou hors campagne n'entre dans aucune série ; bastion = département visé par ≥ `combos.bastion.cartesMin` cartes ; tour de région = région dont ≥ `combos.tourDeRegion.departementsMin` départements distincts sont visés.
  - Types `Famille = 'terrain' | 'medias' | 'numerique' | 'organisation'`, `ImplantationChange = { actorId; departement; before; after; factors: { label: string; value: number }[] }`, `ComboApplied = { actorId; kind: 'serie' | 'bastion' | 'tour-de-region'; libelle: string; cible: string | null }`.
- Produces (format 25) : `GameState.implantation: Record<actorId, Record<departement, number>>` ; `Opinion.departements: Record<departement, Record<actorId, number>>` (centièmes, défaut `{}`) ; `WeeklyReport.implantation: ImplantationChange[]` et `WeeklyReport.combos: ComboApplied[]` (défaut `[]`).
- Jeu de règles : `implantation = { statut, note, depart: 30, plafond: 100, erosion: 1, gains: { meeting: 12, 'grand-meeting': 20, tournee: 6, 'porte-a-porte': 8, recrutement: 6, 'elus-locaux': 10 }, regionGrandMeeting: 5, regionTournee: true, deplacementPresident: 8, poids: 0.5, pivot: 15, alpha: 0.6 }` ; `combos = { statut, note, serie: { deuxieme: 0.25, suivantes: 0.5 }, bastion: { cartesMin: 2, multiplicateur: 1.5 }, tourDeRegion: { departementsMin: 3, gain: 5 } }` ; actions : `famille` (Terrain : meeting, grand-meeting, tournee, porte-a-porte, recrutement, elus-locaux ; Médias : interview, emission-politique, interview-longue, decryptage ; Numérique : numerique, vague-video-courte, live-twitch ; Organisation : collecte, emprunt-bancaire, preparation-debat, negocier-soutien, negocier-soutien-ministere), et `cible: 'departement'` + `cibleFacultative: true` pour les cinq cartes Terrain qui n'avaient pas de cible.

- [ ] **Step 1: Tests** — `implantationTier` aux bornes (0, 4, 5, 24, 25, 49, 50, 74, 75, 100) ; `departmentInscrits` couvre les 101 départements, total = somme des circonscriptions ; `startingImplantation` (personnalisé : tout à 0 ; fictif : 30 exactement dans ses régions) ; `militantsByDepartment` (somme exacte, sans implantation au prorata des inscrits) ; `weekCombos` (2ᵉ carte +25 %, 3ᵉ et 4ᵉ +50 %, huit cartes au même endroit : un bastion, plafond +50 %) — Review Focus 4 ; migration 24 → 25 sur la fixture réelle la plus récente : implantation de départ, `opinion.departements` vide, intentions inchangées — Review Focus 3 ; jeu de règles 23.0.0 (valeurs ci-dessus, statut `hypothese`).
- [ ] **Step 2: Échec, implémenter, vert** — `createGame` remplit `state.implantation` par `startingImplantation` ; `SAVE_SCHEMA_VERSION` 25 ; moteur 0.25.0.
- [ ] **Step 3: `pnpm check` vert, commit.**

### Task 2: Moteur — implantation de la semaine, combos et registre

**Files:**
- Create: `packages/engine/src/campaign/implantation.ts`, `packages/engine/src/campaign/implantation.test.ts`
- Modify: `packages/engine/src/campaign/actions.ts` (cible facultative, bonus de série), `packages/engine/src/core/effects.ts` (facteur de série), `packages/engine/src/core/advanceWeek.ts` (étape et bilan), `packages/engine/src/presidency/actions.ts` (déplacement +8)

**Interfaces:**
- Consumes: `weekCombos`, `startingImplantation` (tâche 1).
- Produces: `applyWeekImplantation(state: GameState, ruleset: Ruleset, plans: Record<string, readonly PlannedAction[]>, accepted: Record<string, readonly number[]>): { changes: ImplantationChange[]; combos: ComboApplied[] }` — seules les cartes acceptées comptent ; gain de la carte au département visé (facteur au libellé de l'action) ; grand meeting +5 aux autres départements de la région, tournée +6 à tous ceux de la région ; bastion : facteur « Bastion ×1,5 » égal à `round(0,5 × gains du département)` ; tour de région : facteur « Tour de région » +5 aux départements de la région ; érosion « Érosion » −1 au-dessus du départ hors départements visés ; plafond 100 (facteur « Plafond »), jamais sous le départ.
- Produces: bonus de série dans le registre — facteur `${libellé} : série ${Famille} ×${rang} (+25 %)` = `round(base × taux)` sur chaque effet de base positif de la carte.

- [ ] **Step 1: Tests** — gains exacts par carte et par région ; bastion et tour de région ; érosion et départ comme plancher ; plafond ; huit cartes au même endroit (Review Focus 4) ; carte Terrain sans département acceptée, sans gain ni combo de lieu (Review Focus 2) ; série dans le registre (somme exacte des facteurs) ; déplacement présidentiel +8 ; déterminisme ; `report.implantation` et `report.combos` remplis.
- [ ] **Step 2: Échec, implémenter, vert.**
- [ ] **Step 3: Commit.**

### Task 3: Moteur — effets électoraux et projection par département

**Files:**
- Modify: `packages/engine/src/election/distribution.ts` (facteur « Implantation »), `packages/engine/src/territory/tally.ts` et `packages/engine/src/election/rounds.ts` (multiplicateur territorial), `packages/engine/src/core/advanceWeek.ts` (projection), tests associés

**Interfaces:**
- Produces: `implantationFactor(state, ruleset, contenderId): UtilityFactor[]` — `[{ label: 'Implantation', value }]` ; `localMultiplier(I_d: number, mean: number, alpha: number): number` ; `projectDepartments(state, ruleset, distributions, baseline): Record<string, Record<string, number>>` — pour chaque département de la base : composition locale des groupes (inscrits × affinité), parts nationales par groupe, multiplicateur d'implantation, renormalisation, plus fort reste à 10 000 ; base nationale : `{}`.

- [ ] **Step 1: Tests** — facteur nul à implantation pivot ; multiplicateur : somme des voix nationales à ± 0,5 point du modèle sans multiplicateur ; un candidat implanté gagne dans son département ; projection : 10 000 par département, déterministe, vide avec la base nationale.
- [ ] **Step 2: Échec, implémenter, vert.**
- [ ] **Step 3: Commit.**

### Task 4: IA adverse et banc d'essai

**Files:**
- Modify: `packages/engine/src/ai/opponents.ts`, `packages/engine/src/sim/equilibrage.ts` (cibles du joueur IA et naïf), tests

**Interfaces:**
- Produces: `bestDepartment(state, ruleset, actorId): string` — département qui maximise `inscrits × proximité au groupe dominant local × (1 − I_d/100)`, égalités par code ; les cartes Terrain des adversaires et du joueur IA du banc reçoivent cette cible.

- [ ] **Step 1: Test** — un adversaire pose ses cartes Terrain sur un département du réservoir ; déterminisme.
- [ ] **Step 2: Implémenter, vert.**
- [ ] **Step 3: Banc** — `pnpm sim:equilibrage observateur-fictifs personnalise-standard-ia-programme observateur-reels-sondages --parties 100` : aucun critère atteint en phase 24 ne doit se perdre (fictifs : 4 vainqueurs, 3 qualifiés > 10 % ; Standard 15–30 % ; Le Pen qualifiée ≥ 85 %) ; noter les chiffres dans `docs/equilibrage/reference-phase-25.md`.
- [ ] **Step 4: Commit.**

### Task 5: Identité « Feutrine »

**Files:**
- Modify: `apps/web/src/index.css` (jetons), `apps/web/src/components/ui.ts` (classes partagées), `apps/web/package.json` (`@fontsource-variable/bricolage-grotesque`), `apps/web/src/design/contraste.test.ts`

**Interfaces:**
- Produces: jetons `--color-feutrine`, `--color-feutrine-2`, `--color-carton`, `--color-carton-2`, `--color-or`, `--color-encre*`, échelle `--color-implantation-0…4` (blanc → rouge, une teinte) ; classes `carton`, `carte` (carte épaisse : bord sombre, bandeau de famille, ombres empilées), `pastille`, `boutonOr` dans `ui.ts` ; police d'affichage Bricolage Grotesque 600–800.

- [ ] **Step 1: Test de contraste** — texte sur feutrine, sur carton, sur chaque palier d'implantation (≥ 4,5:1 pour le texte, ≥ 3:1 pour les bords) ; jour et nuit.
- [ ] **Step 2: Implémenter, vert ; les écrans existants restent lisibles (tests web verts).**
- [ ] **Step 3: Commit.**

### Task 6: Le plateau (carte SVG des départements)

**Files:**
- Create: `apps/web/src/plateau/geometry.ts` (+ test), `apps/web/src/plateau/Board.tsx`, `apps/web/src/plateau/DepartmentSheet.tsx`, `apps/web/src/plateau/board.test.tsx`

**Interfaces:**
- Produces: `boardShapes(collection: TerritoryCollection): { code: string; d: string; zone: 'metropole' | 'outre-mer'; label: [number, number] }[]` — projection plane (longitude × cos 46,5°) de la métropole dans un cadre fixe, DROM en encarts ; `Board({ state, ruleset, reading: 'implantation' | 'qui-mene' | 'sondage-local', selected, placed, onSelect })` ; `DepartmentSheet({ code, state, ruleset, onPlay })`.

- [ ] **Step 1: Tests** — 101 formes dont `2A`, `2B`, `971`–`976` (Review Focus 1) ; couleur et palier écrit de chaque département ; légende chiffrée ; trois lectures, « projection simulée » étiquetée ; sélection au clavier ; fiche (implantation, palier, militants estimés, projection, cartes jouables).
- [ ] **Step 2: Implémenter, vert.**
- [ ] **Step 3: Commit.**

### Task 7: La main, la pose et l'écran Plateau

**Files:**
- Create: `apps/web/src/plateau/Hand.tsx`, `apps/web/src/plateau/Card.tsx`, `apps/web/src/plateau/TopBar.tsx`, `apps/web/src/screens/Plateau.tsx`, `apps/web/src/screens/plateau.test.tsx`
- Modify: `apps/web/src/routes.tsx` (`plateau` ; `tableau-de-bord` → `plateau`), `apps/web/src/stores/plan.ts`, logique de la semaine extraite de `Dashboard.tsx` (avance idempotente, décisions, programme, alliances, débats, avance rapide)

**Interfaces:**
- Consumes: `weekCombos` (annonce des combos), `implantationTier`.
- Produces: `Hand({ cards, plan, onPlay })` — cartes par famille, coût, effet, carte grisée avec sa raison, halo quand elle compléterait un combo ; pose : glisser sur un département, ou toucher la carte puis le département (ou la liste des départements, accessible) ; Médias : choix du média ou de l'émission ; mini-cartes posées sur le plateau, retrait d'un geste ; au plus 8 cartes ; bouton « Résoudre la semaine N » ; observateur : pas de main ; quinquennat : actions présidentielles.

- [ ] **Step 1: Tests** — poser une carte Terrain au toucher puis au clavier envoie `{ actionId, cible }` ; carte indisponible et sa raison ; combo annoncé (série, bastion) ; décisions en cartes plein écran ; alerte « Programme trop court » conservée ; requête d'avance identique à celle du QG (`expectedWeek`, actions, programme, alliances, décisions, clé d'idempotence).
- [ ] **Step 2: Implémenter, vert ; supprimer le QG (`Dashboard.tsx`) une fois la parité couverte.**
- [ ] **Step 3: Commit.**

### Task 8: Le verdict et les bruitages

**Files:**
- Create: `apps/web/src/plateau/Verdict.tsx`, `apps/web/src/plateau/verdict.test.tsx`
- Modify: `apps/web/src/audio/` (bruitages synthétisés : glisser, retourner, combo), suppression de `WeeklyDebrief.tsx` au profit du verdict

**Interfaces:**
- Consumes: `WeeklyReport` (actions, combos, implantation, intentions, sondages, événements) ; rien n'est recalculé.
- Produces: `Verdict({ report, state, onDone })` — cartes retournées une à une (effet ou refus), combos, départements qui changent de palier, sondage avant / après / rang, événements, « Semaine suivante » ; un toucher accélère ; mouvement réduit : tout d'un coup.

- [ ] **Step 1: Tests** — séquence complète ; accélération ; mouvement réduit = même contenu affiché d'un coup, bouton atteignable au clavier (Review Focus 5) ; jingle et bruitage appelés.
- [ ] **Step 2: Implémenter, vert.**
- [ ] **Step 3: Commit.**

### Task 9: La boîte de jeu

**Files:**
- Create: `apps/web/src/plateau/GameBox.tsx`, `apps/web/src/plateau/Panel.tsx`, `apps/web/src/plateau/gamebox.test.tsx`
- Modify: `apps/web/src/routes.tsx` (anciens espaces et écrans → `plateau?panneau=<écran>`), `apps/web/src/screens/shell/*` (barre du bas remplacée), `apps/web/src/screens/Espace.tsx` (supprimé)

**Interfaces:**
- Produces: `GameBox` (grille de tuiles des écrans du registre, selon la phase) et `Panel({ screen, onClose })` — panneau en carton qui rend le composant existant de l'écran, fermeture par le bouton, Échap ou glissement vers le bas ; au bureau, tiroir latéral.

- [ ] **Step 1: Tests** — chaque tuile ouvre son écran ; redirection d'une ancienne adresse (`…/programme`, `…/campagne`, `…/carte`) vers le bon panneau ; Échap referme et rend le focus.
- [ ] **Step 2: Implémenter, vert.**
- [ ] **Step 3: Commit.**

### Task 10: Écran-titre, création, soirée électorale et débat en Feutrine

**Files:**
- Modify: `apps/web/src/screens/Home.tsx`, `NewGame.tsx`, `Soiree.tsx`, `Debat.tsx` et leurs composants (classes `ui.ts`, jetons)

- [ ] **Step 1: Restyler sans changer les mécaniques ; tests web verts (aucune assertion de comportement modifiée).**
- [ ] **Step 2: Captures téléphone et bureau relues ; commit.**

### Task 11: Vérifications, documentation, APK 1.17.0

**Files:**
- Modify: `apps/web/e2e/*.spec.ts` (semaine jouée au plateau, panneaux, axe-core), `apps/mobile/e2e/hors-ligne.spec.ts`, `apps/mobile/scripts/essai-android.mjs`, `docs/PLAN_DEVELOPPEMENT.md`, `docs/MODELE_DONNEES.md`, `docs/ARCHITECTURE.md`, `README.md`, `apps/mobile/README.md`, `apps/mobile/package.json`, `apps/mobile/android/app/build.gradle`

- [ ] **Step 1: e2e téléphone et bureau, `pnpm test:mobile`, intégration (plan avec cibles départementales : même état final par l'API et le moteur local).**
- [ ] **Step 2: Documentation ; APK construit, `aapt2` (1.17.0, 18, mêmes permissions), `apksigner`.**
- [ ] **Step 3: Commit, push, compte rendu.**
