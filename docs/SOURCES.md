# Sources et données — RÉPUBLIQUE 2027

> Vérification de la phase 0 : 20/10/2026.
> **Statuts** : **vérifié** = lu sur la source primaire citée ; **recompté** = vérifié et recompté localement à partir du fichier officiel ; **déduit** = calcul à partir de faits vérifiés ; **non vérifié** = à confirmer avant usage.
> Règle : aucune valeur de ce fichier n'entre dans le jeu sans sa source dans un *ruleset* ou un `DataImport`.

## 1. Sources officielles du cahier des charges (§10 et annexe)

| Source | Usage (§10) | URL | Accès `curl` depuis l'environnement cloud |
|---|---|---|---|
| INSEE — Code officiel géographique | Géographie, codes, population, statistiques | https://www.insee.fr/fr/information/8740222 | accessible |
| Ministère de l'Intérieur | Résultats électoraux | https://www.elections.interieur.gouv.fr/ (données publiées sur data.gouv.fr) | 403 ; data.gouv.fr inaccessible |
| Conseil constitutionnel | Cadre de la présidentielle, proclamations | https://www.conseil-constitutionnel.fr/ | inaccessible |
| Légifrance | Textes juridiques | https://www.legifrance.gouv.fr/ | 403 — **aucun texte de loi n'a pu être lu dans sa version Légifrance** |
| Service-Public.fr | Règles et démarches | https://www.service-public.fr/ | redirection |
| CNCCFP | Financement de campagne | https://www.cnccfp.fr/ | redirection |
| Assemblée nationale | Composition, travaux, votes | https://www.assemblee-nationale.fr/ · https://data.assemblee-nationale.fr/ | accessible |
| Sénat | Travaux parlementaires | https://www.senat.fr/ | accessible |
| Banque de France | Indicateurs économiques | https://www.banque-france.fr/ | redirection |
| IGN (ajouté) | Contours administratifs | https://data.geopf.fr/telechargement/ · https://cartes.gouv.fr/ | accessible |
| Etalab (ajouté) | Contours administratifs prêts à l'emploi | https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/ | accessible (réponses intermittentes) |

---

## 2. Géographie

### 2.1 Code officiel géographique (INSEE)

| Fait | Valeur | Statut | Source |
|---|---|---|---|
| Dernier millésime | **COG 2026** (au 1er janvier 2026, mis à jour le 24/02/2026) | vérifié | https://www.insee.fr/fr/information/8740222 ; index des millésimes : https://www.insee.fr/fr/information/2560452 |
| Communes au 1er janvier 2026 | **34 875** (`TYPECOM = COM`) | recompté | `v_commune_2026.csv` du COG 2026 |
| dont métropole (Corse incluse) | 34 746 | vérifié | idem |
| dont DROM | **129** : 971 Guadeloupe 32 · 972 Martinique 34 · 973 Guyane 22 · 974 La Réunion 24 · 976 Mayotte 17 | recompté | idem (mêmes nombres au COG 2022) |
| Autres lignes du fichier | 45 arrondissements municipaux (Paris 20, Marseille 16, Lyon 9), 2 105 communes déléguées, 471 communes associées | vérifié | idem |
| Communes au COG 2022 (géographie de la présidentielle 2022) | **34 955** | vérifié | https://www.insee.fr/fr/statistiques/fichier/6051727/commune_2022.csv |
| Évolution 2022 → 2026 | −80 communes ; communes nouvelles au 1er janvier 2023 (8), 2024 (11), 2025 (46) ; **rétablissements (scissions) en 2024 et 2025** ; aucune commune nouvelle entre le 2 janvier 2025 et le 1er janvier 2026 | vérifié | fichier des mouvements ci-dessous |
| Table de passage | `v_mvt_commune_2026.csv` (mouvements depuis 1943 : `MOD`, `DATE_EFF`, `COM_AV`, `COM_AP`) ; tables prêtes à l'emploi 2003–2026 | vérifié | https://www.insee.fr/fr/statistiques/fichier/8740222/v_mvt_commune_2026.csv · https://www.insee.fr/fr/information/7671867 |
| Licence | Licence Ouverte (`fr-lo` sur la fiche data.gouv.fr) | vérifié | fiche data.gouv.fr du COG |

