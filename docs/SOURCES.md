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

## 8 bis. Utilisation dans le jeu (phase 4)

| Donnée | Usage | Statut |
|---|---|---|
| COG 2026 (communes, départements, régions, collectivités d'outre-mer, mouvements) | référentiel de la carte ; passage 2022 → 2026 | importé ; empreintes SHA-256 dans le manifeste |
| IGN ADMIN EXPRESS COG CARTO 4-0, édition 2026-01-01 (archive de 125 711 568 octets, SHA-256 `40269cb7…de28`) | contours, population légale affichée dans la fiche | importé ; correspondance exacte avec le COG (Saint-Pierre-et-Miquelon écartée, hors carte) |
| Présidentielle 2022, fichiers communaux des deux tours (17 688 915 et 6 092 257 octets) | géographie électorale du jeu ; couche « résultats officiels 2022 » de la carte | importés localement ; **somme des lignes = totaux proclamés à l'unité** (vérifié par l'import) ; non commités (licence non précisée, Q8) |
| Répartition des électeurs de chaque candidat de 2022 entre les groupes du jeu | situer les groupes commune par commune | `hypothese` (jeu de règles 2.1.0, `electorat.baseHistorique`) |

## 8 ter. Utilisation dans le jeu (phase 5)

Jeu de règles `presidentielle-2027@3.0.0` :

| Donnée | Valeur dans le jeu | Statut | Source |
|---|---|---|---|
| Seuil des parrainages | 500 présentations, d'au moins 30 départements ou collectivités d'outre-mer, au plus 1/10 d'un même département | `officiel` | §5 ; lecture retenue : au plus **50 présentations comptées** par département pour atteindre le seuil (texte Légifrance non relu, §9 point 1) |
| Clôture des présentations | 12 mars 2027, 18 h | `deduit` | §5 et §8 (règle du sixième vendredi) |
| Ouverture de l'envoi des présentations | **22 février 2027** | `hypothese` | règle vérifiée (lendemain du décret de convocation, §5) ; décret non publié : date supposée trois semaines avant la clôture (« conception du jeu ») |
| Réservoir d'élus par département | un maire par commune du COG 2026 (34 875 dans 101 départements) ; 45 % mobilisables | `estimation` (effectifs) et `hypothese` (part mobilisable) | INSEE, COG 2026 (§2.1) ; les autres élus habilités (parlementaires, conseillers départementaux et régionaux, élus des COM et des Français de l'étranger) ne sont pas comptés |
| Rythme de la collecte (conversion des promesses, renoncements, envoi, 1,5 % de présentations invalidées) | paramètres de jeu | `hypothese` | conception du jeu |
| Plafonds de dépenses | 16 851 000 € (1er tour), 22 509 000 € (2nd tour) | `officiel` | guide CNCCFP 2027 (§6) |
| Dons des personnes physiques | 4 600 € par personne et par élection ; au-delà de 150 €, pas d'espèces ; personnes morales interdites hors partis | `officiel` | guide CNCCFP 2027, art. L. 52-8 (§6) ; simplification : chaque offre de don vient d'une personne distincte |
| Avance forfaitaire | 200 000 € (montant) ; versés dans le jeu à chaque candidat retenu, à la clôture des présentations | `officiel` (montant) | guide CNCCFP 2027 (§6) |
| Remboursement forfaitaire | 4,75 % du plafond du 1er tour sous 5 % des exprimés ; 47,5 % au-dessus ; 47,5 % du plafond du 2nd tour pour les finalistes ; dans la limite des dépenses et de l'apport personnel, avance déduite | `officiel` | guide CNCCFP 2027 (§6) ; le jeu affiche un remboursement **prévisionnel** (pas de dépôt ni de contrôle du compte) |
| Apport personnel initial (20 % du budget de départ), taux et conditions d'emprunt | paramètres de jeu | `hypothese` | conception du jeu ; les emprunts sont comptés en apport personnel et la banque ne prête que dans la limite du remboursement attendu |
| Programme : 17 domaines, 51 propositions, coûts, délais, faisabilité, effets | estimations de jeu | `hypothese` | conception du jeu ; sans valeur de chiffrage officiel, affiché « Estimations de jeu » |
| Médias : six organes **fictifs** (audience, crédibilité, priorités) | paramètres de jeu | `hypothese` | conception du jeu ; aucun média réel représenté |
| Débats (poids des composantes), alliances (fenêtre de 10 semaines, seuils), IA (budget, actions, température par difficulté) | paramètres de jeu | `hypothese` | conception du jeu |

