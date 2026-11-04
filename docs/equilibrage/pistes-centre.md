# Avantage structurel du centre : pistes mesurées (phase 24)

Scénario `observateur-fictifs` (sept candidats fictifs, IA, Standard, format court), 100 parties par
piste sauf mention, graines `equilibrage-observateur-fictifs-<n>`. Chaque piste est un paramètre du
jeu de règles (statut `hypothese`) dont la valeur neutre reproduit le comportement d'avant la phase.
Cibles du brief : aucun candidat au-dessus de 45 % de victoires, au moins 4 vainqueurs différents, au
moins 3 qualifiés différents dans plus de 10 % des parties.

## Démonstration : position ou ressources ?

| Mesure (300 parties) | Claire Delorme (Boussole) : victoires | 2nd tour |
|---|---|---|
| Référence (jeu de règles 21.0.0) | 98,7 % | 98,7 % |
| Ressources de Boussole et de Pilier échangées (`inverse-boussole-pilier`) | 97,0 % | 97,0 % |

L'échange des moyens de départ ne change presque rien : l'avantage tient à la **position**. Boussole
(économie 20, société −10) est sur le groupe « centre libéral » (14 % de l'électorat) et, pour
chacun des groupes de gauche (41 %), plus proche que tout candidat de droite : au second tour face à
un candidat de droite, la proximité linéaire lui donne une majorité structurelle.

## Pistes

| Piste | Paramètre | Valeur | Delorme : victoires | Vainqueurs ≥ 1 % | Qualifiés > 10 % | Verdict |
|---|---|---|---|---|---|---|
| (a) proximité qui sature | `modele.saturationProximite` | 1,0 | 96 % | 2 | 3 | insuffisant |
| (a) | | 0,8 | 92 % | 3 | 3 | insuffisant |
| (a) | | 0,6 | 91 % | 4 | 3 | insuffisant |
| (a) | | 0,4 | 81 % | 4 | 3 | insuffisant |
| (a) | | 0,3 | 77 % | 4 | 3 | insuffisant |
| (b) fidélité de camp (1er tour) | `modele.fideliteCamp` | 0,5 | 100 % | 1 | 2 | écartée (aggrave) |
| (c) abstention différentielle (2nd tour) | `modele.secondTour.abstentionDifferentielle` | 0,4 (au lieu de 0,12) | 98 % | 3 | 2 | écartée (sans effet) |
