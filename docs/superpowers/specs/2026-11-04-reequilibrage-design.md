# Phase 24 — Rééquilibrage de la présidentielle (jeu de règles 22.0.0)

Brief de l'utilisateur (04/11/2026), préparé avec Perplexity et joint à la conversation : « Phase
24 : rééquilibrage de la présidentielle ». Ordre décidé le même jour : ce rééquilibrage d'abord
(phase 24), puis le plateau de jeu (phase 25,
`docs/superpowers/specs/2026-11-04-plateau-de-jeu-design.md`), puis les limites des candidatures
(phase 26). Le brief fait foi ; cette spécification en reprend les exigences et précise les choix
techniques.

## Constat (simulation de 2 545 campagnes, format court, vrai moteur)

| Scénario | Parties | Résultat |
|---|---|---|
| Observateur, adversaires fictifs | 300 | Boussole (Claire Delorme) gagne 99 % ; Pilier au 2nd tour 91 % ; Étincelle sans parrainages 91 % |
| Observateur, personnalités réelles | 300 | Attal 82 %, Philippe 17 %, les 15 autres environ 0 % ; 1er tour éclaté (1er environ 11 %) |
| Candidat personnalisé au centre, sans programme, 5 niveaux × {passif, naïf, IA} | 900 | 0 victoire, 0 qualification, rang médian 7 sur 7, même en Découverte |
| Même chose, joueur IA, programme copié sur Boussole, 4 orientations | 320 | Découverte 10 % de victoires ; Standard 0 % (6,5 % des voix) |
| Positions miroirs gauche ↔ droite (joueur IA, Standard) | 300 | symétrique (1,2 % contre 1,1 %) : neutralité partisane à conserver |
| Chacune des 17 personnalités réelles incarnée (joueur IA, Standard) | 425 | seuls Attal 52 %, Philippe 16 %, Becht 4 % peuvent gagner |

Causes : écart de notoriété de départ du joueur (600 en Standard contre 1 500 à 7 000 pour les
fictifs, soit environ −2,3 de score latent face à Boussole) ; programme sans effet visible ;
avantage structurel du centre (distance linéaire, R-12) ; rapport de force réel absent (popularité
de départ identique pour toutes les personnalités, aucun programme prêté) ; anomalie « naïf <
passif » en Découverte ; échecs de parrainages des petits candidats (Étincelle 91 %, Zemmour 55 %).

## Critères d'acceptation

Mesurés par `pnpm sim:equilibrage` après correction, sur au moins 300 parties par scénario :

- **Candidat personnalisé**, joueur IA, avec programme, position centrale : Découverte 35 à 60 % de
  victoires, Standard 15 à 30 %, Expert 5 à 15 %, Légende 1 à 8 % ; strictement décroissant d'un
  niveau à l'autre.
- **Sans programme**, en Standard : au moins 5 points de victoires de moins qu'avec programme ; et
  l'alerte du QG est visible.
- **Observateur, adversaires fictifs** : aucun candidat au-dessus de 45 % de victoires ; au moins
  4 vainqueurs différents ; au moins 3 qualifiés différents au 2nd tour dans plus de 10 % des
  parties.
- **Personnalités réelles, « Sondages actuels »** :
  - en semaine 0, intentions simulées de chaque personnalité testée à ± 2 points de la moyenne
    des sondages ;
  - en observateur, Marine Le Pen qualifiée au 2nd tour dans au moins 85 % des parties ;
    Jean-Luc Mélenchon 2e qualifié le plus fréquent ;
  - seconds tours simulés en semaine 0 à ± 4 points des duels sourcés ;
  - campagne ouverte : Marine Le Pen gagne entre 55 et 85 % des parties en observateur ;
  - en incarnant Philippe, Glucksmann ou Mélenchon (joueur IA, Standard), au moins 5 % de
    victoires.
- **Personnalités réelles, « Départ équitable »** : aucun candidat au-dessus de 55 % de victoires
  en observateur.
- **Positions miroirs** : écart de victoires entre gauche et droite symétriques de 3 points au
  plus.
