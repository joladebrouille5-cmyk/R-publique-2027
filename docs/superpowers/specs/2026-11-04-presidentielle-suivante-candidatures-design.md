# Phase 23 — Présidentielle suivante : candidatures et poids du bilan

Demande de l'utilisateur (04/11/2026) : « faut faire en sorte que les candidats et personnalités
politiques puissent choisir de se présenter ou non dans la présidentielle qui suit le 1er
quinquennat, pas forcément les mêmes se présentent ; impact du quinquennat sur les intentions pour
le président sortant, etc. »

Décisions de l'utilisateur (questionnaire du 04/11/2026) :

- si le candidat du joueur ne se représente pas (choix, ou limite de deux mandats consécutifs), le
  joueur **passe la main à un successeur de son camp** et joue sa campagne ;
- peuvent entrer dans la course : des personnages **fictifs** et des **personnalités réelles déjà
  présentes dans la partie** (candidats de 2027, membres d'un gouvernement de la partie), leur
  candidature étant **simulée et étiquetée**, sans aucun propos prêté ;
- conception présentée le 04/11/2026 approuvée telle quelle (« Oui, on y va »).

## Compréhension

- **Aujourd'hui** (`presidency/cycle.ts`, phase 6) : à l'ouverture de la campagne suivante, tous
  les acteurs redeviennent candidats, sauf le président au terme de deux mandats consécutifs
  (inéligible) ; le bilan du quinquennat est arrêté et affiché, mais n'agit pas sur les intentions.
- **Voulu** : un champ de candidats renouvelé (retraits, entrées, successeur du joueur) et un bilan
  qui pèse sur le président sortant et sur son camp.
- **Contraintes** (CLAUDE.md) : moteur pur et déterministe (tirages par le générateur à graine de
  la partie) ; paramètres dans le jeu de règles (nouvelle version), étiquetés `hypothèse` ; toute
  variation de ressource par le registre ; nouveau format de sauvegarde et migration ; aucune
  route nouvelle sans son double dans le moteur local ; jamais de propos ni de citation prêtés à
  une personne réelle ; codes géographiques en chaînes ; interface en français.

## Conception

### 1. Le choix du joueur, quatre semaines avant la campagne

- **Quand** : la semaine où la date de la partie atteint « ouverture de la campagne suivante − 4
  semaines » (paramètre `succession.delaiDecisionSemaines` = 4), pendant le quinquennat, si le joueur
  a un candidat (pas en observateur) et qu'aucune décision `candidature` n'a déjà été prise pour ce
  cycle.
- **Décision** : nouveau genre `candidature` (liste `DECISION_KINDS`), obligatoire (elle arrête
  l'avance rapide et la résolution comme les autres décisions). Options :
  - `se-representer` — si le candidat est éligible (pas au terme de deux mandats consécutifs, art. 6) ;
  - `successeur-<id>` — jusqu'à quatre successeurs de son camp (§3), chacun décrit (nom, parti,
    fonction ou parcours, nature réelle ou fictive).
  Option par défaut : `se-representer` si possible, sinon le premier successeur.
- **Effet** : le choix est mémorisé (`state.succession.choixJoueur`) et appliqué à l'ouverture de la
  campagne (§4).

### 2. Les autres candidats décident (simulation)

À l'ouverture de la campagne, pour chaque acteur non joueur de la présidentielle précédente, un
tirage (générateur de la partie, flux `candidature`, identifiant de l'acteur, année du cycle) donne
la décision ; probabilité de se représenter (paramètres du jeu de règles, hypothèses) :

| Situation à la présidentielle précédente | Probabilité de se représenter |
|---|---|
| Président sortant éligible | `0,5 + 1,5 × (popularité finale − 30 %)`, bornée à [0,10 ; 0,95] |
| Président au terme de deux mandats | 0 (inéligible, art. 6) |
| Finaliste battu au second tour | 0,85 |
| Éliminé au premier tour, score `s` | `0,25 + 2 × s`, bornée à [0,15 ; 0,80] |
| Écarté (parrainages) ou retiré (ralliement) | 0,30 |

Le candidat qui ne se représente pas passe au statut `retire` ; il reste dans la partie (historique,
relations). Annonce neutre dans le bilan de la semaine : « Candidature simulée : X ne se présente pas
à la présidentielle 2032 », avec le motif de jeu (« score de 2027 : 3,2 % »), jamais un propos.

### 3. Les entrants

Dans cet ordre, sans dépasser `succession.maxCandidats` = 12 candidats déclarés :

1. **Successeur du joueur** (s'il a passé la main).
2. **Héritier du camp sortant** : si le président sortant (IA) ne se représente pas, son camp
   présente le Premier ministre en fonction à la fin du quinquennat, ou, à défaut ou s'il est déjà
   candidat, le ministre à la plus forte popularité prêtée (`quinquennat.suivi`).
3. **Ministre ambitieux** : au plus un ministre (hors Premier ministre) dont la popularité prêtée
   atteint `succession.ministreSeuilPopularite` = 45 % entre, avec la probabilité
   `succession.ministreProbabilite` = 0,35, si aucun candidat déclaré n'est à moins de 0,25 de sa
   position.
4. **Famille sans candidat** : pour chaque groupe d'électeurs du jeu de règles dont aucun candidat
   déclaré n'est à moins de `succession.distanceFamille` = 0,35, le profil fictif
   (`quinquennat.profils`) le plus proche de la position du groupe entre, s'il n'est pas déjà acteur.

**Successeurs proposés au joueur** (§1), au plus quatre : s'il est président, son Premier ministre
puis ses ministres les plus proches de sa position (popularité prêtée en départage) ; sinon, les
personnalités réelles du vivier de même parti et les profils fictifs les plus proches de sa position.

**Création d'un acteur entrant** : depuis une figure du vivier (réelle) ou un profil fictif.
Position : celle de la fiche (estimation CHES pour une figure). Moyens de départ (hypothèses du jeu
de règles, `succession.entrants`) : budget et militants fixes, notoriété selon le niveau de la fiche
(1 à 3) pour une figure, fixe pour un profil, popularité de départ fixe ; programme vide (les
personnalités réelles adverses n'ont jamais de programme prêté). Un successeur du joueur hérite de
`succession.transmissionMilitants` = 60 % des militants de son prédécesseur (registre : « passation
de la campagne »). Le précédent candidat du joueur devient un acteur `adversaire` au statut `retire`.

### 4. Ouverture de la campagne

`openNextCampaign` applique, dans l'ordre : bilan arrêté (inchangé) → décisions (§2) → choix du
joueur (§1) → entrants (§3) → moyens de départ des candidats déclarés (comme aujourd'hui) → facteurs
de bilan (§5) → annonces dans le bilan de la semaine. Tout est déterministe pour une graine donnée.

### 5. Le poids du bilan sur les intentions

Nouveau facteur d'utilité « Bilan du quinquennat », ajouté par `campaignFactors`
(`election/distribution.ts`) pendant toute la campagne suivante, calculé une fois à l'ouverture :

`B = wPopularite × (popularité finale − 0,35) + wNote × (note sur 20 − 10) / 10 − wChomage ×
(variation du chômage en points)`, borné à ±`succession.bilan.max` = 0,6 ; `wPopularite` = 1,2,
`wNote` = 0,3, `wChomage` = 0,15 (hypothèses ; note manquante : 10).

| Candidat | Facteur |
|---|---|
| Président sortant | `B` |
| Héritier du camp sortant, successeur du joueur s'il était président | `0,5 × B` |
| Autre membre du dernier gouvernement candidat | `0,25 × B` |
| Les autres | aucun |

Le facteur apparaît dans « Pourquoi ça bouge ? » et dans le détail des intentions, comme les autres.

### 6. Données et formats

- **Jeu de règles 21.0.0** : bloc `succession` (paramètres ci-dessus, tous étiquetés `hypothèse`,
  avec leur justification courte).
- **Format de sauvegarde 23** :
  - `state.succession` : `{ annee, choixJoueur, annonces[], bilan{} } | null` ; une annonce :
    `{ actorId, choix: 'candidat' | 'retrait' | 'entree' | 'successeur', motif }` ; `bilan` :
    facteur et rôle par acteur ;
  - identité du candidat : `figureId` (figure du vivier) ; une personnalité réelle renvoie à
    exactement une fiche, sa fiche de candidate (`personnaliteId`) ou sa fiche de figure
    (`figureId`) ;
  - genre de décision `candidature`.
  Migration 22 → 23 : `succession: null`, `figureId: null` pour chaque acteur.
- **Moteur 0.23.0** ; API et moteur local : aucune route nouvelle (la décision passe par l'avance
  de la semaine) ; schémas partagés.

### 7. Interface

- Décision « Votre candidature en 2032 » : options en cartes (portrait, nom, parti, fonction ;
  étiquette « personnalité réelle — candidature simulée » ou « personnage fictif »).
- Bilan de la semaine d'ouverture : section « Candidatures 2032 » (qui se représente, qui se
  retire, qui entre), étiquetée simulation.
- Écran Candidats : badges « Nouveau en 2032 » et « Ne se présente pas » ; le successeur du joueur
  est « vous ».
- Portraits : photo libre de la figure (dossier `gouvernement`) pour une figure entrante.

## Tests

- Moteur : décision `candidature` (date, options, éligibilité, défaut) ; décisions des autres
  (probabilités bornées, déterminisme par graine, inéligible) ; entrants (héritier, ministre,
  famille sans candidat, plafond de 12) ; successeur du joueur (acteur joueur, militants transmis
  par le registre, ancien candidat retiré) ; facteur de bilan (formule, bornes, rôles, somme exacte
  des facteurs) ; migration 22 → 23 sur un état réel.
- Intégration (API) : de la décision à l'ouverture de la campagne avec un successeur.
- Interface : décision et cartes, section du bilan, badges ; e2e du président joueur jusqu'à la
  campagne de 2032 avec passation ; `pnpm test:mobile`.

## Hors périmètre

Primaires, candidatures annoncées au fil des semaines, alliances avant le premier tour du cycle
suivant (le moteur des ralliements existant continue de jouer pendant la campagne), présidentielle
de 2037 au-delà de ce que le moteur fait déjà (les mêmes règles s'y appliquent).
