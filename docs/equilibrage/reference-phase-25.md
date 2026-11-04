# Banc d'essai d'équilibrage : non-régression de la phase 25

Mesures du banc `pnpm sim:equilibrage observateur-fictifs personnalise-standard-ia-programme observateur-reels-sondages --parties 100`
sur le jeu de règles presidentielle-2027@23.0.0 (moteur 0.25.0), format court, 100 parties par
scénario, graines `equilibrage-<scénario>-<n>`. La phase 25 ajoute l'implantation par département
(gains des cartes Terrain, combos, érosion), le facteur d'utilité « Implantation » et le
multiplicateur local du dépouillement ; les adversaires et le joueur IA du banc posent leurs cartes
Terrain là où un point d'implantation rapporte le plus (inscrits × proximité au bloc arrivé en tête
aux législatives de 2024 × terrain à prendre). Les candidats et leurs résultats sont simulés ; ces
chiffres décrivent le moteur du jeu, jamais une prévision.

Les paramètres d'implantation et de combos sont des hypothèses de jeu (statut `hypothese` du jeu de
règles), sans prétention de mesure.

## Critères atteints en phase 24 : aucun ne se perd

| Critère (cible) | Phase 24 (300 parties) | Phase 25 (100 parties) | Tenu |
|---|---|---|---|
| Observateur, fictifs : au moins 4 vainqueurs différents | 4 | 4 (Rivière, Delorme, Castaing, Laborde) | oui |
| Observateur, fictifs : au moins 3 qualifiés différents dans plus de 10 % des parties | 3 | 4 | oui |
| Candidat personnalisé au centre, IA + programme, Standard (15–30 %) | 16,7 % | 16,0 % | oui |
| Sondages actuels : Marine Le Pen qualifiée ≥ 85 % | 100,0 % | 100,0 % | oui |
| Sondages actuels : Mélenchon 2e qualifié le plus fréquent | 79,7 % | 70,0 % (Glucksmann 22,0 %) | oui |

Critères manqués en phase 24, mesurés à nouveau :

| Critère (cible) | Phase 24 | Phase 25 | État |
|---|---|---|---|
| Sondages actuels : Marine Le Pen gagne 55 à 85 % | 86,7 % | 82,0 % | désormais atteint (100 parties) |
| Observateur, fictifs : aucun candidat au-dessus de 45 % | Rivière 49,0 % | Rivière 52,0 % | toujours manqué |

## Détail des scénarios

### Observateur, adversaires fictifs (`observateur-fictifs`, 100 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 52,0 % | 88,0 % | 0,0 % | 21,3 % |
| Claire Delorme | 30,0 % | 52,0 % | 0,0 % | 18,6 % |
| Julien Castaing | 11,0 % | 18,0 % | 0,0 % | 16,0 % |
| Mathieu Laborde | 7,0 % | 41,0 % | 0,0 % | 18,4 % |
| Élise Marchetti | 0,0 % | 1,0 % | 0,0 % | 12,7 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 1,2 % |

### Candidat personnalisé au centre, Standard, IA, avec programme (`personnalise-standard-ia-programme`, 100 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 53,0 % | 87,0 % | 0,0 % | 18,9 % |
| Claire Delorme | 17,0 % | 30,0 % | 0,0 % | 15,1 % |
| Joueur | 16,0 % | 16,0 % | 0,0 % | 14,1 % |
| Mathieu Laborde | 8,0 % | 60,0 % | 0,0 % | 16,5 % |
| Julien Castaing | 6,0 % | 7,0 % | 0,0 % | 13,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,5 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,3 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,1 % |

Rang médian du joueur au premier tour : 4.

### Observateur, personnalités réelles, sondages actuels (`observateur-reels-sondages`, 100 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Marine Le Pen | 82,0 % | 100,0 % | 0,0 % | 23,1 % |
| Raphaël Glucksmann | 9,0 % | 22,0 % | 0,0 % | 13,6 % |
| Édouard Philippe | 5,0 % | 8,0 % | 0,0 % | 11,6 % |
| Jean-Luc Mélenchon | 4,0 % | 70,0 % | 0,0 % | 15,1 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,1 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 7,1 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,1 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 3,0 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,3 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 2,2 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,4 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,0 % |
| Éric Zemmour | 0,0 % | 0,0 % | 65,0 % | 1,0 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 1,0 % |

Durées sur l'environnement de développement : 69 s, 126 s et 194 s.
