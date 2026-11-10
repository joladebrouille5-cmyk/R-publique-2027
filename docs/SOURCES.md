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

- Résultats (Licence Ouverte 2.0, vérifié) : https://www.data.gouv.fr/datasets/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour · https://www.data.gouv.fr/datasets/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-2nd-tour. Contrairement à 2022, les codes outre-mer y sont de style INSEE (`971;Guadeloupe;97101…`) ; `ZX` et `ZZ` subsistent.
- **Import de la phase 6** (`pnpm data:legislatives`, 21/10/2026) : fichiers « résultats définitifs par circonscription » du 10/07/2024 (1er tour SHA-256 `dbeb0214…ab3f`, 2nd tour `bcc062b9…1083`). Constats, conservés tels quels et non masqués :
  - le fichier du 1er tour omet les zéros initiaux des codes métropolitains (`1`, `101`) alors que celui du 2nd tour les porte (`01`, `0101`) : l'importeur les rétablit (point 6 du §9 résolu) ;
  - 577 circonscriptions, dont **76 pourvues au premier tour** ;
  - dans 4 circonscriptions (1602 : +2, 2704 : −1, 3404 : −1, 7502 : +2), la somme des voix par nuance diffère des exprimés publiés : l'écart est conservé dans un champ `ecart` ;
  - Polynésie française, 3e circonscription (98703) : nuance de l'élu UG au 2nd tour, REG au 1er tour (nuances attribuées différemment d'un tour à l'autre) ; conservé tel quel.
  Seules les voix **par nuance** et la nuance de l'élu sont lues : **aucun nom de candidat n'est conservé**. Sortie commitée : `packages/rulesets/src/legislatives-2024.json` (empreinte vérifiée par `presidentielle-2027@9.0.0`).
- **Règles** (citées d'après Wikipédia, révisions datées ; Légifrance refusant l'accès) : dissolution, élections générales 20 à 40 jours plus tard, pas de nouvelle dissolution dans l'année qui suit (art. 12, révision 230532189) ; élu au premier tour avec la majorité absolue des exprimés et au moins 25 % des inscrits, second tour ouvert aux candidats ayant réuni 12,5 % des inscrits (sinon les deux premiers), fin des pouvoirs le troisième mardi de juin, cinq ans après l'élection (loi organique n° 2001-419) : article « Élections législatives en France », révision 239629789. Fin de la législature élue en 2024 : **mardi 19 juin 2029** (déduit). Dates des législatives de 2029 : 10 et 17 juin 2029 (**hypothèse** sur le modèle de 2022 ; dates réelles fixées par décret).
- **Simulation** (hypothèses du jeu de règles) : nuances regroupées en cinq blocs (gauche, centre, droite, RN et alliés/extrême droite, régionalistes et divers) et groupes de l'Assemblée rattachés à ces blocs ; un candidat par bloc dans chaque circonscription ; voix de 2024 modulées par l'écart national de chaque bloc (élan présidentiel, popularité du président, aléa) et un aléa local ; reports de voix au second tour selon la proximité des blocs ; sièges d'un bloc répartis entre ses groupes au prorata de leurs sièges sortants. Les désistements entre les deux tours ne sont pas simulés.
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

### 4.1 Mandat et cycles suivants (phase 6)

