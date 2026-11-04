# Banc d'essai d'équilibrage : référence avant la phase 24

Mesures du banc `pnpm sim:equilibrage` sur le jeu de règles presidentielle-2027@21.0.0 (commit 1e78a0a, avant toute modification de la phase 24), format court, 300 parties par scénario, graines `equilibrage-<scénario>-<n>`. Les candidats et leurs résultats sont simulés ; ces chiffres décrivent le moteur du jeu, jamais une prévision.

Stratégies du joueur : `passif` (aucune action), `naif` (deux rencontres d'élus, un meeting, une interview par semaine), `ia` (le joueur confié à l'IA du jeu, style équilibré). « Avec programme » : dans cette référence, le joueur annonce le programme du candidat fictif le plus proche (deux propositions par semaine) ; après la phase 24, le programme de départ suggéré du QG. Les scénarios « incarner une personnalité » mesurés avant la phase sont limités à Marine Le Pen, Jean-Luc Mélenchon, Raphaël Glucksmann et Édouard Philippe (durée du banc).

### Observateur, adversaires fictifs (`observateur-fictifs`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 98,7 % | 98,7 % | 0,0 % | 22,1 % |
| Antoine Rivière | 1,0 % | 91,7 % | 0,0 % | 20,6 % |
| Julien Castaing | 0,3 % | 0,7 % | 0,0 % | 14,8 % |
| Mathieu Laborde | 0,0 % | 9,0 % | 0,0 % | 17,2 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 14,0 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,3 % |

### Observateur, personnalités réelles (départ équitable) (`observateur-reels-equitable`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Gabriel Attal | 74,0 % | 90,0 % | 0,0 % | 10,6 % |
| Édouard Philippe | 23,7 % | 39,0 % | 0,0 % | 8,7 % |
| Raphaël Glucksmann | 1,3 % | 9,3 % | 0,0 % | 7,8 % |
| Olivier Becht | 1,0 % | 1,7 % | 0,0 % | 6,8 % |
| Marine Le Pen | 0,0 % | 59,0 % | 0,0 % | 9,1 % |
| Xavier Bertrand | 0,0 % | 0,3 % | 0,0 % | 6,2 % |
| Bruno Retailleau | 0,0 % | 0,7 % | 0,0 % | 6,0 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 5,9 % |
| Jean-Luc Mélenchon | 0,0 % | 0,0 % | 0,0 % | 5,9 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 5,1 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 5,1 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 4,8 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 4,8 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 4,7 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 3,9 % |
| Fabien Roussel | 0,0 % | 0,0 % | 0,0 % | 3,7 % |
| Éric Zemmour | 0,0 % | 0,0 % | 61,0 % | 1,0 % |

### Observateur, ressources de Boussole et Pilier échangées (`inverse-boussole-pilier`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 97,0 % | 97,0 % | 0,0 % | 20,8 % |
| Julien Castaing | 1,7 % | 1,7 % | 0,0 % | 15,1 % |
| Antoine Rivière | 1,3 % | 97,3 % | 0,0 % | 21,8 % |
| Mathieu Laborde | 0,0 % | 4,0 % | 0,0 % | 16,9 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 14,1 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,1 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,2 % |

