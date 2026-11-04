# Diagnostics d'équilibrage (phase 24)

Mesures du banc `pnpm sim:equilibrage` (format court, 300 parties par scénario sauf mention, graines
`equilibrage-<scénario>-<n>`), jeu de règles 21.0.0 avant la phase 24. Ce document répond aux points
2.5 et 2.6 du brief.

## 2.5. Anomalie « naïf < passif »

**Non reproduite sur le banc de la phase 24.** Le joueur passif (aucune action) ne réunit jamais ses
parrainages : il est écarté avant le premier tour (94,3 % des parties en Découverte, 100 % aux autres
niveaux). Le joueur naïf (deux rencontres d'élus, un meeting, une interview par semaine) les réunit en
Découverte, Accessible et Standard, et fait mieux que le passif à tous les niveaux.

| Niveau | Passif : écarté (parrainages) | Passif : score T1 | Naïf : écarté | Naïf : score T1 |
|---|---|---|---|---|
| Découverte | 94,3 % | 0,1 % | 0,0 % | 1,9 % |
| Accessible | 100,0 % | 0,0 % | 0,0 % | 0,7 % |
| Standard | 100,0 % | 0,0 % | 0,0 % | 0,5 % |
| Expert | 100,0 % | 0,0 % | 43,0 % | 0,2 % |
| Légende | 100,0 % | 0,0 % | 100,0 % | 0,0 % |

Le protocole de la mesure citée par le brief n'est pas connu ici ; sur ce banc, aucune
configuration ne montre le naïf derrière le passif. Conséquence retenue : pas de correction du
moteur pour ce point ; la faiblesse mesurée est celle du candidat personnalisé dans son ensemble
(point 2.1, rattrapage de notoriété).

## 2.6. Parrainages des petits candidats

### Étincelle (Bastien Roudier, adversaire fictif)

**Ce ne sont pas des échecs de parrainages mais des ralliements.** Sur 12 parties tracées
(`observateur-fictifs`), Étincelle se retire 12 fois, entre les semaines 18 et 27, pour soutenir
Élise Marchetti (Aurore). Règle en cause (`alliances`, hypothèse) : un adversaire IA sans objectif de
victoire, sous 4 % d'intentions (`seuilIntentions` 400), se rallie avec la probabilité
`probabiliteHebdo` 0,25 par semaine pendant les 10 semaines qui précèdent le premier tour, soit
1 − 0,75¹⁰ ≈ 94 % sur la période. Le banc compte ces retraits à part des écartés : la colonne
« Sans parrainages » d'Étincelle est nulle, sa part au premier tour quasi nulle.

### Éric Zemmour (personnalité réelle, organisation « aucune »)

**Échec de justesse** : 61 % des parties en départ équitable. Sur 6 parties tracées, il réunit
443 à 505 présentations validées pour un seuil de 500 (loi n° 62-1292, art. 3). Ses promesses de
départ (200, niveau d'organisation « aucune », hypothèse commune à sept personnalités) tombent à une
cinquantaine en semaine 12 par conversion en intentions et renoncements, puis remontent sans
dépasser le seuil avec marge. Les autres personnalités du même niveau ne sont jamais écartées sur ce
banc.

### Décision (phase 24)

Aucun paramètre de parrainage ni d'alliance n'est modifié dans cette phase. Après la phase
(300 parties) : Zemmour reste écarté dans 62 à 64 % des parties (départ équitable et sondages
actuels), Étincelle reste absente du premier tour par ralliement. Pistes proposées pour une phase
suivante, à mesurer au banc : promesses de départ du niveau d'organisation « aucune » (200 → 300,
commune à sept personnalités) et probabilité hebdomadaire de ralliement (`alliances.probabiliteHebdo`,
0,25 → 0,10, environ 65 % sur dix semaines au lieu de 94 %).