Les valeurs `officiel` et `deduit` sont vérifiées par les tests du jeu de règles ; aucune n'a été inventée pour combler les sources inaccessibles (Légifrance, CNCCFP et INSEE refusés par le proxy de l'environnement cloud le 21/10/2026 : les valeurs reprises sont celles relevées en phases 0 et 4).

## 8 quater. Personnalités politiques réelles (phase 5 bis)

Décision de l'utilisateur du 21/10/2026 (question Q2) : personnalités jouables et adversaires ; candidatures **déclarées** seulement ; photos sous **licence libre** créditées ; position d'après l'**enquête d'experts Chapel Hill** (CHES) ; candidatures dont aucun parti n'est noté par CHES non intégrées, sauf Nathalie Arthaud, François Asselineau, David Lisnard et François Ruffin (position « hypothèse »). Import : `pnpm data:personnalites` ; fiches dans [`packages/rulesets/src/personnalites-2027.json`](../packages/rulesets/src/personnalites-2027.json), photos dans `apps/web/public/personnalites/`.

| Source | Usage | Version, licence |
|---|---|---|
| Wikipédia, « Candidatures à l'élection présidentielle française de 2027 » | liste des candidatures déclarées, parti, fonctions en cours, date de la déclaration et référence de presse qui la suit (le titre de l'article de presse n'est pas affiché) | révision 240556510, consultée le 21/10/2026 ; texte CC BY-SA 4.0 : seuls des faits datés sont repris, reformulés ; empreinte SHA-256 dans les fiches |
| Wikidata (requête SPARQL) | identifiant de chaque personne ; partis successifs (P102) pour les rattachements « ancien parti » | CC0 1.0 ; requête du 21/10/2026, empreinte dans les fiches |
| Wikimedia Commons | photos ; licence et auteur lus dans les champs lisibles par machine de la page du fichier | licences acceptées : CC0, domaine public, CC BY, CC BY-SA ; photos réduites (240 px, WebP), métadonnées retirées |
| Chapel Hill Expert Survey 2024 (`CHES_2024_final_v2.csv`) et fichier de tendance 1999-2024 | positions des partis : `lrecon` (économie) et `galtan` (valeurs), converties par (x − 5) × 20 ; familles de partis | Rovny et al., « The 2024 Chapel Hill Expert Survey on political party positioning in Europe: Twenty-five years of party positional data », 2025 ; licence non précisée, usage avec citation demandé |
| COG 2026 (INSEE) | vérification des communes et départements des mandats, régions d'ancrage | Licence Ouverte 2.0 (§2.1) |
| Assemblée nationale, députés en exercice (§7, fichier du 19/10/2026) | taille des groupes pour le niveau d'organisation | Licence Ouverte |

Fiches retenues (économie / société sur −100 … +100) :