### Candidat personnalisé au centre, decouverte, ia (`personnalise-decouverte-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 97,7 % | 97,7 % | 0,0 % | 20,7 % |
| Julien Castaing | 2,0 % | 2,3 % | 0,0 % | 14,9 % |
| Antoine Rivière | 0,3 % | 98,3 % | 0,0 % | 20,3 % |
| Mathieu Laborde | 0,0 % | 1,7 % | 2,7 % | 15,3 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,0 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,5 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 5,3 % |
| Bastien Roudier | 0,0 % | 0,0 % | 9,3 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, decouverte, ia, avec programme (`personnalise-decouverte-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 77,7 % | 77,7 % | 0,0 % | 17,3 % |
| Joueur | 11,0 % | 11,0 % | 0,0 % | 13,9 % |
| Antoine Rivière | 8,0 % | 97,0 % | 0,0 % | 19,0 % |
| Julien Castaing | 3,3 % | 3,3 % | 0,0 % | 12,9 % |
| Mathieu Laborde | 0,0 % | 11,0 % | 4,0 % | 14,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,3 % | 12,4 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,0 % |
| Bastien Roudier | 0,0 % | 0,0 % | 6,7 % | 0,0 % |

Rang médian du joueur au 1er tour : 4.

### Candidat personnalisé au centre, decouverte, naif (`personnalise-decouverte-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 99,3 % | 99,3 % | 0,0 % | 21,9 % |
| Julien Castaing | 0,7 % | 0,7 % | 0,0 % | 15,8 % |
| Antoine Rivière | 0,0 % | 96,7 % | 0,0 % | 21,2 % |
| Mathieu Laborde | 0,0 % | 3,3 % | 5,7 % | 15,2 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,0 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,0 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 1,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 12,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, decouverte, passif (`personnalise-decouverte-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 99,0 % | 99,0 % | 0,0 % | 22,4 % |
| Julien Castaing | 1,0 % | 2,3 % | 0,0 % | 16,2 % |
| Antoine Rivière | 0,0 % | 97,7 % | 0,0 % | 21,6 % |
| Mathieu Laborde | 0,0 % | 1,0 % | 5,0 % | 15,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,4 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,8 % |
| Joueur | 0,0 % | 0,0 % | 94,3 % | 0,1 % |
| Bastien Roudier | 0,0 % | 0,0 % | 9,7 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, accessible, ia (`personnalise-accessible-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 99,3 % | 99,3 % | 0,0 % | 21,1 % |
| Antoine Rivière | 0,7 % | 90,3 % | 0,0 % | 20,0 % |
| Mathieu Laborde | 0,0 % | 10,0 % | 0,0 % | 16,7 % |
| Julien Castaing | 0,0 % | 0,3 % | 0,0 % | 14,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,7 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,7 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 3,3 % |
| Bastien Roudier | 0,0 % | 0,0 % | 1,0 % | 0,1 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, accessible, ia, avec programme (`personnalise-accessible-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 89,3 % | 89,3 % | 0,0 % | 18,7 % |
| Antoine Rivière | 10,0 % | 90,3 % | 0,0 % | 19,0 % |
| Julien Castaing | 0,7 % | 0,7 % | 0,0 % | 13,2 % |
| Mathieu Laborde | 0,0 % | 19,3 % | 0,0 % | 16,3 % |
| Élise Marchetti | 0,0 % | 0,3 % | 0,0 % | 13,3 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,2 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 9,0 % |
| Bastien Roudier | 0,0 % | 0,0 % | 1,7 % | 0,2 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, accessible, naif (`personnalise-accessible-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 99,7 % | 99,7 % | 0,0 % | 21,9 % |
| Julien Castaing | 0,3 % | 1,0 % | 0,0 % | 15,0 % |
| Antoine Rivière | 0,0 % | 92,3 % | 0,0 % | 20,3 % |
| Mathieu Laborde | 0,0 % | 7,0 % | 0,0 % | 17,2 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,7 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,9 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 0,7 % |
| Bastien Roudier | 0,0 % | 0,0 % | 1,0 % | 0,3 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, accessible, passif (`personnalise-accessible-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 98,3 % | 98,3 % | 0,0 % | 22,2 % |
| Antoine Rivière | 1,3 % | 91,0 % | 0,0 % | 20,5 % |
| Julien Castaing | 0,3 % | 1,0 % | 0,0 % | 15,1 % |
| Mathieu Laborde | 0,0 % | 9,7 % | 0,0 % | 17,2 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,8 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 2,3 % | 0,2 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, standard, ia (`personnalise-standard-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 98,3 % | 98,3 % | 0,0 % | 21,3 % |
| Antoine Rivière | 1,3 % | 92,3 % | 0,0 % | 20,4 % |
| Julien Castaing | 0,3 % | 0,7 % | 0,0 % | 14,4 % |
| Mathieu Laborde | 0,0 % | 8,7 % | 0,0 % | 16,9 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,9 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,8 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 2,1 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,2 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, standard, ia, avec programme (`personnalise-standard-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 90,3 % | 90,3 % | 0,0 % | 19,5 % |
| Antoine Rivière | 7,0 % | 90,0 % | 0,0 % | 19,6 % |
| Julien Castaing | 2,7 % | 2,7 % | 0,0 % | 13,6 % |
| Mathieu Laborde | 0,0 % | 17,0 % | 0,0 % | 16,5 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,6 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,5 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 6,6 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,2 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, standard, naif (`personnalise-standard-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 99,7 % | 99,7 % | 0,0 % | 22,1 % |
| Julien Castaing | 0,3 % | 0,3 % | 0,0 % | 14,5 % |
| Antoine Rivière | 0,0 % | 90,0 % | 0,0 % | 20,4 % |
| Mathieu Laborde | 0,0 % | 10,0 % | 0,0 % | 17,2 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,9 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,1 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 0,5 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,3 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, standard, passif (`personnalise-standard-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 99,0 % | 99,0 % | 0,0 % | 22,2 % |
| Julien Castaing | 1,0 % | 1,0 % | 0,0 % | 14,7 % |
| Antoine Rivière | 0,0 % | 90,3 % | 0,0 % | 20,5 % |
| Mathieu Laborde | 0,0 % | 9,7 % | 0,0 % | 17,3 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 14,2 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 11,0 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,1 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, expert, ia (`personnalise-expert-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 98,0 % | 98,0 % | 0,0 % | 22,5 % |
| Julien Castaing | 1,7 % | 2,3 % | 0,0 % | 13,9 % |
| Antoine Rivière | 0,3 % | 95,0 % | 0,0 % | 21,2 % |
| Mathieu Laborde | 0,0 % | 4,7 % | 0,0 % | 16,0 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,3 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,6 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 1,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,5 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, expert, ia, avec programme (`personnalise-expert-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 94,7 % | 94,7 % | 0,0 % | 20,3 % |
| Antoine Rivière | 3,7 % | 96,7 % | 0,0 % | 20,7 % |
| Julien Castaing | 1,7 % | 2,0 % | 0,0 % | 13,0 % |
| Mathieu Laborde | 0,0 % | 6,7 % | 0,0 % | 15,7 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,3 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,3 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 6,4 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,4 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, expert, naif (`personnalise-expert-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 94,7 % | 94,7 % | 0,0 % | 22,8 % |
| Antoine Rivière | 3,0 % | 95,0 % | 0,0 % | 21,7 % |
| Julien Castaing | 2,3 % | 2,3 % | 0,0 % | 14,2 % |
| Mathieu Laborde | 0,0 % | 7,7 % | 0,0 % | 16,2 % |
| Élise Marchetti | 0,0 % | 0,3 % | 0,0 % | 13,5 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,8 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,6 % |
| Joueur | 0,0 % | 0,0 % | 43,0 % | 0,2 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, expert, passif (`personnalise-expert-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 98,7 % | 98,7 % | 0,0 % | 23,0 % |
| Antoine Rivière | 0,7 % | 97,0 % | 0,0 % | 21,7 % |
| Julien Castaing | 0,7 % | 1,0 % | 0,0 % | 14,2 % |
| Mathieu Laborde | 0,0 % | 3,3 % | 0,0 % | 16,1 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,6 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,7 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,5 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, legende, ia (`personnalise-legende-ia`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 96,7 % | 96,7 % | 0,0 % | 22,7 % |
| Antoine Rivière | 2,7 % | 93,7 % | 0,0 % | 23,5 % |
| Julien Castaing | 0,7 % | 1,0 % | 0,0 % | 14,3 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,4 % |
| Mathieu Laborde | 0,0 % | 8,7 % | 0,0 % | 12,9 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,5 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 2,1 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,6 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, legende, ia, avec programme (`personnalise-legende-ia-programme`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 95,0 % | 95,0 % | 0,0 % | 20,7 % |
| Antoine Rivière | 4,3 % | 93,7 % | 0,0 % | 22,5 % |
| Julien Castaing | 0,7 % | 0,7 % | 0,0 % | 12,9 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,1 % |
| Mathieu Laborde | 0,0 % | 10,7 % | 0,0 % | 12,7 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,4 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 7,1 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,5 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, legende, naif (`personnalise-legende-naif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 98,7 % | 98,7 % | 0,0 % | 23,7 % |
| Antoine Rivière | 1,0 % | 97,3 % | 0,0 % | 24,3 % |
| Julien Castaing | 0,3 % | 0,7 % | 0,0 % | 14,4 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,7 % |
| Mathieu Laborde | 0,0 % | 3,3 % | 0,0 % | 12,5 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,7 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,5 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Candidat personnalisé au centre, legende, passif (`personnalise-legende-passif`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 97,3 % | 97,3 % | 0,0 % | 23,7 % |
| Antoine Rivière | 1,7 % | 94,0 % | 0,0 % | 23,9 % |
| Julien Castaing | 1,0 % | 1,3 % | 0,0 % | 14,5 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 13,5 % |
| Mathieu Laborde | 0,0 % | 7,3 % | 0,0 % | 13,0 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,8 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,6 % |
| Joueur | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 7.

### Position miroir (droite), joueur IA, Standard (`miroir-droite`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 99,0 % | 99,0 % | 0,0 % | 20,3 % |
| Julien Castaing | 1,0 % | 4,3 % | 0,0 % | 14,3 % |
| Antoine Rivière | 0,0 % | 66,0 % | 0,0 % | 17,0 % |
| Mathieu Laborde | 0,0 % | 29,3 % | 0,0 % | 15,8 % |
| Élise Marchetti | 0,0 % | 1,3 % | 0,0 % | 13,8 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 10,9 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 7,5 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,3 % |

Rang médian du joueur au 1er tour : 7.

### Position miroir (gauche), joueur IA, Standard (`miroir-gauche`, 300 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Claire Delorme | 98,0 % | 98,0 % | 0,0 % | 20,9 % |
| Antoine Rivière | 2,0 % | 92,0 % | 0,0 % | 20,3 % |
| Mathieu Laborde | 0,0 % | 10,0 % | 0,0 % | 16,9 % |
| Julien Castaing | 0,0 % | 0,0 % | 0,0 % | 12,8 % |
| Élise Marchetti | 0,0 % | 0,0 % | 0,0 % | 12,3 % |
| Nadia Ferrand | 0,0 % | 0,0 % | 0,0 % | 9,8 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 6,9 % |
| Bastien Roudier | 0,0 % | 0,0 % | 0,0 % | 0,1 % |

Rang médian du joueur au 1er tour : 7.

