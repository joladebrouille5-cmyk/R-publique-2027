# Phase 24 — Le plateau : refonte intégrale en jeu de plateau et de cartes

Demande de l'utilisateur (04/11/2026) : « j'ai toujours pas eu ma refonte intégrale de l'interface
du jeu, rien n'a changé quasiment ; débrouille-toi mais je veux que ce soit totalement différent,
addictif et incroyablement magnifique ». Les limites de la phase 23 (candidatures) suivront en
phase 25.

Décisions de l'utilisateur (questionnaire et maquettes du 04/11/2026) :

- forme de jeu : **plateau + cartes** — la carte de France devient le plateau, toujours visible ; les
  actions sont des cartes en main que l'on pose ; la semaine se résout en séquence animée ;
- leviers addictifs : **résolution spectaculaire** et **combos entre cartes** ;
- écran prioritaire : **téléphone Android** (portrait, une main), le bureau suit ;
- direction visuelle : **mélange A + B** des maquettes — un jeu de société (feutrine bleu nuit,
  plateau en carton imprimé, cartes épaisses, pions dorés) qui a l'énergie d'un jeu mobile (relief,
  couleurs franches, cartes qui rebondissent, combos en gros) ;
- couleur de la carte = une information : **implantation** par département, du blanc (aucune
  attache, rien fait là-bas) au rouge (ton fief, beaucoup de militants) — nouvelle règle du moteur ;
- conception présentée en trois sections, approuvée (« Vsy », « Oui », « Go »).

Maquettes validées (jetables, non commitées) : planche des trois directions, puis planche
« mélange A + B » (plateau, carte posée avec série, verdict).

## Compréhension

- **Aujourd'hui** : une application à écrans (QG en cartes, cinq espaces à sections dépliables,
  carte MapLibre à part), refaite deux fois en surface (phases 21 et 22 : polices, couleurs,
  sommaire, courbes) sans changer la structure : d'où « rien n'a changé ».
- **Voulu** : un jeu dont l'écran principal est un plateau ; on joue des cartes sur la France ; la
  carte dit où l'on est implanté ; chaque semaine se termine par un verdict spectaculaire ; des
  combos récompensent les enchaînements.
- **Contraintes** (CLAUDE.md) : moteur pur et déterministe ; paramètres dans le jeu de règles
  (nouvelle version), étiquetés `hypothese` ; variations de ressources par le registre ; nouveau
  format de sauvegarde et migration ; `apps/web` ne calcule jamais l'état (règles partagées dans
  `@r2027/shared` si l'interface doit les montrer) ; toute route nouvelle doublée dans le moteur
  local ; jamais de propos prêté à une personne réelle ; codes géographiques en chaînes ; interface
  en français ; APK sans nouvelle permission ; le son reste de l'interface.

## Conception

### 1. Implantation par département (moteur, jeu de règles 22.0.0)

- **Donnée** : pour chaque candidat, une implantation entière de 0 à 100 dans chacun des 101
  départements du jeu de règles (`parrainages.reservoir.departements`, codes en chaînes) ; les
  territoires hors carte n'en ont pas.
- **Paliers affichés** (règle partagée `implantationTier`) : Terre inconnue 0–4, Présence 5–24,
  Ancrage 25–49, Bastion 50–74, Fief 75–100.
- **Départ** : 30 dans les départements des régions d'implantation du candidat
  (`actor.implantation`) pour une personnalité réelle ou un adversaire fictif ; 0 partout pour le
  candidat personnalisé du joueur (carte blanche). Ce départ est aussi le **socle** sous lequel
  l'érosion ne descend pas.
- **Gains** quand une carte Terrain est posée sur un département (paramètres `implantation.gains`) :
  porte-à-porte +8, rencontre d'élus +10, recrutement +6, meeting +12, grand meeting +20 (et +5 aux
  autres départements de la région), tournée +6 dans tous les départements de la région du
  département visé ; pendant le quinquennat, déplacement du président (actions de déplacement déjà
  ciblées) +8. Plafond 100.
- **Érosion** : −1 par semaine dans chaque département au-dessus du socle, sauf ceux où le candidat
  a posé une carte cette semaine.
- **Registre** : chaque variation est expliquée par ses facteurs (« Meeting », « Bastion ×1,5 »,
  « Érosion ») et publiée dans le bilan de la semaine (`report.implantation`), sur le modèle du
  `Ledger` ; l'implantation n'est pas une des ressources nationales.
