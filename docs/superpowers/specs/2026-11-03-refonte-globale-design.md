# Phase 22 — Refonte globale : architecture de l'information, données, mouvement

Demande de l'utilisateur (03/11/2026) : « refonte globale en utilisant les skills, tous, pour un
design optimal ; carte blanche, donne tout ce que tu as ». Carte blanche répétée : les décisions
ci-dessous sont prises sans questionnaire et restent révisables par l'utilisateur.

## Compréhension

- **Ce qui est demandé** : l'interface la meilleure possible sur tous les écrans, web et Android,
  en mobilisant les compétences de conception disponibles (audit visuel, parcours, design system,
  visualisation de données, mouvement, interaction, accessibilité, navigation mobile).
- **Contraintes** (CLAUDE.md) : interface seule — ni moteur, ni règles, ni format de sauvegarde ;
  le navigateur ne calcule jamais l'état ; aucune donnée officielle inventée ; aucun propos prêté ;
  documentation et interface en français ; une seule phase, tests avec chaque fonctionnalité.
- **Hypothèse** : l'identité « Tract » livrée en phase 21 (le 03/11/2026) est conservée. Changer
  d'identité une troisième fois n'apporterait rien ; l'audit montre que les faiblesses restantes
  sont structurelles (navigation dans les pages, données, éditeurs), pas cosmétiques.
- **Succès** : chaque espace se parcourt sans défilement aveugle ; l'évolution des sondages se lit
  en un graphique ; le programme se compose en tuiles ; les réglages se règlent en un geste ; le
  mouvement confirme les actions sans jamais masquer le contenu ; WCAG 2.1 AA partout ; tous les
  tests existants restent verts (rôles et libellés accessibles conservés).

## Audit (compétences visual-audit, journey-mapping, design-system-architecture)

Captures complètes (bureau 1280 px, téléphone 390 px, clair et nuit, sections dépliées) :

| Constat | Gravité | Écran |
|---|---|---|
| Espaces en une seule colonne de sections : Campagne 18 500 px sur téléphone, Pouvoir (mandat) 15 900 px, Paramètres 45 800 px ; aucun moyen de sauter d'une section à l'autre ni de savoir où l'on est. | critique | Campagne, Opinion, Pouvoir, Paramètres |
| Sous mouvement réduit, les affiches de l'écran-titre restent invisibles jusqu'à 1 s : la règle réduit la durée des animations mais garde leur délai. | critique (accessibilité) | Accueil |
| Évolution des intentions présentée en tableau seulement : la tendance (le vrai sujet) ne se voit pas. | important | Opinion |
| Programme : 17 éléments `<details>` natifs (triangles du navigateur, « 0 retenue(s) sur 3 ») ; rien n'indique d'un coup d'œil les thèmes couverts. | important | Campagne |
| Apparence : un seul bouton qui fait défiler les trois thèmes ; libellés des jingles qui se coupent sur deux lignes. | important | Paramètres |
| Crédits : plus de deux cents liens à la suite, sans regroupement ni recherche. | important | Paramètres |
| 972 classes `dark:` ; la paire `text-slate-600 dark:text-slate-400` répétée 212 fois, `text-slate-500 dark:text-slate-400` 114 fois : pas de jeton sémantique d'encre secondaire. | dette | tous |
| Bloc « Défi du jour » : grand vide sous le score quand il n'y en a pas. | mineur | Accueil |

Parcours (journey-mapping) : le joueur revient chaque semaine au QG (bien servi depuis la phase 21),
puis va chercher une information précise dans un espace (programme, sondage, ministre) — c'est là
que la friction se concentre : il déplie, défile, cherche. Moment de plaisir déjà présent : le coup
de tampon ; moment manquant : voir sa courbe monter dans les sondages.

## Approches envisagées

1. **Sommaire collant + visualisation + éditeurs refaits** (retenue) : un sommaire de sections
   collant sous le bandeau, qui déplie et amène la section ; un graphique d'évolution des sondages ;
   un éditeur de programme en tuiles ; des réglages en contrôles segmentés ; un jeton sémantique
   d'encre ; corrections d'accessibilité. Compatible avec les tests (sections dépliables conservées).
2. **Onglets à la place des sections dépliables** : une section visible à la fois. Plus net, mais
   casse la lecture d'ensemble, l'ancre d'adresse (`#resultats`) et la majorité des tests de bout en
   bout, qui déplient des sections ; écartée.
3. **Nouvelle identité visuelle** : écartée (voir Hypothèse).

## Conception

### 1. Fondations (design system)

- **Jetons sémantiques d'encre** dans `index.css` (`@theme` + variables redéfinies en thème de nuit) :
  `--color-encre` (texte principal), `--color-encre-2` (texte secondaire, remplace la paire
  slate-600/400), `--color-encre-3` (texte tertiaire, remplace slate-500/400), `--color-filet`
  (filets), `--color-feuille` (surface de carte). Contraste vérifié : encre-2 et encre-3 ≥ 4,5:1
  sur papier et sur feuille, dans les deux thèmes. Remplacement mécanique des paires exactes
  (codemod relu, sans changer le rendu).
- **Mouvement** : jetons de durée (`--duree-rapide` 120 ms, `--duree` 200 ms, `--duree-lente`
  360 ms) et la courbe `ease-sortie` existante ; sous mouvement réduit, **délais annulés** en plus
  des durées (`animation-delay: 0s`), ce qui corrige les affiches invisibles.

### 2. Sommaire des espaces (navigation dans la page)