| Personnalité | Parti (source) | Candidature — source | Position | Statut et méthode | Photo |
|---|---|---|---|---|---|
| Nathalie Arthaud | Lutte ouvrière | 2025-12-08 (déclaration) — RTL.fr | -78 / -46 | `hypothese` (famille : PCF, FI 2024) | CC BY-SA 4.0 — Kokluts |
| François Asselineau | Union populaire républicaine | 2023-08-31 (déclaration) — Wikipédia | 43 / 75 | `hypothese` (famille : RN, REC 2024) | CC BY-SA 4.0 — Union Populaire Républicaine |
| Gabriel Attal | Renaissance | 2026-05-22 (déclaration) — RTL.fr | 24 / -18 | `estimation` (parti : RE 2024) | CC BY 4.0 — Ismail Aissoub |
| Olivier Becht | Renaissance / Agir | 2026-09-24 (déclaration) — Paris Match | 24 / -18 | `estimation` (parti : RE 2024) | CC BY 2.0 — Palácio do Planalto from Brasilia, Brasil |
| Xavier Bertrand | Nous France / Les Républicains | 2024-02-03 (déclaration) — Ouest-France | 56 / 44 | `estimation` (parti : LR 2024) | CC BY 4.0 — Claudio Centonze / European Union, 2025 / EC - Audiovisual Service |
| Karim Bouamrane | Parti socialiste | 2026-06-09 (déclaration) — Le Monde | -33 / -45 | `estimation` (parti : PS 2024) | CC BY 4.0 — Oumma |
| Nicolas Dupont-Aignan | Debout la France | 2026-09-19 (déclaration) — Le Journal du dimanche | 40 / 66 | `estimation` (parti : DLF 2019) | CC BY-SA 4.0 — Debout la France |
| Raphaël Glucksmann | Place publique | 2026-10-11 (désignation) — Libération | -33 / -45 | `estimation` (parti_soutien : PS 2024) | aucune (licence non reconnue comme libre (European Parliament)) |
| Marine Le Pen | Rassemblement national | 2026-07-07 (déclaration) — Euronews | 20 / 67 | `estimation` (parti : RN 2024) | CC0 — Vox España |
| David Lisnard | Nouvelle Énergie | 2026-03-31 (déclaration) — Franceinfo.fr | 56 / 44 | `hypothese` (ancien_parti : LR 2024) | CC BY-SA 4.0 — Grégor Sauvagère |
| Jean-Luc Mélenchon | La France insoumise | 2026-05-03 (déclaration) — Le Monde | -82 / -64 | `estimation` (parti : FI 2024) | CC BY 4.0 — jlm2017.fr |
| Édouard Philippe | Horizons | 2024-09-03 (déclaration) — Le Point | 36 / 6 | `estimation` (parti : Horizons 2024) | CC0 — Wasasaq8 |
| Bruno Retailleau | Les Républicains | 2026-04-19 (désignation) — Le Monde | 56 / 44 | `estimation` (parti : LR 2024) | CC BY 4.0 — Anthonymontardyfr |
| Fabien Roussel | Parti communiste français | 2026-09-06 (désignation) — Le Figaro | -75 / -29 | `estimation` (parti : PCF 2024) | CC BY-SA 4.0 — Zouhair NAKARA |
| François Ruffin | Debout ! | 2025-04-01 (déclaration) — Le HuffPost | -75 / -29 | `hypothese` (ancien_parti : PCF 2024) | CC BY-SA 4.0 — Thinkerview |
| Marine Tondelier | Les Écologistes | 2026-09-21 (désignation) — Le Monde | -54 / -66 | `estimation` (parti : LE/EELV 2024) | CC BY-SA 4.0 — Greenbox |
| Éric Zemmour | Reconquête | 2026-09-17 (déclaration) — BFM TV | 67 / 82 | `estimation` (parti : REC 2024) | CC0 — Anh De France |

Remarques :
- **Statut** : `estimation` = position d'experts du parti de la personnalité (ou du parti qui soutient officiellement sa candidature : Parti socialiste pour Raphaël Glucksmann) ; `hypothese` = rattachement indirect, détaillé dans la fiche.
- **Source de la candidature de François Asselineau** : les références de la phrase portent sur une procédure judiciaire ou sur une autre personnalité ; l'article lui-même sert de source. L'importeur refuse toute référence de candidature portant sur une procédure judiciaire (relecture humaine imposée).
- **Photo de Raphaël Glucksmann** : licence « European Parliament » non reconnue comme libre par la règle retenue : initiales affichées.
- **Candidatures non intégrées** (aucun parti noté par CHES) : Delphine Batho, Bernard Cazeneuve, Sylvain Durif, Anasse Kazib, Selma Labib, Francis Lalanne, Mira Markovic, Benoît Mathieu, Antoine Mikolajczak, Manolo Mlekuz, Florian Philippot, Gilles Platret, Natacha Polony (liste affichée dans le jeu).
- **Moyens de départ** : niveaux de notoriété et d'organisation établis par des règles écrites à partir des faits ci-dessus ; leur conversion en ressources est une hypothèse du jeu de règles 4.0.0. Aucun sondage réel n'est utilisé.

## 8 quinquies. Médias réels, émissions et journalistes politiques (phase 5 ter)

