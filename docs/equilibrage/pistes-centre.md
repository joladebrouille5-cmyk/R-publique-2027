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
| (a) | | 0,2 | 77 % | 4 | 3 | insuffisant |
| (a) + (d) moyens de Boussole réduits (notoriété 45 %, budget 5 M€) | `saturationProximite`, `candidatsFictifs[adv-boussole].ressources` | 0,3 | 44 % | 4 | 3 | critères atteints, de justesse |
| (a) + (d) moyens de Boussole réduits (notoriété 35 %, budget 4 M€, popularité 30 %) | idem | 0,3 | 35 % (Rivière 41 %) | 4 | 3 | critères atteints |
| **(a) + (d) retenue** : moyens de Boussole réduits (notoriété 35 %, budget 4 M€, popularité 30 %) | idem | **0,4** | 37 % (Rivière 43 %) | 4 | 3 | **retenue** |
| (d) seule, sans saturation | `candidatsFictifs[adv-boussole].ressources` | — | 78 % | 3 | 2 | insuffisante |
| (b) fidélité de camp (1er tour) | `modele.fideliteCamp` | 0,5 | 100 % | 1 | 2 | écartée (aggrave) |
| (c) abstention différentielle (2nd tour) | `modele.secondTour.abstentionDifferentielle` | 0,4 (au lieu de 0,12) | 98 % | 3 | 2 | écartée (sans effet) |

## Valeurs retenues

Saturation à **0,4** et moyens de départ de Boussole ramenés au niveau des autres candidats fictifs
(notoriété 35 %, budget 4 M€, popularité 30 %, militants inchangés). La saturation à 0,3 satisfait
aussi les cibles des candidats fictifs, mais renforce Marine Le Pen au second tour en départ
« Sondages actuels » (88 % de victoires, au-dessus des 85 % visés) ; à 0,4, elle gagne 84 %
(100 parties, décroissance du socle 0,985 / 0,95). Effet sur les personnalités réelles en départ
équitable (saturation 0,3) : la personnalité la plus victorieuse passe de 74 % (Gabriel Attal,
référence) à 38 %.

Aucune piste n'est ciblée sur une personne réelle : la saturation vaut pour tous les candidats, et
seule une fiche fictive (Boussole) voit ses moyens changer.

## Mesure finale (300 parties, jeu de règles 22.0.0)

Observateur, candidats fictifs : Antoine Rivière 49,0 %, Claire Delorme 32,3 %, Mathieu Laborde
15,0 %, Julien Castaing 3,7 % de victoires (4 vainqueurs ; Rivière, Laborde et Delorme qualifiés
dans plus de 10 % des parties). La cible de 45 % est manquée de 4 points ; l'avantage est passé du
centre (Boussole) au centre droit (Pilier), qui profite à son tour de la proximité saturée au second
tour. Effet secondaire mesuré : la position miroir de droite (joueur IA) gagne 13,7 %, celle de
gauche jamais (la gauche fictive compte quatre candidats). Détail : [référence après](./reference-phase-24-apres.md).
