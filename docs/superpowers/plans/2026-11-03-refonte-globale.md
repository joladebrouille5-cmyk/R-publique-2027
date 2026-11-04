# Phase 22 — Refonte globale : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** porter l'interface de RÉPUBLIQUE 2027 à son meilleur niveau sans toucher au jeu : navigation dans les espaces, évolution des sondages en courbes, éditeur de programme en tuiles, Paramètres refaits, jetons sémantiques, mouvement et accessibilité.

**Architecture:** interface seule (`apps/web`). Nouveaux composants isolés (`SectionNav`, `PollTrend` et sa géométrie pure `pollTrend.ts`, `ThemeChoice`), branchés dans les écrans existants sans changer les rôles ni les libellés accessibles dont dépendent les tests ; jetons ajoutés dans `index.css`.

**Tech Stack:** React 19, Tailwind 4 (`@theme`), SVG, Vitest + Testing Library, Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-11-03-refonte-globale-design.md`

## Global Constraints

- Ni moteur, ni jeu de règles, ni format de sauvegarde, ni API : `git diff` vide sous `packages/engine`, `packages/rulesets`, `packages/save-engine`, `packages/shared`, `apps/api`, `packages/local-api`.
- `apps/web/src` n'importe pas `@r2027/engine` (sauf tests).
- Interface et documentation en français ; pluriels écrits (« 1 retenue », « 2 retenues »), jamais « (s) ».
- WCAG 2.1 AA (axe-core) dans les deux thèmes ; cibles tactiles ≥ 44 px ; aucun défilement horizontal de page à 360 px.
- Mouvement réduit : ni durée ni délai d'animation.
- Tests lancés avant chaque commit ; commit en fin de tâche.

## Review Focus

1. **Espace d'une seule section** (Opinion en campagne) : le sommaire ne s'affiche pas (rien à parcourir) — test dans la tâche 2.
2. **Sondages sans évolution** (semaine 0, un seul sondage) : pas de graphique, pas d'erreur ; un candidat absent d'une vague (abandon) : sa ligne s'interrompt, sans point inventé — tests dans la tâche 3.
3. **Étiquettes de fin de ligne qui se chevauchent** (candidats à 0,1 point d'écart) : écartement minimal garanti — test de géométrie dans la tâche 3.
4. **Programme hors campagne ou en observateur** (non modifiable) : tuiles consultables, cases désactivées comme aujourd'hui — test dans la tâche 4.
5. **Filtre des crédits sans résultat** : message « Aucun crédit ne correspond à … » et les catégories restent atteignables — test dans la tâche 5.

---

### Task 1: Fondations — jetons d'encre, mouvement réduit sans délai

**Files:**
- Modify: `apps/web/src/index.css` (jetons `@theme`, variables du thème de nuit, règle `prefers-reduced-motion`)
- Modify: tous les `*.tsx` de `apps/web/src` contenant exactement `text-slate-600 dark:text-slate-400` ou `text-slate-500 dark:text-slate-400` (remplacement mécanique)
- Create: `apps/web/src/design/contraste.test.ts`
- Modify: `apps/web/e2e/refonte.spec.ts` (mouvement réduit)

**Interfaces:**
- Produces: utilitaires Tailwind `text-encre`, `text-encre-2`, `text-encre-3`, `border-filet`, `bg-feuille` (variables `--color-encre`, `--color-encre-2`, `--color-encre-3`, `--color-filet`, `--color-feuille`, valeur de jour dans `@theme`, valeur de nuit redéfinie sous la classe `dark`). `text-encre-2` = ancienne paire slate-600/slate-400 ; `text-encre-3` = ancienne paire slate-500/slate-400.

- [ ] **Step 1: Test de contraste** — `contraste.test.ts` lit `index.css`, extrait les valeurs hexadécimales de jour et de nuit des cinq jetons, et vérifie : `encre`, `encre-2`, `encre-3` ≥ 4,5:1 sur `papier` (#fbfbfc) et sur `feuille` le jour ; ≥ 4,5:1 sur slate-950 (#100f25) et slate-900 (#1b1a3a) la nuit (`ratio(fg, bg)` WCAG relatif, écrit dans le test).
- [ ] **Step 2: Le lancer** — `pnpm exec vitest run --project web src/design` : échec (jetons absents).
- [ ] **Step 3: Jetons** dans `index.css` : jour `encre` #1b1a3a, `encre-2` #4a4e70, `encre-3` #62678a, `filet` #d3d6e0, `feuille` #fbfbfc ; nuit `encre` #f1f2f5, `encre-2` #9297ae, `encre-3` #9297ae, `filet` rgb(255 255 255 / 0.12), `feuille` #1b1a3a. Règle de mouvement réduit : ajouter `animation-delay: 0s !important; transition-delay: 0s !important`.
- [ ] **Step 4: Remplacement mécanique** des deux paires exactes par `text-encre-2` / `text-encre-3` (script `sed` sur les seules occurrences exactes ; `git diff --stat` relu).
- [ ] **Step 5: E2E mouvement réduit** — dans `refonte.spec.ts`, sous `reducedMotion: 'reduce'`, les huit panneaux du mur d'affichage ont une opacité calculée de 1 moins de 150 ms après le chargement (`getComputedStyle(el).opacity === '1'` pour chaque `.animate-colle`).
- [ ] **Step 6: Vérifier** — `pnpm check` vert, captures avant/après identiques à l'œil (QG, Opinion, clair et nuit).
- [ ] **Step 7: Commit**

### Task 2: Sommaire des espaces

**Files:**
- Create: `apps/web/src/components/SectionNav.tsx`, `apps/web/src/components/SectionNav.test.tsx`
- Modify: `apps/web/src/screens/Espace.tsx` (rendu du sommaire), `apps/web/src/screens/Parametres.tsx` (sommaire de la page)
- Create: `apps/web/e2e/sommaire.spec.ts`

**Interfaces:**
- Produces: `SectionNav({ items, label, onShow, onCollapseAll? }: { items: { id: string; label: string; icon?: ReactNode; open?: boolean }[]; label: string; onShow?: (id: string) => void; onCollapseAll?: () => void }): JSX.Element | null` — `nav aria-label={label}`, liste de liens `href="#id"` ; clic : `preventDefault`, `onShow(id)` si fourni, sinon `scrollIntoView` de l'élément `id` ; entrée courante `aria-current="location"` suivie par `IntersectionObserver` (repli sans observateur : première entrée) ; rend `null` si `items.length < 2` ; bouton « Tout replier » si `onCollapseAll` et au moins deux entrées `open`.
- Consumes: `useOpenSections(paths)` → `{ open, toggle, show }` (Espace.tsx) ; ajouter `collapseAll(): void` à son retour.
- Barre collante : `sticky top-[calc(var(--sat)+var(--hud,0px))] z-10`, fond `bg-papier/95` + flou, pastilles `min-h-11`, défilement horizontal interne (`overflow-x-auto`, sans barre visible), filet d'encre dessous.

- [ ] **Step 1: Tests de composant** (`SectionNav.test.tsx`) : `nav` nommée « Sommaire de l’espace » ; un lien par entrée avec `href="#programme"` ; clic → `onShow('programme')` appelé ; `aria-current="location"` sur la première entrée sans observateur ; « Tout replier » visible avec deux entrées ouvertes, absent avec une ; une seule entrée → rien n'est rendu.
- [ ] **Step 2: Échec attendu** — `pnpm exec vitest run --project web src/components/SectionNav.test.tsx`.
- [ ] **Step 3: Implémenter `SectionNav`** puis le brancher : `Espace` passe `hub.sections` (libellé de `screens`/`mergedSection`, icône `SECTION_ICONS`, `open`) avec `onShow={show}` et `onCollapseAll={collapseAll}` ; Paramètres : entrées Apparence, Son, Rappels, Crédits, À propos (ancres des sections existantes).
- [ ] **Step 4: E2E** (`sommaire.spec.ts`, bureau et téléphone) : dans Campagne, cliquer « Finances » dans le sommaire déplie la section Finances, la met dans la fenêtre, sous le bandeau, et l'entrée porte `aria-current="location"` après défilement ; audit axe-core ; aucun débordement à 360 px ; espace d'une seule section : pas de sommaire.
- [ ] **Step 5: Vérifier** — tests de composant, e2e `sommaire`, `espaces` et `mobile` verts.
- [ ] **Step 6: Commit**

### Task 3: Évolution des sondages en courbes

**Files:**
- Create: `apps/web/src/components/pollTrend.ts` (géométrie pure), `apps/web/src/components/pollTrend.test.ts`
- Create: `apps/web/src/components/PollTrend.tsx`, `apps/web/src/components/PollTrend.test.tsx`
- Modify: `apps/web/src/screens/Polls.tsx` (graphique au-dessus du tableau, tableau replié sous « Voir le tableau »)

**Interfaces:**
- Produces (pur) : `type TrendSeries = { id: string; label: string; color: string; player: boolean; points: ({ x: number; value: number } | null)[] }` et `layoutTrend(series: TrendSeries[], box: { width: number; height: number; padding: { top: number; right: number; bottom: number; left: number } }): { yMax: number; ticks: number[]; paths: { id: string; d: string }[]; labels: { id: string; y: number }[]; xAt: (i: number) => number; yAt: (v: number) => number }`. Valeurs en points de base (×100, comme `formatShare`) ; `yMax` = plus petit multiple de 500 ≥ valeur maximale ; `ticks` tous les 500 (5 %) ; un `null` interrompt la ligne (nouveau `M`) ; `labels` triés et écartés d'au moins 14 px (repoussés vers le bas puis vers le haut si débordement).
- Produces (composant) : `PollTrend({ polls, state, ruleset }: { polls: Poll[]; state: GameState; ruleset: Ruleset | undefined })` — `figure` + `svg role="img"` dont l'`aria-label` résume (« Intentions au premier tour sur 6 sondages : en tête Claire Delorme, 24,8 % ; vous : 1,8 % ») ; groupe focalisable (`tabIndex=0`), flèches gauche/droite pour déplacer le réticule, infobulle listant les valeurs de la vague ; ligne du joueur 3 px et au premier plan, autres 2 px, marqueurs de 8 px ; étiquettes directes à droite (nom court).

- [ ] **Step 1: Tests de géométrie** (`pollTrend.test.ts`) : `yMax` de [2480, 1993] = 2500 ; ticks [0, 500, …, 2500] ; un `null` au milieu donne deux `M` dans `d` ; deux séries finissant à 1500 et 1510 ont des étiquettes écartées d'au moins 14 px ; étiquettes dans la boîte.
- [ ] **Step 2: Échec attendu**, puis **implémenter `layoutTrend`**, puis vert.
- [ ] **Step 3: Palette** — lancer `node <skill dataviz>/scripts/validate_palette.js "<couleurs des familles>" --mode light` puis `--mode dark` (fond #1b1a3a) ; consigner le résultat dans SOURCES ou ARCHITECTURE ; un AVERTISSEMENT de daltonisme est couvert par les étiquettes directes et les marqueurs (décision de la spec).
- [ ] **Step 4: Tests de composant** (`PollTrend.test.tsx`, état réel fabriqué avec le moteur comme les autres tests d'écran) : un `path` par candidat ; une étiquette par candidat ; `role="img"` avec un résumé qui nomme le candidat en tête ; flèche droite sur le graphique → infobulle de la vague suivante ; un seul sondage → rien n'est rendu.
- [ ] **Step 5: Implémenter `PollTrend`** et l'intégrer dans `Polls.tsx` ; le tableau d'évolution reste (mêmes libellés) sous `Disclosure` local « Voir le tableau ».
- [ ] **Step 6: Vérifier** — tests web, e2e `sondages` vert (le tableau reste atteignable), axe-core clair et nuit.
- [ ] **Step 7: Commit**

### Task 4: Éditeur de programme en tuiles

**Files:**
- Modify: `apps/web/src/screens/Programme.tsx`
- Modify: `apps/web/src/screens/campaign.test.tsx` (aide d'ouverture d'un domaine), `apps/web/e2e/campagne.spec.ts` (idem)

**Interfaces:**
- Grille `ul` de tuiles (`grid-cols-2 @xl:grid-cols-3 @3xl:grid-cols-4`), chaque tuile = `button aria-expanded aria-controls="domaine-<id>"` nommé par le libellé du domaine puis l'état (« Économie, 1 retenue sur 3 ») ; jauge de trois segments ; un seul panneau ouvert à la fois (`useState<string | null>`), ouvert d'emblée sur le premier domaine qui a une proposition retenue, sinon aucun ; panneau `section id="domaine-<id>" aria-labelledby` avec les cartes de propositions existantes (contrôles, libellés et validation inchangés).

- [ ] **Step 1: Mettre à jour les aides de test** : `openDomain(name)` clique `getByRole('button', { name: new RegExp(\`^${name},\`) })` (composant et e2e) ; ajouter un test : « 0 retenue sur 3 » puis, après ajout d'une proposition, « 1 retenue sur 3 » ; en observateur, tuiles ouvrables et cases désactivées.
- [ ] **Step 2: Échec attendu**, puis **implémenter** la grille et le panneau, puis vert (`campaign.test.tsx`, e2e `campagne`).
- [ ] **Step 3: Commit**

### Task 5: Paramètres — thème, son, crédits

**Files:**
- Create: `apps/web/src/components/ThemeChoice.tsx`
- Modify: `apps/web/src/screens/Parametres.tsx`, `apps/web/src/components/SoundSettings.tsx`, `apps/web/src/screens/parametres.test.tsx`

**Interfaces:**
- Produces: `ThemeChoice()` — `role="radiogroup"` nommé « Thème », trois `input type="radio"` (Clair, Nuit, Système) stylés en tuiles avec vignette, liés à `useThemeStore` (`ThemeChoice` = `'clair' | 'sombre' | 'systeme'`) ; flèches du clavier natives.
- Crédits : chaque `Sub` devient une catégorie `Disclosure` (titre et nombre d'entrées) ; champ `input type="search"` « Filtrer les crédits » qui déplie les catégories qui correspondent et masque les entrées qui ne correspondent pas (comparaison sans accents ni casse) ; sans résultat : « Aucun crédit ne correspond à « … ». ».
- Jingles : grille `sm:grid-cols-2` de boutons « Écouter » au libellé court (nom du jingle), description dessous.
- Nouvelle catégorie « Polices » : Anybody, Atkinson Hyperlegible Next et Archivo, licence SIL OFL 1.1, distribuées par Fontsource et embarquées (aucune connexion) — valeurs lues dans le `package.json` de chaque paquet (licence OFL-1.1, version 5.3.0).

- [ ] **Step 1: Tests** (`parametres.test.tsx`) : `radiogroup` « Thème » avec trois radios, choisir « Nuit » met `theme` à `'sombre'` ; filtre « Commons » : au moins une catégorie ouverte, entrées non correspondantes masquées ; filtre « zzz » : message d'absence ; boutons d'écoute de chaque jingle toujours présents (libellés accessibles inchangés : « Écouter « Résultat à 20 h » »).
- [ ] **Step 2: Échec attendu**, **implémenter**, vert ; e2e `son` et `parametres` verts.
- [ ] **Step 3: Commit**

### Task 6: Accueil et mouvement

**Files:**
- Modify: `apps/web/src/components/Palmares.tsx` (bloc du défi sans vide), `apps/web/src/screens/dashboard/ActionPlanner.tsx` (retour d'ajout), `apps/web/src/index.css` (animation `imprime`)

**Interfaces:**
- Animation `--animate-imprime: imprime 420ms var(--ease-sortie)` : aplat de surligneur qui s'efface sur la tuile ajoutée (`data-ajoutee` posé 450 ms après l'ajout) ; compteur « Actions » du plan : bref rebond (`scale` 1 → 1.12 → 1). Coupés sous mouvement réduit (tâche 1).

- [ ] **Step 1: Test** (composant du planificateur) : après « Ajouter Meeting public », la tuile porte `data-ajoutee` puis ne la porte plus.
- [ ] **Step 2: Implémenter**, vert ; captures de l'accueil (défi sans score : bloc compact, bouton en bas).
- [ ] **Step 3: Commit**

### Task 7: Accessibilité, revue visuelle, documentation, APK 1.14.0

**Files:**
- Modify: `docs/PLAN_DEVELOPPEMENT.md` (phase 22 : tâches, bilan), `docs/ARCHITECTURE.md`, `docs/RISQUES.md` si besoin, `README.md` (ligne 22), `apps/mobile/README.md`, `apps/mobile/package.json` (1.14.0), `apps/mobile/android/app/build.gradle` (`versionCode 15`, `versionName "1.14.0"`)

- [ ] **Step 1: Audit a11y** (compétence a11y-audit) : clavier dans le sommaire, le graphique, l'éditeur de programme, le thème ; axe-core clair et nuit sur tous les écrans ; corriger.
- [ ] **Step 2: Revue visuelle** (compétence visual-audit) sur captures bureau et téléphone, clair et nuit ; corriger.
- [ ] **Step 3: Vérifications** — `pnpm check`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:mobile` verts.
- [ ] **Step 4: APK** — `android:sync`, `assembleDebug`, `aapt2 dump badging` (1.14.0, 15, mêmes permissions), `apksigner verify`.
- [ ] **Step 5: Commit, push, compte rendu.**