- Tests existants verts ; pas de régression du quinquennat, des législatives ni du défi du jour ;
  `SAVE_SCHEMA_VERSION` incrémenté avec migration si `GameState` change ; `docs/RISQUES.md` (R-12),
  `docs/PLAN_DEVELOPPEMENT.md` et la note `modele` du jeu de règles mis à jour avec les valeurs et
  la référence avant / après.

Un critère qui ne pourrait pas être atteint sans casser un autre est signalé tel quel dans le
compte rendu, avec les chiffres : rien n'est masqué.

## Conception

### 1. Banc d'essai (livré en premier, lancé avant toute modification)

- Module pur `packages/engine/src/sim/equilibrage.ts` : parties en format court, graine par graine
  (`equilibrage-<scénario>-<n>`), avec `createGame` / `advanceWeek`, débats conclus par la fin
  simulée, décisions par défaut.
- Stratégies du joueur : `passif` (aucune action), `naif` (parrainages, `meeting`,
  `interview@france-inter` chaque semaine), `ia` (l'acteur du joueur cloné en adversaire
  `equilibre`, tolérance 0,4, objectif victoire, plan de `planOpponentActions`) ; option : annonce
  progressive d'un programme (celui du programme de départ suggéré, §2.2).
- Scénarios : observateur fictifs ; observateur réels (« Sondages actuels » et « Départ
  équitable ») ; candidat personnalisé × 5 niveaux × stratégies, avec et sans programme ; positions
  miroirs ; chaque personnalité réelle incarnée ; inversion des ressources Boussole ↔ Pilier (§2.3).
- Lancement : `pnpm sim:equilibrage [scénario] [--parties N]` (script `tsx`), hors `pnpm check` ;
  sorties : résumé texte en français (% de victoires, % de 2nd tour, % sans parrainages, score
  moyen au 1er tour, rang médian, par candidat) et fichier JSONL dans `data/sim/` (hors Git).
- Version courte dans `pnpm check` : 40 parties par scénario clé, critères vérifiés avec une marge
  (intervalle de confiance à 95 % de chaque proportion).

### 2. Corrections, dans l'ordre du brief : 2.4, puis 2.1, 2.2, 2.3, 2.5, 2.6

#### 2.4. Sondages actuels (prioritaire)

- **Données** : `packages/rulesets/src/sondages-2027.json`, saisi à la main depuis les sources
  vérifiées (aucun chiffre inventé) : pour chaque enquête, institut, commanditaire, dates de
  terrain, échantillon, hypothèse testée, intentions par personnalité, lien vers la notice de la
  Commission des sondages ou l'article ; duels de second tour sourcés. Chaque enquête est
  référencée dans `docs/SOURCES.md` ; une source injoignable d'ici est vérifiée par une autre
  (article de presse, liste Wikipédia des sondages en révision figée) ou laissée de côté. Toute
  modification impose une nouvelle version du jeu de règles.
- **Moyenne** documentée : les 5 dernières enquêtes, hypothèse la plus proche de la liste du jeu
  (le plus de personnalités en commun) ; une personnalité non testée est étiquetée « non testée »
  et reçoit le socle minimal (hypothèse : 0,5 %), sans chiffre inventé.
- **Socle électoral** : facteur d'utilité « Socle électoral (sondages au JJ/MM/AAAA) » de chaque
  personnalité réelle, identique dans tous les groupes d'électeurs, ajouté par `campaignFactors`
  et visible dans « Pourquoi ça bouge ? ». Calibré à la création de la partie par un ajustement
  itératif déterministe (décalage += ln(cible / simulé)) jusqu'à ± 0,5 point de la moyenne en
  semaine 0, puis enregistré dans l'état ; décroissance lente ou stabilité (paramètre `hypothese`)
  pour que la campagne puisse renverser la situation. Même formule pour toutes les personnalités ;
  ni programme prêté, ni propos attribué, ni bonus éditorial.
- **Second tour** : reports de voix et plafond de chaque camp calibrés sur les duels sourcés
  (décalage de second tour par personnalité ajusté de la même manière), à ± 4 points en semaine 0.
