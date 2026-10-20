# Registre des risques — RÉPUBLIQUE 2027

> Établi en phase 0 (20/10/2026). À relire au début de chaque phase ; un risque fermé reste dans le tableau avec son statut.
> Échelle : **P** probabilité, **I** impact — Faible / Moyen / Élevé.

## 1. Risques majeurs (à traiter en priorité)

| ID | Risque | P | I | Phase | Atténuation | Signal d'alerte |
|---|---|---|---|---|---|---|
| R-01 | **Carte communale trop lourde sur mobile** : ~35 000 polygones communaux + 5 encarts DROM, rendu WebGL et mémoire limités sur téléphone. | Élevée | Élevé | 4 | Tuiles vectorielles (PMTiles) ou GeoJSON par département chargés selon le zoom ; simplification multi-niveaux ; une seule carte DROM active sur mobile ; spike mesuré avant implémentation complète. | Temps de premier rendu ou mémoire hors budget mesuré au spike. |
| R-02 | **Accès réseau aux sources officielles bloqué depuis l'environnement cloud de développement** : `www.data.gouv.fr`, `geo.api.gouv.fr`, `www.conseil-constitutionnel.fr` ne répondent pas, `www.elections.interieur.gouv.fr`, `www.legifrance.gouv.fr` et `www.interieur.gouv.fr` renvoient 403 (constat du 20/10/2026). | Élevée | Élevé | 3–4 | Autoriser ces domaines dans la politique réseau de l'environnement, ou exécuter les imports en local / en CI ; les importeurs restent testés sur des extraits commités ; aucun résultat inventé pour compenser. | Import impossible au démarrage de la phase 4. |
| R-03 | **Attribution d'un résultat à la mauvaise commune** : les fichiers 2022 du ministère de l'Intérieur utilisent des codes propres pour l'outre-mer et l'étranger (`ZA`…`ZM`, `ZZ`, `ZN`, `ZP`, `ZS`, `ZW`, `ZX` — vérifié, voir [SOURCES §3.1](./SOURCES.md#31-présidentielle-2022-par-commune-ministère-de-lintérieur-datagouvfr)), alors que les législatives 2024 utilisent des codes de style INSEE ; Corse `2A`/`2B` ; zéros initiaux (`01`…`09`) perdus si un code est traité comme un nombre ; fichiers en Latin-1 à blocs de candidats répétés. | Élevée | Élevé | 4 | Codes toujours en chaînes ; table de correspondance explicite et versionnée ; l'import **échoue** si une ligne ne trouve pas sa commune ou si une commune reçoit deux lignes ; test d'exhaustivité par département. | Écart entre somme des communes et total officiel publié. |
| R-04 | **Géographie qui évolue** : 34 955 communes au COG 2022 contre 34 875 au COG 2026 ; communes nouvelles en 2023, 2024 et 2025, mais aussi **rétablissements (scissions) en 2024 et 2025** (vérifié). | Élevée | Moyen | 4 | Tables de passage INSEE ; fusion = somme exacte ; scission = ventilation au prorata de la population, étiquetée `estimation`. | Communes sans base électorale après import. |
| R-05 | **Périmètre national ≠ périmètre cartographié** : les Français établis hors de France et les collectivités d'outre-mer votent à la présidentielle mais ne figurent pas (ou pas tous) sur la carte. | Certaine | Élevé | 3–4 | Périmètre du scrutin explicite dans le *ruleset* ; liste « Hors carte » dans l'interface ; test : total national = Σ territoires du périmètre (cartographiés + hors carte). | Total national ≠ agrégation (critère 7). |
| R-06 | **Personnalités réelles** : risques juridiques (atteinte à l'image, propos inventés, diffamation), données périmées, candidatures 2027 non confirmées. | Moyenne | Élevé | 3, 5 | Profils limités à des faits publics sourcés et datés ; aucun propos fictif présenté comme citation (§1.1) ; statut de candidature affiché (`non déclarée` / `déclarée` / `officielle`) ; pas de photo sans licence compatible ; avertissement « simulation » ; relecture juridique recommandée avant toute mise en ligne publique. | Profil sans source ou source de plus de N mois. |
| R-07 | **Dérive de périmètre** : le cahier des charges couvre campagne, deux tours, carte communale, quinquennat, Parlement, économie, législatives et continuation. Risque de livrer des écrans sans mécanique. | Élevée | Élevé | toutes | Phases courtes avec critères d'acceptation testables ; règle « ne pas simuler une fonctionnalité non implémentée » ; un écran sans moteur derrière est marqué « non disponible ». | Écran livré sans test d'intégration associé. |
| R-08 | **Perte du déterminisme** (ordre d'itération, `Math.random`, `Date.now`, flottants différents entre moteurs JS) ⇒ sauvegardes non reproductibles. | Moyenne | Élevé | 2 | Lint interdisant `Math.random`/`Date` dans `packages/engine` ; ordre de tri explicite ; calcul faisant foi côté serveur uniquement ; test de rejeu par empreinte SHA-256 en CI. | Test de rejeu instable. |

## 2. Risques modérés

| ID | Risque | P | I | Phase | Atténuation |
|---|---|---|---|---|---|
| R-09 | **Dates de 2027 annoncées mais pas encore décrétées** (18 avril et 2 mai 2027 retenus en Conseil des ministres le 1er juillet 2026 ; décret de convocation non publié) ; règles (plafonds, parrainages) modifiables par un nouveau texte. | Moyenne | Moyen | 2–3 | Dates et plafonds dans des *rulesets* versionnés, avec source et date de vérification ; valeurs non confirmées étiquetées `hypothèse`. |
| R-10 | **Volume des sauvegardes** (instantanés hebdomadaires sur plus de 300 semaines). | Élevée | Moyen | 1–2 | Pas de données par commune dans l'instantané ; rétention des sauvegardes auto ; rejeu du journal ([MODELE_DONNEES §3](./MODELE_DONNEES.md)). |
| R-11 | **Réalisme du modèle électoral** : résultats absurdes ou instables. | Moyenne | Moyen | 3 | Test de calibration : rejouer 2022 sans action doit rester proche des résultats réels (écart borné, seuil fixé après mesure) ; paramètres documentés. |
| R-12 | **Biais politique perçu** (paramètres d'affinité, IA plus favorable à un camp). | Moyenne | Moyen | 3, 5 | Même catalogue d'actions et mêmes coûts pour tous ; paramètres publics et documentés ; tests de symétrie (deux profils miroirs ⇒ résultats miroirs). |
| R-13 | **Licences des données géographiques** : les contours Etalab sont sous **ODbL** (partage à l'identique), car ils intègrent des données OpenStreetMap ; IGN ADMIN EXPRESS est sous Licence Ouverte 2.0 (vérifié). | Moyenne | Moyen | 4 | Utiliser IGN ADMIN EXPRESS COG CARTO (décision D8) ; attributions affichées ; licence notée dans `DataImport`. |
| R-14 | **Pile très récente** : TypeScript 7.0 (compilateur réécrit), étiquette `latest` de `prisma` sur une *release candidate* 8.0, Vite 8. Incompatibilités d'outillage possibles. | Moyenne | Moyen | 1 | Figer des versions stables vérifiées ensemble en phase 1 (Prisma 7.10.1) ; mise à jour volontaire et testée ensuite. |
| R-15 | **Docker indisponible dans l'environnement cloud** (CLI présente, pas de démon) : l'image ne peut pas être construite ici. | Certaine | Faible | 1, 8 | Tests avec un PostgreSQL 16 local (binaires présents, démarrage vérifié) ; construction de l'image en CI GitHub Actions. |
| R-16 | **Playwright** : Chromium préinstallé en révision 1194, différent de celui attendu par `@playwright/test` 1.64. | Certaine | Faible | 1 | `executablePath` dans l'environnement cloud ; `playwright install` en CI. |
| R-17 | **Accessibilité d'une carte WebGL** (lecteurs d'écran). | Élevée | Moyen | 4 | Tableau alternatif filtrable, recherche au clavier, légende textuelle, région ARIA annonçant la sélection. |
| R-18 | **Import de sauvegarde malveillant ou corrompu** (taille, structure, pollution de prototype). | Moyenne | Moyen | 1–2 | Taille maximale, validation Zod stricte avant toute écriture, transaction, jamais d'écrasement d'une partie existante. |
| R-19 | **Indicateurs socio-économiques communaux incomplets** (secret statistique pour les petites communes, millésimes différents). | Élevée | Faible | 4 | Indicateurs au niveau départemental par défaut ; millésime conservé ; valeur manquante affichée comme telle. |
| R-20 | **Narration par LLM** (optionnelle) attribuant des propos inventés à des personnes réelles. | Faible | Élevé | 5+ | Désactivée par défaut ; jamais de citation de personnalité réelle ; aucun accès en écriture à l'état (§7). |
| R-21 | **Hébergement non choisi** (coût, sauvegardes PostgreSQL, HTTPS). | Certaine | Moyen | 8 | Décision à prendre avant la phase 8 ; critères : Node.js, PostgreSQL managé avec sauvegardes, variables d'environnement, HTTPS. |
| R-22 | **Modèle économique simplifié** pris pour une prévision. | Moyenne | Faible | 6 | Étiquette « simulation » sur tous les indicateurs simulés ; valeurs initiales réelles sourcées. |
| R-23 | **Licence des résultats présidentiels 2022 non précisée** (`notspecified` sur data.gouv.fr, vérifié) : conditions de redistribution de données dérivées (jeu de démonstration, base électorale) incertaines. | Moyenne | Moyen | 4 | Clarifier les conditions de réutilisation avant de commiter des données dérivées ; ne jamais commiter les fichiers bruts ; sinon jeu de démonstration synthétique étiqueté `fictif`. |

## 3. Informations manquantes signalées (non inventées)

Ces points bloquent ou conditionnent certaines phases ; ils sont repris dans [PLAN_DEVELOPPEMENT.md — Questions ouvertes](./PLAN_DEVELOPPEMENT.md#5-questions-ouvertes).

1. Décret de convocation des électeurs pour 2027 (dates annoncées : 18 avril et 2 mai 2027 ; voir [SOURCES §4](./SOURCES.md#4-calendrier-de-la-présidentielle-2027)).
2. Liste des personnalités réelles à proposer en mode « candidat réel », et politique d'affichage (photos, statut de candidature).
3. Validation du millésime géographique de référence (proposition : COG 2026, le plus récent) et de la source des contours (décision D8).
4. Périmètre du scrutin dans le jeu : métropole + DROM uniquement, ou aussi collectivités d'outre-mer et Français de l'étranger (recommandé : tout le périmètre officiel, avec liste « Hors carte »).
5. Comptes utilisateurs : session anonyme seule, ou comptes avec authentification.
6. Hébergeur cible.
7. Autorisation réseau vers les domaines de données publiques dans l'environnement de développement cloud (R-02).
8. Conditions de réutilisation des résultats présidentiels 2022 (R-23).
9. Textes officiels non consultables depuis l'environnement (Légifrance) : règles de parrainage et de financement vérifiées uniquement via le guide CNCCFP et des documents officiels secondaires.
