# Banc d'essai d'équilibrage : mesures après la phase 24

Mesures du banc `pnpm sim:equilibrage` sur le jeu de règles presidentielle-2027@22.0.0 (moteur 0.24.0), format court, 300 parties par scénario, graines `equilibrage-<scénario>-<n>` (les mêmes que la [référence avant](./reference-phase-24-avant.md)). Les candidats et leurs résultats sont simulés ; ces chiffres décrivent le moteur du jeu, jamais une prévision. Le programme « avec programme » est le programme de départ suggéré du QG. Les scénarios « incarner » et « sondages actuels » partent du socle calibré sur les sondages publiés ([SOURCES §8 quindecies](../SOURCES.md)).

## Critères du brief

| Critère (cible) | Avant (21.0.0) | Après (22.0.0) | Atteint |
|---|---|---|---|
| Candidat personnalisé au centre, IA + programme, Découverte (35–60 %) | 11,0 % | 50,0 % | oui |
| Candidat personnalisé au centre, IA + programme, Accessible (entre Découverte et Standard) | 0,0 % | 35,7 % | oui (strictement décroissant) |
| Candidat personnalisé au centre, IA + programme, Standard (15–30 %) | 0,0 % | 16,7 % | oui |
| Candidat personnalisé au centre, IA + programme, Expert (5–15 %) | 0,0 % | 12,7 % | oui |
| Candidat personnalisé au centre, IA + programme, Légende (1–8 %) | 0,0 % | 2,0 % | oui |
| Standard sans programme : au moins 5 points de victoires de moins qu’avec | 0,0 % | 0,0 % | oui (16,7 points d’écart avec le programme) |
| Observateur, fictifs : aucun candidat au-dessus de 45 % | Claire Delorme 98,7 % | Antoine Rivière 49,0 % | **non** (de justesse) |
| Observateur, fictifs : au moins 4 vainqueurs différents | 3 | 4 | oui |
| Observateur, fictifs : au moins 3 qualifiés différents dans plus de 10 % des parties | 2 | 3 | oui |
| Réels, départ équitable : aucun candidat au-dessus de 55 % | Gabriel Attal 74,0 % | Gabriel Attal 41,0 % | oui |
| Sondages actuels : Marine Le Pen qualifiée ≥ 85 % | — | 100,0 % | oui |
| Sondages actuels : Mélenchon 2e qualifié le plus fréquent | — | 79,7 % (Glucksmann 15,3 %) | oui |
| Sondages actuels : Marine Le Pen gagne 55 à 85 % | — | 86,7 % | **non** (de justesse) |
| Incarner Édouard Philippe (IA, Standard) : au moins 5 % de victoires | 14,0 % | 0,7 % | **non** (recul : départ équitable avant, sondages après) |
| Incarner Raphaël Glucksmann (IA, Standard) : au moins 5 % de victoires | 0,0 % | 1,7 % | **non** |
| Incarner Jean-Luc Mélenchon (IA, Standard) : au moins 5 % de victoires | 0,0 % | 0,3 % | **non** |
| Positions miroirs : écart ≤ 3 points (victoires ; score T1) | gauche 0,0 %, droite 0,0 % ; T1 6,9 % / 7,5 % | gauche 0,0 %, droite 13,7 % ; T1 11,5 % / 14,4 % | **non** (recul : écart de 0,6 point avant) |

Réglages retenus et pistes écartées : [pistes du centre](./pistes-centre.md), [diagnostics](./diagnostics.md) ; valeurs dans le jeu de règles (`modele`, `departSondages`, `rattrapageNotoriete`, `jeu.ressourcesInitiales`, `programme.minimumRecommande`, fiche fictive de Boussole).

### Critères non atteints