**Conséquence** : projeter les résultats 2022 sur la carte 2026 exige des fusions (somme exacte) **et** des scissions (ventilation estimée), voir [ARCHITECTURE §5.4](./ARCHITECTURE.md#54-pipeline-géographique-packagesdata-import).

### 2.2 Contours communaux

| Option | Couverture | Licence | Statut | Remarques |
|---|---|---|---|---|
| **IGN ADMIN EXPRESS COG CARTO 4-0, édition 2026-01-01** | métropole + DROM + COM ; version « France entière » en WGS84 (GeoPackage, FlatGeobuf, GeoParquet) ; versions par territoire en projections locales | **Licence Ouverte 2.0** (`lov2` sur data.gouv.fr ; CGU : https://cartes.gouv.fr/cgu) | vérifié | Archive France entière WGS84 GeoPackage (7z, 125 711 568 octets) : https://data.geopf.fr/telechargement/download/ADMIN-EXPRESS-COG-CARTO/ADMIN-EXPRESS-COG-CARTO_4-0__GPKG_WGS84G_FRA_2026-01-01/ADMIN-EXPRESS-COG-CARTO_4-0__GPKG_WGS84G_FRA_2026-01-01.7z · fiche : https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_ADMIN-EXPRESS |
| **Etalab « Contours administratifs » 2026** | communes, départements, régions, EPCI ; 4 niveaux de simplification (1000 m, 100 m, 50 m, 5 m) en GeoJSON et GeoJSON gzip | **ODbL** (partage à l'identique, car les COM proviennent d'OpenStreetMap) | vérifié | Dérivé d'ADMIN EXPRESS + OSM. 35 014 entités dans `communes-1000m` : 34 875 communes + 45 arrondissements + 94 unités de COM (recompté). Propriétés `code, nom, departement, region, epci` ; Paris, Lyon, Marseille portent `plm: true`, les arrondissements une propriété `commune` (code parent) et **se superposent** à leur commune parente. Fichiers servis depuis `https://contours-administratifs.s3.rbx.io.cloud.ovh.net/2026/geojson/`. Millésime 2022 disponible aussi. Fiche : https://www.data.gouv.fr/datasets/contours-administratifs |
| gregoiredavid/france-geojson | métropole + DROM, sans COM | non précisée au niveau du dépôt | vérifié | Données de 2018, dernier commit du 16/10/2018 : **à écarter**. |

Tailles des fichiers Etalab 2026 `communes-*` (octets) :

| Niveau | `.geojson` | `.geojson.gz` |
|---|---|---|
| 1000 m | 10 039 017 | 1 534 299 |
| 100 m | 32 511 556 | 8 237 354 |
| 50 m | 59 690 746 | 17 577 060 |
| 5 m | 292 489 559 | 89 956 679 |

**Recommandation (décision D8, à valider)** : partir d'**IGN ADMIN EXPRESS COG CARTO 2026** (Licence Ouverte 2.0, sans obligation de partage à l'identique), le simplifier nous-mêmes (`mapshaper`) puis le découper en tuiles. Les fichiers Etalab restent utiles pour le spike de la phase 4 (prototype rapide), avec attribution « IGN, contributeurs OpenStreetMap ». Les géométries sont en coordonnées réelles (lon/lat WGS84) : les DROM sont à leur position géographique, d'où les encarts.

---

## 3. Résultats électoraux

### 3.1 Présidentielle 2022 par commune (ministère de l'Intérieur, data.gouv.fr)

| Tour | Jeu de données | Fichier « par commune » |
|---|---|---|
| 1er tour (10 avril 2022) | https://www.data.gouv.fr/datasets/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour | https://static.data.gouv.fr/resources/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour/20220414-152459/resultats-par-niveau-subcom-t1-france-entiere.txt (17 688 915 octets) |
| 2nd tour (24 avril 2022) | https://www.data.gouv.fr/datasets/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2nd-tour | https://static.data.gouv.fr/resources/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2nd-tour/20220428-142333/resultats-par-niveau-subcom-t2-france-entiere.txt (6 092 257 octets) |

Autres niveaux publiés pour chaque tour : France entière, région, département, circonscription législative, bureau de vote (txt et xlsx). Statut : vérifié.

**Format** (vérifié) : séparateur `;`, encodage Latin-1 / Windows-1252, virgule décimale. Table « large » : l'en-tête ne décrit que le premier bloc de candidat ; chaque ligne répète un bloc par candidat (7 champs au 2nd tour par commune : n° de panneau, sexe, nom, prénom, voix, % inscrits, % exprimés ; 6 champs au 1er tour par département).

**Codes** (vérifié sur le fichier communal du 2nd tour et départemental du 1er tour) :

| Code Intérieur | Territoire | Code INSEE de commune |
|---|---|---|
| `01`…`95`, `2A`, `2B` | départements métropolitains | code département + code commune à 3 chiffres (`01` + `001` → `01001`) |
| `ZA` | Guadeloupe | `97` + code commune (`ZA;101` → `97101`) |
| `ZB` | Martinique | idem (`972xx`) |
| `ZC` | Guyane | idem (`973xx`) |
| `ZD` | La Réunion | idem (`974xx`) |
| `ZM` | Mayotte | idem (`ZM;601` → `97601`) |
| `ZN`, `ZP`, `ZS`, `ZW`, `ZX` | Nouvelle-Calédonie, Polynésie française, Saint-Pierre-et-Miquelon, Wallis-et-Futuna, Saint-Martin/Saint-Barthélemy | hors carte |
| `ZZ` | Français établis hors de France (lignes = postes consulaires, ≈ 210 — nombre **non vérifié**) | hors carte |

**Paris, Lyon, Marseille** : une seule ligne par ville au niveau communal (`75;Paris;056`, `69;Rhône;123;Lyon`, `13;Bouches-du-Rhône;055;Marseille`) — vérifié au 2nd tour, **non vérifié** au 1er tour (fichier trop volumineux pour l'outil de lecture). Le détail par arrondissement passerait par le fichier des bureaux de vote (structure non vérifiée). La carte utilisera donc les **communes parentes** et ignorera les arrondissements.

**Licence** : la fiche data.gouv.fr des deux jeux indique `notspecified` (vérifié par l'API). Les conditions de réutilisation sont **non vérifiées** ; à clarifier avant de redistribuer des données dérivées (voir [RISQUES R-23](./RISQUES.md)). À titre de comparaison, les législatives 2024 sont sous Licence Ouverte 2.0.

### 3.2 Totaux nationaux officiels 2022 (contrôle d'agrégation)

Proclamations du Conseil constitutionnel. Statut : vérifié ; pourcentages calculés.

**1er tour** — décision n° 2022-195 PDR du 13 avril 2022 (https://www.conseil-constitutionnel.fr/decision/2022/2022195PDR.htm) : inscrits 48 747 876 · votants 35 923 707 · blancs 543 609 · nuls 247 151 · exprimés 35 132 947.

| Candidat | Voix | % exprimés |
|---|---|---|
| Emmanuel Macron | 9 783 058 | 27,85 |
| Marine Le Pen | 8 133 828 | 23,15 |
| Jean-Luc Mélenchon | 7 712 520 | 21,95 |
| Éric Zemmour | 2 485 226 | 7,07 |
| Valérie Pécresse | 1 679 001 | 4,78 |
| Yannick Jadot | 1 627 853 | 4,63 |
| Jean Lassalle | 1 101 387 | 3,13 |
| Fabien Roussel | 802 422 | 2,28 |
| Nicolas Dupont-Aignan | 725 176 | 2,06 |
| Anne Hidalgo | 616 478 | 1,75 |
| Philippe Poutou | 268 904 | 0,77 |
| Nathalie Arthaud | 197 094 | 0,56 |

**2nd tour** — décision n° 2022-197 PDR du 27 avril 2022 (https://www.conseil-constitutionnel.fr/decision/2022/2022197PDR.htm) : inscrits 48 752 339 · votants 35 096 478 · blancs 2 233 904 · nuls 805 249 · exprimés 32 057 325 · Emmanuel Macron 18 768 639 (58,55 %) · Marine Le Pen 13 288 686 (41,45 %). Mandat « à compter du 14 mai 2022 à 0 heure ».

Ces totaux servent de **test d'acceptation de l'import** : Σ des lignes du fichier communal (périmètre complet, y compris hors carte) = totaux proclamés. Si un écart subsiste (par exemple décisions de rectification du Conseil constitutionnel), il est documenté, jamais masqué.

### 3.3 Législatives 2024 et circonscriptions (phase 6)

- Résultats (Licence Ouverte 2.0, vérifié) : https://www.data.gouv.fr/datasets/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour · https://www.data.gouv.fr/datasets/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-2nd-tour. Contrairement à 2022, les codes outre-mer y sont de style INSEE (`971;Guadeloupe;97101…`) ; `ZX` et `ZZ` subsistent. Présence des zéros initiaux en métropole : **non vérifiée**.
- Contours : fichier simplifié INSEE de mai 2022, 558 polygones (métropole + 5 DROM, sans les 11 circonscriptions des Français de l'étranger ni les 8 des COM), WGS84 : https://www.insee.fr/fr/statistiques/6441661 (licence de ce fichier **non vérifiée**). Alternative : https://www.data.gouv.fr/datasets/contours-geographiques-des-circonscriptions-legislatives (auteur individuel, Licence Ouverte 2.0, mise à jour 13/06/2024).
- Découpage en vigueur depuis les législatives de 2012 : d'après un extrait de recherche, **texte de référence non vérifié**.

---

## 4. Calendrier de la présidentielle 2027

| Fait | Valeur | Statut | Source |
|---|---|---|---|
| Dates retenues | **1er tour : dimanche 18 avril 2027 · 2nd tour : dimanche 2 mai 2027** | vérifié (relu sur la page) | Compte rendu du Conseil des ministres du 1er juillet 2026 : https://www.elysee.fr/emmanuel-macron/2026/07/01/compte-rendu-du-conseil-des-ministres-du-mercredi-1er-juillet-2026 |
| Vote la veille (samedi) | Guadeloupe, Martinique, Guyane, Saint-Pierre-et-Miquelon, Saint-Barthélemy, Saint-Martin, Polynésie française | vérifié | idem |
| Début de la période de financement | 1er avril 2026 | vérifié | idem ; guide CNCCFP |
| Décret de convocation des électeurs | **non publié** d'après des sources secondaires du 1er au 4 octobre 2026 ; Légifrance inaccessible | non vérifié | — |
| Délai de publication du décret | au moins 10 semaines avant le 1er tour, soit au plus tard vers le 7 février 2027 | déduit (règle citée par des sources secondaires) | précédent : décret n° 2022-66 du 26 janvier 2022 |
| Fenêtre constitutionnelle | élection « vingt jours au moins et trente-cinq jours au plus avant l'expiration des pouvoirs du Président en exercice » (art. 7 de la Constitution) ; mandat commencé le 14 mai 2022 à 0 h | vérifié (texte cité par une source secondaire ; date de début vérifiée) | — |
| Fin du mandat en cours | 13 mai 2027 à minuit | déduit | — |

Remarque : la page de l'Élysée mentionne une consultation des partis « le 29 juillet 2026 » dans un compte rendu du 1er juillet, et un décret qui « interviendra en début d'année 2026 » : incohérences apparentes de la page officielle, signalées telles quelles.

**Dans le jeu** : ces dates entrent dans le *ruleset* `presidentielle-2027` avec le statut `annoncé` (et non `officiel`) jusqu'à la publication du décret. La date de scrutin est portée **par territoire** (vote du samedi).

---

## 5. Parrainages (présentations)

| Règle | Statut | Source |
|---|---|---|
| 500 présentations d'élus, d'au moins 30 départements ou collectivités d'outre-mer, au plus 1/10 (50) d'un même département ou collectivité — art. 3-I de la loi n° 62-1292 du 6 novembre 1962 (modifiée par la loi organique n° 76-528 du 18 juin 1976) | vérifié par documents officiels secondaires ; **texte Légifrance non lu** | https://www.assemblee-nationale.fr/dyn/16/textes/l16b1708_proposition-loi.pdf · https://presidentielle2022.conseil-constitutionnel.fr/les-parrainages/tous-les-parrainages-valides.html |
| Envoi exclusivement postal au Conseil constitutionnel ; publication des noms au fil de l'eau, au moins deux fois par semaine (loi organique n° 2016-506 du 25 avril 2016) | vérifié | https://presidentielle2017.conseil-constitutionnel.fr/tout-savoir/parrainages/concernant-parrainages-quest-a-change-2012/ |
| Ouverture : lendemain de la publication du décret de convocation | vérifié | compte rendu du Conseil des ministres du 1er juillet 2026 |
| Clôture : 6e vendredi précédant le 1er tour à 18 h, soit le **12 mars 2027** pour un 1er tour le 18 avril | règle vérifiée (guide CNCCFP) ; date déduite | guide CNCCFP (§6) |
| Données 2022 : 13 427 parrainages validés, téléchargeables en CSV/JSON/XLSX | vérifié | site présidentielle 2022 du Conseil constitutionnel |

---

## 6. Financement de campagne

Source principale (vérifiée) : guide CNCCFP 2027 — https://cnccfp.fr/wp-content/uploads/2026/04/Guide-a-lusage-des-candidats-a-lelection-du-President-de-la-Republique-2027.pdf · https://cnccfp.fr/elections/election-du-president-de-la-republique-2027/

| Règle | Valeur | Base indiquée par le guide |
|---|---|---|
| Plafond de dépenses, 1er tour | **16 851 000 €** | art. L. 52-11 du Code électoral (gel par la loi de finances n° 2011-1977 du 28/12/2011) ; montants du décret n° 2009-1730 du 30/12/2009 |
| Plafond de dépenses, candidats du 2nd tour | **22 509 000 €** | idem |
| Remboursement forfaitaire, < 5 % des exprimés | au plus 4,75 % du plafond du 1er tour (≈ 800 k€) | V de l'art. 3 de la loi n° 62-1292 |
| Remboursement, ≥ 5 % | au plus 47,5 % du plafond du 1er tour | idem |
| Remboursement, candidats du 2nd tour | au plus 47,5 % du plafond du 2nd tour | idem |
| Limites du remboursement | dans la limite des dépenses remboursables et de l'apport personnel ; déduction de l'avance forfaitaire de 200 000 € ; compte approuvé requis | idem |
| Dons des personnes physiques | 4 600 € par élection, tous candidats confondus ; au-delà de 150 € par chèque, virement ou carte | art. L. 52-8 |
| Personnes morales | interdites (sauf partis politiques au sens de la loi n° 88-227 du 11 mars 1988) | art. L. 52-8 |
| Dépôt du compte | 11e vendredi suivant le 1er tour à 18 h, soit le **2 juillet 2027** | guide CNCCFP |
| Rôle de la CNCCFP | approuve, réforme ou rejette le compte et fixe le remboursement ; recours devant le Conseil constitutionnel sous un mois ; compte rejeté ou tardif ⇒ pas de remboursement, avance à restituer | guide CNCCFP |

Statut : vérifié sur le guide CNCCFP ; les montants de base inscrits dans la loi de 1962 elle-même sont **non vérifiés** (Légifrance inaccessible).

---

## 7. Assemblée nationale (phase 6)

- Données ouvertes (vérifié) : https://data.assemblee-nationale.fr/ — députés, organes et groupes (fichiers AMO), votes (https://data.assemblee-nationale.fr/travaux-parlementaires/votes), amendements, débats, dossiers législatifs ; XML/JSON et listes CSV. Licence : « Licence Ouverte / Open Licence » (version non précisée sur la page).
- Députés en exercice (17e législature) : https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_actifs_csv_opendata/liste_deputes_libre_office.csv (dernière modification serveur : 19/10/2026).
- Composition comptée dans ce fichier : **574 députés en exercice** (3 sièges sur 577 non pourvus, cause non vérifiée) — RN 121 · EPR 90 · LFI-NFP 70 · SOC 68 · DR 47 · EcoS 38 · Dem 37 · HOR 35 · LIOT 23 · GDR 17 · UDR 17 · non-inscrits 11. Valeur datée, à ré-importer au moment de la phase 6.

---

## 8. Utilisation dans le jeu (phases 2 et 3)

Le jeu de règles [`packages/rulesets/src/presidentielle-2027.json`](../packages/rulesets/src/presidentielle-2027.json) (`presidentielle-2027@2.0.0` depuis la phase 3 ; 1.0.0 en phase 2) reprend, avec leur source et leur statut :

| Donnée | Valeur | Statut dans le jeu | Source |
|---|---|---|---|
| Premier tour | 18 avril 2027 | `annonce` | compte rendu du Conseil des ministres du 1er juillet 2026 (§4) |
| Second tour | 2 mai 2027 | `annonce` | idem |
| Vote la veille | 971, 972, 973, 975, 977, 978, 987 | `annonce` | idem (texte relu le 20/10/2026 : Guadeloupe, Martinique, Guyane, Saint-Pierre-et-Miquelon, Saint-Barthélemy, Saint-Martin, Polynésie française) |
| Présentation des candidatures | 12 mars 2027, 18 h | `deduit` | règle relue mot pour mot dans le guide CNCCFP : « le sixième vendredi précédant le premier tour de scrutin à dix-huit heures » |
| Dépôt des comptes de campagne | 2 juillet 2027, 18 h | `deduit` | règle relue mot pour mot dans le guide CNCCFP : « au plus tard à dix-huit heures le onzième vendredi suivant le premier tour de scrutin » |
| Inscrits (phase 3) | 48 752 339 | `estimation` | inscrits proclamés au second tour de 2022, décision n° 2022-197 PDR (§3.2) ; repris faute de chiffre pour 2027 |
| Participation, blancs, nuls (phase 3) | calés sur 73,69 % / 71,99 % de participation, 1,51 % / 6,37 % de blancs et 0,69 % / 2,29 % de nuls des votants (1er / 2nd tour 2022) | `hypothese` (modèle) | calculés à partir des décisions n° 2022-195 et 2022-197 PDR (§3.2) |

Les dates déduites sont recalculées par un test à partir de leur règle. Tous les autres paramètres du jeu de règles (ressources de départ, coûts, effets, probabilités ; en phase 3 : les 9 groupes d'électeurs et leurs positions, les coefficients du vote, les 7 adversaires et les 2 instituts de sondage) sont des **hypothèses de jeu** (source « conception du jeu », sans URL), affichées comme telles dans l'interface. Les adversaires et les instituts sont **fictifs** (« Personnage fictif », « (fictif) », vérifié par test) : aucune personnalité ni aucun institut réel n'est représenté (question Q2).

## 9. Points restant non vérifiés

1. Texte exact, sur Légifrance, de la loi n° 62-1292 (parrainages, financement) et de l'article L. 52-11.
2. Publication du décret de convocation des électeurs pour 2027.
3. Conditions de réutilisation des résultats présidentiels 2022 (licence `notspecified`).
4. Structure du fichier communal du 1er tour 2022 pour Paris, Lyon, Marseille, et nombre exact de lignes `ZZ`.
5. Licence du fichier INSEE des contours de circonscriptions ; texte de référence du découpage.
6. Zéros initiaux des codes métropolitains dans les fichiers des législatives 2024.
7. Sources des indicateurs économiques initiaux (Banque de France, INSEE) : à identifier en phase 6.

## 10. Métadonnées obligatoires de chaque import (§10)

Chaque import enregistre dans `DataImport` : source, URL exacte, date de récupération, millésime, licence, période de validité, transformations appliquées, empreinte SHA-256 du fichier brut, version de l'importeur, nombre de lignes, statut. Les mises à jour sont versionnées ; un import qui ne passe pas ses contrôles est rejeté en entier.

## 11. Données de démonstration

Un jeu réduit, commité dans `data/demo/`, permet de jouer hors ligne (§10). S'il est dérivé de données réelles, il en conserve la source et la licence (sous réserve du point 3 de la section 9) ; s'il est synthétique, il est étiqueté `fictif`.