Décision de l'utilisateur du 21/10/2026 : médias réels (presse, télévision, radio) ; comportement des chaînes et des stations fondé sur les **temps de parole mesurés par l'Arcom** ; presse écrite identique pour tous les candidats ; **émissions politiques réelles** avec leur chaîne et leurs présentateurs (interviews simulées, aucun propos attribué) ; **logos seulement sous licence libre** (ou domaine public), crédités. Import : `pnpm data:medias` ; données dans [`packages/rulesets/src/medias-2027.json`](../packages/rulesets/src/medias-2027.json), logos dans `apps/web/public/medias/`.

| Source | Usage | Version, licence |
|---|---|---|
| Arcom, temps de parole des personnalités politiques hors période électorale (`www.arcom.fr/temps-parole/hors-elections`), fichiers mensuels « partis politiques » (CSV) | temps de parole de chaque parti par service (journaux, magazines, autres programmes), temps du pouvoir exécutif ; contrôles : somme des partis = total publié, parts publiées exécutif + partis = 100 % | 12 mois, du 01/08/2025 au 31/07/2026, chacun avec son empreinte SHA-256 ; licence non précisée sur la page (l'Arcom publie des jeux analogues sous Licence Ouverte 2.0 sur data.gouv.fr) : seules des parts agrégées en sont tirées, avec citation |
| Médiamétrie, Médiamat mensuel (classeur Excel de la page) | part d'audience des chaînes, individus de 4 ans et plus | septembre 2026 ; licence non précisée : quelques parts publiées reprises avec citation |
| Médiamétrie, EAR National (classeur Excel de la page) | part d'audience des stations, 13 ans et plus, du lundi au vendredi (5 h-24 h) | vague avril-juin 2026 ; idem |
| ACPM, classements OneNext de la presse quotidienne nationale et régionale | lecteurs au numéro moyen (LNM : moyenne sur les six derniers numéros parus) | 2026 S1 ; licence non précisée : quelques lectorats publiés repris avec citation |
| Wikipédia (API REST, révision indiquée pour chaque organe et chaque émission) | infobox : logo de l'organe ; chaîne ou station, présentateurs, jour ou périodicité, statut de diffusion de l'émission | 35 articles consultés le 21/10/2026 ; texte CC BY-SA 4.0 : seuls ces faits sont repris |
| Wikimedia Commons | logos ; licence et auteur lus sur la page du fichier (redirections de fichier suivies) | licences acceptées : CC0, domaine public, CC BY, CC BY-SA ; SVG conservés tels quels après contrôle (aucun script, gestionnaire d'événement ni ressource externe), autres formats réduits et convertis en WebP ; un logo reste une marque de son titulaire |
| Fiches des personnalités réelles (§8 quater) | rattachement de chaque personnalité à un parti des relevés de l'Arcom (nom identique à l'un des partis de sa fiche) | jeu de règles 5.0.0 |

Organes retenus (26) :

| Organe | Type | Audience mesurée (source) | Temps de parole des partis (Arcom, 12 mois) | Logo |
|---|---|---|---|---|
| TF1 | Télévision | part d’audience 19,1 % (septembre 2026) | 36 h | Public domain — Patrick Delobelle (Naked Compagnie) for TF1 |
| France 2 | Télévision | part d’audience 13,7 % (septembre 2026) | 45 h | CC0 — Pierre-Félix Vautrin |
| France 3 | Télévision | part d’audience 9,3 % (septembre 2026) | 18 h | CC0 — Pierre-Félix Vautrin |
| France 5 | Télévision | part d’audience 3,6 % (septembre 2026) | 54 h | CC0 — Pierre-Félix Vautrin |
| M6 | Télévision | part d’audience 8 % (septembre 2026) | 11 h | Public domain — Étienne Robial (original 1987) - Gédéon pour M6 |
| TMC | Télévision | part d’audience 3 % (septembre 2026) | 17 h | Public domain — TMC |
| BFMTV | Télévision | part d’audience 3 % (septembre 2026) | 628 h | aucun (fichier « BFMTV 2025.png » absent de Wikimedia Commons (hébergé sur Wikipédia, hors licence libre)) |
| CNews | Télévision | part d’audience 3 % (septembre 2026) | 421 h | Public domain — CNews |
| LCI | Télévision | part d’audience 2,8 % (septembre 2026) | 372 h | aucun (fichier « LCI - Logo (Août 2017).svg » absent de Wikimedia Commons (hébergé sur Wikipédia, hors licence libre)) |
| France Info (télévision) | Télévision | part d’audience 1,1 % (septembre 2026) | 438 h | aucun (aucun logo dans l’infobox de l’article) |
| RMC Story | Télévision | part d’audience 1,4 % (septembre 2026) | 57 h | aucun (fichier « RMC Story 2025.png » absent de Wikimedia Commons (hébergé sur Wikipédia, hors licence libre)) |
| T18 | Télévision | part d’audience 0,9 % (septembre 2026) | 22 h | Public domain — Etienne Robial (logo original) - Llempereur (reproduction) |
| France Inter | Radio | part d’audience 13,9 % (avril - juin 2026) | 89 h | Public domain — Radio France - Yuma Paris |
| France Info (radio) | Radio | part d’audience 4,7 % (avril - juin 2026) | 339 h | Public domain — France Info |
| RTL | Radio | part d’audience 11,2 % (avril - juin 2026) | 88 h | Public domain — CLT (RTL Group) |
| RMC | Radio | part d’audience 5,2 % (avril - juin 2026) | 98 h | Public domain — RMC BFM - Agence Barjabulle |
| Europe 1 | Radio | part d’audience 4,4 % (avril - juin 2026) | 347 h | CC BY-SA 4.0 — ONAIR9214 |
| France Culture | Radio | part d’audience 3,6 % (avril - juin 2026) | 16 h | Public domain — Radio France - Yuma Paris |
| Le Parisien / Aujourd’hui en France | Presse | 2 920 000 lecteurs par numéro (2026 S1) | — (non mesurée) | Public domain — Le Parisien |
| Le Monde | Presse | 2 794 000 lecteurs par numéro (2026 S1) | — (non mesurée) | Public domain — Le Monde vectorized by RaphaelQS at English Wikipedia |
| Le Figaro | Presse | 2 018 000 lecteurs par numéro (2026 S1) | — (non mesurée) | aucun (fichier « Logo Le Figaro.svg » absent de Wikimedia Commons (hébergé sur Wikipédia, hors licence libre)) |
| Libération | Presse | 1 267 000 lecteurs par numéro (2026 S1) | — (non mesurée) | Public domain — Unknown author |
| Les Échos | Presse | 843 000 lecteurs par numéro (2026 S1) | — (non mesurée) | aucun (fichier « Logo Les Échos (2021).svg » absent de Wikimedia Commons (hébergé sur Wikipédia, hors licence libre)) |
| La Croix | Presse | 634 000 lecteurs par numéro (2026 S1) | — (non mesurée) | Public domain — La Croix |
| L’Humanité | Presse | 578 000 lecteurs par numéro (2026 S1) | — (non mesurée) | aucun (fichier « Logo L'Humanité (2024).svg » absent de Wikimedia Commons (hébergé sur Wikipédia, hors licence libre)) |
| Presse quotidienne régionale (66 titres) | Presse | 13 505 000 lecteurs par numéro (2026 S1) | — (non mesurée) | aucun (aucun logo dans l’infobox de l’article) |

Émissions politiques retenues (7) — faits de l'infobox de l'article, à la révision consultée ; dans le jeu, l'interview est **simulée** et rien n'est attribué aux journalistes :

| Émission | Organe(s) | Présentation | Diffusion (source) |
|---|---|---|---|
| C politique | France 5 | Thomas Snégaroff | Hebdomadaire ; Tous les dimanches |
| L'Heure de vérité | France 2 | Caroline Roux | non indiquée |
| Les Quatre Vérités | France 2 | Francis Letellier | Quotidien |
| Vie politique | TF1 | Gilles Bouleau | Occasionnelle |
| L'Heure des pros | CNews, Europe 1 | Pascal Praud, Eliot Deval | Quotidienne (du lundi au dimanche) |
| Le Grand Jury | RTL | Olivier Bost | 12 h - 13 h, le dimanche |
| Le Grand Rendez-vous | Europe 1, CNews | Pierre de Vilno, Mathieu Bock-Côté, Christophe Jakubyszyn | Le dimanche de 10h à 11h |

Règles et remarques :
- **Sélection** : télévision et radio = services dont l'Arcom publie les temps de parole, avec au moins une heure par mois en moyenne (exécutif et partis) et une part d'audience publiée par Médiamétrie ; presse = quotidiens nationaux d'information générale et politique du classement OneNext et agrégat PQR66. Non retenus, avec leur motif : RMC Découverte, Radio Classique, Novo19, RMC Life (moins d'une heure par mois), BFM Business et Sud Radio (aucune part d'audience dans les deux mesures utilisées), L'Équipe (quotidien sportif), Le Parisien IDFO (édition déjà comprise), total PQN, 32 lignes régionales représentées par PQR66 ; émissions *L'Événement* (remplacée par *L'Heure de vérité* selon la source) et *Questions politiques* (arrêtée le 28 juin 2026). Articles introuvables sous les titres essayés : « BFM Politique », « Dimanche en politique », « La Grande Interview », « Punchline », « Face à face » (aucune émission de BFMTV, LCI, France Inter, France Info ni RMC n'est donc retenue).
- **Poids d'audience dans le jeu** (`hypothese`, jeu de règles 5.0.0) : part de l'organe dans l'audience cumulée des organes retenus de son type × poids du type (télévision 1, radio 0,6, presse 0,4). Les indicateurs diffèrent d'un type à l'autre (part du temps d'écoute, lectorat) : ces poids sont des choix de jeu, pas une mesure comparée.
- **Exposition relative d'un parti** (`estimation`) : part du parti sur le service ÷ part sur l'ensemble des services retenus, bornée à [0,5 ; 2] dans le jeu ; partis suivis : au moins dix heures cumulées. Décrit l'exposition observée sur la période, **pas une ligne éditoriale**. Personnalités sans parti suivi (exposition moyenne) : Nathalie Arthaud (Lutte ouvrière, 4,6 h), François Asselineau (UPR, 2 min), David Lisnard (Nouvelle Énergie, 6,8 h) ; candidats fictifs et personnalisés : exposition moyenne.
- **Crédibilité** identique pour tous les organes (0,7) ; tonalité de la couverture tirée des seuls facteurs du jeu (popularité, crédibilité du programme, aléa, incidents).
- Une réimportation (nouveau mois Arcom, nouvelle vague, nouvelle révision) impose une nouvelle version du jeu de règles (empreinte vérifiée par les tests).

## 9. Points restant non vérifiés

1. Texte exact, sur Légifrance, de la loi n° 62-1292 (parrainages, financement) et de l'article L. 52-11.
2. Publication du décret de convocation des électeurs pour 2027.
3. Conditions de réutilisation des résultats présidentiels 2022 (licence `notspecified`).
4. ~~Structure du fichier communal du 1er tour 2022 pour Paris, Lyon, Marseille, et nombre exact de lignes `ZZ`.~~ Vérifié en phase 4 : une ligne par ville au 1er tour aussi (75056, 69123, 13055) ; 210 lignes `ZZ` à chaque tour.
5. Licence du fichier INSEE des contours de circonscriptions ; texte de référence du découpage.
6. Zéros initiaux des codes métropolitains dans les fichiers des législatives 2024.
7. Sources des indicateurs économiques initiaux (Banque de France, INSEE) : à identifier en phase 6.
8. Conditions de réutilisation des relevés de temps de parole de l'Arcom (page sans licence), des mesures de Médiamétrie et des classements de l'ACPM : seuls quelques chiffres agrégés sont repris avec citation ; à confirmer avant une mise en ligne publique.

## 10. Métadonnées obligatoires de chaque import (§10)

Chaque import enregistre dans `DataImport` : source, URL exacte, date de récupération, millésime, licence, période de validité, transformations appliquées, empreinte SHA-256 du fichier brut, version de l'importeur, nombre de lignes, statut. Les mises à jour sont versionnées ; un import qui ne passe pas ses contrôles est rejeté en entier.

## 11. Données de démonstration

Un jeu réduit, commité dans `data/demo/`, permet de jouer hors ligne (§10). S'il est dérivé de données réelles, il en conserve la source et la licence (sous réserve du point 3 de la section 9) ; s'il est synthétique, il est étiqueté `fictif`.

Réalisé en phase 4 : `packages/data-import/demo/cog-2026/` contient des géométries réelles (IGN, INSEE, Licence Ouverte 2.0, sources et empreintes dans son manifeste) pour l'aperçu national et les communes de l'Ain, de la Corse et des DROM. Aucun résultat 2022 n'y figure : la base électorale de démonstration est synthétique et affichée « Démonstration fictive ».