- **Personnalités réelles en « Sondages actuels »** (Le Pen 86,7 % ; Philippe, Glucksmann et Mélenchon incarnés sous 2 %) : la moyenne des duels publiés donne Marine Le Pen gagnante face à chacun ; le moteur reproduit ce point de départ et la campagne simulée ne le renverse presque jamais. Les rendre jouables demanderait une règle générale de second tour moins déterministe (incertitude du jour du scrutin, rejet d'un finaliste), à concevoir et mesurer dans une phase suivante, sans règle ciblée sur une personne.
- **Positions miroirs** : la gauche fictive compte quatre candidats sur 41 % de l'électorat, la droite deux ou trois sur 45 % ; avec la proximité qui sature, le joueur placé à droite gagne 13,7 % et celui placé à gauche jamais. Recul par rapport à la référence, où aucun des deux ne gagnait (écart de 0,6 point au premier tour).
- **Observateur, fictifs** : Antoine Rivière gagne 49 % des parties (43 % sur 100 parties pendant le réglage) : cible de 45 % manquée de 4 points.

## Détail des scénarios


### Observateur, adversaires fictifs (`observateur-fictifs`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 49,0 % | 84,7 % | 0,0 % | 20,7 % |
| Claire Delorme | 32,3 % | 50,0 % | 0,0 % | 18,6 % |
| Mathieu Laborde | 15,0 % | 59,7 % | 0,0 % | 19,0 % |
| Julien Castaing | 3,7 % | 5,7 % | 0,0 % | 15,5 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,8 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,7 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 2,7 % |

### Observateur, personnalités réelles (départ équitable) (`observateur-reels-equitable`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Gabriel Attal | 41,0 % | 75,7 % | 0,0 % | 8,9 % |
| Marine Le Pen | 31,7 % | 53,7 % | 0,0 % | 8,2 % |
| Édouard Philippe | 18,0 % | 33,7 % | 0,0 % | 7,7 % |
| Jean-Luc Mélenchon | 6,0 % | 25,3 % | 0,0 % | 7,6 % |
| Raphaël Glucksmann | 1,3 % | 4,7 % | 0,0 % | 6,7 % |
| Xavier Bertrand | 0,7 % | 3,0 % | 0,0 % | 6,4 % |
| David Lisnard | 0,7 % | 1,3 % | 0,0 % | 6,2 % |
| Bruno Retailleau | 0,3 % | 1,3 % | 0,0 % | 6,2 % |
| Olivier Becht | 0,3 % | 1,0 % | 0,0 % | 5,9 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 5,9 % |
| François Asselineau | 0,0 % | 0,3 % | 0,0 % | 5,7 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 5,3 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 4,8 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 4,4 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 4,3 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 4,1 % |
| Éric Zemmour | 0,0 % | 0,0 % | 64,0 % | 1,5 % |

### Observateur, personnalités réelles (sondages actuels) (`observateur-reels-sondages`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Marine Le Pen | 86,7 % | 100,0 % | 0,0 % | 22,6 % |
| Raphaël Glucksmann | 7,0 % | 15,3 % | 0,0 % | 12,7 % |
| Jean-Luc Mélenchon | 4,7 % | 79,7 % | 0,0 % | 14,8 % |
| Édouard Philippe | 1,7 % | 5,0 % | 0,0 % | 11,7 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,4 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 7,1 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,0 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 3,1 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,5 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 2,4 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,5 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,3 % |
| Éric Zemmour | 0,0 % | 0,0 % | 62,3 % | 1,3 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 1,1 % |

### Observateur, ressources de Boussole et Pilier échangées (`inverse-boussole-pilier`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 85,7 % | 91,3 % | 0,0 % | 21,3 % |
| Mathieu Laborde | 9,0 % | 74,3 % | 0,0 % | 19,6 % |
| Antoine Rivière | 4,0 % | 30,0 % | 0,0 % | 17,5 % |
| Julien Castaing | 1,3 % | 4,3 % | 0,0 % | 15,6 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,8 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,6 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 2,5 % |

### Candidat personnalisé au centre, decouverte, ia (`personnalise-decouverte-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 64,0 % | 76,0 % | 0,0 % | 18,8 % |
| Julien Castaing | 19,0 % | 22,0 % | 0,0 % | 16,5 % |
| Antoine Rivière | 16,3 % | 86,3 % | 0,0 % | 19,7 % |
| Mathieu Laborde | 0,7 % | 14,7 % | 2,3 % | 15,7 % |
| Nadia Ferrand | 0,0 % | 1,0 % | 0,0 % | 12,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,6 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 6,4 % |
| Bastien Roudier | 0,0 % | 0,0 % | 13,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, decouverte, ia, avec programme (`personnalise-decouverte-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Joueur | 50,0 % | 50,0 % | 0,0 % | 16,7 % |
| Claire Delorme | 33,3 % | 44,3 % | 0,0 % | 16,5 % |
| Julien Castaing | 9,0 % | 11,7 % | 0,0 % | 14,4 % |
| Antoine Rivière | 7,7 % | 87,0 % | 0,0 % | 18,2 % |
| Mathieu Laborde | 0,0 % | 6,7 % | 4,3 % | 13,9 % |
| Nadia Ferrand | 0,0 % | 0,3 % | 0,0 % | 11,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,3 % | 8,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 12,3 % | 0,0 % |

Rang médian du joueur au 1er tour : 2.

### Candidat personnalisé au centre, decouverte, naif (`personnalise-decouverte-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 65,0 % | 73,3 % | 0,0 % | 19,6 % |
| Julien Castaing | 23,0 % | 25,3 % | 0,0 % | 17,6 % |
| Antoine Rivière | 10,7 % | 87,0 % | 0,0 % | 20,7 % |
| Mathieu Laborde | 1,3 % | 14,3 % | 5,3 % | 15,8 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 13,0 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,9 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 2,4 % |
| Bastien Roudier | 0,0 % | 0,0 % | 14,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, decouverte, passif (`personnalise-decouverte-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 63,3 % | 74,0 % | 0,0 % | 20,1 % |
| Julien Castaing | 22,0 % | 26,0 % | 0,0 % | 18,0 % |
| Antoine Rivière | 14,7 % | 86,7 % | 0,0 % | 21,2 % |
| Mathieu Laborde | 0,0 % | 13,3 % | 5,0 % | 16,2 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 13,1 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,3 % |
| Joueur | 0,0 % | 0,0 % | 94,7 % | 0,2 % |
| Bastien Roudier | 0,0 % | 0,0 % | 12,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, accessible, ia (`personnalise-accessible-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 48,3 % | 85,3 % | 0,0 % | 19,5 % |
| Claire Delorme | 43,0 % | 52,0 % | 0,0 % | 17,8 % |
| Julien Castaing | 4,7 % | 5,3 % | 0,0 % | 14,8 % |
| Mathieu Laborde | 4,0 % | 57,3 % | 0,0 % | 18,1 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,1 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,0 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 6,2 % |
| Bastien Roudier | 0,0 % | 0,0 % | 3,0 % | 1,5 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, accessible, ia, avec programme (`personnalise-accessible-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Joueur | 35,7 % | 35,7 % | 0,0 % | 15,9 % |
| Antoine Rivière | 33,3 % | 78,7 % | 0,0 % | 18,0 % |
| Claire Delorme | 23,3 % | 29,7 % | 0,0 % | 15,5 % |
| Mathieu Laborde | 5,0 % | 53,3 % | 0,0 % | 16,6 % |
| Julien Castaing | 2,7 % | 2,7 % | 0,0 % | 12,8 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,9 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,0 % |
| Bastien Roudier | 0,0 % | 0,0 % | 1,7 % | 0,4 % |

Rang médian du joueur au 1er tour : 3.

### Candidat personnalisé au centre, accessible, naif (`personnalise-accessible-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 45,7 % | 80,3 % | 0,0 % | 20,1 % |
| Claire Delorme | 41,0 % | 50,3 % | 0,0 % | 18,7 % |
| Julien Castaing | 7,7 % | 8,3 % | 0,0 % | 15,7 % |
| Mathieu Laborde | 5,7 % | 61,0 % | 0,0 % | 18,8 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,7 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,1 % |
| Bastien Roudier | 0,0 % | 0,0 % | 4,0 % | 2,4 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 1,5 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, accessible, passif (`personnalise-accessible-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 46,7 % | 54,3 % | 0,0 % | 19,0 % |
| Antoine Rivière | 44,0 % | 78,0 % | 0,0 % | 20,5 % |
| Mathieu Laborde | 5,0 % | 62,3 % | 0,0 % | 19,1 % |
| Julien Castaing | 4,3 % | 5,3 % | 0,0 % | 15,9 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,8 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,6 % |
| Bastien Roudier | 0,0 % | 0,0 % | 4,3 % | 2,1 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, standard, ia (`personnalise-standard-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 51,3 % | 89,0 % | 0,0 % | 19,9 % |
| Claire Delorme | 29,7 % | 49,0 % | 0,0 % | 17,6 % |
| Mathieu Laborde | 15,3 % | 57,3 % | 0,0 % | 18,0 % |
| Julien Castaing | 3,7 % | 4,7 % | 0,0 % | 14,6 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,9 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,2 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 5,7 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 1,2 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, standard, ia, avec programme (`personnalise-standard-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 39,3 % | 84,3 % | 0,0 % | 18,3 % |
| Claire Delorme | 23,7 % | 38,3 % | 0,0 % | 15,6 % |
| Mathieu Laborde | 17,7 % | 55,7 % | 0,0 % | 16,8 % |
| Joueur | 16,7 % | 16,7 % | 0,0 % | 14,5 % |
| Julien Castaing | 2,7 % | 5,0 % | 0,0 % | 12,9 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,2 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,3 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,4 % |

Rang médian du joueur au 1er tour : 4.

### Candidat personnalisé au centre, standard, naif (`personnalise-standard-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 51,0 % | 81,7 % | 0,0 % | 20,4 % |
| Claire Delorme | 31,0 % | 53,3 % | 0,0 % | 18,3 % |
| Mathieu Laborde | 15,0 % | 60,7 % | 0,0 % | 18,9 % |
| Julien Castaing | 3,0 % | 4,3 % | 0,0 % | 15,2 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,9 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 11,7 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 2,5 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 1,1 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, standard, passif (`personnalise-standard-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 55,0 % | 86,0 % | 0,0 % | 20,7 % |
| Claire Delorme | 28,3 % | 48,7 % | 0,0 % | 18,7 % |
| Mathieu Laborde | 14,7 % | 61,3 % | 0,0 % | 19,1 % |
| Julien Castaing | 2,0 % | 4,0 % | 0,0 % | 15,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 12,1 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 2,1 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, expert, ia (`personnalise-expert-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 68,3 % | 96,0 % | 0,0 % | 21,6 % |
| Claire Delorme | 20,3 % | 45,0 % | 0,0 % | 17,1 % |
| Julien Castaing | 7,0 % | 9,3 % | 0,0 % | 14,3 % |
| Mathieu Laborde | 4,3 % | 49,3 % | 0,0 % | 17,2 % |
| Nadia Ferrand | 0,0 % | 0,3 % | 0,0 % | 10,8 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,5 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 5,1 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 3,4 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, expert, ia, avec programme (`personnalise-expert-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 65,0 % | 97,0 % | 0,0 % | 20,2 % |
| Claire Delorme | 16,3 % | 29,7 % | 0,0 % | 15,1 % |
| Joueur | 12,7 % | 13,7 % | 0,0 % | 13,7 % |
| Julien Castaing | 3,3 % | 5,3 % | 0,0 % | 12,6 % |
| Mathieu Laborde | 2,7 % | 54,3 % | 0,0 % | 16,3 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,9 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,0 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 1,3 % |

Rang médian du joueur au 1er tour : 4.

### Candidat personnalisé au centre, expert, naif (`personnalise-expert-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 63,0 % | 96,3 % | 0,0 % | 22,3 % |
| Claire Delorme | 25,7 % | 46,3 % | 0,0 % | 17,6 % |
| Mathieu Laborde | 5,7 % | 49,0 % | 0,0 % | 17,8 % |
| Julien Castaing | 5,7 % | 8,3 % | 0,0 % | 15,0 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,2 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,4 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 4,8 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 1,0 % |

Rang médian du joueur au 1er tour : 8.

### Candidat personnalisé au centre, expert, passif (`personnalise-expert-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 71,0 % | 95,3 % | 0,0 % | 22,6 % |
| Claire Delorme | 18,3 % | 44,7 % | 0,0 % | 17,6 % |
| Julien Castaing | 7,3 % | 11,0 % | 0,0 % | 15,0 % |
| Mathieu Laborde | 3,3 % | 48,7 % | 0,0 % | 18,0 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,3 % |
| Élise Marchetti | 0,0 % | 0,3 % | 0,0 % | 10,8 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 4,7 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 8.

### Candidat personnalisé au centre, legende, ia (`personnalise-legende-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 78,7 % | 91,0 % | 0,0 % | 22,4 % |
| Claire Delorme | 13,3 % | 61,0 % | 0,0 % | 19,0 % |
| Mathieu Laborde | 6,7 % | 44,0 % | 0,0 % | 13,6 % |
| Julien Castaing | 1,3 % | 4,0 % | 0,0 % | 14,7 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,8 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,5 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 4,6 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 4,4 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, legende, ia, avec programme (`personnalise-legende-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 79,7 % | 93,3 % | 0,0 % | 21,1 % |
| Claire Delorme | 12,7 % | 55,7 % | 0,0 % | 17,2 % |
| Mathieu Laborde | 5,7 % | 45,7 % | 0,0 % | 13,1 % |
| Joueur | 2,0 % | 3,7 % | 0,0 % | 12,5 % |
| Julien Castaing | 0,0 % | 1,7 % | 0,0 % | 13,0 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,5 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,4 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 2,1 % |

Rang médian du joueur au 1er tour : 5.

### Candidat personnalisé au centre, legende, naif (`personnalise-legende-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 82,3 % | 94,7 % | 0,0 % | 23,8 % |
| Claire Delorme | 12,0 % | 72,0 % | 0,0 % | 20,3 % |
| Mathieu Laborde | 3,3 % | 27,0 % | 0,0 % | 11,9 % |
| Julien Castaing | 2,3 % | 6,3 % | 0,0 % | 15,4 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,6 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 5,6 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 0,9 % |

Rang médian du joueur au 1er tour : 8.

### Candidat personnalisé au centre, legende, passif (`personnalise-legende-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 78,7 % | 92,7 % | 0,0 % | 23,3 % |
| Claire Delorme | 15,3 % | 69,0 % | 0,0 % | 20,6 % |
| Mathieu Laborde | 4,7 % | 34,0 % | 0,0 % | 13,5 % |
| Julien Castaing | 1,3 % | 4,3 % | 0,0 % | 15,4 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,5 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,8 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 4,9 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 8.

### Position miroir (droite), joueur IA, Standard (`miroir-droite`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 35,0 % | 50,7 % | 0,0 % | 16,0 % |
| Antoine Rivière | 32,7 % | 54,0 % | 0,0 % | 16,3 % |
| Joueur | 13,7 % | 18,7 % | 0,0 % | 14,4 % |
| Mathieu Laborde | 11,3 % | 67,0 % | 0,0 % | 16,6 % |
| Julien Castaing | 7,3 % | 9,3 % | 0,0 % | 13,8 % |
| Élise Marchetti | 0,0 % | 0,3 % | 0,0 % | 11,5 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,7 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,8 % |

Rang médian du joueur au 1er tour : 4.

### Position miroir (gauche), joueur IA, Standard (`miroir-gauche`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Antoine Rivière | 54,0 % | 85,3 % | 0,0 % | 19,3 % |
| Claire Delorme | 28,7 % | 52,3 % | 0,0 % | 17,2 % |
| Mathieu Laborde | 15,7 % | 60,3 % | 0,0 % | 17,7 % |
| Julien Castaing | 1,7 % | 1,7 % | 0,0 % | 13,2 % |
| Joueur | 0,0 % | 0,3 % | 0,0 % | 11,5 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 10,7 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,2 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,2 % |

Rang médian du joueur au 1er tour : 5.

### Incarner Raphaël Glucksmann, joueur IA, Standard (`incarne-reel-glucksmann`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Marine Le Pen | 94,3 % | 100,0 % | 0,0 % | 22,9 % |
| Jean-Luc Mélenchon | 2,0 % | 91,3 % | 0,0 % | 15,4 % |
| Édouard Philippe | 2,0 % | 5,0 % | 0,0 % | 11,9 % |
| Joueur | 1,7 % | 3,7 % | 0,0 % | 11,5 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,5 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 7,3 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,2 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 3,3 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 2,5 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,5 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,5 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,4 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| Éric Zemmour | 0,0 % | 0,0 % | 80,7 % | 0,6 % |

Rang médian du joueur au 1er tour : 4.

### Incarner Marine Le Pen, joueur IA, Standard (`incarne-reel-le-pen`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Joueur | 80,7 % | 100,0 % | 0,0 % | 21,4 % |
| Jean-Luc Mélenchon | 9,3 % | 85,3 % | 0,0 % | 15,1 % |
| Raphaël Glucksmann | 7,3 % | 11,0 % | 0,0 % | 12,7 % |
| Édouard Philippe | 2,7 % | 3,7 % | 0,0 % | 11,8 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,4 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 7,3 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,2 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 3,2 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,5 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 2,4 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,5 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,4 % |
| Éric Zemmour | 0,0 % | 0,0 % | 60,3 % | 1,3 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 1,1 % |

Rang médian du joueur au 1er tour : 1.

### Incarner Jean-Luc Mélenchon, joueur IA, Standard (`incarne-reel-melenchon`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Marine Le Pen | 84,7 % | 100,0 % | 0,0 % | 23,1 % |
| Raphaël Glucksmann | 8,7 % | 41,3 % | 0,0 % | 13,2 % |
| Édouard Philippe | 6,3 % | 12,7 % | 0,0 % | 12,0 % |
| Joueur | 0,3 % | 46,0 % | 0,0 % | 13,2 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,5 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 7,3 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,3 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 3,3 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,5 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 2,4 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,5 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,4 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,3 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| Éric Zemmour | 0,0 % | 0,0 % | 82,3 % | 0,6 % |

Rang médian du joueur au 1er tour : 3.

### Incarner Édouard Philippe, joueur IA, Standard (`incarne-reel-philippe`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Marine Le Pen | 79,7 % | 100,0 % | 0,0 % | 22,7 % |
| Jean-Luc Mélenchon | 10,3 % | 82,3 % | 0,0 % | 15,0 % |
| Raphaël Glucksmann | 9,3 % | 16,0 % | 0,0 % | 12,8 % |
| Joueur | 0,7 % | 1,7 % | 0,0 % | 10,9 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,1 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 7,3 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,1 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 3,3 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,5 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 2,4 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,5 % |
| Éric Zemmour | 0,0 % | 0,0 % | 58,0 % | 1,4 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,4 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 1,1 % |

Rang médian du joueur au 1er tour : 4.