Composant `SectionNav` (`components/SectionNav.tsx`), rendu par `Espace` et par Paramètres :
- Barre horizontale collante sous le bandeau de campagne (`top` aligné sur la hauteur du bandeau),
  à toutes les tailles : pastilles qui défilent horizontalement si elles ne tiennent pas (jamais de
  défilement horizontal de la page). Pas de colonne verticale : la navigation des espaces occupe
  déjà la gauche sur grand écran.
- Chaque entrée : icône et libellé de la section, état (point plein si dépliée) ; un clic
  **déplie la section et l'amène à la vue** (fonction `show` existante de `useOpenSections`), le
  focus va sur le titre de la section. Entrée courante (`aria-current="location"`) suivie par
  `IntersectionObserver` pendant le défilement.
- `nav aria-label="Sommaire de l'espace"` ; liste de liens vers les ancres (`#programme`) :
  fonctionne sans JavaScript d'interface, et l'adresse partagée ouvre la section (comportement
  existant de l'ancre). Bouton « Tout replier » quand au moins deux sections sont ouvertes.

### 3. Opinion : l'évolution en courbes (compétence dataviz)

Composant `PollTrend` (`components/PollTrend.tsx`), en SVG, au-dessus du tableau d'évolution :
- **Forme** : changement dans le temps → graphique en lignes ; une seule échelle (intentions en
  %), axe des semaines ; jamais de double axe.
- **Couleur** : celle de la famille de chaque candidat (`colorOf`, convention du jeu, suit le
  candidat et non son rang) ; palette validée par le script du skill (`validate_palette.js`) dans
  les deux thèmes. Paires trop proches pour un daltonien : **encodage secondaire** obligatoire —
  étiquette directe en bout de ligne (nom), marqueurs de forme différente ; la ligne du joueur est
  plus épaisse et toujours au premier plan, les autres atténuées au survol d'une ligne.
- **Marques** : lignes de 2 px (3 px pour le joueur), marqueurs ≥ 8 px aux vagues de sondage,
  grille discrète, étiquettes directes sans collision (écartement minimal calculé), texte en jetons
  d'encre, jamais à la couleur de la série.
- **Interaction** : réticule et infobulle au survol et au clavier (flèches gauche/droite sur le
  graphique focalisable), cible plus large que la marque ; le tableau existant reste, replié sous
  « Voir le tableau » (vue équivalente pour les lecteurs d'écran ; `role="img"` + résumé textuel
  sur le SVG).
- **Données** : les sondages déjà servis par l'API (`state.polls`), filtrés comme le tableau
  actuel ; rien n'est recalculé de la simulation (les points sont les valeurs publiées).

### 4. Campagne : l'éditeur de programme en tuiles

Dans `Programme.tsx`, les dix-sept `<details>` deviennent une grille de **tuiles de thème** (deux
colonnes sur téléphone, quatre sur bureau) : nom du thème, jauge « 1 sur 3 » (encre pleine pour
chaque proposition retenue), état « vide / en cours / complet ». Toucher une tuile ouvre le
panneau du thème sous la grille (une seule à la fois, `aria-expanded`, `aria-controls`), avec les
propositions en cartes à cocher (mêmes contrôles et mêmes libellés qu'aujourd'hui : les tests et
la validation par le serveur ne changent pas). Pluriels écrits (« 1 retenue », « 2 retenues »).

### 5. Paramètres

- **Apparence** : contrôle segmenté à trois options (Clair, Nuit, Système), `radiogroup`, chaque
  option avec une vignette du thème ; le bouton de l'en-tête reste.
- **Son** : jingles en grille de boutons compacts (libellé court + description), sans coupure.
- **Crédits** : regroupés en catégories dépliables avec leur nombre (sources du jeu de règles,
  personnalités, gouvernement, médias, musique, polices) et un champ « Filtrer les crédits » ;
  sommaire de la page (composant du §2).

### 6. Accueil et finitions

- Affiches visibles d'emblée sous mouvement réduit (§1) ; bloc « Défi du jour » sans vide
  (le score ou l'invitation remplit le bloc, bouton aligné en bas).
- Mouvement (compétence motion-design) : un seul moment orchestré par écran (déjà : titre en
  surimpression, coup de tampon) ; retours d'action : la tuile d'action ajoutée « s'imprime »
  (bref aplat de surligneur), le compteur du plan rebondit, la barre de résolution montre l'envoi.
  Rien d'automatique ne boucle ; tout est coupé sous mouvement réduit.

### 7. Accessibilité (compétence a11y-audit)

Audit axe-core étendu aux nouveaux composants dans les deux thèmes ; parcours au clavier du
sommaire, du graphique et de l'éditeur de programme ; cibles ≥ 44 px ; ordre de focus ; libellés.

## Tests

- Composants : `SectionNav` (liens, déplie et amène, `aria-current`, « Tout replier »),
  `PollTrend` (une ligne par candidat, étiquettes, infobulle au clavier, résumé textuel, tableau
  équivalent), éditeur de programme (tuiles, compteur, panneau unique, cases inchangées),
  Paramètres (contrôle segmenté du thème, filtre des crédits).
- E2E : un parcours par espace avec le sommaire (bureau et téléphone), audit axe-core des nouveaux
  composants, mouvement réduit (affiches visibles sans délai), aucun débordement à 360 px.
- Suite existante inchangée et verte ; `pnpm check`, intégration, e2e, `pnpm test:mobile`.

## Hors périmètre

Moteur, règles, format de sauvegarde, API ; soirée électorale et débat (habillage télévisé gardé) ;
carte (MapLibre) au-delà du sommaire ; nouvelles fonctionnalités de jeu.