- **Choix du joueur** à l'étape « Le terrain » de la création : « Sondages actuels » (par défaut
  avec les personnalités réelles, date des sondages affichée) ou « Départ équitable » (mode actuel),
  tous deux étiquetés « Simulation : point de départ issu des sondages publiés, la suite est
  simulée ». Champ de création validé par l'API et le moteur local (mêmes codes d'erreur).
- **Éligibilité de Marine Le Pen** : proposition seulement (compte rendu et `docs/PLAN`) d'un
  événement optionnel étiqueté « simulé » sur la décision de la Cour de cassation attendue « au plus
  tard début avril 2027 » ; aucune issue présentée comme réelle.

#### 2.1. Candidat personnalisé jouable

- Révision de `jeu.ressourcesInitiales` (notoriété surtout) et/ou **rattrapage de notoriété** : gain
  supplémentaire quand la notoriété est basse, par le registre, facteur « Rattrapage de
  notoriété ». Outsider en Standard, pas condamné ; coefficients `ia` inchangés.

#### 2.2. Programme visible

- QG : alerte tant que le programme compte moins de N propositions, avec l'effet estimé sur les
  intentions, tiré des facteurs existants (« Programme », « Crédibilité ») ; option « Programme de
  départ suggéré » proche du positionnement : règle partagée (`@r2027/shared`) qui propose des
  propositions du jeu de règles, ajoutées par le flux normal `programme.ajouter` du plan de la
  semaine, modifiables. Aucune route nouvelle.

#### 2.3. Avantage structurel du centre, par des règles générales

- D'abord, démonstration par le banc : Boussole avec les ressources de Pilier et inversement, pour
  séparer la part de la position et celle des ressources.
- Pistes testées une à une, ne garder que le minimum efficace : (a) distance non linéaire qui
  sature ; (b) fidélité de camp (bonus du candidat le plus proche du groupe) ; (c) abstention
  différentielle quand aucun candidat n'est proche ; (d) ressources de départ de Boussole. Aucun
  malus ciblé.

#### 2.5. Anomalie « naïf < passif »

- Diagnostic (lassitude du public, coûts, risques) ; correction si c'est un défaut, sinon
  explication montrée au joueur dans le débriefing.

#### 2.6. Parrainages des petits candidats

- Étincelle (91 % d'échecs) et Zemmour (55 %) : documenter si c'est voulu, sinon ajuster les
  paramètres.

### 3. Annexe : essai Android

- `apps/mobile/scripts/essai-android.mjs` attend « Nom de la partie » sur le premier écran,
  disparu avec l'assistant de création : adapter au parcours actuel. Le workflow GitHub reste
  bloqué au niveau du compte (Actions) : le script est vérifié localement autant que possible et la
  limite est dite.

### 4. Données et formats

- **Jeu de règles 22.0.0** : blocs `sondagesReels` (fichier joint, empreinte vérifiée, moyenne,
  socle minimal, décroissance, second tour), `rattrapageNotoriete`, ressources de départ revues,
  paramètres retenus du §2.3 ; tous `hypothese` sauf les sondages (données sourcées) ; note
  `modele` mise à jour avec la référence avant / après.
- **Format de sauvegarde 24** : `player.depart` (`sondages` | `equitable`) et `socle` (décalages
  calibrés par personnalité, premier et second tours). Migration 23 → 24 : `equitable`, aucun
  socle. Moteur 0.24.0 ; application 1.16.0.

## Tests

- Banc : déterminisme (même graine, mêmes résultats), stratégies, scénarios ; version courte dans
  `pnpm check`.
- Moteur : calibrage du socle (± 2 points en semaine 0), seconds tours (± 4 points), décroissance,
  rattrapage par le registre, programme suggéré, migration 23 → 24 sur un état réel.
- API et moteur local : création « Sondages actuels » / « Départ équitable », refus identiques.
- Interface : choix à l'étape « Le terrain », alerte du programme, programme suggéré.

## Hors périmètre

Événement « décision de la Cour de cassation » (proposition seulement) ; refonte en cartes
(phase 25) ; modification des données réelles déjà importées (médias, Assemblée, économie,
personnalités).
