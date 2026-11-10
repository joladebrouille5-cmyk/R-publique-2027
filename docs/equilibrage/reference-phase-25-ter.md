# Banc d'essai d'équilibrage : phase 25 ter (Teddy Riner)

Mesures du banc `pnpm sim:equilibrage observateur-fictifs personnalise-standard-ia-programme observateur-reels-sondages observateur-reels-equitable incarne-reel-riner --parties 100`
sur le jeu de règles presidentielle-2027@24.0.0 (moteur 0.26.0), format court, 100 parties par
scénario. La phase 25 ter n'a modifié ni mécanisme ni paramètre de campagne : seule une fiche de
personnalité réelle s'ajoute (Teddy Riner, sans parti : notoriété 3, organisation « aucune »,
aucune implantation, position (0, 0) hypothèse). Les candidats et leurs résultats sont simulés ; ces
chiffres décrivent le moteur du jeu, jamais une prévision.

## Cibles existantes

| Critère (cible) | Phase 25 | Phase 25 ter | Tenu |
|---|---|---|---|
| Observateur, fictifs : au moins 4 vainqueurs différents | 4 | 4 (chiffres identiques : Riner n'y figure pas) | oui |
| Observateur, fictifs : au moins 3 qualifiés différents dans plus de 10 % des parties | 4 | 4 | oui |
| Candidat personnalisé au centre, IA + programme, Standard (15–30 %) | 16,0 % | 16,0 % | oui |
| Sondages actuels : Marine Le Pen qualifiée ≥ 85 % | 100,0 % | 100,0 % | oui |
| Sondages actuels : Mélenchon 2e qualifié le plus fréquent | 70,0 % | 78,0 % (Glucksmann 17,0 %) | oui |
| Sondages actuels : Marine Le Pen gagne 55 à 85 % | 82,0 % | 85,0 % | oui (à la borne) |
| Réels, départ équitable : aucun candidat au-dessus de 55 % | — | Attal 52,0 % | oui |
| Observateur, fictifs : aucun candidat au-dessus de 45 % | Rivière 52,0 % | Rivière 52,0 % | toujours manqué (inchangé) |

## Teddy Riner

| Critère (cible) | Mesure | État |
|---|---|---|
| Incarné (IA, Standard, sondages actuels) : qualification au premier tour < 10 % | 0 % (score moyen 0,8 %, rang médian 17e) | atteint |
| … sans être impossible | aucune qualification en 100 parties | non démontré |
| Parrainages réellement difficiles | 0 % d'échec (incarné et en adversaire) | non atteint : les mécanismes existants ne pénalisent pas assez l'absence d'organisation (même constat pour Arthaud et Asselineau) ; à traiter dans une phase d'équilibrage, sans règle ciblée sur une personne |
| Adversaire, départ équitable | 0 % de second tour, 4,8 % au premier tour | — |
| Adversaire, sondages actuels | 0 % de second tour, 0,9 % (jamais testé dans les sondages : socle minimal) | — |

Effet de bord à suivre : un dix-huitième candidat sollicite aussi les élus ; Éric Zemmour échoue
désormais aux parrainages dans 100 % des parties « Sondages actuels » (65 % en phase 25) et Fabien
Roussel dans 20 % (0 %), 15 % en départ équitable. Aucune cible écrite ne porte sur eux.

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



### Candidat personnalisé au centre, standard, ia, avec programme (`personnalise-standard-ia-programme`, 100 parties)

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

Rang médian du joueur au 1er tour : 4.

### Observateur, personnalités réelles (sondages actuels) (`observateur-reels-sondages`, 100 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Marine Le Pen | 85,0 % | 100,0 % | 0,0 % | 23,2 % |
| Raphaël Glucksmann | 7,0 % | 17,0 % | 0,0 % | 13,6 % |
| Jean-Luc Mélenchon | 5,0 % | 78,0 % | 0,0 % | 15,4 % |
| Édouard Philippe | 3,0 % | 5,0 % | 0,0 % | 11,7 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,3 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 7,0 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,2 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 2,9 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,2 % |
| Fabien Roussel | 0,0 % | 0,0 % | 20,0 % | 1,8 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,4 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,3 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,0 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 0,9 % |
| Teddy Riner | 0,0 % | 0,0 % | 0,0 % | 0,9 % |
| Éric Zemmour | 0,0 % | 0,0 % | 100,0 % | 0,0 % |



### Observateur, personnalités réelles (départ équitable) (`observateur-reels-equitable`, 100 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Gabriel Attal | 52,0 % | 72,0 % | 0,0 % | 8,8 % |
| Marine Le Pen | 23,0 % | 54,0 % | 0,0 % | 8,4 % |
| Édouard Philippe | 13,0 % | 24,0 % | 0,0 % | 7,7 % |
| Jean-Luc Mélenchon | 7,0 % | 33,0 % | 0,0 % | 7,8 % |
| Raphaël Glucksmann | 5,0 % | 14,0 % | 0,0 % | 7,2 % |
| Xavier Bertrand | 0,0 % | 1,0 % | 0,0 % | 6,5 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 6,2 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 6,1 % |
| Nathalie Arthaud | 0,0 % | 1,0 % | 0,0 % | 5,6 % |
| Olivier Becht | 0,0 % | 1,0 % | 0,0 % | 5,5 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 5,2 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 4,9 % |
| Teddy Riner | 0,0 % | 0,0 % | 0,0 % | 4,8 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 4,5 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 3,8 % |
| François Ruffin | 0,0 % | 0,0 % | 1,0 % | 3,7 % |
| Fabien Roussel | 0,0 % | 0,0 % | 15,0 % | 3,4 % |
| Éric Zemmour | 0,0 % | 0,0 % | 100,0 % | 0,0 % |



### Incarner Teddy Riner, joueur IA, Standard (`incarne-reel-riner`, 100 parties)

| Candidat | Victoires | 2nd tour | Sans parrainages | Score moyen T1 |
|---|---|---|---|---|
| Marine Le Pen | 76,0 % | 100,0 % | 0,0 % | 22,9 % |
| Raphaël Glucksmann | 15,0 % | 24,0 % | 0,0 % | 13,8 % |
| Jean-Luc Mélenchon | 9,0 % | 75,0 % | 0,0 % | 15,6 % |
| Édouard Philippe | 0,0 % | 1,0 % | 0,0 % | 11,2 % |
| David Lisnard | 0,0 % | 0,0 % | 0,0 % | 8,0 % |
| Bruno Retailleau | 0,0 % | 0,0 % | 0,0 % | 6,9 % |
| Gabriel Attal | 0,0 % | 0,0 % | 0,0 % | 6,4 % |
| Marine Tondelier | 0,0 % | 0,0 % | 0,0 % | 3,1 % |
| Nicolas Dupont-Aignan | 0,0 % | 0,0 % | 0,0 % | 2,3 % |
| Fabien Roussel | 0,0 % | 0,0 % | 3,0 % | 2,1 % |
| Karim Bouamrane | 0,0 % | 0,0 % | 0,0 % | 1,4 % |
| Nathalie Arthaud | 0,0 % | 0,0 % | 0,0 % | 1,3 % |
| Olivier Becht | 0,0 % | 0,0 % | 0,0 % | 1,2 % |
| François Asselineau | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| Xavier Bertrand | 0,0 % | 0,0 % | 0,0 % | 1,1 % |
| François Ruffin | 0,0 % | 0,0 % | 0,0 % | 0,9 % |
| Joueur | 0,0 % | 0,0 % | 0,0 % | 0,8 % |
| Éric Zemmour | 0,0 % | 0,0 % | 100,0 % | 0,0 % |

Rang médian du joueur au 1er tour : 17.