- **Militants par département** (affichage, règle partagée) : le total national réparti au prorata
  de l'implantation (à défaut, au prorata des inscrits) ; le total ne change pas.
- **Effet sur le vote** :
  - facteur d'utilité national « Implantation » = `poids × (implantation moyenne pondérée par les
    inscrits − pivot) / 100` (hypothèses : poids 0,5, pivot 15), dans « Pourquoi ça bouge ? » ;
  - au dépouillement territorial, la probabilité de vote d'un candidat dans un département est
    multipliée par `(1 + α × I_d / 100) / (1 + α × Ī / 100)` (α = 0,6), puis renormalisée : le
    score monte là où il est implanté, baisse d'autant ailleurs, et le total national reste proche
    du modèle national (sondages cohérents avec les résultats).
- **Cartes Terrain** : meeting, grand meeting, tournée, porte-à-porte, recrutement et rencontre
  d'élus acceptent une **cible départementale** (`cible: 'departement'`, facultative sauf pour la
  rencontre d'élus, qui l'exige déjà) ; sans cible, la carte garde ses effets nationaux sans gain
  d'implantation (l'interface en demande toujours une).
- **Projection par département** (pour les lectures « Qui mène » et « Sondage local ») : chaque
  semaine de campagne, le moteur projette les intentions nationales sur chaque département
  (composition locale des groupes d'électeurs tirée de la base territoriale, puis multiplicateur
  d'implantation ci-dessus), en centièmes de point ; projection simulée, étiquetée comme telle,
  jamais présentée comme un sondage local réel.
- **Adversaires (IA)** : leurs cartes Terrain visent le département où un point d'implantation
  rapporte le plus d'inscrits pondérés par leur proximité au groupe local ; ils profitent des mêmes
  combos.

### 2. Combos (moteur et interface, règle partagée)

- **Familles** de cartes (nouveau champ `famille` des actions de campagne) : Terrain, Médias,
  Numérique, Organisation.
- **Série** : la 2ᵉ carte d'une même famille dans la semaine a +25 % d'effet, la 3ᵉ et les
  suivantes +50 % (plafond) — appliqué aux effets de base, par le registre (« Série Terrain ×2 :
  +25 % »).
- **Bastion** : deux cartes ou plus dans le même département la même semaine : gain
  d'implantation ×1,5 sur ce département.
- **Tour de région** : cartes dans trois départements distincts d'une même région la même semaine :
  +5 d'implantation dans tous les départements de la région.
- **Règle partagée** `weekCombos(plan, ruleset)` (`@r2027/shared`) : employée par le moteur pour
  appliquer les bonus et par l'interface pour les montrer avant validation. Ordre des cartes = ordre
  du plan.

### 3. Le plateau (interface, téléphone d'abord)

- **Identité « Feutrine »** (nouveau design system, remplace « Tract ») : feutrine bleu nuit
  texturée, plateau en carton crème bordé d'or, cartes épaisses à bord sombre et bandeau de
  famille, relief en ombres empilées, pastilles dorées, couleurs franches, police Bricolage
  Grotesque (graisses 600 à 800, licence OFL). Échelle de l'implantation : une seule teinte, du
  blanc au rouge, contrastes vérifiés sur la feutrine et le carton. Thème de nuit conservé.
- **En haut** : semaine et compte à rebours, rang au sondage (pastille dorée), popularité, budget,
  heures restantes ; toucher ouvre le détail des ressources.
- **Plateau** : la France en relief (SVG des départements projeté depuis la topologie déjà servie
  par l'API géo), colorée selon la lecture choisie : Implantation (défaut), Qui mène, Sondage
  local ; légende chiffrée ; pions dorés là où des cartes sont posées ; jetons hors carte en bord
  de plateau ; toucher un département ouvre sa fiche (implantation, palier, militants estimés,
  sondage local, cartes jouables).
- **Main** : toutes les cartes jouables, par famille, défilement horizontal ; coût (heures, euros),
  effet, illumination quand la carte compléterait un combo ; carte indisponible grisée avec la
  raison (prérequis, budget, heures).
- **Pose** : glisser la carte sur le département ; une carte Médias ouvre le choix du média ou de
  l'émission ; ou toucher la carte puis la cible (clavier et lecteurs d'écran). Les cartes posées
  restent sur le plateau en mini-cartes, avec les bandeaux de série ; retirer d'un geste. Au plus
  8 cartes par semaine (règle existante).
- **Décisions et événements** : cartes plein écran à trancher (le pop-up des urgences, généralisé).
- **Verdict** (remplace le débriefing) : cartes retournées une à une avec leur effet ou leur refus ;
  combos qui éclatent ; départements qui gagnent un palier qui s'allument ; gains qui volent vers
  les jauges ; sondage dévoilé (avant, après, rang) ; événements à lire ; « Semaine suivante ». Un
  toucher accélère ; mouvement réduit : tout s'affiche d'un coup. Données : le bilan de la semaine,
  rien n'est recalculé.
- **Sons** : jingles existants et bruitages synthétisés (glisser, retourner, combo), réglages
  existants.

### 4. La boîte de jeu (tous les autres écrans)

- Un bouton ouvre une grille de tuiles ; chaque tuile ouvre un **panneau en carton** qui glisse
  par-dessus le plateau (fermeture en le tirant vers le bas, Échap, bouton) : Candidats (rivaux en
  cartes de personnage), Sondages (piste de score et courbes), Programme (cartes de propositions en
  classeur), Médias, Finances (cagnotte), Journal, Sauvegardes, Paramètres ; au quinquennat :
  Gouvernement (cartes des ministres), Parlement (hémicycle en plateau), Économie, Crises,
  Législatives, Bilan. Les espaces à sections et le QG disparaissent ; les adresses existantes
  redirigent vers le plateau avec le bon panneau ouvert.
- **Quinquennat** : même plateau ; la main contient les actions présidentielles ; la carte garde
  l'implantation.
- **Écran-titre, création de partie, soirée électorale, débat** : refaits dans l'identité Feutrine,
  mécaniques inchangées.
- **Bureau** : plateau au centre, main en bas, panneaux en tiroirs latéraux.
- **Accessibilité** : couleur jamais seule (palier écrit, chiffre), contraste ≥ 4,5:1 vérifié par
  test sur feutrine et carton, focus visible jamais masqué, alternative au glisser, cibles ≥ 44 px,
  mouvement réduit, axe-core sans violation.

### 5. Données et formats

- **Jeu de règles 22.0.0** : bloc `implantation` (départ, gains, érosion, poids, pivot, α, paliers),
  bloc `combos` (série, bastion, tour de région), champ `famille` des actions de campagne, cible
  départementale des cartes Terrain ; tout étiqueté `hypothese`.
- **Format de sauvegarde 24** : `implantation: Record<actorId, Record<code département, entier>>` ;
  `opinion.departements` (projection de la semaine, `Record<code, Record<actorId, centièmes>>`) ;
  bilan de la semaine : `implantation` (variations avec facteurs) et `combos` (combos appliqués).
  Migration 23 → 24 : implantation de départ recalculée pour chaque acteur (règle du §1), aucune
  variation passée.
- **Moteur 0.24.0** ; aucune route nouvelle (la topologie géo est déjà servie, le plan de la semaine
  porte les cibles) ; schémas partagés ; application 1.16.0.

## Tests

- Moteur : départ et socle ; gains par carte et par région ; érosion ; plafond ; facteurs publiés ;
  série, bastion, tour de région (bonus exacts, registre) ; effet national et territorial
  (renormalisation, total national) ; projection par département (somme cohérente avec le
  national, déterministe) ; IA qui vise des départements ; quinquennat (déplacements) ;
  déterminisme ; migration 23 → 24 sur un état réel.
- Règles partagées : `implantationTier`, militants par département, `weekCombos`.
- API et moteur local : plan avec cibles départementales, même état final.
- Interface : plateau (couleurs et légende, fiche de département, lectures), main (indisponibles,
  combo annoncé), pose au glisser et au toucher, verdict (séquence, accélération, mouvement
  réduit), panneaux de la boîte de jeu, redirections ; contraste ; e2e téléphone et bureau
  (semaine complète jouée au plateau, panneaux, axe-core) ; `pnpm test:mobile`.

## Hors périmètre

Main tirée au hasard, objectifs de la semaine, combos du quinquennat, nouvelles musiques, limites
des candidatures (phase 25).