| Fait | Valeur | Statut | Source |
|---|---|---|---|
| Durée du mandat, limite des mandats | « Le Président de la République est élu pour cinq ans au suffrage universel direct. Nul ne peut exercer plus de deux mandats consécutifs. » (art. 6 de la Constitution) | vérifié par une source secondaire ; **texte Légifrance non relu** (accès refusé, 403, le 21/10/2026) | article Wikipédia « Article 6 de la Constitution de la Cinquième République française », révision 239702659 du 21/09/2026 : https://fr.wikipedia.org/w/index.php?title=Article_6_de_la_Constitution_de_la_Cinqui%C3%A8me_R%C3%A9publique_fran%C3%A7aise&oldid=239702659 (consulté le 21/10/2026) |
| Fenêtre de l'élection | « L'élection du nouveau président a lieu vingt jours au moins et trente-cinq jours au plus avant l'expiration des pouvoirs du président en exercice. » (art. 7) ; appliquée au premier tour, comme en 2012, 2017 et 2022 | vérifié par une source secondaire ; texte Légifrance non relu | révision 240299785 du 12/10/2026 de l'article Wikipédia « Article 7 de la Constitution… » : https://fr.wikipedia.org/w/index.php?title=Article_7_de_la_Constitution_de_la_Cinqui%C3%A8me_R%C3%A9publique_fran%C3%A7aise&oldid=240299785 |
| Début du mandat issu de l'élection de 2027 | vendredi 14 mai 2027 | déduit (mandat de 2022 « à compter du 14 mai 2022 à 0 heure », cinq ans) | décision n° 2022-197 PDR (§3.2) ; art. 6 |
| Fin de ce mandat | jeudi 13 mai 2032 à minuit ; les mandats suivants se décalent de cinq ans jour pour jour | déduit | art. 6 |
| Présidentielle 2032 (jeu) | calendrier de 2027 décalé de 261 semaines : 1er tour dimanche 18 avril 2032 (fenêtre de l'art. 7 : du 9 au 24 avril 2032), 2nd tour 2 mai 2032 | **hypothèse** (dates réelles fixées par décret le moment venu) | règle du jeu de règles `presidentielle-2027@6.0.0` |
| Présidentielle 2037 (jeu) | décalage de 522 semaines : 1er tour dimanche 19 avril 2037 (fenêtre : du 9 au 24 avril 2037), 2nd tour 3 mai 2037 | **hypothèse** | idem |
| Échéances de campagne de 2032 et 2037 (jeu) | ouverture et clôture des présentations, dépôt des comptes : dates de 2027 transposées du même nombre de semaines (étape P6-08) | **hypothèse** (source : conception du jeu) | fonction `cycleRuleset` de `@r2027/shared` |

Remarque : la page de l'Élysée mentionne une consultation des partis « le 29 juillet 2026 » dans un compte rendu du 1er juillet, et un décret qui « interviendra en début d'année 2026 » : incohérences apparentes de la page officielle, signalées telles quelles.

**Dans le jeu** : ces dates entrent dans le *ruleset* `presidentielle-2027` avec le statut `annoncé` (et non `officiel`) jusqu'à la publication du décret. La date de scrutin est portée **par territoire** (vote du samedi).

### 4.2 Calendrier réel de la campagne (phase 20)

| Fait | Valeur | Statut | Source |
|---|---|---|---|
| Jours fériés | onze jours fériés du droit national (« légalement définis par le code du travail », articles L. 3133-1 à 3) : 1er janvier, lundi de Pâques, 1er mai, 8 mai, jeudi de l'Ascension (« 40e jour à partir du dimanche de Pâques »), lundi de Pentecôte (« 50 jours après le dimanche de Pâques »), 14 juillet, 15 août, 1er novembre, 11 novembre, 25 décembre ; jours propres à l'Alsace-Moselle et aux outre-mer non retenus (jeu national) | vérifié par une source secondaire ; **texte Légifrance non relu** (accès refusé, 403, le 03/11/2026) | article Wikipédia « Fêtes et jours fériés en France », révision 239433226 du 12/09/2026 : https://fr.wikipedia.org/w/index.php?title=F%C3%AAtes_et_jours_f%C3%A9ri%C3%A9s_en_France&oldid=239433226 (consulté le 03/11/2026) |
| Dates des jours fériés (2026-2027 et cycles suivants) | calculées par `publicHolidays` de `@r2027/shared` : dates fixes et dimanche de Pâques par le comput grégorien (algorithme de Meeus, Jones et Butcher ; Pâques 2027 le 28 mars, lundi de Pâques le 29 mars) ; aucune date écrite en dur | déduit | règle ci-dessus ; tests `feries.test.ts` |
| Effet dans le jeu | une semaine qui compte un jour férié du lundi au samedi retire 6 h de campagne à chaque candidat en lice (`jeu.heuresSemaineFeriee`) | **hypothèse de jeu** | conception du jeu |
| Ouverture de la campagne officielle et égalité du temps de parole | en 2022, « la campagne officielle débute le 28 mars 2022, deux semaines avant le premier tour, lançant ainsi la période d'égalité du temps de parole là où l'équité était la règle depuis la publication des candidats par le Conseil constitutionnel » ; pour 2027 : **lundi 5 avril 2027**, deux semaines avant le premier tour du 18 avril | **hypothèse** (précédent de 2022 ; date officielle fixée par décret, non publié) | article Wikipédia « Élection présidentielle française de 2022 », révision 240947813 du 02/11/2026 : https://fr.wikipedia.org/w/index.php?title=%C3%89lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2022&oldid=240947813 (consulté le 03/11/2026) |
| Règles de l'Arcom en période électorale | « une recommandation propre à chaque scrutin », règles qui « s'appliquent généralement durant les six semaines précédant l'élection » ; l'Arcom veille « à l'égalité stricte pour l'élection présidentielle » | vérifié (relu sur la page le 03/11/2026, empreinte SHA-256 de la page `f5377979794e0281ae48a86ca2829432d74ba02234da45ff7f6193dc2cc772e0`) | Arcom, « Temps de parole politique » : https://www.arcom.fr/temps-parole |
| Effet dans le jeu | de l'ouverture de la campagne officielle au second tour, la part de l'exposition qui suit la notoriété est la même pour chaque candidat en lice à la télévision et à la radio, sans propension par parti (`medias.periodeElectorale`) ; la presse écrite reste à la notoriété ; seules les actions font varier l'exposition à l'antenne | modélisation (hypothèse de jeu fondée sur la règle) | conception du jeu |

Dans le jeu (jeu de règles `presidentielle-2027@19.0.0`) : les jours fériés figurent au calendrier électoral et dans les échéances proches du bilan (« date déduite d'une règle ») ; l'ouverture de la campagne officielle est une échéance du calendrier, transposée pour 2032 et 2037 comme les autres (`cycleRuleset`, statut « hypothèse »). Lieux réels : deux coups adverses (tractage, ralliement d'un maire fictif) se déroulent dans un département réel où le joueur a fait campagne, comme les événements locaux de la phase 11.

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
- Composition comptée dans ce fichier : **574 députés en exercice** (3 sièges sur 577 non pourvus, cause non vérifiée) — RN 121 · EPR 90 · LFI-NFP 70 · SOC 68 · DR 47 · EcoS 38 · Dem 37 · HOR 35 · LIOT 23 · GDR 17 · UDR 17 · non-inscrits 11.
- **Import de la phase 6** (`pnpm data:assemblee`, 21/10/2026) : fichier modifié le 19/10/2026 (en-tête du serveur), SHA-256 `66a10580…bdb9` ; mêmes effectifs. Seules les colonnes « Groupe politique (abrégé) » et « Groupe politique (complet) » sont lues : **aucun nom de député n'est conservé**. Sortie commitée : `packages/rulesets/src/assemblee-2026.json` (empreinte vérifiée par le jeu de règles `presidentielle-2027@7.0.0`).
- **Position des groupes** : parti de référence dans l'enquête CHES 2024, convertie par (x − 5) × 20 (statut `estimation`) — RN → RN, EPR → RE, LFI-NFP → FI, SOC → PS, DR → LR, EcoS → LE/EELV, Dem → MoDem, HOR → Horizons, GDR → PCF. Sans parti noté (statut `hypothese`) : LIOT (groupe composite) au centre ; UDR à la moyenne des partis français des familles CHES « droite radicale » et « conservateurs » (d'après l'intitulé du groupe) ; non-inscrits au centre, sans discipline de vote.
- **Règles constitutionnelles** (citées d'après Wikipédia, révisions datées ; Légifrance refusant l'accès) : session ordinaire du premier jour ouvrable d'octobre au dernier jour ouvrable de juin (art. 28, révision 234377898) ; navette, commission mixte paritaire et dernier mot à l'Assemblée (art. 45, révision 230532500) ; motion de censure signée par un dixième des membres, seuls les votes favorables recensés, adoptée à la majorité des membres ; engagement de responsabilité sur un projet de loi de finances ou de financement de la sécurité sociale, et sur un autre texte une fois par session (art. 49, révision 240034355).
- **Simulation** (hypothèses du jeu de règles) : vote en bloc de chaque groupe (discipline 95 %, non-inscrits 50 %, participation 90 %) selon la distance entre sa position et celle du texte et sa position à l'égard du président (soutien, non aligné, opposition, d'après la proximité des positions) ; concessions (+0,15 de soutien, −25 % d'effet chacune, deux au plus) ; Sénat non modélisé groupe par groupe : accord tiré au sort (70 %, ordre de grandeur indiqué par l'article Wikipédia sur l'article 45, non vérifié), lecture définitive à l'Assemblée sinon ; décision de censurer selon l'éloignement et l'impopularité du président. **Aucun vote n'est attribué à un député réel.**

## 7 bis. Économie (phase 6)

Import `pnpm data:economie` du 21/10/2026 : pages publiques des séries de l'Insee (`https://www.insee.fr/fr/statistiques/serie/{idbank}`, lues par la réponse JSON de la page ; `bdm.insee.fr` et `api.insee.fr` refusés depuis l'environnement). Licence : conditions de réutilisation de l'Insee non consultées ; seules quelques valeurs publiées sont reprises, avec citation de la série. Sortie commitée : `packages/rulesets/src/economie-2026.json` (empreinte vérifiée par `presidentielle-2027@8.0.0`).

| Indicateur | Valeur de départ | Période | Statut | Série(s) |
|---|---|---|---|---|
| Croissance du PIB sur un an | +0,50 % | 4 trimestres jusqu'au T2 2026 | déduit (produit des quatre évolutions trimestrielles) | 011794844 (évolution trimestrielle du PIB en volume, CVS-CJO, base 2020) |
| Inflation | 3,10 % | septembre 2026 | estimation | 011814632 (IPC base 2025, glissement annuel, ensemble) |
| Chômage (BIT) | 8,30 % | T2 2026 | estimation | 001688527 (France hors Mayotte, CVS) |
| Solde public | −5,00 % du PIB | 4 trimestres jusqu'au T2 2026 | déduit (somme des besoins de financement / somme des PIB) | 011794759 (capacité ou besoin de financement des APU) et 011794859 (PIB en valeur) |
| Dette publique | 119,00 % du PIB | T2 2026 | estimation | 010777608 (dette au sens de Maastricht, base 2020) |
| Confiance des ménages | 86 | septembre 2026 | estimation | 001587668 (indicateur synthétique, CVS) |
| PIB annuel en valeur | 3 022 609 M€ | 4 trimestres jusqu'au T2 2026 | déduit | 011794859 |

Pouvoir d'achat (indice 100 au début du quinquennat) et tensions sociales (indicateur de jeu, 40/100 au départ) : **conventions du jeu**, sans série officielle. L'évolution de tous les indicateurs est **simulée** (modèle de jeu étiqueté `hypothese` dans le jeu de règles : retour vers une croissance potentielle de 1 %, une inflation de 2 % et un chômage structurel de 7,5 %, loi d'Okun, part conjoncturelle du déficit, dette nourrie par le déficit et allégée par la croissance nominale, réformes chiffrées par le coût annuel estimé de la proposition, crises fictives) : ce ne sont pas des prévisions.

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
| Débats (poids des composantes), alliances (fenêtre de 10 semaines, seuils), IA (budget, notoriété de départ, actions, température par difficulté ; cinq niveaux depuis la phase 18), moyens et promesses de départ du joueur par niveau | paramètres de jeu | `hypothese` | conception du jeu |

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
| Raphaël Glucksmann | Place publique | 2026-10-11 (désignation) — Libération | -33 / -45 | `estimation` (parti_soutien : PS 2024) | CC BY-SA 4.0 — Librairie Mollat (photo choisie sur Commons, voir ci-dessous) |
| Marine Le Pen | Rassemblement national | 2026-07-07 (déclaration) — Euronews | 20 / 67 | `estimation` (parti : RN 2024) | CC0 — Vox España |
| David Lisnard | Nouvelle Énergie | 2026-03-31 (déclaration) — Franceinfo.fr | 56 / 44 | `hypothese` (ancien_parti : LR 2024) | CC BY-SA 4.0 — Grégor Sauvagère |
| Jean-Luc Mélenchon | La France insoumise | 2026-05-03 (déclaration) — Le Monde | -82 / -64 | `estimation` (parti : FI 2024) | CC BY 4.0 — jlm2017.fr |
| Édouard Philippe | Horizons | 2024-09-03 (déclaration) — Le Point | 36 / 6 | `estimation` (parti : Horizons 2024) | CC0 — Wasasaq8 |
| Bruno Retailleau | Les Républicains | 2026-04-19 (désignation) — Le Monde | 56 / 44 | `estimation` (parti : LR 2024) | CC BY 4.0 — Anthonymontardyfr |
| Fabien Roussel | Parti communiste français | 2026-09-06 (désignation) — Le Figaro | -75 / -29 | `estimation` (parti : PCF 2024) | CC BY-SA 4.0 — Zouhair NAKARA |
| François Ruffin | Debout ! | 2025-04-01 (déclaration) — Le HuffPost | -75 / -29 | `hypothese` (ancien_parti : PCF 2024) | CC BY-SA 4.0 — Thinkerview |
| Marine Tondelier | Les Écologistes | 2026-09-21 (désignation) — Le Monde | -54 / -66 | `estimation` (parti : LE/EELV 2024) | CC BY-SA 4.0 — Greenbox |
| Éric Zemmour | Reconquête | 2026-09-17 (déclaration) — BFM TV | 67 / 82 | `estimation` (parti : REC 2024) | CC0 — Anh De France |
| Teddy Riner (phase 25 ter, ajout à la main) | Sans parti | 2026-11-09 (déclaration) — [RTS](https://www.rts.ch/info/monde/2026/article/presidentielle-2027-teddy-riner-annonce-sa-candidature-29410550.html) | 0 / 0 | `hypothese` (sans_parti) | aucune (motif dans la fiche) |

Remarques :
- **Statut** : `estimation` = position d'experts du parti de la personnalité (ou du parti qui soutient officiellement sa candidature : Parti socialiste pour Raphaël Glucksmann) ; `hypothese` = rattachement indirect, détaillé dans la fiche.
- **Source de la candidature de François Asselineau** : les références de la phrase portent sur une procédure judiciaire ou sur une autre personnalité ; l'article lui-même sert de source. L'importeur refuse toute référence de candidature portant sur une procédure judiciaire (relecture humaine imposée).
- **Photo de Raphaël Glucksmann** (phase 9, jeu de règles 11.0.0) : la photo de l'article, diffusée par le Parlement européen, n'est pas sous licence libre ; la sélection de l'importeur désigne à la place le portrait « Raphaël_Glucksmann.jpg » de Wikimedia Commons (CC BY-SA 4.0, Librairie Mollat), dont la licence est vérifiée comme les autres. Le motif est consigné dans la fiche (`photo.choix`) et affiché avec le crédit. Réimport sur la même révision de l'article : `pnpm data:personnalites -- --revision 240556510`. À défaut de photo, l'interface affiche les initiales sur la couleur de la famille politique.
- **Candidatures non intégrées** (aucun parti noté par CHES) : Delphine Batho, Bernard Cazeneuve, Sylvain Durif, Anasse Kazib, Selma Labib, Francis Lalanne, Mira Markovic, Benoît Mathieu, Antoine Mikolajczak, Manolo Mlekuz, Florian Philippot, Gilles Platret, Natacha Polony (liste affichée dans le jeu).
- **Teddy Riner** (décision de l'utilisateur du 10/11/2026, jeu de règles 24.0.0) : candidature annoncée le 9 novembre 2026, postérieure à la révision importée de l'article Wikipédia (et l'API Wikipédia refusait alors nos requêtes, erreur 429) ; fiche ajoutée à la main dans la sélection de l'importeur (`AJOUTS_MANUELS`, jointe à chaque import). Faits repris : judoka en activité, « quintuple champion olympique » (formulation de la RTS ; d'autres articles comptent les seuls titres individuels, trois) ; candidature sans parti ni élus. Recoupé par la publication du candidat sur X et par [LCP](https://lcp.fr/actualites/le-judoka-teddy-riner-annonce-sa-candidature-a-l-election-presidentielle-de-2027-444920). **Aucun propos, slogan ni élément de programme n'est repris** (règle du projet), ni de positionnement déclaré : sa position est le milieu de l'échelle du jeu (0, 0), hypothèse `sans_parti`. Notoriété de niveau 3 (règle étendue en phase 25 ter : personnalité de premier plan hors politique), organisation « aucune » (ni parti ni élu ; financement de campagne par dons et fonds propres modélisé par les moyens du niveau « aucune », hypothèse), aucune implantation (aucun mandat). Médias : aucun temps de parole Arcom sur la période, exposition moyenne. Sondages réels : jamais testé dans les cinq enquêtes retenues (socle minimal). Pas de photo importée.
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

## 8 sexies. Réseaux sociaux et nouveaux médias (phase 9)

Formats réels repris comme exemples, chacun avec un fait vérifié dans une révision figée de Wikipédia (consultée le 22/10/2026), reformulé sans propos ni citation d'un animateur :

| Format du jeu | Exemple | Fait retenu | Source |
|---|---|---|---|
| Interview longue sur YouTube | Legend | émission d'entretiens longs avec des personnalités, diffusée en podcast et sur YouTube depuis 2022 | [Wikipédia, « Guillaume Pley », rév. 240531960](https://fr.wikipedia.org/w/index.php?title=Guillaume_Pley&oldid=240531960) |
| Format décryptage | HugoDécrypte | média en ligne français fondé en 2015, qui traite l'actualité dans de courtes vidéos et se veut ouvert aux jeunes | [Wikipédia, « HugoDécrypte (média) », rév. 238305935](https://fr.wikipedia.org/w/index.php?title=HugoD%C3%A9crypte_%28m%C3%A9dia%29&oldid=238305935) |
| Vidéos courtes verticales | TikTok | réseau social lancé en 2016 où des créateurs publient des vidéos très courtes au format vertical | [Wikipédia, « TikTok », rév. 240352054](https://fr.wikipedia.org/w/index.php?title=TikTok&oldid=240352054) |
| Vidéos courtes verticales | YouTube Shorts | vidéos courtes au format vertical publiées sur YouTube (trois minutes au plus), déployées en Europe en juillet 2021 | [Wikipédia, « YouTube Shorts », rév. 238801749](https://fr.wikipedia.org/w/index.php?title=YouTube_Shorts&oldid=238801749) |
| Direct sur Twitch | Twitch | plateforme de diffusion en direct sur Internet lancée en juin 2011, filiale du groupe Amazon | [Wikipédia, « Twitch », rév. 240180491](https://fr.wikipedia.org/w/index.php?title=Twitch&oldid=240180491) |

Tout le reste est **simulé** et étiqueté `hypothese` dans le jeu de règles (`numerique`) : effets des formats sur les jauges Jeunesse (écho chez les 18-34 ans) et Dynamique (buzz), usure (4 % par semaine) et retombée (35 % par semaine), poids dans le score latent (un poids plus fort pour les électeurs éloignés de la politique, hypothèse non calibrée), vues des publications, réactions. Les comptes qui réagissent sont **inventés** (pseudonymes du jeu de règles) ; leurs textes sont des modèles du jeu, sans nom de personne et sans propos prêté à un animateur, à une chaîne ni à une personne réelle (contrôlé par les tests du jeu de règles). Aucune audience réelle d'une plateforme n'est reprise.

## 8 septies. Soirée électorale (phase 9)

Aucune donnée officielle n'est reprise : la soirée est une **mise en scène** du résultat simulé du tour. Horaires des tranches (de 20 h 00 à 0 h 00, toutes les demi-heures), ordre et rythme du dépouillement (outre-mer annoncé dès 20 h, départements les moins peuplés plus tôt, tirage déterministe pour le reste), révélation des communes et écart de l'estimation de 20 h (au plus 1,5 point, nul à minuit) sont des **hypothèses de présentation** du jeu, codées dans le module `soiree` de `@r2027/shared` et affichées comme telles à l'écran. Les heures réelles de fermeture des bureaux et de publication des estimations ne sont pas modélisées. Les chiffres affichés à chaque tranche sont des fractions exactes du résultat du moteur ; à minuit, ce sont ceux de l'écran Résultats.

## 8 octies. Débats télévisés et interview longue (phase 10)

Aucune donnée officielle n'est reprise pour les débats : leur organisation n'est fixée par aucun texte, et le jeu ne présente aucun débat comme annoncé. Tout est étiqueté `hypothese` (source `conception-du-jeu`) dans le jeu de règles `presidentielle-2027@12.0.0` :

| Élément | Valeur du jeu | Statut |
|---|---|---|
| Dates | « Grand débat à cinq » le mercredi 24 mars 2027 à 21 h (cinq premiers du dernier sondage) ; « Débat de tous les candidats » le mardi 6 avril 2027 à 21 h ; « Débat d'entre-deux-tours » le mercredi 28 avril 2027 à 21 h (deux finalistes). Transposées pour 2032 et 2037 par `cycleRuleset`. | `hypothese` |
| Chaînes | TF1, BFMTV, France 2 : organes réels de la liste des médias (§8 quinquies) ; aucun journaliste nommé, aucune question attribuée. | chaînes réelles, plateau simulé |
| Déroulé | 4 séquences et une conclusion (premier tour), 5 et une conclusion (second tour) ; 3 cartes par séquence ; thèmes repris des domaines du programme du jeu. | `hypothese` |
| Compétence | préparation 30 % (40 heures utiles, usure de 10 % par semaine), maîtrise 25 % (notoriété, équipe), cohérence du programme 15 %, qualité des réponses (aléa) 30 %. | `hypothese` |
| Approbation du public | de 0 à 100, départ à 50 ; gains et pertes par carte (défendre, attaquer, retour de bâton, riposte, hauteur, petite phrase) ; sondage flash « le plus convaincant » tiré de l'approbation finale. | `hypothese`, simulé |
| Effets | popularité, notoriété (forte pour les petits candidats), dynamique, chaise vide (−1,2 point de popularité) ; facteur de vote « Débats télévisés » qui s'estompe (au plus environ 2 points d'intentions au premier tour, 3 au second, vérifié par les tests du moteur). | `hypothese` |
| Refus d'un favori IA | si son avance dépasse 8 points dans le dernier sondage, probabilité 35 %. | `hypothese` |

Les **attaques** ne portent que sur des faits de la partie (crédibilité du programme, revirements, dons refusés, ralliements, bilan d'un président sortant) : une attaque dont le fait est faux se retourne contre son auteur. Les **répliques** sont des modèles du jeu de règles, écrites pour le joueur et les candidats fictifs seulement ; un coup d'une personnalité réelle est décrit sans aucune réplique (« Coup simulé : aucune réplique n'est prêtée à une personnalité réelle »), ce que vérifient les tests du moteur et de l'interface. Les comptes qui réagissent pendant le débat sont inventés.

**Interview longue (format « Legend », §8 sexies)** : le format et son exemple sont réels ; l'entretien est simulé. Effets du jeu (hypothèses) : Jeunesse +10 points, Popularité +1 point, Notoriété +2,5 points, Dynamique +8 points (avec saturation à la répétition) ; risque « contradiction avec son parcours » de 8 %, majoré de 5 points par revirement de programme et de 4 points par interview longue des 12 dernières semaines (au plus 35 %), dont la perte de popularité s'étale sur trois semaines. L'événement ne décrit aucun contenu, et rien n'est attribué à l'animateur ni à une personne réelle.

## 8 nonies. Personnalités nominables au gouvernement (phase 11)

> Fiches et méthode remplacées à partir du jeu de règles 15.0.0 (phase 14) : voir le [§8 undecies](#8-undecies-vivier-élargi-et-expertise-ministérielle-phase-14).

Demande de l'utilisateur du 22/10/2026 (phase 11, demande 2) : figures clés des partis, dont Jordan Bardella et Jean-Philippe Tanguy, nominables à Matignon et aux ministères régaliens. Sélection éditoriale (dans [`packages/data-import/src/gouvernement/selection.ts`](../packages/data-import/src/gouvernement/selection.ts)) : responsables nationaux des partis représentés par un groupe à l'Assemblée nationale ; les personnalités candidates à la présidentielle (§8 quater) restent nominables comme acteurs de la partie et ne sont pas reprises ici. Import : `pnpm data:gouvernement` ; fiches dans [`packages/rulesets/src/gouvernement-2027.json`](../packages/rulesets/src/gouvernement-2027.json), photos dans `apps/web/public/gouvernement/`. Jeu de règles `presidentielle-2027@13.0.0`.

| Source | Usage | Version, licence |
|---|---|---|
| Wikipédia, article de chaque figure (infobox « Personnalité politique ») | libellés des fonctions et leurs dates (`fonctionN`, « depuis le », « à partir du », « jusqu'au ») ; aucune phrase de l'article | révisions du 22/10/2026 (numéro de révision dans chaque fiche) ; texte CC BY-SA 4.0 : seuls les libellés des fonctions et leurs dates sont repris ; empreinte SHA-256 de la réponse dans les fiches |
| Wikidata (requête SPARQL) | identifiant ; appartenance en cours au parti (P102, sans date de fin), vérifiée ; ancien parti pour une position « hypothèse » ; photo (P18) | CC0 1.0 ; requête du 22/10/2026, empreinte dans les fiches |
| Wikimedia Commons | photos ; licence et auteur lus dans les champs lisibles par machine de la page du fichier | licences acceptées : CC0, domaine public, CC BY et CC BY-SA 1.0 à 4.0 (2.5 comprise), Licence Ouverte d'Etalab ; photos réduites (240 px, WebP), métadonnées retirées |
| Chapel Hill Expert Survey 2024 (§8 quater) | position du parti, convertie par (x − 5) × 20 | même fichier et même licence qu'au §8 quater |
| Assemblée nationale (§7, fichier du 19/10/2026) | taille du groupe associé au parti (niveau 3 de notoriété à partir de 60 députés) ; groupe associé à chaque parti (table du jeu) | Licence Ouverte |

Méthodes (écrites dans les fiches et affichées dans Paramètres → Crédits) :
- **Nature des fonctions** : déduite du libellé (Premier ministre ; ministre ou garde des Sceaux ; secrétaire d'État ou ministre délégué ; mandat parlementaire ; exécutif local ; direction d'un parti, d'un groupe, d'une assemblée, d'une commission ou d'une association d'élus ; autre).
- **Compétence** (`estimation`, somme de facteurs affichée) : 0,30 ; + 0,30 si Premier ministre ; + 0,15 pour une fonction de ministre et + 0,05 par fonction de ministre supplémentaire (plafond + 0,25) ; + 0,05 par fonction de secrétaire d'État ou de ministre délégué (plafond + 0,10) ; + 0,05 à partir de 5 ans de mandats parlementaires cumulés, + 0,10 à partir de 10 ans ; + 0,05 pour un exécutif local ; + 0,05 pour une fonction de direction ; plafond 0,90. Une estimation de jeu, sans prétention de mesure.
- **Notoriété** (1 à 3) : niveau 3 pour un Premier ministre (en fonction ou ancien) ou la direction nationale en cours d'un parti dont le groupe compte au moins 60 députés ; niveau 2 pour un ministre, secrétaire d'État ou ministre délégué, une autre fonction de direction en cours ou la présidence en cours d'un conseil régional ; niveau 1 sinon. Le jeu en tire une **popularité prêtée** (hypothèse, `quinquennat.equipe.popularite` : 27, 30 et 33 points), jamais présentée comme un sondage.

Fiches retenues (économie / société sur −100 … +100) :

| Personnalité | Parti | Groupe | Fonction principale (source) | Révision | Position | Compétence | Notoriété | Photo |
|---|---|---|---|---|---|---|---|---|
| Jordan Bardella | Rassemblement national | rn | Président du groupe Patriotes pour l'Europe au Parlement européen | 240613637 | 20 / 67 (`estimation`) | 0,40 | 3 | CC BY-SA 4.0 — English: Raphael ATTAL @BootEXE |
| Jean-Philippe Tanguy | Rassemblement national | rn | Député français | 240277243 | 20 / 67 (`estimation`) | 0,35 | 2 | CC BY-SA 4.0 — Rafaels06 |
| Sébastien Chenu | Rassemblement national | rn | Député français | 240310368 | 20 / 67 (`estimation`) | 0,35 | 1 | aucune (licence non reconnue comme libre (GFDL 1.2)) |
| Éric Ciotti | Union des droites pour la République | udr | Président de la Métropole Nice Côte d'Azur | 240251063 | 56 / 44 (`hypothese`) | 0,50 | 2 | CC BY 2.0 — European People's Party |
| Mathilde Panot | La France insoumise | lfi-nfp | Présidente du groupe LFI à l’Assemblée nationale | 240363721 | -82 / -64 (`estimation`) | 0,40 | 2 | CC BY 4.0 — original : Antoine Stouls modification : O.Taris |
| Manuel Bompard | La France insoumise | lfi-nfp | Coordinateur de La France insoumise | 240615624 | -82 / -64 (`estimation`) | 0,40 | 3 | aucune (licence non reconnue comme libre (European Parliament)) |
| Éric Coquerel | La France insoumise | lfi-nfp | Président de la commission des Finances de l’Assemblée nationale | 240568424 | -82 / -64 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Marche des fiertés de Paris 2017-14.jpg : Jérémie Silvestro Derivative work : Keymap9 |
| Élisabeth Borne | Renaissance | epr | Députée française | 240523260 | 24 / -18 (`estimation`) | 0,90 | 3 | CC BY-SA 4.0 — Andrea Adriani © European Union 2022 |
| Gérald Darmanin | Renaissance | epr | Garde des Sceaux, ministre de la Justice | 240592460 | 24 / -18 (`estimation`) | 0,60 | 2 | CC BY 2.5 — UK Home Office |
| Yaël Braun-Pivet | Renaissance | epr | Présidente de l'Assemblée nationale | 239994034 | 24 / -18 (`estimation`) | 0,55 | 2 | CC BY 2.0 — Houses of the Oireachtas from Ireland |
| Sébastien Lecornu | Renaissance | epr | Premier ministre français chargé de la Planification écologique et énergétique | 240418778 | 24 / -18 (`estimation`) | 0,90 | 3 | Public domain — U.S. Secretary of Defense |
| Olivier Faure | Parti socialiste | soc | Premier secrétaire du Parti socialiste | 240579524 | -33 / -45 (`estimation`) | 0,45 | 3 | CC BY-SA 2.0 — Olivier Faure |
| Boris Vallaud | Parti socialiste | soc | Président du groupe socialiste à l'Assemblée nationale | 239852242 | -33 / -45 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Bloody-libu |
| Carole Delga | Parti socialiste | soc | Présidente des Régions de France | 239496419 | -33 / -45 (`estimation`) | 0,45 | 2 | CC BY-SA 3.0 — Clément Bucco-Lechat |
| Laurent Wauquiez | Les Républicains | dr | Président du groupe Droite républicaine à l'Assemblée nationale | 240253315 | 56 / 44 (`estimation`) | 0,70 | 2 | CC BY 2.0 — European People's Party |
| Valérie Pécresse | Les Républicains | dr | Présidente de Soyons libres | 240408505 | 56 / 44 (`estimation`) | 0,60 | 2 | CC BY-SA 4.0 — Gail Leenstra |
| Cyrielle Chatelain | Les Écologistes | ecos | Présidente du groupe écologiste et social à l'Assemblée nationale | 237388032 | -54 / -66 (`estimation`) | 0,35 | 2 | CC BY-SA 4.0 — GLaG 38 - Guillaume LAGET |
| Yannick Jadot | Les Écologistes | ecos | Sénateur français | 240052469 | -54 / -66 (`estimation`) | 0,40 | 1 | aucune (licence non reconnue comme libre (European Parliament)) |
| François Bayrou | Mouvement démocrate | dem | Président du Mouvement démocrate | 240230804 | 14 / -10 (`estimation`) | 0,90 | 3 | Licence Ouverte — Service photographique de Matignon |
| Marc Fesneau | Mouvement démocrate | dem | Président du groupe Les Démocrates à l'Assemblée nationale | 236197196 | 14 / -10 (`estimation`) | 0,60 | 2 | CC BY 4.0 — European Commission Audiovisual Center |
| Christian Estrosi | Horizons | hor | Président délégué du conseil régional de Provence-Alpes-Côte-d'Azur | 240310067 | 36 / 6 (`estimation`) | 0,65 | 2 | CC BY-SA 3.0 — Olivier Ezratty |
| Ian Brossat | Parti communiste français | gdr | Sénateur français | 240072173 | -75 / -29 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — Ismaelelhajri |

Remarques :
- **Rattachement des candidats** : les personnalités candidates dont l'étiquette cite un parti de la table (Renaissance, Rassemblement national, La France insoumise, Parti socialiste, Les Républicains, Les Écologistes, Horizons, Parti communiste français…) sont associées au groupe de ce parti (`rattachements`) ; les autres n'apportent le soutien d'aucun groupe.
- **Photos non reprises** : licence GFDL seule (Sébastien Chenu) ou licence propre au Parlement européen (Manuel Bompard, Yannick Jadot) ; l'interface affiche alors les initiales.
- **Fonctions** : l'infobox de Wikipédia peut être en retard ou en avance sur un changement de fonction ; le libellé et les dates sont ceux de la révision importée, sans correction manuelle.
- **Ce qui est simulé** : la réponse d'une personnalité sollicitée (acceptation au-delà d'une proximité de 60/100 avec le président, sinon 25 % de chances ; en cohabitation, une personnalité d'un groupe de la majorité accepte Matignon), son action au gouvernement et ses effets. Aucun propos ni aucune citation n'est attribué (le schéma n'a aucun champ pour cela ; les tests du jeu de règles le vérifient).
- **Effets dans le jeu** (hypothèses, `quinquennat.equipe`) : popularité du président à la nomination (0,25 × écart de la popularité prêtée du Premier ministre à la référence, 0,05 par ministre régalien) ; action hebdomadaire du gouvernement (16 × (compétence de l'équipe − 0,5), équipe = moitié Premier ministre, moitié moyenne des ministres régaliens) ; gestion des crises (80 × (compétence du ministre du poste concerné − 0,5)) ; ouverture (un groupe non allié représenté au gouvernement : + 0,15 de soutien aux textes et − 0,3 de propension à censurer par membre, au plus deux) ; censure (− 0,6 × (compétence du Premier ministre − 0,5)). Tous passent par le registre des facteurs.

## 8 decies. Mandat vivant (phase 13)

Demande de l'utilisateur du 27/10/2026 (retour de test de William). Jeu de règles `presidentielle-2027@14.0.0`, format de sauvegarde 17. Aucune nouvelle donnée importée : les seules règles officielles ajoutées sont citées d'après Wikipédia (révisions figées), Légifrance refusant l'accès depuis l'environnement.

| Règle | Source | Usage dans le jeu |
|---|---|---|
| Le président « peut prendre la parole devant le Parlement réuni à cet effet en Congrès » ; un débat sans vote peut suivre, hors sa présence (Constitution, art. 18) | article Wikipédia « Article 18 de la Constitution de la Cinquième République française », [révision 239705826](https://fr.wikipedia.org/w/index.php?title=Article_18_de_la_Constitution_de_la_Cinqui%C3%A8me_R%C3%A9publique_fran%C3%A7aise&oldid=239705826) | action « Discours devant le Parlement réuni en Congrès » ; sa fréquence (une fois par an au plus) est une hypothèse de jeu |
| Un député ne peut signer plus de trois motions de censure au cours d'une même session ordinaire (art. 49 al. 2) | article Wikipédia « Article 49 de la Constitution… », [révision 240034355](https://fr.wikipedia.org/w/index.php?title=Article_49_de_la_Constitution_de_la_Cinqui%C3%A8me_R%C3%A9publique_fran%C3%A7aise&oldid=240034355) (déjà citée au §7) | au plus trois motions de censure spontanées par session ordinaire |
| Sous la Cinquième République, l'entrée au Panthéon est décidée par le président, « plus un état de fait qu'un véritable droit », sans texte officiel | article Wikipédia « Panthéon (Paris) », [révision 240490285](https://fr.wikipedia.org/w/index.php?title=Panth%C3%A9on_(Paris)&oldid=240490285) | action « Panthéonisation d'une grande figure de l'histoire » (figure non nommée ; une fois par mandat, hypothèse de jeu) |

Tout le reste est un **paramètre de jeu** (statut `hypothese` dans le jeu de règles), sans prétention de mesure :
- **Tension parlementaire** (`parlement.tension`, 0 à 100, somme de facteurs nommés) : base 10 ; part de l'opposition dans les sièges pourvus (× 40) ; voix manquantes pour la majorité des membres, rapportées à cette majorité (× 30) ; impopularité du président sous la référence du jeu (× 25) ; 12 par engagement de responsabilité (49.3) de la session ; 0,4 par frondeur (15 au plus) ; 6 par motion de censure de la session ; 0,3 par point de tensions sociales au-delà de 50/100 ; − 8 en coalition ; apaisement (discours devant le Congrès, commémoration, panthéonisation, sommet de crise, réunion de la majorité), qui décroît de 15 % par semaine. À partir de 65, une motion de censure spontanée devient possible (probabilité de 1,2 % par point à partir du seuil, six semaines au moins entre deux motions). Le coût du 49.3 en popularité et en tensions sociales est multiplié par 1 + tension/100.
- **Frondeurs** (`parlement.frondeurs`) : part des députés des groupes qui soutiennent le président votant contre un texte (au plus 30 %), selon l'éloignement du texte (au-delà d'une distance de 0,45), l'impopularité, la tension et la compétence du ministre concerné ; fronde de fond accrue de 5 % des sièges de chaque groupe de soutien après un 49.3, résorbée de 8 % par semaine (un député au moins) et par une réunion de la majorité ; négocier avec les frondeurs en retient 60 % pour 10 % d'effet perdu. Des **nombres** de députés, jamais un nom.
- **Opposition** (`parlement.opposition`) : à un vote clé (écart projeté entre pour et contre de 6 % des sièges pourvus au plus, 49.3, motion de censure), le premier groupe d'opposition par le nombre de sièges pèse sur les groupes non alignés (effet 0,12). Il n'est mené par une personne nommée que si un candidat **fictif** de la partie, autre que le président et le joueur, est proche de sa position (distance 0,6 au plus) ; aucune personnalité réelle ni aucun député réel n'est mis en scène, aucun propos n'est rapporté.
- **Ministres** (`quinquennat.equipe.themes`) : chaque poste couvre des domaines du programme et des indicateurs (table du jeu) ; la compétence du ministre (écart à 0,5) donne un bonus ou un malus de soutien aux textes de ses domaines, un effet hebdomadaire sur ses indicateurs et module les actions du président liées à son poste. Formules dans `@r2027/shared`, partagées par le moteur et l'affichage.
- **Actions du chef de l'État** (`quinquennat.actions`) : visite d'usine et de CHU (deux semaines entre deux visites), sommet de crise à l'Élysée (dans les quatre semaines qui suivent une crise), négociation avec les partenaires sociaux (six semaines), discours devant le Congrès (52 semaines), réunion de la majorité (quatre semaines), commémoration nationale (huit semaines), panthéonisation (260 semaines) : délais, effets, risques et apaisement sont des hypothèses de jeu.
- **Législatives** (`legislatives.alliances`) : campagne de six semaines ; investitures communes (un candidat commun, 80 % des voix du partenaire reportées ; acceptées entre blocs à une distance de 0,7 au plus), désistements réciproques (75 % de report ; distance 1 au plus), front républicain contre le bloc d'extrême droite (désistement au second tour ; les blocs de l'IA à une distance d'au moins 0,75 de ce bloc s'y joignent) ; mobilisation du camp présidentiel par les déplacements du président dans un département (+ 1,5 % des voix du camp par déplacement dans chacune de ses circonscriptions, + 6 % au plus) ; coalition après un second tour sans majorité avec un bloc à une distance de 0,9 au plus. Les accords prêtés aux blocs conduits par l'IA ne décrivent **aucun accord réel** ; par convention du jeu, ils n'en concluent aucun avec le bloc visé par le front républicain.
- **Couleurs des groupes** de l'hémicycle et **groupe du joueur** (celui de sa personnalité réelle, sinon le plus proche de son positionnement) : conventions d'affichage du jeu, signalées comme telles à l'écran ; ce ne sont pas des couleurs officielles.
- **Carte des législatives** : résultats officiels de 2024 par bloc au niveau du département (§3.3, mêmes fichiers) ; législatives simulées étiquetées comme telles, jamais présentées comme une prévision.
- **Portraits** : photo choisie par le joueur pour son candidat personnalisé (fichier JPEG, PNG ou WebP ; recadrée en carré de 256 px et réencodée en WebP ou JPEG sur l'appareil, environ 100 Ko au plus — URL de données de 140 000 caractères —, contrôlée par le serveur : type, taille, signature du fichier), conservée dans l'état de la partie ; portraits illustrés générés (SVG déterministe) pour les seuls personnages fictifs ; une personnalité réelle sans photo libre garde une silhouette neutre et ses initiales (aucun visage généré). Nouvelle recherche des trois photos manquantes (§8 nonies) non faite : leurs fichiers Wikidata restent sous licence non retenue, et les API Wikimedia répondaient 429 depuis l'environnement le 28/10/2026.

## 8 undecies. Vivier élargi et expertise ministérielle (phase 14)

Demande de l'utilisateur du 28/10/2026 : « augmenter significativement le nombre de personnalités politiques présentes avec leurs photos pour tous », pour les ministères et les législatives. Même import qu'au §8 nonies (`pnpm data:gouvernement`, fiches dans [`packages/rulesets/src/gouvernement-2027.json`](../packages/rulesets/src/gouvernement-2027.json), photos dans `apps/web/public/gouvernement/`), méthode révisée ; jeu de règles `presidentielle-2027@15.0.0`, format de sauvegarde 18. Les fiches ci-dessous **remplacent** celles du §8 nonies (révisions du 28/10/2026).

Sélection éditoriale (dans [`packages/data-import/src/gouvernement/selection.ts`](../packages/data-import/src/gouvernement/selection.ts), environ 120 personnes) : membres du gouvernement en fonction (article « Gouvernement Lecornu II », révision 240680163), anciens Premiers ministres et ministres encore actifs, dirigeants nationaux et présidents de groupe (Assemblée nationale et Sénat) des partis suivis par le jeu ; hors candidats déclarés à la présidentielle (acteurs de la partie, §8 quater). Résultat : **108 fiches retenues, toutes avec une photo sous licence libre**, et 12 fiches écartées avec leur motif. Répartition par parti : Renaissance 26, Les Républicains 16, Parti socialiste 12, Horizons 10, Rassemblement national 9, La France insoumise 9, Mouvement démocrate 9, Les Écologistes 6, Parti communiste français 6, Sans étiquette 3, Union des droites pour la République 1, Reconquête 1.

| Source | Usage | Version, licence |
|---|---|---|
| Wikipédia, article de chaque figure (infobox « Personnalité politique ») | libellés des fonctions et leurs dates ; **parti** (champ `parti` : partis cités et périodes) ; aucune phrase de l'article | révisions du 28/10/2026 (numéro de révision dans chaque fiche) ; texte CC BY-SA 4.0 : seuls les libellés des fonctions, leurs dates et les partis cités sont repris ; empreinte SHA-256 de la réponse dans les fiches |
| Wikidata (requête SPARQL) | identifiant ; photos (P18, toutes, rang préféré d'abord) ; catégorie Commons (P373) ; date de décès (P570) | CC0 1.0 ; requête du 28/10/2026, empreinte dans les fiches |
| Wikimedia Commons (API `imageinfo`, et liste des fichiers de la catégorie de la personne) | photos ; licence et auteur lus dans les métadonnées du fichier (`extmetadata`) ; type et largeur de l'image | licences acceptées : CC0, domaine public, CC BY et CC BY-SA 1.0 à 4.0 (2.5 comprise), Licence Ouverte d'Etalab ; image JPEG, PNG ou WebP d'au moins 150 pixels de large ; photos réduites (240 px de large au plus, WebP), métadonnées retirées |
| Chapel Hill Expert Survey 2024 (§8 quater) | position du parti, convertie par (x − 5) × 20 | même fichier et même licence qu'au §8 quater |
| Assemblée nationale (§7, fichier du 19/10/2026) | groupe associé à chaque parti (table du jeu) ; taille du groupe (notoriété) | Licence Ouverte |

Méthodes (écrites dans les fiches et affichées dans Paramètres → Crédits) — changements par rapport au §8 nonies :
- **Parti** : lu dans le champ `parti` de l'infobox (plus à jour que Wikidata, dont la propriété P102 donnait un parti périmé ou inexact pour plusieurs figures). Une ligne est en cours si sa période porte « depuis » ou si elle n'en a pas (« A puis B » : A est close) ; le parti retenu est le dernier parti suivi par le jeu cité dans une ligne en cours ; anciens noms reconnus (Front national, La République en marche, Europe Écologie Les Verts). Aucune ligne en cours : **« Sans étiquette »**, sans groupe, position du dernier parti suivi quitté (`hypothese`).
- **Fiche écartée** (au lieu de faire échouer tout l'import) : parti en cours non suivi par le jeu, aucun parti dans l'infobox, personne décédée (Wikidata), article sans infobox de fonctions ou page d'homonymie.
- **Photo** : choix à la main après revue visuelle sur une planche contact quand le premier choix automatique ne convenait pas (scène de groupe, plan large ou en pied, manifestation ; motif consigné dans la fiche), sinon les photos de Wikidata (P18) dans l'ordre, sinon les fichiers de la catégorie Commons de la personne dont le titre porte son nom et n'annonce pas plusieurs personnes (année la plus récente d'abord). Les fichiers essayés et écartés avant la photo retenue sont consignés avec leur motif (licence, format, taille).
- **Compétence** (`estimation`) : + 0,30 aussi pour un président de la République (en fonction ou ancien) ; le reste est inchangé (§8 nonies). **Notoriété** : niveau 3 aussi pour un président de la République.
- **Fonction principale affichée** : la première fonction en cours (hors « autre ») de l'infobox, sinon la première de la fiche, signalée « fonction passée » quand elle a pris fin (règle partagée par le moteur et l'interface).

**Expertise ministérielle** (paramètres du jeu de règles, `quinquennat.equipe.expertise`, `hypothese`) : une fonction de ministre, de secrétaire d'État ou de ministre délégué, en cours ou passée, dont le libellé cite un mot-clé d'un poste du jeu (sans tenir compte des accents ni des majuscules) donne une expertise sur ce poste ; la meilleure fonction est retenue (ministre avant secrétaire d'État ; à égalité, une fonction en cours). Compétence sur le poste = compétence estimée + 0,10 (ministre du domaine) ou + 0,05 (secrétaire d'État ou ministre délégué), dans la limite de 0,95, jamais abaissée par ce plafond. Elle sert à la composition du gouvernement, aux effets des ministres (domaines, crises, textes, actions du président) et à l'affichage, par les mêmes fonctions de `@r2027/shared`. Le Premier ministre (IA) place les personnalités de son camp là où elles sont expertes (au plus 10 personnalités réelles ou candidats parmi les ministres), les profils fictifs comblant les autres postes.

| Poste du jeu | Mots-clés (libellé de la fonction) |
|---|---|
| Économie et Finances | économie, finances, budget, comptes publics, industrie, numérique |
| Intérieur | intérieur, citoyenneté |
| Europe et Affaires étrangères | affaires étrangères, europe, affaires européennes, commerce extérieur, francophonie |
| Armées | armées, défense, anciens combattants |
| Justice | justice, garde des sceaux |
| Éducation nationale | éducation, enseignement, jeunesse |
| Santé et Solidarités | santé, solidarité, autonomie, personnes âgées, handicap, affaires sociales, famille |
| Travail et Emploi | travail, emploi, formation professionnelle, insertion, dialogue social |
| Transition écologique et Énergie | écologie, écologique, environnement, énergie, énergétique, climat, biodiversité, transports |
| Agriculture | agriculture, alimentation, alimentaire, pêche, forêt, ruralité |

Fiches écartées (12) :
- Jean-Pierre Farandou : Aucun parti indiqué dans l’infobox de l’article.
- Monique Barbut : Aucun parti indiqué dans l’infobox de l’article.
- Serge Papin : Aucun parti indiqué dans l’infobox de l’article.
- Édouard Geffray : Aucun parti indiqué dans l’infobox de l’article.
- Françoise Gatel : Parti en cours non suivi par le jeu (infobox : Union des démocrates et indépendants).
- Philippe Baptiste : Aucun parti indiqué dans l’infobox de l’article.
- Laurent Panifous : Parti en cours non suivi par le jeu (infobox : Régions et peuples solidaires, La Convention).
- Alice Rufo : Aucun parti indiqué dans l’infobox de l’article.
- Michel Fournier : Aucun parti indiqué dans l’infobox de l’article.
- Catherine Pégard : Parti en cours non suivi par le jeu (infobox : Indépendant (politique)).
- François Patriat : Personne décédée (Wikidata : 2026-08-19).
- Hervé Marseille : Parti en cours non suivi par le jeu (infobox : Les Centristes - Le Nouveau Centre, Union des démocrates et indépendants, Force européenne démocrate).

Photos dont le choix est motivé dans la fiche (22) :
- Jordan Bardella : Choisie à la main après revue visuelle : portrait de face ; la photo retenue par défaut est une scène de groupe.
- Jean-Philippe Tanguy : Choisie à la main après revue visuelle : photo récente (2025), visage lisible ; celle de Wikidata est un plan en pied.
- Sébastien Chenu : Fichier de la catégorie Commons « Sébastien Chenu » ; écartées avant elle : Denain - Sébastien Chenu lors du conseil municipal du 27 juin 2016 (cropped).JPG : licence non reconnue comme libre (GFDL 1.2).
- Manuel Bompard : Choisie à la main après revue visuelle : portrait de face ; la photo retenue par défaut est prise dans une manifestation.
- Yannick Jadot : Autre photo de Wikidata (P18) ; écartées avant elle : Member of the European Parliament Yannick Jadot.jpg : licence non reconnue comme libre (European Parliament).
- Stéphanie Rist : Choisie à la main après revue visuelle : portrait recadré ; la photo de Wikidata est un plan large.
- Marie-Pierre Vedrenne : Autre photo de Wikidata (P18) ; écartées avant elle : 1720447608272 20240708 VEDRENNE Marie-Pierre FR 021.jpg : licence non reconnue comme libre (European Parliament).
- Catherine Chabaud : Choisie à la main après revue visuelle : portrait officiel recadré ; la photo de Wikidata est un plan large.
- Mathieu Lefèvre : Choisie à la main après revue visuelle : portrait recadré ; la photo de Wikidata est un plan large d’une cérémonie.
- David Amiel : Choisie à la main après revue visuelle : version recadrée de la même photo ; celle de Wikidata est un plan en pied.
- Jean-Didier Berger : Choisie à la main après revue visuelle : version recadrée de la même photo ; celle de Wikidata est un plan en pied.
- Camille Galliard-Minier : Choisie à la main après revue visuelle : visage lisible ; la photo de Wikidata est une vue d’ensemble de l’hémicycle.
- Jean Castex : Choisie à la main après revue visuelle : portrait rapproché ; la photo de Wikidata est prise de loin.
- Guillaume Gontard : Choisie à la main après revue visuelle : portrait rapproché ; la photo de Wikidata est un plan large.
- Laure Lavalette : Choisie à la main après revue visuelle : portrait ; la photo de Wikidata est un plan large.
- Philippe Ballard : Choisie à la main après revue visuelle : portrait recadré ; la photo de Wikidata est prise dans un cortège.
- Antoine Léaument : Choisie à la main après revue visuelle : portrait recadré ; la photo de Wikidata est prise dans un cortège.
- Éric Piolle : Choisie à la main après revue visuelle : photo récente (2024), visage lisible ; celle de Wikidata est un plan en pied.
- Grégory Doucet : Choisie à la main après revue visuelle : portrait recadré ; la photo de Wikidata est un plan large.
- Marie Toussaint : Choisie à la main après revue visuelle : portrait ; la photo retenue par défaut est un plan large dans l’hémicycle du Parlement européen.
- François-Xavier Bellamy : Fichier de la catégorie Commons « François-Xavier Bellamy » ; écartées avant elle : François-Xavier Bellamy intervenant en Session Plénière (crop).jpg : licence non reconnue comme libre (European Parliament) ; François-Xavier Bellamy au Parlement européen en 2021.jpg : licence non reconnue comme libre (European Parliament).
- Léon Deffontaines : Choisie à la main après revue visuelle : visage lisible ; la photo de Wikidata est un plan large.

Fiches retenues (108 ; économie / société sur −100 … +100 ; groupe « — » : aucun groupe) :

| Personnalité | Parti | Groupe | Fonction principale (source) | Révision | Position | Compétence | Notoriété | Photo |
|---|---|---|---|---|---|---|---|---|
| Jordan Bardella | Rassemblement national | rn | Président du groupe Patriotes pour l'Europe au Parlement européen | 240789020 | 20 / 67 (`estimation`) | 0,40 | 3 | CC BY-SA 4.0 — Raphael ATTAL @BootEXE |
| Jean-Philippe Tanguy | Rassemblement national | rn | Député français | 240277243 | 20 / 67 (`estimation`) | 0,35 | 2 | CC0 — Timeolove122 |
| Sébastien Chenu | Rassemblement national | rn | Président du groupe Rassemblement national à l'Assemblée nationale | 240783032 | 20 / 67 (`estimation`) | 0,40 | 2 | CC BY 4.0 — VenteXe |
| Éric Ciotti | Union des droites pour la République | udr | Président de la Métropole Nice Côte d'Azur | 240686213 | 56 / 44 (`hypothese`) | 0,50 | 2 | CC BY 2.0 — European People's Party |
| Mathilde Panot | La France insoumise | lfi-nfp | Présidente du groupe LFI à l’Assemblée nationale | 240363721 | -82 / -64 (`estimation`) | 0,40 | 2 | CC BY 4.0 — original : Antoine Stouls modification : O.Taris |
| Manuel Bompard | La France insoumise | lfi-nfp | Coordinateur de La France insoumise | 240653520 | -82 / -64 (`estimation`) | 0,40 | 3 | CC BY-SA 4.0 — SarahBulle ( talk · contribs ) |
| Éric Coquerel | La France insoumise | lfi-nfp | Président de la commission des Finances de l’Assemblée nationale | 240732677 | -82 / -64 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Marche des fiertés de Paris 2017-14.jpg : Jérémie Silvestro Derivative work : Keymap9 |
| Élisabeth Borne | Renaissance | epr | Députée française | 240713602 | 24 / -18 (`estimation`) | 0,90 | 3 | CC BY-SA 4.0 — Andrea Adriani © European Union 2022 |
| Gérald Darmanin | Sans étiquette | — | Garde des Sceaux, ministre de la Justice | 240718787 | 24 / -18 (`hypothese`) | 0,60 | 2 | CC BY 2.5 — UK Home Office |
| Yaël Braun-Pivet | Renaissance | epr | Présidente de l'Assemblée nationale | 239994034 | 24 / -18 (`estimation`) | 0,55 | 2 | CC BY 2.0 — Houses of the Oireachtas from Ireland |
| Sébastien Lecornu | Renaissance | epr | Premier ministre français chargé de la Planification écologique et énergétique | 240418778 | 24 / -18 (`estimation`) | 0,90 | 3 | Public domain — U.S. Secretary of Defense |
| Olivier Faure | Parti socialiste | soc | Premier secrétaire du Parti socialiste | 240685583 | -33 / -45 (`estimation`) | 0,45 | 3 | CC BY-SA 2.0 — Olivier Faure |
| Boris Vallaud | Parti socialiste | soc | Président du groupe socialiste à l'Assemblée nationale | 239852242 | -33 / -45 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Bloody-libu |
| Carole Delga | Parti socialiste | soc | Présidente des Régions de France | 240743599 | -33 / -45 (`estimation`) | 0,45 | 2 | CC BY-SA 3.0 — Clément Bucco-Lechat |
| Laurent Wauquiez | Les Républicains | dr | Président du groupe Droite républicaine à l'Assemblée nationale | 240759457 | 56 / 44 (`estimation`) | 0,70 | 2 | CC BY 2.0 — European People's Party |
| Valérie Pécresse | Les Républicains | dr | Présidente de Soyons libres | 240408505 | 56 / 44 (`estimation`) | 0,60 | 2 | CC BY-SA 4.0 — Gail Leenstra |
| Cyrielle Chatelain | Les Écologistes | ecos | Présidente du groupe écologiste et social à l'Assemblée nationale | 237388032 | -54 / -66 (`estimation`) | 0,35 | 2 | CC BY-SA 4.0 — GLaG 38 - Guillaume LAGET |
| Yannick Jadot | Sans étiquette | — | Sénateur français (fonction passée) | 240723795 | -54 / -66 (`hypothese`) | 0,40 | 1 | CC BY 2.0 — greensefa |
| François Bayrou | Mouvement démocrate | dem | Président du Mouvement démocrate | 240230804 | 14 / -10 (`estimation`) | 0,90 | 3 | Licence Ouverte — Service photographique de Matignon |
| Marc Fesneau | Mouvement démocrate | dem | Président du groupe Les Démocrates à l'Assemblée nationale | 236197196 | 14 / -10 (`estimation`) | 0,60 | 2 | CC BY 4.0 — European Commission Audiovisual Center |
| Christian Estrosi | Horizons | hor | Président délégué du conseil régional de Provence-Alpes-Côte-d'Azur | 240786276 | 36 / 6 (`estimation`) | 0,65 | 2 | CC BY-SA 3.0 — Olivier Ezratty |
| Ian Brossat | Parti communiste français | gdr | Sénateur français | 240072173 | -75 / -29 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — Ismaelelhajri |
| Laurent Nuñez | Renaissance | epr | Ministre de l'Intérieur | 240745946 | 24 / -18 (`estimation`) | 0,50 | 2 | Licence Ouverte — Ministère de l'Intérieur |
| Catherine Vautrin | Renaissance | epr | Ministre des Armées et des Anciens Combattants | 239090512 | 24 / -18 (`estimation`) | 0,80 | 2 | Licence Ouverte — Lara PRIOLET/ECPAD/DEFENSE |
| Roland Lescure | Renaissance | epr | Ministre de l'Économie, des Finances et de la Souveraineté industrielle, énergétique et numérique | 239218983 | 24 / -18 (`estimation`) | 0,55 | 2 | CC BY 4.0 — Lukasz Kobus / European Union, 2022 / EC - Audiovisual Service |
| Annie Genevard | Les Républicains | dr | Ministre de l'Agriculture, de l'Agroalimentaire et de la Souveraineté alimentaire | 239221198 | 56 / 44 (`estimation`) | 0,65 | 2 | CC0 — Yladda |
| Jean-Noël Barrot | Mouvement démocrate | dem | Ministre de l'Europe et des Affaires étrangères | 239893726 | 14 / -10 (`estimation`) | 0,60 | 2 | CC BY 2.0 — Belgian Presidency of the Council of the EU 2024 from Belgium |
| Rachida Dati | Les Républicains | dr | Maire du de Paris | 240527290 | 56 / 44 (`estimation`) | 0,60 | 2 | CC BY-SA 4.0 — Thesupermat |
| Stéphanie Rist | Renaissance | epr | Ministre de la Santé, des Familles, de l'Autonomie et des Personnes handicapées | 239134704 | 24 / -18 (`estimation`) | 0,45 | 2 | Licence Ouverte — Cédric Bufkens / SIPA |
| Naïma Moutchou | Horizons | hor | Ministre des Outre-mer | 238981248 | 36 / 6 (`estimation`) | 0,55 | 2 | Licence Ouverte — Ministère des Outre-mer - DICOM |
| Amélie de Montchalin | Renaissance | epr | Première présidente de la Cour des comptes | 240608502 | 24 / -18 (`estimation`) | 0,60 | 2 | CC BY-SA 4.0 — Gézelin Grée |
| Marina Ferrari | Mouvement démocrate | dem | Ministre des Sports, de la Jeunesse et de la Vie associative (fonction passée) | 239001369 | 14 / -10 (`estimation`) | 0,55 | 2 | CC BY 2.0 — Régions Démocrates 2010 |
| Philippe Tabarot | Les Républicains | dr | Ministre des Transports | 240069738 | 56 / 44 (`estimation`) | 0,45 | 2 | CC BY 4.0 — Nicolas Kovarik / European Union, 2025 / EC - Audiovisual Service |
| Vincent Jeanbrun | Les Républicains | dr | Ministre de la Ville et du Logement | 239717840 | 56 / 44 (`estimation`) | 0,50 | 2 | CC BY 4.0 — Thomas Padilla / European Union, 2026 / EC - Audiovisual Service |
| Maud Bregeon | Renaissance | epr | Ministre déléguée chargée de l'Énergie | 240662079 | 24 / -18 (`estimation`) | 0,35 | 2 | CC BY 3.0 — Ministère de l'Europe et des Affaires étrangères |
| Aurore Bergé | Renaissance | epr | Ministre déléguée chargée de l'Égalité entre les femmes et les hommes et de la Lutte contre les discriminations | 240787265 | 24 / -18 (`estimation`) | 0,55 | 2 | CC BY-SA 4.0 — HUGUES DE BEAUCHESNE |
| Marie-Pierre Vedrenne | Mouvement démocrate | dem | Ministre déléguée auprès du ministre de l'Intérieur, chargée de la Citoyenneté | 237145524 | 14 / -10 (`estimation`) | 0,45 | 2 | CC BY-SA 2.0 — World Trade Organization from Switzerland |
| Catherine Chabaud | Mouvement démocrate | dem | Ministre déléguée à la Mer et à la Pêche | 236930417 | 14 / -10 (`estimation`) | 0,40 | 2 | Licence Ouverte — Damien Valente / Terra |
| Mathieu Lefèvre | Renaissance | epr | Ministre délégué chargé de la Transition écologique | 240764002 | 24 / -18 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Nicolas Maramotti |
| Sébastien Martin | Les Républicains | dr | Ministre délégué chargé de l'Industrie | 240676109 | 56 / 44 (`estimation`) | 0,40 | 2 | CC BY 4.0 — Bogdan Hoyaux / European Union, 2025 / EC - Audiovisual Service |
| Anne Le Hénanff | Horizons | hor | Ministre délégué chargé de l’Intelligence artificielle et du Numérique | 240238375 | 36 / 6 (`estimation`) | 0,35 | 2 | CC BY 4.0 — Europäische Kommission - Audiovisueller Dienst, Lukasz Kobus, Yügen, CE - Service audiovisuel, EC - Audiovisual Service |
| Benjamin Haddad | Renaissance | epr | Ministre délégué chargé de l'Europe | 240409741 | 24 / -18 (`estimation`) | 0,35 | 2 | CC BY 4.0 — TrisHR |
| Nicolas Forissier | Les Républicains | dr | Ministre délégué chargé du Commerce extérieur et de l'Attractivité | 240715659 | 56 / 44 (`estimation`) | 0,50 | 2 | Licence Ouverte — Ministère de l'Europe et des Affaires étrangères |
| Éléonore Caroit | Renaissance | epr | Ministre déléguée chargée de la Francophonie, des Partenariats internationaux et des Français de l'étranger | 240253347 | 24 / -18 (`estimation`) | 0,35 | 2 | CC BY 4.0 — Claudio Centonze / European Union, 2026 / EC - Audiovisual Service |
| Charlotte Parmentier-Lecocq | Horizons | hor | Députée française | 240471978 | 36 / 6 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Qlprvst |
| David Amiel | Renaissance | epr | Ministre de l'Action et des Comptes publics | 240419775 | 24 / -18 (`estimation`) | 0,50 | 2 | CC BY-SA 4.0 — B.MODIFICATEUR |
| Jean-Didier Berger | Les Républicains | dr | Ministre délégué auprès du ministre de l'Intérieur | 239226762 | 56 / 44 (`estimation`) | 0,45 | 2 | CC BY-SA 4.0 — TrisHR |
| Sabrina Agresti-Roubache | Renaissance | epr | Ministre déléguée chargée de l'Enseignement et de la Formation professionnels et de l'Apprentissage | 240574387 | 24 / -18 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Sacha Vaytet |
| Camille Galliard-Minier | Renaissance | epr | Ministre déléguée chargée de l'Autonomie et des Personnes handicapées | 238843173 | 24 / -18 (`estimation`) | 0,35 | 2 | CC BY-SA 4.0 — Henry de Chambernac |
| Michel Barnier | Les Républicains | dr | Député français | 239309161 | 56 / 44 (`estimation`) | 0,90 | 3 | CC BY-SA 4.0 — Florian David Pm |
| Jean Castex | Sans étiquette | — | Président directeur-général de la Société nationale des chemins de fer français | 237142807 | 56 / 44 (`hypothese`) | 0,70 | 3 | CC BY-SA 4.0 — Florian DAVID |
| Manuel Valls | Renaissance | epr | Ministre d'État, ministre des Outre-mer (fonction passée) | 240518229 | 24 / -18 (`estimation`) | 0,85 | 3 | CC BY 4.0 — Nicolas Kovarik / European Union, 2025 / EC - Audiovisual Service |
| Paul Christophe | Horizons | hor | Maire de Zuydcoote | 239669706 | 36 / 6 (`estimation`) | 0,55 | 2 | CC BY-SA 4.0 — G.Garitan |
| Stéphane Peu | Parti communiste français | gdr | Président du groupe de la Gauche démocrate et républicaine à l’Assemblée nationale | 240703446 | -75 / -29 (`estimation`) | 0,40 | 2 | CC BY 3.0 — PCF - Parti communiste français (PCF) |
| Gérard Larcher | Les Républicains | dr | Président du Sénat français | 240585871 | 56 / 44 (`estimation`) | 0,60 | 2 | CC BY-SA 4.0 — Senate |
| Mathieu Darnaud | Les Républicains | dr | Président du groupe Les Républicains au Sénat | 239943637 | 56 / 44 (`estimation`) | 0,50 | 2 | CC BY-SA 4.0 — Ladroite07 |
| Patrick Kanner | Parti socialiste | soc | Président du groupe socialiste au Sénat | 240285357 | -33 / -45 (`estimation`) | 0,60 | 2 | CC BY-SA 3.0 — Photo Claude TRUONG-NGOC |
| Cécile Cukierman | Parti communiste français | gdr | Présidente du groupe Communiste Républicain Citoyen et Écologiste - Kanaky au Sénat | 240105150 | -75 / -29 (`estimation`) | 0,45 | 2 | CC BY-SA 4.0 — PCF AuvergneRhoneAlpes |
| Guillaume Gontard | Les Écologistes | ecos | Sénateur français | 240017197 | -54 / -66 (`estimation`) | 0,45 | 1 | CC BY-SA 4.0 — Percygam |
| Claude Malhuret | Horizons | hor | Président du groupe Les Indépendants – République et territoires au Sénat | 240140298 | 36 / 6 (`estimation`) | 0,55 | 2 | CC BY-SA 4.0 — ClarisseBuchot |
| Louis Aliot | Rassemblement national | rn | Président de Perpignan Méditerranée Métropole | 240567862 | 20 / 67 (`estimation`) | 0,45 | 2 | CC BY-SA 4.0 — Pablo Tupin-Noriega |
| Edwige Diaz | Rassemblement national | rn | Présidente du groupe Union nationale pour les territoires au Sénat | 240780243 | 20 / 67 (`estimation`) | 0,35 | 2 | CC BY-SA 4.0 — Marsouinduteich |
| Laurent Jacobelli | Rassemblement national | rn | Député français | 240638620 | 20 / 67 (`estimation`) | 0,30 | 1 | CC BY-SA 2.0 — Debout la France |
| Julien Odoul | Rassemblement national | rn | Député français (fonction passée) | 240164147 | 20 / 67 (`estimation`) | 0,30 | 1 | CC BY-SA 4.0 — Toufik-de-Planoise |
| Laure Lavalette | Rassemblement national | rn | Députée française | 240218063 | 20 / 67 (`estimation`) | 0,30 | 1 | CC BY-SA 4.0 — Alain V |
| Philippe Ballard | Rassemblement national | rn | Député français | 236733973 | 20 / 67 (`estimation`) | 0,30 | 1 | CC0 — LuilGG |
| Sarah Knafo | Reconquête | — | Députée européenne | 240735123 | 67 / 82 (`estimation`) | 0,30 | 1 | CC BY-SA 2.0 — Anh De France |
| Clémence Guetté | La France insoumise | lfi-nfp | Députée française | 240596861 | -82 / -64 (`estimation`) | 0,30 | 1 | CC BY 4.0 — Claire Jacquin |
| Aurélie Trouvé | La France insoumise | lfi-nfp | Députée française | 239631222 | -82 / -64 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — Azimuts14 |
| Manon Aubry | La France insoumise | lfi-nfp | Députée européenne | 239747826 | -82 / -64 (`estimation`) | 0,35 | 1 | CC BY 2.0 — European Parliament from EU |
| Paul Vannier | La France insoumise | lfi-nfp | Député français | 236052561 | -82 / -64 (`estimation`) | 0,30 | 1 | CC BY 4.0 — satellio |
| Louis Boyard | La France insoumise | lfi-nfp | Député français | 240626944 | -82 / -64 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — Babar BZH |
| Antoine Léaument | La France insoumise | lfi-nfp | Député français | 239644585 | -82 / -64 (`estimation`) | 0,30 | 1 | CC0 — Tomkiou |
| François Hollande | Parti socialiste | soc | Député français | 240311894 | -33 / -45 (`estimation`) | 0,70 | 3 | CC BY 2.0 — Web Summit |
| Jérôme Guedj | Parti socialiste | soc | Député français | 240554631 | -33 / -45 (`estimation`) | 0,35 | 1 | CC BY-SA 2.0 — Audrey AK |
| Hélène Geoffroy | Parti socialiste | soc | Conseillère municipale de Vaulx-en-Velin | 239922154 | -33 / -45 (`estimation`) | 0,40 | 2 | CC BY-SA 3.0 — Gwada |
| Nicolas Mayer-Rossignol | Parti socialiste | soc | Président de la Métropole Rouen Normandie | 240163922 | -33 / -45 (`estimation`) | 0,40 | 1 | CC BY-SA 4.0 — Alexandre Moatti |
| Johanna Rolland | Parti socialiste | soc | Première secrétaire déléguée du Parti socialiste | 240042705 | -33 / -45 (`estimation`) | 0,40 | 3 | CC BY-SA 4.0 — Jpjp12 |
| Pierre Jouvet | Parti socialiste | soc | Député européen | 239005333 | -33 / -45 (`estimation`) | 0,40 | 3 | CC BY 4.0 — Maxlath |
| Najat Vallaud-Belkacem | Parti socialiste | soc | Conseillère régionale d'Auvergne-Rhône-Alpes | 240579425 | -33 / -45 (`estimation`) | 0,50 | 2 | CC BY 2.0 — Potrait_Najat_Vallaud-Belkacem.jpg : Benjamin Geminel derivative work: Flappiefh |
| Anne Hidalgo | Parti socialiste | soc | Maire de Paris (fonction passée) | 240702088 | -33 / -45 (`estimation`) | 0,35 | 1 | CC BY 2.0 — Jacques Paquier |
| Sandrine Rousseau | Les Écologistes | ecos | Députée française | 240771630 | -54 / -66 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — Greenbox |
| Éric Piolle | Les Écologistes | ecos | Porte-parole des Écologistes (fonction passée) | 240592713 | -54 / -66 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — Jean-Paul Corlin |
| Grégory Doucet | Les Écologistes | ecos | Maire de Lyon | 240483113 | -54 / -66 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — CloudMamma |
| Marie Toussaint | Les Écologistes | ecos | Députée européenne | 238162225 | -54 / -66 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — Greenbox |
| François-Xavier Bellamy | Les Républicains | dr | Député européen | 240597851 | 56 / 44 (`estimation`) | 0,35 | 1 | CC BY 2.0 — European People's Party |
| Philippe Juvin | Les Républicains | dr | Député français | 239233821 | 56 / 44 (`estimation`) | 0,45 | 1 | CC BY-SA 3.0 — Andy Mabbett |
| Jean-François Copé | Les Républicains | dr | Maire de Meaux | 240720668 | 56 / 44 (`estimation`) | 0,60 | 2 | CC BY-SA 4.0 — Astrakan25 |
| Yannick Neuder | Les Républicains | dr | Député français | 236179386 | 56 / 44 (`estimation`) | 0,50 | 2 | CC BY 3.0 — Unió Europea i Acció Exterior sur YouTube |
| Stéphane Séjourné | Renaissance | epr | Vice-président exécutif de la Commission européenne à la Prospérité et à la Stratégie industrielle Commissaire européen à l'Industrie, aux PME et au Marché unique | 240764028 | 24 / -18 (`estimation`) | 0,50 | 2 | CC BY 4.0 — European Commission Audiovisual Service |
| Agnès Pannier-Runacher | Renaissance | epr | Députée française | 240577334 | 24 / -18 (`estimation`) | 0,60 | 2 | CC BY 2.0 — IAEA Imagebank |
| Prisca Thevenot | Renaissance | epr | Députée française | 240729989 | 24 / -18 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Maxime BOUDET |
| Olivier Véran | Renaissance | epr | Député français (fonction passée) | 239879796 | 24 / -18 (`estimation`) | 0,55 | 2 | CC BY-SA 4.0 — Audran Demierre |
| Clément Beaune | Renaissance | epr | Haut-commissaire à la Stratégie et au Plan | 239777607 | 24 / -18 (`estimation`) | 0,40 | 2 | CC BY 4.0 — Lukasz Kobus / European Union, 2023 / EC - Audiovisual Service |
| Bruno Le Maire | Renaissance | epr | Ministre d'État, ministre des Armées et des Anciens Combattants (fonction passée) | 240590581 | 24 / -18 (`estimation`) | 0,60 | 2 | CC BY 2.5 — Sebastiaan ter Burg from Utrecht, The Netherlands |
| Valérie Hayer | Renaissance | epr | Présidente du groupe Renew Europe au Parlement européen | 240331262 | 24 / -18 (`estimation`) | 0,40 | 2 | CC BY 4.0 — Christophe Licoppe / European Union |
| Laurent Saint-Martin | Renaissance | epr | Conseiller régional d'Île-de-France | 239050842 | 24 / -18 (`estimation`) | 0,55 | 2 | CC BY-SA 4.0 — Lionel Barbe |
| Marc Ferracci | Renaissance | epr | Député français | 239226146 | 24 / -18 (`estimation`) | 0,45 | 2 | CC BY 4.0 — Lukasz Kobus / European Union, 2025 / EC - Audiovisual Service |
| Geneviève Darrieussecq | Mouvement démocrate | dem | Députée française | 238345423 | 14 / -10 (`estimation`) | 0,65 | 2 | CC BY-SA 2.0 — Jérémy Barande |
| Sarah El Haïry | Mouvement démocrate | dem | Haute-commissaire à l'Enfance | 240363996 | 14 / -10 (`estimation`) | 0,40 | 2 | CC BY-SA 4.0 — Lionel Barbe |
| Patrick Mignola | Mouvement démocrate | dem | Ministre délégué chargé des Relations avec le Parlement (fonction passée) | 239787636 | 14 / -10 (`estimation`) | 0,50 | 2 | CC0 — JohnWhite73 |
| Christophe Béchu | Horizons | hor | Maire d'Angers | 240605291 | 36 / 6 (`estimation`) | 0,65 | 2 | CC BY-SA 4.0 — AminataDkt |
| Agnès Firmin Le Bodo | Horizons | hor | Députée française | 236602432 | 36 / 6 (`estimation`) | 0,55 | 2 | CC BY-SA 4.0 — CELINEPOIZAT |
| Frédéric Valletoux | Horizons | hor | Président de la commission des Affaires sociales de l'Assemblée nationale | 240414973 | 36 / 6 (`estimation`) | 0,45 | 2 | CC BY-SA 4.0 — Baidax |
| Laurent Marcangeli | Horizons | hor | Président du groupe Horizons à l'Assemblée nationale | 239935408 | 36 / 6 (`estimation`) | 0,55 | 2 | CC BY 4.0 — Christophe Licoppe / European Union, 2025 / EC - Audiovisual Service |
| André Chassaigne | Parti communiste français | gdr | Président du groupe de la Gauche démocrate et républicaine à l'Assemblée nationale (fonction passée) | 239917853 | -75 / -29 (`estimation`) | 0,50 | 1 | CC BY-SA 3.0 — Le grand Cricri |
| Léon Deffontaines | Parti communiste français | gdr | Vice-président d'Amiens Métropole | 239001441 | -75 / -29 (`estimation`) | 0,35 | 1 | CC BY-SA 4.0 — TestDeTuring |
| Pierre Laurent | Parti communiste français | gdr | Maire de Saint-Martin-du-Tartre | 238541054 | -75 / -29 (`estimation`) | 0,50 | 1 | CC BY-SA 4.0 — Thesupermat |

Remarques :
- **Fonctions et partis** : ceux de la révision importée, sans correction manuelle ; l'infobox peut être en retard ou en avance sur un changement. Exemple : l'infobox de Gérald Darmanin clôt ses appartenances à Renaissance (2017-2025) et à Populaires (2024-2025) ; il figure donc « Sans étiquette », avec la position de Renaissance (`hypothese`).
- **Photos** : les trois figures du §8 nonies restées sans photo libre (Sébastien Chenu, Manuel Bompard, Yannick Jadot) en ont désormais une (autre photo de Wikidata, fichier de la catégorie Commons ou choix après revue).
- **Ce qui reste simulé** : réponse d'une personnalité sollicitée, action au gouvernement, effets ; aucun propos ni aucune citation n'est attribué (le schéma n'a aucun champ pour cela ; les tests du jeu de règles le vérifient). Aux législatives, les « figures des blocs » montrent les personnalités des partis de chaque bloc avec leur fonction relevée dans les sources : aucune candidature dans une circonscription ni aucun propos ne leur est prêté.

## 8 duodecies. Pré-campagne, gouvernement vivant et vie parlementaire (phase 15)

Demande de l'utilisateur (phase 15) : dynamiser la pré-campagne (parrainages d'élus, négociations de soutien, orientation du mouvement), pop-ups d'intervention des ministres, Conseil des ministres hebdomadaire et questions au gouvernement, avec cinq idées de la phase 14 (remaniement ciblé, objectifs et note du mandat, usure des ministres, déplacements choisis sur la carte, succès). Jeu de règles `presidentielle-2027@16.0.0`, format de sauvegarde 19. **Aucune nouvelle donnée importée** : les personnalités et leurs photos sont celles du §8 undecies ; les règles officielles ajoutées sont citées d'après Wikipédia (révisions figées, consultées le 28/10/2026), Légifrance refusant l'accès depuis l'environnement.

| Règle | Source | Usage dans le jeu |
|---|---|---|
| « Le président de la République préside le Conseil des ministres » (Constitution, art. 9) | article Wikipédia « Article 9 de la Constitution de la Cinquième République française », [révision 238940303](https://fr.wikipedia.org/w/index.php?title=Article_9_de_la_Constitution_de_la_Cinqui%C3%A8me_R%C3%A9publique_fran%C3%A7aise&oldid=238940303) | section « Conseil des ministres » de l'espace Pouvoir et compte rendu dans le débriefing de la semaine |
| Réunion hebdomadaire du Conseil des ministres, le mercredi matin à l'Élysée, sauf une pause de deux ou trois semaines en août (usage, sans texte) | article Wikipédia « Conseil des ministres (France) », [révision 240570707](https://fr.wikipedia.org/w/index.php?title=Conseil_des_ministres_(France)&oldid=240570707) | un Conseil à chaque semaine de jeu dès la formation du gouvernement ; la pause d'août n'est pas simulée (simplification) |
| « Une séance par semaine au moins, y compris pendant les sessions extraordinaires prévues à l'article 29, est réservée par priorité aux questions des membres du Parlement et aux réponses du Gouvernement » (art. 48) | article Wikipédia « Article 48 de la Constitution de la Cinquième République française », [révision 235009013](https://fr.wikipedia.org/w/index.php?title=Article_48_de_la_Constitution_de_la_Cinqui%C3%A8me_R%C3%A9publique_fran%C3%A7aise&oldid=235009013) | une séance de questions au gouvernement par semaine de session ordinaire (octobre à juin, art. 28, §7) ; les sessions extraordinaires ne sont pas simulées |
| À l'Assemblée nationale, les questions au gouvernement ont lieu le mardi et le mercredi pendant la session | article Wikipédia « Questions au gouvernement », [révision 236418454](https://fr.wikipedia.org/w/index.php?title=Questions_au_gouvernement&oldid=236418454) | une interpellation emblématique par semaine (convention du jeu) |

Tout le reste est un **paramètre de jeu** (statut `hypothese` dans le jeu de règles), sans prétention de mesure. Unités : popularité en points (sur 100), loyauté sur 100.
- **Orientation du mouvement** (`orientations`, facultative, candidat du joueur seulement) : cinq orientations (rassembler au-delà de son camp, mobiliser son camp, s'appuyer sur les élus locaux, mouvement numérique, candidature de rupture). Écarts de moyens appliqués à la création, promesses de parrainage de départ (premier cycle seulement) et **base électorale de départ** : facteur nommé du score latent dans certains groupes d'électeurs (le plus proche du candidat, ceux qui en sont proches, les électorats éloignés du centre, ou tous), valeur × (1 − semaine / 26), éteint après 26 semaines.
- **Rendez-vous d'élus** (`parrainages.rendezVous`) : pendant la course aux parrainages, jusqu'à la semaine qui précède la clôture des présentations, une délégation d'élus locaux d'un département propose au candidat du joueur de 6 à 14 promesses de parrainage, dans la limite des élus encore libres. Délégation **fictive et anonyme** : aucun élu n'est nommé. Probabilité de 45 % par semaine, deux semaines au moins entre deux rendez-vous ; département tiré au prorata des élus libres, deux fois plus souvent là où le candidat n'a encore aucun engagement. Recevoir la délégation prend 4 h de la semaine, réservées avant les actions (règle partagée par le moteur et l'affichage du temps restant) ; la décliner ne coûte rien.
- **Négociations de soutien** (`negociations`) avec les personnalités nominables du §8 undecies : actions « Négocier le soutien d'une personnalité » (sans contrepartie) et « Négocier un soutien contre un ministère promis » (5 000 €, 4 h chacune).
  - Refus d'office, sans coût : personnalité qui soutient déjà un candidat, candidat de son parti en lice, proximité sous 35/100, refus de moins de 8 semaines, 6 soutiens déjà obtenus, même personnalité deux fois dans le plan.
  - Sinon, probabilité d'accord = 0,3 + 0,9 × (proximité − 50) / 100 + 1,2 × intentions de vote + 0,25 si un ministère est promis, bornée entre 5 % et 90 % (affichée au joueur avant la négociation).
  - Un soutien apporte de la notoriété (0,6, 1,2 ou 2,2 points selon le niveau de la personnalité), des militants (20, 50 ou 100) et un facteur de vote (0,15 × niveau × proximité / 3).
  - Ministère promis : la personnalité est nommée d'abord au premier gouvernement (+ 10 de loyauté) ; ne pas tenir la promesse coûte 1,5 point de popularité.
  - Candidats de l'IA : une négociation toutes les trois semaines au plus, seulement si l'accord est probable (40 % au moins sans contrepartie ; sinon 55 % au moins en promettant un ministère).
  - **Soutiens et refus sont simulés** : aucune prise de position réelle, aucun propos attribué.
- **Ministres vivants** (`quinquennat.suivi`) : popularité prêtée (jamais un sondage) et loyauté envers le président de chaque membre du gouvernement, mises à jour à chaque Conseil par des facteurs nommés.
  - Popularité prêtée : usure (− 0,05 point par semaine), rappel de 4 % vers la valeur de départ, moitié de la variation hebdomadaire de la popularité du président, crise tranchée (± 8 × (compétence − 0,5) points), texte du ministère adopté ou rejeté (± 1,5 point), choix d'une urgence.
  - Loyauté : référence 55 + 0,6 × (proximité − 50) (+ 10 pour le Premier ministre), rappel de 5 % vers elle, écart de popularité du président × 0,15, − 1 toutes les 6 semaines au poste, choix d'une urgence.
  - Départ simulé (au plus un par semaine) : ministre au poste depuis 12 semaines au moins, loyauté ≤ 25 ou popularité prêtée ≤ 18 %, probabilité de 15 % ; − 1,5 point de popularité pour le président. Motif neutre (loyauté au plus bas, usure au poste), sans propos ni scandale prêtés ; le Premier ministre propose aussitôt un remplaçant, que le président joueur confirme ou remplace.
- **Remaniement ciblé** (action « Remplacer un ministre », 3 h, une fois toutes les quatre semaines au plus) : le président choisit le ministère ; le Premier ministre propose un successeur. Le président IA remplace le ministre le moins populaire s'il est au poste depuis 12 semaines au moins et sous 20 % de popularité prêtée.
- **Urgences ministérielles** (`urgences`) : douze situations sectorielles **fictives** (grève des transports, pénurie de médicaments, feux de forêt, cyberattaque…), rattachées à un ministère ; 2 % par semaine chacune, 26 semaines au moins entre deux occurrences de la même urgence, trois au plus par partie pour chacune, certaines saisonnières ; au plus une par semaine, aucune tant qu'une urgence ou une crise attend une décision. Le ministre en charge est présenté avec sa photo (nomination simulée, aucun propos). Choix binaire : popularité du président × (0,5 + compétence du ministre), indicateurs économiques, popularité prêtée et loyauté du ministre. Le président IA prend le choix par défaut.
- **Questions au gouvernement** (`parlement.qag`) : chaque semaine de session ordinaire, une fois le gouvernement formé, un groupe d'opposition (à défaut un groupe non aligné ; jamais les non-inscrits) interpelle le gouvernement, tiré au prorata de ses sièges, sur un thème du jeu (pouvoir d'achat, emploi, comptes publics, climat social, moral des ménages, sécurité, hôpital, école, climat, international), trois fois plus probable si son indicateur s'est dégradé depuis le début du mandat. Le ministre du thème répond (le Premier ministre sinon). Trois répliques : répondre sur le fond (− 2 de tension, + 0,3 point), annoncer une mesure (− 4 de tension, + 0,6 point, − 0,03 point de solde public), contre-attaquer (+ 6 de tension, + 0,1 point) ; l'effet sur l'opinion est modulé par la compétence du ministre qui répond (surtout sur le fond). L'échauffement de l'hémicycle est un facteur de la tension parlementaire (§8 decies), qui décroît de 25 % par semaine. La séance est **facultative** : sans réponse, le gouvernement répond sur le fond (signalé comme réponse automatique). **Aucun député n'est nommé, aucun propos n'est rapporté.**
- **Objectifs et note du mandat** (`objectifs`) : à la formation du premier gouvernement, quatre objectifs parmi huit (chômage, déficit, pouvoir d'achat, climat social, confiance, réformes adoptées, popularité, absence de censure), ceux des domaines les plus représentés dans le programme du président d'abord. Note sur 20 au bilan : un objectif atteint compte pour 1, un objectif manqué pour la moitié de la part du chemin parcouru vers la cible ; mentions du jeu (exemplaire dès 16, réussi dès 12, contrasté dès 8, décevant sinon). Cibles : jamais des prévisions.
- **Déplacements choisis sur la carte** : la fiche d'un département propose les visites du président (déplacement de terrain, visite d'usine ou de CHU), ajoutées à l'agenda de la semaine puis validées par le serveur ; les déplacements effectués sont comptés par département et tracés en pointillés sur la carte.
- **Succès** (`succes`) : dix-huit jalons de la partie du joueur (parrainages, soutiens, second tour, Élysée, gouvernement d'experts, majorité absolue, séances de questions sans contre-attaque, crises tranchées, objectifs, note, popularité, déplacements…), débloqués une fois et évalués chaque semaine ; convention du jeu, sans valeur d'évaluation réelle.

## 8 quaterdecies. Présidentielle suivante : candidatures et poids du bilan (phase 23)

Demande de l'utilisateur (04/11/2026) : à la présidentielle qui suit un quinquennat, les candidats et personnalités politiques choisissent de se présenter ou non, pas forcément les mêmes, et le bilan du quinquennat pèse sur les intentions de vote du président sortant. Jeu de règles 21.0.0, bloc `succession`. Seule règle de droit employée : la limite de deux mandats consécutifs (Constitution, art. 6, déjà sourcée au §8 decies et dans le bloc `quinquennat`). **Tout le reste est un paramètre de jeu** (statut `hypothese`), sans prétention de mesure ni de prévision ; aucune candidature réelle n'est annoncée ni prêtée.

- **Décision du joueur** : quatre semaines avant l'ouverture de la campagne suivante, se représenter (s'il n'est pas au terme de deux mandats consécutifs) ou passer la main à l'un de quatre successeurs au plus : s'il préside, son Premier ministre puis les ministres les plus proches de sa position ; sinon, les figures du vivier (§8 nonies) de son parti puis les profils fictifs les plus proches. Le successeur reprend 60 % des militants de son prédécesseur.
- **Probabilité de se représenter** des autres candidats de la présidentielle précédente : président sortant éligible 0,5 + 1,5 × (popularité finale − 30 %), bornée à [0,10 ; 0,95] ; au terme de deux mandats, 0 ; finaliste battu 0,85 ; éliminé au premier tour 0,25 + 2 × score, bornée à [0,15 ; 0,80] ; écarté (parrainages) ou retiré (ralliement) 0,30. Tirage par la graine de la partie ; au plus 12 candidats déclarés.
- **Entrants** : si le président sortant (IA) ne se représente pas, son camp présente le Premier ministre en fonction (figure ou profil), sinon le ministre à la plus forte popularité prêtée ; un ministre dont la popularité prêtée atteint 45 % entre avec la probabilité 0,35 si aucun candidat déclaré n'est à moins de 25 points de sa position ; pour chaque groupe d'électeurs sans candidat déclaré à moins de 35 points, le profil fictif le plus proche entre ; deux candidats au moins en tout cas. Moyens de départ d'un entrant : 2 M€, 300 militants, notoriété 15, 30 ou 45 % selon le niveau de la fiche (12 % pour un profil), popularité 30 %, aucun programme prêté à une personnalité réelle.
- **Poids du bilan** (facteur d'utilité « Bilan du quinquennat », pendant la seule campagne qui suit) : B = 1,2 × (popularité finale − 35 %) + 0,3 × (note sur 20 − 10) / 10 − 0,15 × variation du chômage en points, borné à ± 0,6 (note manquante : 10) ; président sortant B, héritier du camp sortant (ou successeur d'un président joueur) 0,5 × B, autre membre du dernier gouvernement 0,25 × B.
- **Annonces** : « Candidature simulée : … se représente / ne se présente pas à la présidentielle 2032 / entre dans la course », avec un motif de jeu chiffré (« score au premier tour en 2027 : 9,5 % ») ; jamais un propos ni une citation.

## 8 quindecies. Sondages réels d'intentions de vote (phase 24)

Point de départ « Sondages actuels » des personnalités réelles (jeu de règles 22.0.0, fichier `packages/rulesets/src/sondages-2027.json`, vérifié le 04/11/2026). Les chiffres sont relus dans la [liste Wikipédia des sondages sur l'élection présidentielle française de 2027, révision figée 240992329](https://fr.wikipedia.org/w/index.php?oldid=240992329) ; chaque enquête renvoie à sa notice déposée à la Commission des sondages (ou à l'article qui la publie). **Seul le point de départ est réel** ; toute la suite de la partie est simulée, et l'interface l'étiquette « Simulation : point de départ issu des sondages publiés, la suite est simulée ». Aucun chiffre n'est inventé : une personnalité jamais testée (Asselineau, Becht, Bertrand, Ruffin) est « non testée » et reçoit le socle minimal du jeu de règles (0,5 %, statut `hypothese`).

| Enquête | Institut | Commanditaire | Terrain | Échantillon | Source |
|---|---|---|---|---|---|
| ifop-2026-10-29 | Ifop | LCI | 27-29/10/2026 | 1 501 | [TF1 Info](https://www.tf1info.fr/politique/elections/presidentielle/sondage-lci-a-six-mois-de-la-presidentielle-2027-marine-le-pen-et-jean-luc-melenchon-sans-adversaires-au-premier-tour-philippe-attal-retailleau-lisnard-2473663.html) |
| ipsos-2026-10-22 | Ipsos bva | Le Parisien | 21-22/10/2026 | 1 500 | [notice 10338](https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10338-pres-iv-ipsos-bva-le-parisien-24-octobre.pdf) |
| cluster17-2026-10-22 | Cluster17 | Politico | 19-22/10/2026 | 2 817 | [notice 10339](https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10339-pres-iv-cluster17-politico-26-octobre.pdf) |
| opinionway-2026-10-22 | OpinionWay | CNews | 21-22/10/2026 | 973 | [notice 10333](https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10333-pres-iv-opinionway-cnews-22-octobre.pdf) |
| harris-2026-10-21 | Toluna Harris Interactive | RTL, M6 | 19-21/10/2026 | 2 094 | [notice 10332](https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10332-pres-iv-toluna-harris-interactive-23-octobre.pdf) |

- **Méthode** (champ `methode` du fichier) : cinq dernières enquêtes du premier tour par date de fin de terrain ; pour chacune, l'hypothèse qui teste le plus de personnalités du jeu (la première en cas d'égalité) ; moyenne de chaque personnalité sur les enquêtes qui la testent ; « moins de 1 % » compté 0,5 % et signalé (`inferieursA1`) ; moyenne renormalisée à 100 % sur les 17 personnalités du jeu. C'est une moyenne de jeu, pas un agrégateur ni une prévision.
- **Duels de second tour** : 25 duels de 2026 (au plus les cinq plus récents par paire de personnalités du jeu), relus dans la même révision, chacun avec son institut, son terrain, son échantillon et sa source ; ils servent à caler le socle du second tour.
- **Commanditaires** : lus dans le nom de la notice de la Commission des sondages ou dans l'article ; l'enquête OpinionWay (une seule hypothèse) a été saisie à la main depuis le tableau de la révision.
- **Paramètres de jeu** (bloc `departSondages`, statut `hypothese`) : socle minimal 0,5 %, tolérance de calage ± 0,5 point, 60 itérations au plus, décroissance hebdomadaire du socle 0,985 au premier tour et 0,95 au second (réglées au banc d'équilibrage, docs/equilibrage), cycle 2027 seulement (pas de socle aux présidentielles suivantes).
- Toute mise à jour des sondages impose une nouvelle version du jeu de règles.

## 8 terdecies. Musique et jingles (phases 19 et 21)

Demande de l'utilisateur (phase 19, questionnaire du 29/10/2026) : musique d'ambiance et jingles des moments forts, musique en fichiers sous licence libre crédités et embarqués, jingles fabriqués par le jeu. Phase 21 (demande du 03/11/2026 : « change toutes les musiques ou sons ») : les cinq morceaux de Kevin MacLeod de la phase 19 sont **remplacés** et les jingles réécrits. Importé par `pnpm data:sons` le 2026-11-03 (Wikimedia Commons ; réseau requis, ffmpeg requis) : pour chaque fichier, la **licence et l'auteur sont lus sur la page du fichier** (champs lisibles par machine du modèle de licence et du champ « Auteur ») et un morceau sans licence libre reconnue est refusé ; l'original est archivé dans `data/raw/sons` (jamais commité) avec son empreinte SHA-256 ; la sortie est commitée dans `apps/web/public/sons/` et décrite par `apps/web/src/audio/musiques.json` (empreinte et taille de chaque fichier, vérifiées par les tests). La musique n'est pas un paramètre de jeu : elle ne change ni le jeu de règles ni le format de sauvegarde.

**Licence d'un enregistrement (phase 21).** Une page de Commons licencie souvent à part la partition (« For the Original Composition » : domaine public) et l'interprétation (« For the Performance » : CC BY-SA…). L'importeur retient la **licence à conditions** quand il y en a une (celle de l'interprétation s'applique au fichier), le domaine public ou CC0 seulement si toutes les licences de la page sont sans condition ; une interprétation sous licence non libre est refusée même si la partition est libre. Constaté le 03/11/2026 : les Gnossiennes de Satie interprétées par « La Pianista » (partition dans le domaine public, interprétation sous CC BY-SA 3.0 ou GFDL) auraient été étiquetées « domaine public » par la règle de la phase 19 (première licence libre de la page) ; elles ne sont pas retenues. Les deux marches retenues sont doublement dans le domaine public : partition (compositeur mort depuis plus de 100 ans, modèle `PD-old-100`) et interprétation de l'**US Marine Band** (œuvre d'une administration fédérale américaine, modèle `PD-USGov-Military-Marines`).

| Morceau | Auteur | Licence | Fichier source (Commons) | Original (SHA-256) | Ambiance | Modifications déclarées |
|---|---|---|---|---|---|---|
| « Orient et Occident, grande marche » | Camille Saint-Saëns (composition), United States Marine Band (interprétation) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) | [Orient et Occident - U.S. Marine Band.ogg](https://commons.wikimedia.org/wiki/File:Orient%20et%20Occident%20-%20U.S.%20Marine%20Band.ogg) | `a5ef63003e49b01c…` (22 499 986 octets, 501 s) | accueil (écran-titre, création, Paramètres) | extrait des 150 premières secondes (sur 501), fondu de sortie de 4 s, volume normalisé (EBU R128, −18 LUFS), réencodé en MP3 96 kbit/s stéréo. |
| « Catalyst » | Scott Buckley | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Scott Buckley - Catalyst.oga](https://commons.wikimedia.org/wiki/File:Scott%20Buckley%20-%20Catalyst.oga) | `13df934d8f870bf6…` (6 352 122 octets, 278 s) | campagne (campagne, entre-deux-tours) | extrait des 150 premières secondes (sur 278), fondu de sortie de 4 s, volume normalisé (EBU R128, −18 LUFS), réencodé en MP3 96 kbit/s stéréo. |
| « Marche hongroise » | Hector Berlioz (composition), United States Marine Band (interprétation) | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) | [Marche Hongroise - U.S. Marine Band.ogg](https://commons.wikimedia.org/wiki/File:Marche%20Hongroise%20-%20U.S.%20Marine%20Band.ogg) | `f52385256e207169…` (14 877 199 octets, 297 s) | campagne (campagne, entre-deux-tours) | extrait des 150 premières secondes (sur 297), fondu de sortie de 4 s, volume normalisé (EBU R128, −18 LUFS), réencodé en MP3 96 kbit/s stéréo. |
| « Hiraeth » | Scott Buckley | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Scott Buckley - Hiraeth.oga](https://commons.wikimedia.org/wiki/File:Scott%20Buckley%20-%20Hiraeth.oga) | `c551df6434ac7fd6…` (7 410 545 octets, 346 s) | mandat (présidence, législatives, bilan) | extrait des 150 premières secondes (sur 346), fondu de sortie de 4 s, volume normalisé (EBU R128, −18 LUFS), réencodé en MP3 96 kbit/s stéréo. |
| « Born of the Sky » | Scott Buckley | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Scott Buckley - Born Of The Sky.oga](https://commons.wikimedia.org/wiki/File:Scott%20Buckley%20-%20Born%20Of%20The%20Sky.oga) | `d5a17046ba2bfa0e…` (32 238 783 octets, 188 s) | mandat (présidence, législatives, bilan) | morceau entier, volume normalisé (EBU R128, −18 LUFS), réencodé en MP3 96 kbit/s stéréo. |

- **Licences** : domaine public (aucune condition ; le crédit est tout de même donné) ; **CC BY 4.0** (Scott Buckley) : réutilisation libre, y compris modifiée, à condition de créditer l'auteur, d'indiquer la licence et de signaler les modifications. Le crédit complet (titre, auteur, licence, fichier source, modifications) figure dans Paramètres, « Crédits et mentions légales », et dans les métadonnées ID3 de chaque fichier (titre, artiste, licence, page source). L'auteur d'un enregistrement ancien est affiché en français (« compositeur (composition), interprète (interprétation) »), tel que la page Commons le donne en anglais (« Composition: … Performance: … »).
- **Traitement** (identique pour chaque morceau, reproductible : même empreinte à chaque relance) : extrait des 150 premières secondes au plus, avec un fondu de sortie de 4 s quand le morceau est coupé ; normalisation de la sonie en deux passes (filtre `loudnorm` de ffmpeg, EBU R128 : −18 LUFS intégrés, crête vraie −1,5 dBTP) ; encodage MP3 96 kbit/s stéréo, 44,1 kHz. Total embarqué : 9,5 Mo.
- **Jingles** (résultat à 20 h, victoire, défaite, ouverture d'un débat, nouvelle importante et, depuis la phase 21, coup de tampon de la semaine bouclée) : **aucun enregistrement**. Ce sont des partitions du jeu (`apps/web/src/audio/jingles.ts`, réécrites en phase 21) jouées par un synthétiseur Web Audio (`synth.ts` : oscillateurs, filtres, bruit et réverbération générés à graine fixe ; timbres ajoutés en phase 21 : marimba, cordes pincées, caisse claire, claquements, cliquetis de téléscripteur, tampon). Aucun indicatif de chaîne réelle n'est imité.

## 9. Points restant non vérifiés

1. Texte exact, sur Légifrance, de la loi n° 62-1292 (parrainages, financement) et de l'article L. 52-11.
2. Publication du décret de convocation des électeurs pour 2027.
3. Conditions de réutilisation des résultats présidentiels 2022 (licence `notspecified`).
4. ~~Structure du fichier communal du 1er tour 2022 pour Paris, Lyon, Marseille, et nombre exact de lignes `ZZ`.~~ Vérifié en phase 4 : une ligne par ville au 1er tour aussi (75056, 69123, 13055) ; 210 lignes `ZZ` à chaque tour.
5. Licence du fichier INSEE des contours de circonscriptions ; texte de référence du découpage.
6. ~~Zéros initiaux des codes métropolitains dans les fichiers des législatives 2024.~~ Vérifié en phase 6 : absents du fichier du 1er tour, présents dans celui du 2nd tour (§3.3).
7. ~~Sources des indicateurs économiques initiaux : à identifier en phase 6.~~ Fait (§7 bis, séries de l'Insee) ; conditions de réutilisation de l'Insee à relire avant une mise en ligne publique.
9. Texte des articles 6, 7, 9, 12, 18, 28, 45, 48 et 49 de la Constitution, du code électoral et de la loi organique n° 2001-419 sur Légifrance (cités d'après Wikipédia, Légifrance refusant l'accès le 21/10/2026).
8. Conditions de réutilisation des relevés de temps de parole de l'Arcom (page sans licence), des mesures de Médiamétrie et des classements de l'ACPM : seuls quelques chiffres agrégés sont repris avec citation ; à confirmer avant une mise en ligne publique.

## 10. Métadonnées obligatoires de chaque import (§10)

Chaque import enregistre dans `DataImport` : source, URL exacte, date de récupération, millésime, licence, période de validité, transformations appliquées, empreinte SHA-256 du fichier brut, version de l'importeur, nombre de lignes, statut. Les mises à jour sont versionnées ; un import qui ne passe pas ses contrôles est rejeté en entier.

## 11. Données de démonstration

Un jeu réduit, commité dans `data/demo/`, permet de jouer hors ligne (§10). S'il est dérivé de données réelles, il en conserve la source et la licence (sous réserve du point 3 de la section 9) ; s'il est synthétique, il est étiqueté `fictif`.

Réalisé en phase 4 : `packages/data-import/demo/cog-2026/` contient des géométries réelles (IGN, INSEE, Licence Ouverte 2.0, sources et empreintes dans son manifeste) pour l'aperçu national et les communes de l'Ain, de la Corse, de la Somme (ajoutée en phase 9 : 771 communes, dont Amiens) et des DROM. Aucun résultat 2022 n'y figure : la base électorale de démonstration est synthétique et affichée « Démonstration fictive ». Depuis la phase 9, ses affinités et sa participation combinent trois tirages déterministes (région, département, commune) pour que la carte et la soirée électorale montrent des territoires contrastés ; ces contrastes sont inventés et ne reproduisent pas la géographie électorale réelle.
