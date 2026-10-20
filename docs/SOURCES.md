# Sources et données — RÉPUBLIQUE 2027

> Version préliminaire de la phase 0 (20/10/2026). Les jeux de données précis (fichiers, licences, codes) sont **en cours de vérification** et seront complétés dans ce fichier ; rien n'est considéré comme acquis tant que la colonne « Statut » n'indique pas « vérifié ».

## 1. Sources officielles du cahier des charges (§10 et annexe)

| Source | Usage (§10) | URL (annexe du cahier des charges) | Accès depuis l'environnement cloud (20/10/2026) |
|---|---|---|---|
| INSEE — Code officiel géographique | Géographie, codes et rattachements communaux, population, statistiques agrégées | https://www.insee.fr/fr/information/8740222 | accessible |
| Ministère de l'Intérieur | Résultats électoraux | https://www.elections.interieur.gouv.fr/ | refusé (403) |
| Conseil constitutionnel | Cadre de l'élection présidentielle | https://www.conseil-constitutionnel.fr/ | inaccessible |
| Légifrance | Textes juridiques | https://www.legifrance.gouv.fr/ | refusé (403) |
| Service-Public.fr | Règles et textes officiels | https://www.service-public.fr/ | redirection |
| CNCCFP | Comptes et financement de campagne | https://www.cnccfp.fr/ | redirection |
| Assemblée nationale | Composition, travaux, votes | https://www.assemblee-nationale.fr/ | accessible |
| Sénat | Travaux parlementaires | https://www.senat.fr/ | accessible |
| Banque de France | Indicateurs économiques | https://www.banque-france.fr/ | redirection |
| Partis et candidats | Programmes et déclarations officielles | sites officiels, au cas par cas | — |

## 2. Jeux de données à identifier précisément

| Besoin | Phase | Statut |
|---|---|---|
| COG INSEE : millésime le plus récent, nombre de communes, tables de passage (fusions, changements de code) | 4 | en cours de vérification |
| Contours communaux sous licence ouverte couvrant métropole **et** 971, 972, 973, 974, 976 | 4 | en cours de vérification |
| Résultats de la présidentielle 2022 par commune, 1er et 2nd tours, et codification outre-mer / étranger | 4 | en cours de vérification |
| Totaux nationaux officiels 2022 (contrôle d'agrégation) | 4 | en cours de vérification |
| Dates des tours de 2027 | 2 | en cours de vérification |
| Règles des parrainages (présentations) | 5 | en cours de vérification |
| Plafonds de dépenses, remboursement, plafond des dons | 5 | en cours de vérification |
| Données ouvertes de l'Assemblée nationale (députés, groupes, votes) | 6 | en cours de vérification |
| Résultats des législatives par circonscription et contours des circonscriptions | 6 | en cours de vérification |

## 3. Métadonnées obligatoires de chaque import (§10)

Chaque import enregistre dans `DataImport` : source, URL exacte, date de récupération, millésime, licence, période de validité, transformations appliquées, empreinte SHA-256 du fichier brut, version de l'importeur, nombre de lignes, statut. Les mises à jour sont versionnées ; un import qui ne passe pas ses contrôles est rejeté en entier.

## 4. Données de démonstration

Un jeu réduit, commité dans `data/demo/`, permet de jouer hors ligne (§10). S'il est dérivé de données réelles, il en conserve la source et la licence ; s'il est synthétique, il est étiqueté `fictif`.
