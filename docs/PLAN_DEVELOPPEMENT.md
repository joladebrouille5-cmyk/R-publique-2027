# Plan de développement — RÉPUBLIQUE 2027

> Phase 0 réalisée le 20/10/2026. Référence : [cahier des charges v1.2](./Cahier_des_charges_Republique_2027.pdf).
> Documents liés : [Architecture](./ARCHITECTURE.md) · [Modèle de données](./MODELE_DONNEES.md) · [Sources](./SOURCES.md) · [Risques](./RISQUES.md).

---

## 1. État des lieux (audit de la phase 0)

### 1.1 Dépôt

| Élément | Constat |
|---|---|
| Historique Git | 1 commit (`Initial commit`), branche de travail `claude/new-session-lmxg1t`. |
| Contenu | `README.md` d'une ligne. Aucun code, aucune dépendance, aucune configuration. |
| Tests existants | **Aucun** : rien à exécuter, donc aucune erreur préexistante à noter. |
| Cahier des charges | PDF lu en entier (10 pages), copié dans `docs/Cahier_des_charges_Republique_2027.pdf` (SHA-256 `678ce99c…cfa93`). |

### 1.2 Outils disponibles dans l'environnement de développement cloud

| Outil | Version | Utilisation prévue |
|---|---|---|
| Node.js | 22.22.0 | API, moteur, outillage |
| pnpm | 10.28.0 | gestionnaire du monorepo (npm 10.9.4, yarn 1.22.22 et bun 1.4.2 aussi présents) |
| PostgreSQL | 16.15 (binaires `initdb`, `pg_ctl`, `postgres`, `psql`) | base locale de développement et de tests — **démarrage d'une instance jetable vérifié** |
| Docker | CLI 29.9.1 + Compose 5.6.0, **démon absent** | images construites en CI uniquement |
| Chromium (Playwright) | révision 1194 dans `/opt/pw-browsers` | tests de bout en bout |
| Python | 3.13.16 | scripts ponctuels si besoin |
| tippecanoe, GDAL/ogr2ogr, mapshaper | absents | `mapshaper` s'installe par npm ; `tippecanoe` via Docker en CI si retenu |
| Machine | 4 cœurs, 15 Gio de RAM, ~30 Go libres | suffisant pour le traitement géographique |

### 1.3 Accès réseau depuis l'environnement cloud (constat du 20/10/2026)

| Domaine | Résultat |
|---|---|
| `registry.npmjs.org` | accessible |
| `www.insee.fr`, `data.geopf.fr` (IGN), `etalab-datasets.geo.data.gouv.fr` (intermittent), `cadastre.data.gouv.fr` | accessibles |
| `www.assemblee-nationale.fr`, `data.assemblee-nationale.fr`, `www.senat.fr`, `api.github.com` | accessibles |
| `www.cnccfp.fr`, `www.banque-france.fr`, `www.service-public.fr` | redirection (301) |
| `www.data.gouv.fr`, `geo.api.gouv.fr`, `www.conseil-constitutionnel.fr` | **inaccessibles** (connexion coupée) |
| `www.elections.interieur.gouv.fr`, `www.interieur.gouv.fr`, `www.legifrance.gouv.fr` | **refusés (403)** |

Conséquence : les imports de résultats électoraux (data.gouv.fr) ne peuvent pas s'exécuter depuis cet environnement tant que la politique réseau n'autorise pas ces domaines (risque [R-02](./RISQUES.md)).

Nouveau contrôle en fin de phase 3 : `geo.api.gouv.fr` et `www.conseil-constitutionnel.fr` répondent désormais (200) ; `www.insee.fr` reste accessible ; `www.data.gouv.fr`, `static.data.gouv.fr` et `etalab-datasets.geo.data.gouv.fr` coupent toujours la connexion ; `object.files.data.gouv.fr` répond 403.

Phase 4 : après l'ajout de `www.data.gouv.fr` et `static.data.gouv.fr` aux domaines autorisés de l'environnement cloud (réglage du porteur du projet sur claude.ai), les fichiers communaux de la présidentielle 2022 ont été téléchargés et importés le 20/10/2026 (Q7). Contrôle du 21/10/2026, après redémarrage du conteneur : `www.data.gouv.fr` répond (200) mais `static.data.gouv.fr` coupe de nouveau la connexion, et `www.legifrance.gouv.fr` comme `www.cnccfp.fr` sont refusés par le proxy (403). Les fichiers déjà téléchargés (`data/raw/`, empreintes vérifiées) suffisent pour rejouer les imports.

---

## 2. Méthode de travail (§18 et guide, étape 5)

À chaque phase :

1. Rappeler les critères d'acceptation de la phase **avant** de coder.
2. Développer par petits incréments, chacun accompagné de ses tests.
3. Lancer les tests pertinents, corriger les échecs, ne jamais masquer une erreur.
4. Ne jamais présenter comme fonctionnelle une fonctionnalité non implémentée : un écran sans moteur affiche « disponible en phase N ».
5. Mettre à jour `README.md` et la documentation.
6. Livrer un compte rendu : résumé, fichiers modifiés, tests et résultats, limites, prochaine étape.
7. Commit uniquement quand la phase est stable ; **s'arrêter à la fin de la phase**.

**Définition de « terminé »** pour une tâche : code + tests automatisés qui échouent sans le code + documentation à jour + CI verte.

---

## 3. Traçabilité des critères d'acceptation (§17)

| # | Critère (§17) | Phase(s) | Preuve attendue |
|---|---|---|---|
| 1 | L'application démarre selon le README | 1, 8 | test manuel guidé + CI |
| 2 | Une partie et un candidat peuvent être créés | 1, 3 | test d'intégration + Playwright |
| 3 | Le calendrier avance semaine par semaine | 2 | tests unitaires calendrier + Playwright |
| 4 | Les actions modifient l'état et les ressources | 2 | tests unitaires + intégration |
| 5 | Les adversaires agissent de façon autonome | 3 (base), 5 | test : partie en mode observateur, actions IA journalisées |
| 6 | Les deux tours sont jouables et cohérents | 3 | tests de propriétés second tour + intégration |
| 7 | Résultats = agrégations territoriales | 3, 4 | tests de propriétés + contrôle sur données 2022 |
| 8 | La carte couvre communes métropolitaines et DROM | 4 | test d'exhaustivité COG ⇄ géométries |
| 9 | Encarts DROM interactifs, résultats consultables | 4 | Playwright (bureau + mobile) |
| 10 | La victoire ouvre la phase gouvernementale | 3 (transition), 6 | intégration |
| 11 | Votes parlementaires et réformes ont des conséquences | 6 | propriétés : réforme rejetée non appliquée |
| 12 | Sauvegarde ⇒ reprise sans perte | 1 (base), 2 | test aller-retour + empreinte d'état |
| 13 | Les tests passent en CI | 1 → 8 | GitHub Actions |
| 14 | Fonctionne sans clé API payante | toutes | CI sans aucun secret |
| 15 | PC et mobile utilisables | 1 → 8 | Playwright viewport mobile |
| 16 | Réel et simulé distingués | 3, 4 | tests de composants (badges) + Playwright |
| 17 | La partie continue après le quinquennat | 6 | intégration fin de mandat → nouvelle présidentielle |

---

## 4. Phases

La numérotation suit le §16 du cahier des charges. La « phase 7 — Finalisation » du guide pratique correspond à la **phase 8** ci-dessous ; la phase 7 du §16 est consacrée au contenu (scénarios, événements).

### Phase 0 — Audit, architecture, sources, risques ✅

- [x] Lire le cahier des charges en entier et le copier dans `docs/`.
- [x] Auditer le dépôt et les outils ; constater l'absence de tests existants.
- [x] Vérifier l'accès réseau aux sources officielles.
- [x] Produire `ARCHITECTURE.md`, `MODELE_DONNEES.md`, `SOURCES.md`, `RISQUES.md`, ce plan.
- [ ] **Validation par le porteur du projet** des décisions D1–D8 ([ARCHITECTURE §13](./ARCHITECTURE.md#13-décisions-darchitecture-à-valider)) et des [questions ouvertes](#5-questions-ouvertes).

**Livrable** : plan documenté (§16).

### Phase 1 — Squelette (application lançable) ✅

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P1-01 | Monorepo pnpm, TypeScript strict, ESLint, Prettier, Vitest ; versions figées (cf. [ARCHITECTURE §12](./ARCHITECTURE.md#12-versions-de-la-pile-figées-en-phase-1-le-20102026)). | `pnpm lint`, `pnpm typecheck`, `pnpm test` passent. |
| P1-02 | `packages/shared` : premiers schémas Zod (`GameState` minimal, DTO de création). | tests de validation (entrées valides / invalides). |
| P1-03 | `packages/engine/core` : PRNG à graine + flux dérivés, `createGame()`. | vecteurs de test du PRNG ; même graine ⇒ même état. |
| P1-04 | `apps/api` : Fastify, `/api/health`, Zod, Prisma + migration initiale (`User`, `Game`, `GameSave`, `GameAction`, `GameEvent`, `SimulationLog`), session anonyme par cookie signé, limitation de débit, en-têtes de sécurité. | tests `inject` contre un PostgreSQL réel. |
| P1-05 | Sauvegardes de base : créer une partie, sauvegarder dans un emplacement, lister, restaurer. | test aller-retour : empreinte d'état identique. |
| P1-06 | `apps/web` : React, Vite, React Router, TanStack Query, Zustand, Tailwind ; mise en page responsive ; navigation vers tous les écrans du §13 (écrans non implémentés marqués comme tels) ; thème clair/sombre ; création de partie. | tests de composants + Playwright bureau et mobile (création de partie). |
| P1-07 | Scripts de développement : `pnpm dev` (API + web), base locale (script PostgreSQL local et `docker-compose.yml`), `.env.example` sans secret. | démarrage en suivant le README sur une machine propre. |
| P1-08 | CI GitHub Actions : lint, typecheck, unitaires, intégration (service PostgreSQL), Playwright. | CI verte. |
| P1-09 | README : prérequis, installation, démarrage, tests. | relecture. |

**Livrable** : application lançable (§16). **Critères visés** : 1, 2 (partie), 12 (base), 13, 14, 15.

**Bilan (20/10/2026)** — les neuf tâches sont réalisées.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` (unitaires, propriétés, composants) | 39 tests réussis |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 23 tests réussis |
| `pnpm test:e2e` (Playwright, bureau + mobile Pixel 7) | 8 tests réussis |
| `pnpm build` (interface + API) | réussi ; l'API construite démarre et répond |
| Séquence complète de la CI rejouée localement sans `.env` | réussie |
| CI GitHub Actions (exécution n° 1, commit `268d591`) | verte : 14 étapes réussies en 2 min |
| Contrôle des tests par mutation (bug volontaire dans la restauration) | détecté par le test de restauration |

Écarts et limites :
- **TypeScript 6.0.3** au lieu de 7.0 : `typescript-eslint` 8.72 n'accepte que TypeScript < 6.1. **Playwright 1.56.1**, qui correspond au Chromium préinstallé (révision 1194). **jsdom 29.1.1**, car la 30 exige Node 22.22.2. **Node ≥ 22.22** requis par React Router 8.5.
- `docker-compose.yml` est validé syntaxiquement (`docker compose config`), mais n'a pas pu être lancé faute de démon Docker dans l'environnement cloud ; les tests ont utilisé un PostgreSQL 16 local (`scripts/pg-local.sh`).
- La création de partie ne crée pas encore de candidat (critère 2 complet en phase 3) ; le mode « candidat réel » est refusé explicitement (422).
- Sauvegarde automatique hebdomadaire, export/import JSON et journal : phase 2.
- Session anonyme uniquement (Q5) ; la démarche « tester depuis un téléphone » du README n'a pas été vérifiée sur un appareil physique (seulement en émulation mobile Playwright).

### Phase 2 — Simulation hebdomadaire persistante ✅

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P2-01 | Calendrier : départ configurable (automne 2026), dates en *ruleset* versionné. | tests unitaires calendrier (semaines, échéances). |
| P2-02 | Pipeline des 12 étapes (§2) dans l'ordre documenté ; étapes non encore actives explicitement vides et journalisées. | test d'ordre des étapes. |
| P2-03 | Ressources (argent en centimes, temps, militants, notoriété, popularité) et premier catalogue d'actions (coût, risque, portée, effet attendu, délai, incertitude — §6). | tests : action refusée si ressources insuffisantes ; coûts débités. |
| P2-04 | Moteur d'événements de base (conditions, probabilité, effets immédiats et différés, étiquette `fictif`). | tests unitaires et de propriétés. |
| P2-05 | Journal et bilan hebdomadaire avec décomposition des facteurs. | test : chaque variation a ses facteurs. |
| P2-06 | `POST /advance` idempotent, verrou optimiste, sauvegarde automatique hebdomadaire et avant événement majeur. | test : double envoi ⇒ une seule progression ; conflit ⇒ 409. |
| P2-07 | Export / import JSON versionné (`save-engine`), validation avant écriture, migrations de sauvegarde. | test aller-retour ; fichier corrompu rejeté sans effet. |
| P2-08 | Test de rejeu déterministe (séquence d'actions ⇒ empreinte identique) en CI. | test de propriétés sur graines aléatoires. |
| P2-09 | UI : tableau de bord, choix d'actions, bouton « semaine suivante », journal, bilan. | Playwright : action → progression → effet visible → sauvegarde → reprise. |

**Livrable** : simulation persistante. **Critères visés** : 3, 4, 12.

**Bilan (20/10/2026)** — les neuf tâches sont réalisées.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` | 87 tests réussis : moteur 43 (dont 4 propriétés fast-check), sauvegardes 15, jeu de règles 6, contrats 4, interface 19 |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 39 tests réussis (23 de la phase 1, 16 nouveaux) |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 10 tests réussis |
| Contrôle par mutation (rejeu idempotent désactivé) | détecté par le test d'idempotence |
| CI GitHub Actions (exécution n° 3, commit `c9b1c53`) | verte : toutes les étapes réussies en 2 min 15 s |

Réalisé :
- **P2-01** : jeu de règles `presidentielle-2027@1.0.0` (paquet `packages/rulesets`) : scrutins annoncés, échéances déduites de leur règle (recalculées par test), sources, paramètres de jeu étiquetés « hypothèse ».
- **P2-02** : pipeline des 12 étapes dans l'ordre du §2 ; les étapes 3, 4, 7 et 8 sont journalisées « inactives » avec la phase prévue.
- **P2-03** : 5 ressources entières, 8 actions (coût, prérequis, portée, effets attendus avec incertitude et délai, risque), rejet motivé.
- **P2-04** : 6 événements fictifs (conditions, probabilité, délai entre occurrences, effets immédiats et différés, choix), décisions obligatoires, événement majeur.
- **P2-05** : bilan hebdomadaire décomposé en facteurs ; somme des facteurs = variation (propriété testée).
- **P2-06** : `POST /advance` idempotent (clé obligatoire, rejeu, refus d'une clé réutilisée), verrou optimiste, envois simultanés départagés, sauvegarde automatique hebdomadaire (8 conservées) et avant événement majeur.
- **P2-07** : export/import JSON versionné, empreinte vérifiée avant migration, import toujours dans une nouvelle partie ; migration du format 1 (phase 1) vers le format 2, à la lecture et à la restauration.
- **P2-08** : déterminisme vérifié par propriétés (moteur) et de bout en bout (API).
- **P2-09** : tableau de bord (ressources, décisions, plan d'actions, bilan, calendrier sourcé), écran Journal, sauvegardes automatiques, export et import.

Écarts et limites :
- Les actions sont envoyées avec la demande de progression (`POST /advance`), et non par une route `POST /actions` séparée : un seul envoi atomique et idempotent par semaine.
- La partie se **bloque explicitement la semaine du premier tour** (12 avril 2027 pour un départ le 28 septembre 2026, soit 28 semaines) : le scrutin sera résolu par le moteur électoral de la phase 3.
- Sans candidats ni adversaires, le mode observateur ne fait qu'avancer le temps.
- Coûts, effets et probabilités ne sont pas calibrés (risque [R-24](./RISQUES.md)).
- Les règles de financement (plafond des dons, compte de campagne) ne sont pas appliquées : la collecte de dons est un montant agrégé, comme l'indique l'interface (phase 5).
- Pas encore d'« accélération » sur plusieurs semaines : une semaine par demande.

### Phase 3 — Présidentielle jouable ✅

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P3-01 | Création de candidat personnalisé (§1.2) ; mode candidat réel avec profils sourcés (selon décision Q2). | intégration. |
| P3-02 | `territory-engine` : hiérarchie et agrégations (données de démonstration tant que l'import réel n'est pas disponible, étiquetées). | propriétés : agrégat = Σ enfants. |
| P3-03 | Scores latents, softmax, participation, abstention différentielle (§5.1). | propriétés : 0 ≤ p ≤ 1, Σ p = 1. |
| P3-04 | Répartition en voix entières (plus fort reste) et agrégation exacte. | propriétés : Σ voix = exprimés ; national = Σ territoires du périmètre. |
| P3-05 | Sondages simulés (terrain, publication, échantillon, méthode, marge, limites) ; popularité distincte (§5.2). | tests statistiques bornés. |
| P3-06 | Premier tour, qualification, reports partiels, second tour (§5.3). | propriétés : un soutien ne transfère jamais 100 % ; deux qualifiés exactement (sauf règle du *ruleset*). |
| P3-07 | Adversaires de base autonomes (même catalogue d'actions). | mode observateur : les adversaires agissent sans le joueur. |
| P3-08 | Issue : victoire ⇒ transition vers la présidence (contenu en phase 6) ; défaite ⇒ bilan et poursuite. | intégration. |
| P3-09 | UI : sondages, soirée électorale (tableaux), badges réel / sondage / simulé. | Playwright élection complète. |

**Livrable** : présidentielle jouable. **Critères visés** : 2, 5 (base), 6, 7, 10 (transition), 16.

**Bilan (20/10/2026)** — les neuf tâches sont réalisées, avec les adaptations signalées ci-dessous.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` | 137 tests réussis : moteur 79 (dont 7 propriétés fast-check), sauvegardes 17, jeu de règles 8, contrats 4, interface 29 |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 47 tests réussis (8 nouveaux ou étendus) |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 12 tests réussis, dont une présidentielle complète jusqu'aux résultats |
| Contrôle visuel (captures bureau et mobile, thèmes clair et sombre) | carte des positionnements, tableaux de sondages et de résultats lisibles, sans défilement horizontal |
| CI GitHub Actions (exécution n° 6, commit `d52a7a3`) | verte : toutes les étapes réussies en 2 min 49 s |

Réalisé :
- **P3-01** : création du candidat personnalisé (prénom, nom, parti, positionnement économique et sociétal de −100 à +100, parcours, profil de départ modifiant les ressources) ; formulaire avec les électorats les plus proches ; nom et parti obligatoires (client et serveur). Mode « candidat réel » toujours refusé, en attente de Q2.
- **P3-02** : `territory/aggregate.ts` (agrégation exacte d'une hiérarchie, contrôle des invariants) ; en attendant les territoires réels, l'électorat est découpé en 9 groupes d'électeurs nationaux étiquetés « hypothèse de jeu ».
- **P3-03 / P3-04** : score latent décomposé en facteurs nommés, softmax, participation et abstention différentielle, blancs croissants au second tour quand aucun finaliste n'est proche ; voix entières au plus fort reste ; national = somme exacte des groupes ; participation, blancs et nuls calés sur 2022.
- **P3-05** : deux instituts fictifs (1 000 et 1 500 personnes, un sondage toutes les deux semaines chacun) ; échantillon tiré des intentions attendues avec biais d'institut ; marge à 95 % ; hypothèse de second tour ; cote de popularité distincte ; fiche technique complète.
- **P3-06** : majorité absolue ou deux qualifiés ; consignes de vote (automatiques pour les adversaires selon la proximité, décision obligatoire pour le joueur éliminé) ne transférant qu'une partie des électeurs (testé) ; débat d'entre-deux-tours simulé ; second tour.
- **P3-07** : 7 adversaires fictifs autonomes (style, tolérance au risque, moyens selon la difficulté), même catalogue, mêmes coûts et même validation que le joueur ; actifs en mode observateur.
- **P3-08** : statuts (en campagne, qualifié, éliminé, élu, battu) ; phase « présidence » si le joueur gagne, « bilan » sinon ; la partie se bloque ensuite explicitement avec un message renvoyant à la phase 6 ; sauvegarde automatique « Avant le premier tour » / « Avant le second tour ».
- **P3-09** : écrans Candidats, Sondages et Résultats ; tableau de bord (position dans le dernier sondage, consigne de vote, fin de la présidentielle) ; bilan hebdomadaire séparant vos actions de celles des adversaires ; badges « Fictif », « Sondage simulé », « Résultat simulé ».
- Format de sauvegarde 3 et migration 2 → 3 testée sur un état réel de la phase 2 ; jeu de règles 2.0.0.

Écarts et limites :
- **Pas de territoires** avant la phase 4 : résultats nationaux et par groupe d'électeurs uniquement ; la carte reste annoncée « phase 4 ».
- **Parrainages non modélisés** (phase 5) : tous les candidats sont présents au premier tour, ce que l'écran Candidats indique.
- Après l'élection, la partie s'arrête (gouvernement, législatives et quinquennat en phase 6) ; défaite : le bilan et la poursuite arrivent en phases 6 et 7.
- Les sondages et résultats sont lus dans l'état de la partie, sans route `/polls` dédiée (prévue avec les volumes communaux de la phase 4).
- Équilibrage non calibré ([R-12](./RISQUES.md), [R-24](./RISQUES.md)) : sans action du joueur, la candidate fictive du centre gagne la plupart des parties testées.
- La migration 2 → 3 donne une identité par défaut (« Candidat du joueur », au centre) aux parties existantes ; l'édition du candidat n'est pas proposée.

### Phase 4 — Carte interactive complète (métropole + DROM) ✅

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P4-01 | **Spike mesuré** : PMTiles vs GeoJSON par département sur un téléphone émulé (taille transférée, premier rendu, mémoire). Décision consignée dans `ARCHITECTURE.md`. | rapport de mesure. |
| P4-02 | `data-import` : COG INSEE du millésime retenu, contours communaux (métropole + 971, 972, 973, 974, 976), métadonnées `DataImport` complètes. | l'import échoue si une commune n'a pas exactement une géométrie. |
| P4-03 | Import des résultats présidentiels 2022 par commune (deux tours ; Latin-1, `;`, blocs de candidats répétés), table de correspondance des codes Intérieur ⇄ INSEE, tables de passage COG 2022 → COG retenu (fusions et scissions). | Σ des lignes = totaux proclamés par le Conseil constitutionnel ([SOURCES §3.2](./SOURCES.md#32-totaux-nationaux-officiels-2022-contrôle-dagrégation)), à l'unité ; tout écart documenté. |
| P4-04 | Jeu de démonstration hors ligne réduit, commité. | jeu jouable sans réseau. |
| P4-05 | Carte métropole : zoom, déplacement, sélection, niveaux commune / département / région. | Playwright. |
| P4-06 | Cinq encarts DROM interactifs (instances indépendantes), bandeau PC, plein écran mobile. | Playwright : ouvrir chaque encart, sélectionner une commune. |
| P4-07 | Recherche par nom ou code ⇒ centrage (ouvre l'encart si DROM). | Playwright : « Mamoudzou », « 97411 », « Ajaccio », « 2A004 ». |
| P4-08 | Fiche territoriale, filtres (tours, candidats, nature des données), comparaison, liste « Hors carte ». | tests de composants + Playwright. |
| P4-09 | Accessibilité : tableau alternatif, clavier, légende textuelle, motifs. | audit axe-core automatisé + test clavier. |
| P4-10 | Mobile : gestes tactiles, légende compacte, fiche dépliable. | Playwright viewport mobile. |

**Livrable** : carte interactive complète. **Critères visés** : 7, 8, 9, 15, 16, et la liste de contrôle de l'étape 6 du guide.

**Bilan (21/10/2026)** — les dix tâches sont réalisées, avec les adaptations signalées ci-dessous.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` | 189 tests réussis : moteur 90, import de données 27 (nouveau paquet), sauvegardes 18, jeu de règles 8, contrats 4, interface 42 |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 65 tests réussis (18 nouveaux : API géographique, résultats communaux, résultats 2022) |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 22 tests réussis, dont 5 scénarios de carte par appareil et un audit axe-core |
| `pnpm data:geo` (référentiel complet) | 34 875 communes du COG 2026, chacune avec exactement une géométrie ; 101 départements, 18 régions, 7 territoires hors carte ; import reproductible à l'octet près |
| `pnpm data:resultats` (présidentielle 2022) | 35 245 lignes par tour ; **somme = totaux proclamés par le Conseil constitutionnel à l'unité**, aux deux tours |
| `pnpm mesure:carte` (spike P4-01) | TopoJSON par département : premier rendu 1,6 s, 0,43 Mo, 11,5 Mo de mémoire sur téléphone émulé ([MESURES_CARTE.md](./MESURES_CARTE.md)) |
| Contrôle visuel avec le référentiel et les résultats réels (bureau, mobile, thèmes clair et sombre, motifs) | carte, encarts, fiche, légende et tableau lisibles ; Marseille, Ajaccio, Mamoudzou retrouvées par la recherche |
| CI GitHub Actions (exécution n° 16, commit `4a77434`) | verte : toutes les étapes réussies en 3 min 43 s (l'échec de l'exécution n° 12 venait d'un sélecteur ambigu du test « présidentielle complète », corrigé) |

Réalisé :
- **P4-01** : mesure sur Pixel 7 émulé (processeur ralenti 4×, 4G) de deux formats ; **décision D7** : aperçu national des départements et régions, puis TopoJSON des communes par département, chargé à la demande (13 fois plus rapide, 19 fois moins de données que le fichier national).
- **P4-02** : nouveau paquet `packages/data-import` : téléchargements reprenables avec métadonnées et empreinte SHA-256, COG 2026 (INSEE), contours IGN ADMIN EXPRESS COG CARTO 2026 lus dans le GeoPackage (lecteur WKB du dépôt), contrôle « une géométrie par commune et inversement » (l'import échoue sinon, testé), simplification mapshaper, départements et régions fusionnés à partir des communes, manifeste des sources.
- **P4-03** : lecture des fichiers de l'Intérieur (Windows-1252, blocs de candidats répétés, contrôles ligne à ligne), correspondance Intérieur ⇄ INSEE pour les DROM et les territoires hors carte, passage COG 2022 → 2026 par le fichier des mouvements (65 fusions sommées exactement, 10 communes ventilées au prorata de la population et étiquetées « estimation », 6 communes sans électeurs). Le moteur dépouille désormais **commune par commune** à partir de cette géographie électorale (affinité locale des 9 groupes, participation locale), en nombres entiers ; département, région et national sont des sommes exactes (propriétés testées).
- **P4-04** : jeu de démonstration commité (744 Ko) : aperçu national complet, communes de l'Ain, de la Corse et des cinq DROM ; sans import, une base électorale **fictive** étiquetée comme telle ; tous les tests de bout en bout tournent avec ce jeu, sans réseau.
- **P4-05** : écran Carte électorale (MapLibre GL 6, chargé à la demande, sans fond de carte externe) : zoom, déplacement, sélection, niveaux région / département / commune.
- **P4-06** : cinq encarts DROM indépendants ; bandeau sur PC, vignettes ouvrant l'encart en plein écran sur téléphone ; sélection d'une commune dans chaque encart testée.
- **P4-07** : recherche par nom (sans accents) ou code ; centrage, et ouverture de l'encart pour une commune d'outre-mer (« Mamoudzou », « 97411 », « Ajaccio », « 2A004 » testés).
- **P4-08** : fiche territoriale (population légale, inscrits, votants, blancs, nuls, exprimés, voix), choix des résultats (tour 1 ou 2 de la partie, présidentielle 2022 officielle si importée, géographie seule), couleurs « candidat en tête », « participation », « score d'un candidat », « écart entre deux candidats », badge de nature des données (officiel, simulé, fictif, estimation), liste « Hors carte ».
- **P4-09** : tableau équivalent filtrable, parcours au clavier, légende textuelle, **motifs** en option (hachures et croisillons doublant les couleurs), repli explicite sans WebGL ; audit axe-core WCAG 2.1 AA sans violation, bureau et mobile.
- **P4-10** : gestes tactiles (rotation désactivée), légende compacte, fiche sous la carte, encarts en plein écran ; aucun défilement horizontal.
- Format de sauvegarde 4 (résultats territoriaux) et migration 3 → 4 testée sur un état réel de la phase 3 ; jeu de règles 2.1.0 (répartition « candidat 2022 → groupes », hypothèse) ; API : `/api/geo/*`, résultats communaux recalculés à la demande (décision D10), résultats 2022.

Écarts et limites :
- **PMTiles non mesurées** : `tippecanoe` ne s'installe pas dans l'environnement (ni compilateur ni Docker) ; option à réévaluer en phase 8 si le niveau communal national doit s'afficher d'un seul tenant.
- Les métadonnées d'import (source, URL, date, licence, empreinte, version de l'importeur) sont dans le manifeste versionné et non dans une table `DataImport` (décision D9).
- **Résultats 2022 non commités** (licence non précisée, Q8) : sans `pnpm data:resultats`, la partie utilise la base fictive de démonstration (détaillée pour l'Ain, la Corse et les DROM seulement ; les autres départements forment chacun un bloc uniforme, et les territoires hors carte n'ont pas de détail).
- **Variation locale encore faible** avec la base réelle : le modèle reste national par groupe d'électeurs ; au second tour simulé, le même candidat arrive souvent en tête partout. Calibrage à reprendre ([R-12](./RISQUES.md), [R-24](./RISQUES.md)).
- La comparaison porte sur deux candidats d'un même jeu de résultats, pas encore sur deux tours ou deux scénarios côte à côte.
- Une partie créée avec la base de démonstration puis consultée après un import complet refuse explicitement le détail communal de ses anciens tours (`409 base_differente`) : agrégats départementaux et régionaux toujours affichés.
- Saint-Pierre-et-Miquelon (collectivité d'outre-mer) est volontairement hors carte, comme les autres COM et les Français de l'étranger.
- L'écran de carte pèse 289 Ko compressés (MapLibre compris), chargés seulement à son ouverture ; budget de performance à fixer en phase 8.

### Phase 5 — Campagne approfondie ✅

Programme (17 domaines du §6 : coût, délai, faisabilité, dépendances, effets, confiance) ; parrainages (promesses → intentions → reçus → validés, règle des 500 du *ruleset*) ; financement (recettes, dépenses, dons autorisés, emprunts, plafonds, compte de campagne) ; médias (portée, audience, crédibilité, priorités) et débats (préparation, maîtrise, cohérence, réponse) ; IA adverse complète avec graphe d'alliances (§7) ; niveaux de difficulté et mode observateur (§1.3).

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P5-01 | Jeu de règles 3.0.0 (programme, parrainages, financement, médias, débats, alliances, IA) ; format de sauvegarde 5 et migration 4 → 5. | schéma du jeu de règles validé ; migration testée sur un état réel de la phase 4. |
| P5-02 | Programme : 17 domaines, propositions avec coût, délai, faisabilité, dépendances, incompatibilités, effets et niveau de confiance ; ajout et retrait dans le plan de la semaine ; facteurs « Programme » et « Crédibilité » du score latent (§5.1). | proposition sans sa dépendance ou incompatible refusée ; revirement pénalisé ; facteurs présents dans la décomposition. |
| P5-03 | Parrainages : promesses → intentions → présentations reçues → validées, par département ; réservoir d'élus partagé entre candidats ; règle des 500 (30 départements, au plus un dixième par département) ; clôture du 12 mars 2027 ; candidat écarté sans parrainages suffisants. | présentations invalides exclues ; plafond par département respecté ; un candidat sous le seuil n'est pas au premier tour (propriétés). |
| P5-04 | Financement : compte de campagne (recettes par origine, dépenses), plafonds légaux, dons des personnes physiques plafonnés, personnes morales et espèces au-delà de 150 € refusées, emprunts, avance forfaitaire, remboursement prévisionnel. | dépassement de plafond détecté (dépense refusée ou signalée) ; dons interdits refusés et journalisés ; trésorerie = recettes − dépenses (propriété). |
| P5-05 | Médias : organes fictifs (portée, audience, crédibilité, priorités), couverture hebdomadaire de chaque candidat, interview ciblée ; facteur « Médias ». | couverture explicable par ses facteurs ; une interview accroît l'exposition dans l'organe choisi. |
| P5-06 | Débats : préparation (action dédiée), maîtrise, cohérence, réponse ; décomposition publiée ; effet au second tour. | une meilleure préparation améliore la prestation attendue ; composantes bornées. |
| P5-07 | Relations et alliances : graphe confiance / proximité / rivalité / historique (étape 4 active) ; ralliements avant le premier tour, proposés par le joueur ou décidés par l'IA ; facteur « Alliances ». | un candidat rallié ne figure pas au premier tour ; un ralliement n'est jamais imposé au joueur. |
| P5-08 | IA adverse complète : objectifs, analyse de la situation, stratégie motivée et mise à jour, actions ciblées (élus, médias, emprunts…) avec les mêmes règles que le joueur. | mode observateur : les adversaires agissent, collectent leurs parrainages et financent leur campagne sans le joueur. |
| P5-09 | Difficulté (§1.3) : capacités des adversaires et pression de gestion seulement. | propriété : la difficulté ne modifie jamais le décompte des voix ni les règles (parrainages, plafonds). |
| P5-10 | API : plan hebdomadaire étendu (cibles, programme, propositions d'alliance) validé par Zod. | tests d'intégration : campagne et parrainages jusqu'à la clôture. |
| P5-11 | Interface : écrans Programme et Finances, parrainages, médias, relations et alliances, stratégie des adversaires, débat ; bilan hebdomadaire enrichi. | tests de composants. |
| P5-12 | Tests de bout en bout et documentation. | Playwright bureau + mobile : programme, finances, parrainages, partie en observateur. |

**Tests clés** : dépassement de plafond détecté ; dons interdits refusés ; parrainages invalides exclus ; la difficulté ne modifie jamais le décompte des voix ; adversaires autonomes. **Critères visés** : 5.

**Bilan (21/10/2026)** — les douze tâches sont réalisées, avec les limites signalées ci-dessous.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` | 231 tests réussis : moteur 120 (30 nouveaux, dont 3 propriétés fast-check), interface 50, import de données 27, sauvegardes 19, jeu de règles 11, contrats 4 |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 70 tests réussis (5 nouveaux : programme avec refus motivé, actions ciblées et requête mal formée, proposition de ralliement hors fenêtre, actions refusées en observateur, liste des candidats arrêtée à la clôture avec sauvegarde préalable) |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 30 tests réussis, dont 4 nouveaux scénarios par appareil : programme et actions ciblées jusqu'au bilan et au compte, candidat écarté à la clôture, partie en observateur, audit axe-core des écrans Programme, Finances et Candidats |
| Tests clés de la phase | dépassement de plafond détecté (dépense refusée à la validation ; dépense imprévue signalée) ; dons interdits refusés et journalisés ; présentations invalides jamais comptées, au plus 50 par département ; difficulté sans effet sur le décompte des voix ni sur les règles (propriétés) ; adversaires autonomes en observateur (stratégie motivée, parrainages réunis, campagne financée) |
| Simulation de contrôle (12 parties complètes, observateur et joueur) | 6,6 ms par semaine simulée en moyenne ; un ralliement par partie en moyenne ; aucun candidat écarté quand chacun collecte ; **la même candidate gagne les 12 parties** (voir limites) |
| Contrôle visuel (bureau, mobile, thèmes clair et sombre) | tableau de bord, plan d'actions ciblées, Programme, Finances, Candidats (relations, médias) lisibles, sans défilement horizontal de la page |
| CI GitHub Actions (exécution n° 20, commit `40855f6`) | verte : lint, format, types, tests unitaires, intégration, bout en bout (bureau + mobile) et construction réussis en 5 min 40 s |

Réalisé :
- **P5-01** : jeu de règles `presidentielle-2027@3.0.0` (programme, parrainages, financement, médias, débats, alliances, IA ; valeurs officielles sourcées, le reste étiqueté hypothèse ou estimation — [SOURCES §8 ter](./SOURCES.md#8-ter-utilisation-dans-le-jeu-phase-5)) ; format de sauvegarde 5 et migration 4 → 5 testée sur un état réel de la phase 4 (semaine 29, entre les deux tours).
- **P5-02** : programme de 51 propositions dans les 17 domaines ; dépendances (une dépendance annoncée la même semaine suffit), incompatibilités, 15 propositions au plus, 3 h de préparation chacune ; revirement compté ; facteurs « Programme » et « Crédibilité » dans la décomposition du vote.
- **P5-03** : parrainages par département (promesses → intentions → reçues → validées, 1,5 % invalidées), réservoir d'élus partagé (un élu ne s'engage qu'une fois, propriété), règle des 500 / 30 départements / 50 comptées par département, clôture le 12 mars 2027 ; candidat sous le seuil écarté (joueur compris, la partie continue en spectateur) ; avance forfaitaire aux candidats retenus.
- **P5-04** : compte de campagne (`FinanceBook`) : recettes par origine et dépenses, trésorerie = recettes − dépenses (propriété) ; plafonds légaux des deux tours ; dons triés selon la loi (personnes morales, espèces au-delà de 150 €, part au-delà de 4 600 €) et refus journalisés ; emprunt bancaire accordé dans la limite du remboursement attendu ; remboursement forfaitaire prévisionnel après chaque tour.
- **P5-05** : six médias fictifs ; couverture hebdomadaire (exposition, tonalité) expliquée par la notoriété, les actions et la rencontre programme ⇄ priorités ; interview ciblée ; facteur « Médias ».
- **P5-06** : débat décomposé (préparation, maîtrise, cohérence, réponse) et publié ; action « Préparation des débats » ; la préparation améliore la prestation attendue (propriété).
- **P5-07** : relations (proximité, confiance, rivalité, historique) mises à jour à l'étape 4 ; ralliements dans les 10 semaines avant le premier tour, décidés par l'IA ou proposés par le joueur et acceptés ou refusés par le candidat sollicité ; facteur « Ralliement de X » ; le joueur n'est jamais rallié d'office.
- **P5-08** : IA à objectif (victoire, qualification, visibilité), priorité motivée chaque semaine, actions ciblées (département, média), emprunt seulement s'il peut être accordé, mêmes règles que le joueur.
- **P5-09** : difficulté limitée aux moyens des adversaires (budget, actions par semaine, température) et à la pression de gestion du joueur (ressources et promesses de départ).
- **P5-10** : `POST /advance` accepte les cibles, `programme: { ajouter, retirer }` et `alliances: { proposer }`, validés par Zod puis par le moteur (motif renvoyé en cas de refus) ; sauvegarde automatique « Avant la clôture des parrainages ».
- **P5-11** : écrans Programme et Finances ; tableau de bord (parrainages, compte, cibles, programme et ralliements prévus, plan conservé par semaine) ; Candidats (statuts, stratégies, relations, médias) ; débat dans Résultats ; bilan hebdomadaire enrichi.
- **P5-12** : scénarios Playwright bureau et mobile, audit axe-core, documentation (README, ARCHITECTURE, MODELE_DONNEES, SOURCES, RISQUES).

Écarts et limites :
- **Calibration** : la candidate fictive du centre (Boussole) gagne encore toutes les parties de contrôle ; les nouveaux facteurs ne compensent pas l'avantage structurel du centre ([R-12](./RISQUES.md)). Rééquilibrage et test de diversité des issues reportés à la phase 7.
- **Réservoir de parrainages** limité aux maires du COG 2026 (`estimation`) : autres élus habilités non comptés, collectivités d'outre-mer et Français de l'étranger sans présentations ([R-25](./RISQUES.md)).
- **Ouverture de l'envoi des présentations** au 22 février 2027 : `hypothese` (décret de convocation non publié).
- **Dons** : chaque offre est réputée venir d'une personne distincte ; le cumul de 4 600 € d'une même personne entre plusieurs candidats n'est pas suivi.
- **Emprunts** comptés en apport personnel (hypothèse) ; remboursement **prévisionnel** seulement : ni dépôt du compte (2 juillet 2027) ni contrôle de la CNCCFP.
- Les adversaires ne modifient pas leur programme (repris du jeu de règles) ; le joueur peut solliciter un ralliement mais ne peut pas se rallier lui-même ; seule la forme « ralliement avant le premier tour » est modélisée (les consignes d'entre-deux-tours restent celles de la phase 3).
- Une partie migrée depuis le format 4 garde des parrainages « non modélisés » (personne n'y est écarté) et un compte « partiel » (budget courant repris comme apport).
- Sources non relues pendant la phase (Légifrance refusé, CNCCFP et Conseil constitutionnel injoignables depuis l'environnement le 21/10/2026) : les valeurs reprises sont celles vérifiées en phases 0 et 4, sans ajout.

### Phase 5 bis — Personnalités politiques réelles ✅

Décision Q2 du 21/10/2026 (ci-dessous, [§5](#5-questions-ouvertes)) : les personnalités réelles sont **jouables** (mode « candidat réel ») **et adversaires** (scénario « adversaires réels », le scénario fictif restant disponible) ; ne sont proposées que les personnes ayant **déclaré publiquement leur candidature** à la présidentielle de 2027, avec la date et la source de la déclaration ; **photos sous licence libre** (Wikimedia Commons) avec auteur, licence et lien affichés ; position sur les deux axes du jeu = position du **parti** dans le Chapel Hill Expert Survey (vague la plus récente), convertie selon une méthode documentée et étiquetée `estimation`.

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P5b-01 | Importeur `pnpm data:personnalites` : pour chaque candidature déclarée, faits publics sourcés et datés (nom, parti, mandat en cours, date et source de la déclaration), photo et métadonnées de licence (auteur, licence, lien), position du parti (CHES) ; manifeste avec URL, date de consultation et empreinte SHA-256. Fichier versionné dans `packages/rulesets`, photos redimensionnées et commitées avec leur crédit. | l'import échoue si un champ n'a pas de source, si une photo n'a pas de licence libre reconnue ou pas d'auteur, ou si un parti n'a pas de position (alors étiquetée `hypothese` explicitement). |
| P5b-02 | Jeu de règles 4.0.0 : profils réels (statut de candidature, date de vérification), conversion CHES → axes du jeu, moyens de départ par personnalité (`hypothese`), scénarios « adversaires fictifs » / « adversaires réels ». | schéma : toute personnalité réelle a ses sources et sa date de vérification ; aucun champ de citation ; conversion testée. |
| P5b-03 | Format de sauvegarde 6 (nature `reel` du candidat, références de sources, crédit photo) et migration 5 → 6. | migration testée sur un état réel de la phase 5. |
| P5b-04 | Création de partie : choix d'une personnalité réelle (fiche sourcée) ou d'un candidat personnalisé, choix du scénario d'adversaires ; API validée par Zod. | intégration : personnalité inconnue refusée ; scénario réel ⇒ adversaires = candidatures déclarées (hors le joueur), aucun adversaire inventé. |
| P5b-05 | Interface : fiche de chaque personnalité (sources, date de vérification, statut de candidature), photo avec crédit, avertissement « simulation », badge « comportement simulé » sur tout fait simulé concernant une personne réelle (actions, stratégie, ralliement, sondage, résultat). | tests de composants ; Playwright bureau + mobile ; axe-core sans violation. |
| P5b-06 | Documentation : SOURCES (fiches, licences, méthode CHES), RISQUES (R-06), README. | — |

**Règles** : aucun propos ni aucune citation attribués à une personne réelle ; aucune information personnelle hors faits publics liés au mandat et à la candidature ; tout comportement d'une personnalité dans la partie est une **simulation**, présentée comme telle ; une modification de la liste (nouvelle déclaration, retrait) donne une nouvelle version du jeu de règles. Relecture juridique recommandée avant toute mise en ligne publique ([R-06](./RISQUES.md)).

**Prérequis** : accès réseau aux sources, ouvert par l'utilisateur le 21/10/2026 (`www.wikidata.org`, `query.wikidata.org`, `fr.wikipedia.org`, `commons.wikimedia.org`, `upload.wikimedia.org`, `www.chesdata.eu` ; fichiers CHES servis par GitHub). L'API MediaWiki (`/w/api.php`) répond « trop de requêtes » depuis l'environnement : l'importeur lit le wikicode (`action=raw`) et les pages HTML des fichiers ; les vignettes de `thumb.wikimedia.org` (non autorisé) sont remplacées par les originaux réduits localement.

Décision complémentaire de l'utilisateur (21/10/2026) : candidatures dont aucun parti n'est noté par CHES non intégrées, **sauf Nathalie Arthaud, François Asselineau, David Lisnard et François Ruffin** (position « hypothèse » à rattachement documenté).

**Bilan (21/10/2026)** — les six tâches sont réalisées.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` | 256 tests réussis : moteur 125, import de données 39 (12 nouveaux), interface 52, sauvegardes 20, jeu de règles 16 (5 nouveaux), contrats 4 |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 76 tests réussis (création en mode candidat réel, adversaires réels, observateur, fiches servies avec le jeu de règles, requêtes invalides refusées) |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 32 tests réussis, dont le nouveau scénario « incarner une personnalité réelle face aux adversaires réels » (photos décodées, rappels de simulation, audit axe-core de la création et de l'écran Candidats) |
| `pnpm data:personnalites` (révision 240556510 de l'article) | 30 candidatures déclarées lues ; 17 fiches retenues (16 photos sous licence libre : CC0, CC BY, CC BY-SA ; 1 refusée : licence « European Parliament ») ; 13 candidatures listées comme non intégrées ; chaque fait cité vérifié mot pour mot dans la source |
| Contrôle visuel (bureau, mobile, thème sombre) | choix de la personnalité, fiches, crédits, sources et méthode lisibles ; carte des positions lisible avec 17 candidats (étiquette du joueur seule, tableau des positions) ; aucun défilement horizontal |
| CI GitHub Actions (exécution n° 24, commit `93ed848`) | verte : lint, format, types, tests unitaires, intégration, bout en bout (bureau + mobile) et construction réussis en 6 min 13 s |

Réalisé :
- **P5b-01** : importeur `pnpm data:personnalites` (`packages/data-import/src/personnalites`) : lecture du tableau des candidatures déclarées (révision figée, références nommées résolues), dates françaises sous toutes leurs formes, faits cités vérifiés, Wikidata (identifiants, partis P102 avec dates), licences et auteurs lus sur Commons, photos réduites à 240 pixels en WebP **sans métadonnées** (une photo d'origine contenait des coordonnées GPS), positions CHES (vague 2024 et fichier de tendance), communes et régions vérifiées dans le COG 2026, manifeste des sources avec empreintes. Garde-fous : l'import échoue si une personne n'est plus dans le tableau, si un fait cité est introuvable, si une référence de candidature porte sur une procédure judiciaire, ou si une nouvelle candidature d'un parti noté par CHES n'est pas prévue par la sélection.
- **P5b-02** : jeu de règles `presidentielle-2027@4.0.0` : fiches jointes (`personnalites-2027.json`, empreinte vérifiée par les tests : une réimportation impose une nouvelle version), paramètres de jeu des moyens de départ (hypothèses : notoriété par niveau, organisation par niveau, popularité identique, style et goût du risque identiques, aucun programme prêté).
- **P5b-03** : format de sauvegarde 6 (`nature: 'reel'`, `personnaliteId`, `player.adversaires`) et migration 5 → 6, testée sur un état réel produit par le moteur de la phase 5 (semaine 29, entre les deux tours, un ralliement), puis menée au second tour.
- **P5b-04** : création de partie en mode « candidat réel » et choix des adversaires (fictifs ou réels, y compris pour un candidat personnalisé ou un observateur) ; API validée par Zod ; personnalité inconnue refusée (422) ; adversaires réels = toutes les fiches retenues sauf la personnalité incarnée, aucun adversaire inventé. Moteur : facteurs « Programme » et « Crédibilité » neutres pour une personnalité réelle adverse.
- **P5b-05** : interface : choix illustré de la personnalité (fiche, candidature datée et sa source, position et sa méthode, crédits des photos, candidatures non intégrées) ; écran Candidats (badge « Personnalité réelle — simulée », photo, fiche sourcée, section « sources et méthode ») ; programme des personnalités réelles adverses non simulé ; rappel de simulation sur tous les écrans d'une partie concernée.
- **P5b-06** : documentation (SOURCES §8 quater, RISQUES, README, ARCHITECTURE, MODELE_DONNEES).

Écarts et limites :
- **Positions par parti, non individuelles** : deux candidats d'un même parti (Gabriel Attal et Olivier Becht ; Xavier Bertrand, Bruno Retailleau et David Lisnard) ont la même position ; quatre positions sont des **hypothèses** (Nathalie Arthaud et François Asselineau : moyenne de la famille CHES de leur parti de référence ; François Ruffin : PCF, seul parti noté que Wikidata lui associe, sans dates ; David Lisnard : LR, quitté le 31/03/2026).
- **Moyens de départ** : niveaux tirés de faits sourcés, mais leur conversion en budget, militants et notoriété reste une hypothèse de jeu ; popularité de départ identique pour tous (aucun sondage réel utilisé).
- **Liste figée** à la révision importée : une nouvelle déclaration ou un retrait exige une réimportation et une nouvelle version du jeu de règles ; les candidatures officielles ne seront connues qu'à la publication de la liste par le Conseil constitutionnel (mars 2027).
- **Source de candidature de François Asselineau** : les références de la phrase portent sur une procédure judiciaire ou sur une autre personnalité ; l'article lui-même sert de source (motif consigné dans la sélection).
- **Licence de l'enquête CHES non précisée** (usage avec citation demandé) : seules quelques positions converties sont reprises, avec la citation ; à confirmer avant une mise en ligne publique.
- **Calibration** : avec les adversaires réels, l'issue dépend surtout des positions et des moyens de départ hypothétiques ; aucune comparaison aux sondages réels n'est faite (volontairement). Relecture juridique recommandée avant toute mise en ligne publique ([R-06](./RISQUES.md)).

### Phase 5 ter — Médias réels, émissions et journalistes politiques ✅

Décision de l'utilisateur du 21/10/2026 : après validation de la phase 5 bis, ajouter les **médias réels** (presse, télévision, radio : BFMTV, CNews, TF1…), les **émissions politiques** et leurs **journalistes**, avant la phase 6. Choix retenus :
- comportement des chaînes de télévision et de radio fondé sur les **temps de parole mesurés par l'Arcom** pour chaque parti et chaque chaîne (exposition) ; la **presse écrite** traite tous les candidats de la même façon ; aucune ligne éditoriale fixée par le jeu ;
- **émissions politiques réelles** avec leur chaîne et leur présentateur (faits sourcés et datés) ; l'interview est **simulée** : aucune question ni aucun propos inventés ne sont attribués aux journalistes ;
- **logos** seulement sous licence libre (ou domaine public), crédités ; sinon le nom en texte.

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P5t-01 | Importeur `pnpm data:medias` : chaînes de télévision et de radio suivies par l'Arcom et leurs temps de parole par parti sur une période de référence, audiences (Médiamétrie), diffusion de la presse (ACPM), émissions politiques et présentateurs (Wikipédia, révision figée), logos sous licence libre (Commons) ; manifeste des sources avec empreintes. | l'import échoue si un média n'a pas de source d'audience, si une émission n'a ni chaîne ni présentateur sourcés, si un logo n'a pas de licence libre et d'auteur, ou si les temps de parole d'une chaîne ne totalisent pas 100 %. |
| P5t-02 | Jeu de règles 5.0.0 : organes réels (nature, audience sourcée), propension d'exposition par parti d'après l'Arcom (estimation), émissions ; les organes fictifs disparaissent ; format de sauvegarde 7 et migration 6 → 7. | migration testée sur un état réel de la phase 5 bis ; un candidat sans parti mesuré par l'Arcom reçoit l'exposition moyenne (hypothèse documentée). |
| P5t-03 | Moteur : couverture hebdomadaire par organe réel ; action « interview dans une émission politique » ciblant une émission (joueur et IA, mêmes règles) ; la tonalité ne dépend que des facteurs du jeu, jamais d'une orientation prêtée au média. | une interview accroît l'exposition dans la chaîne de l'émission ; la presse écrite traite tous les candidats à l'identique (propriété). |
| P5t-04 | Interface : écran des médias (organes, audiences, temps de parole sourcés, émissions et présentateurs, logos crédités), plan d'actions et bilans. | tests de composants ; Playwright bureau + mobile ; axe-core. |
| P5t-05 | Documentation (SOURCES, RISQUES, README, ARCHITECTURE, MODELE_DONNEES). | — |

**Règles** : faits publics seulement (nom de l'émission, chaîne, présentateur, jour de diffusion) ; aucune question, réplique ou appréciation attribuée à un journaliste ou à un média ; toute couverture d'un candidat par un média réel est **simulée** et présentée comme telle.

**Prérequis** : accès réseau à `www.arcom.fr`, `www.mediametrie.fr` et `www.acpm.fr`, ouvert par l'utilisateur le 21/10/2026 (Wikipédia et Commons déjà ouverts). L'API REST de Wikipédia limite le débit (`retry-after`) : l'importeur respecte ce délai et garde les réponses du jour dans `data/raw/medias/`.

**Bilan (21/10/2026)** — les cinq tâches sont réalisées.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` | 303 tests réussis : moteur 131 (6 nouveaux, dont la propriété « presse écrite identique quel que soit le parti »), import de données 62 (23 nouveaux), interface 58 (6 nouveaux), sauvegardes 21 (migration 6 → 7), jeu de règles 23 (7 nouveaux), contrats 4, Worker Cloudflare 4 |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 76 tests réussis (interview dans un média réel et dans une émission politique, cibles enregistrées) |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 32 tests réussis, dont la campagne avec interview à France Inter et passage au *Grand Jury* (bilan, écran Médias, logo décodé, couverture simulée) et l'audit axe-core de l'écran Médias |
| `pnpm data:medias` | 12 relevés mensuels de l'Arcom (août 2025 à juillet 2026, contrôles de totaux et de parts : 0 écart), Médiamat de septembre 2026, EAR d'avril-juin 2026, OneNext 2026 S1 ; 26 organes retenus, 10 lignes écartées avec leur motif ; 7 émissions retenues, 2 écartées (arrêtée, remplacée) ; 18 logos sous licence libre (CC0, domaine public, CC BY-SA 4.0), 8 organes sans logo (fichier hors de Commons ou absent de l'infobox) ; 14 personnalités rattachées à un parti suivi, 3 à l'exposition moyenne |
| Construction et déploiement simulé | `pnpm build` réussi ; `wrangler deploy --dry-run` : 44 fichiers d'interface, logos compris |

Réalisé :
- **P5t-01** : importeur `pnpm data:medias` (`packages/data-import/src/medias`) : lecture des CSV mensuels de l'Arcom (réglages de la page, douze derniers mois consécutifs), lecteur de classeurs Excel sans dépendance (archive ZIP, chaînes partagées), Médiamat mensuel et EAR National (population et période vérifiées dans le fichier), classements OneNext de l'ACPM, infobox des articles Wikipédia (API REST, révision consultée), logos et licences sur Commons (redirections de fichier suivies, SVG contrôlés). Chaque critère d'acceptation fait échouer l'import ; un service ou un titre mesuré sans décision de sélection aussi.
- **P5t-02** : jeu de règles `presidentielle-2027@5.0.0` : médias réels joints (`medias-2027.json`, empreinte vérifiée), organes fictifs supprimés, paramètres de jeu (poids des types, crédibilité uniforme, bornes de la propension, report sur les autres diffuseurs), action « Invité d'une émission politique » (cible `emission`). Format de sauvegarde 7 (`medias.interviews`) et migration 6 → 7, testée sur un état réel produit par le moteur de la phase 5 bis (semaine 10, couverture par les organes fictifs), poursuivi avec une interview réelle.
- **P5t-03** : moteur : couverture hebdomadaire par organe réel, propension d'exposition par parti à la télévision et à la radio, presse identique pour tous (propriété testée), tonalité tirée des seuls facteurs du jeu (facteur programme neutre pour une personnalité réelle adverse), interviews dans les émissions pour le joueur et l'IA (mêmes règles, choix selon l'audience touchée).
- **P5t-04** : écran **Médias** (émissions et interviews simulées de la semaine, organes par type, mesures sourcées, temps de parole et exposition mesurée des partis, couverture, sources et méthode, exclusions, crédits des logos) ; plan d'actions avec médias groupés par type et émissions ; tests de composants, Playwright bureau + mobile, axe-core.
- **P5t-05** : documentation (SOURCES §8 quinquies, RISQUES R-06 et R-29 à R-31, README, ARCHITECTURE, MODELE_DONNEES, CLAUDE.md).

Écarts et limites :
- **Émissions limitées à celles dont l'article Wikipédia existe** et indique chaîne et présentateurs : aucune émission de BFMTV, LCI, France Inter, France Info ni RMC n'est retenue (articles introuvables sous les titres essayés) ; *Vie politique* (TF1) est dite « en production » par sa source sans date de dernière diffusion.
- **Mesures d'audience hétérogènes** (part du temps d'écoute pour la télévision et la radio, lectorat pour la presse) : leur combinaison dans le jeu repose sur des poids de type qui sont des hypothèses.
- **Exposition par parti** mesurée sur douze mois passés (hors période électorale) : elle ne prédit pas la couverture de la campagne 2027 ; trois personnalités (Lutte ouvrière, UPR, Nouvelle Énergie) et tous les candidats fictifs reçoivent l'exposition moyenne.
- **Licences** des relevés de l'Arcom, de Médiamétrie et de l'ACPM non précisées : quelques chiffres agrégés seulement, avec citation ; à confirmer avant une mise en ligne publique ([R-30](./RISQUES.md)).
- **Cloudflare Workers** (relié au dépôt par l'utilisateur) : seule l'interface y est publiée ; l'API et PostgreSQL restent à héberger (Q6).

### Phase 6 — Quinquennat jouable (en cours)

Gouvernement et Premier ministre, feuille de route ; législatives (moteur distinct, 577 circonscriptions) ; Assemblée nationale (groupes, sièges, coalitions, discipline, amendements, procédures) ; économie ; crises ; bilan de fin de mandat et poursuite.

**Tests clés** : réforme rejetée jamais appliquée ; effets différés des réformes ; fin de quinquennat ⇒ nouvelle présidentielle. **Critères visés** : 10 (la victoire ouvre la phase gouvernementale), 11 (les votes parlementaires et réformes ont des conséquences), 17 (la partie continue après le quinquennat).

Décisions de l'utilisateur du 21/10/2026 :
- **défaite du joueur** : le vainqueur gouverne (IA, mêmes règles que le joueur) ; le joueur suit le quinquennat simulé et peut se représenter à la présidentielle de 2032 ;
- **Assemblée de départ** : composition réelle en vigueur (groupes et sièges importés de `data.assemblee-nationale.fr`, sans nom de député) ; le président peut **dissoudre** (législatives anticipées sur les 577 circonscriptions), sinon législatives à la fin de la législature ;
- **gouvernement** : Premier ministre et ministres choisis parmi des profils fictifs **ou** parmi les personnalités réelles de la partie (comportement simulé et étiqueté comme tel, aucun propos attribué) ;
- **économie** : modèle simple sourcé (valeurs de départ INSEE / Banque de France, évolution par un modèle de jeu étiqueté hypothèse).

Découpage (une sous-étape = un commit vérifié ; compte rendu à la fin de la phase) :

| ID | Tâche | Test d'acceptation |
|---|---|---|
| P6-01 | **Calendrier institutionnel** (jeu de règles 6.0.0) : investiture et fin du mandat (Constitution, art. 6 et 7 ; mandat 2022 « à compter du 14 mai 2022 à 0 heure »), fenêtre de la présidentielle 2032, fin de la législature élue en 2024, règles de la dissolution (art. 12), postes du gouvernement, profils fictifs, paramètres de jeu étiquetés. Chaque date est `deduit` (règle citée) ou `hypothese`. | dates 2032 dans la fenêtre constitutionnelle (dimanches) ; aucune date sans source ni statut. |
| P6-02 | **Format de sauvegarde 8** : présidence (président, mandat), gouvernement (Premier ministre, ministres réels ou fictifs, feuille de route), parlement, économie, crises, phase `quinquennat` ; migration 7 → 8 (une partie terminée au second tour reprend au début du quinquennat). | migration testée sur un état réel de la phase 5 ter terminé au second tour ; reprise et rejeu déterministes. |
| P6-03 | **Investiture et gouvernement** (government-engine) : passation, choix du Premier ministre (décision du joueur ou règle de l'IA), composition proposée puis remaniements ; une personnalité réelle peut refuser (simulé, d'après sa proximité) ; feuille de route tirée du programme ; président IA en cas de défaite ; quinquennat semaine par semaine avec **avance rapide** arrêtée avant toute décision obligatoire. | la victoire ouvre la phase gouvernementale (critère 10) ; défaite ⇒ président IA ; même graine ⇒ même gouvernement. |
| P6-04 | **Assemblée nationale** (import, parliament-engine) : groupes et sièges réels, position de chaque groupe (CHES du parti de référence, ou hypothèse documentée), majorité, opposition et soutiens ; textes issus de la feuille de route : dépôt, examen, amendements négociés (concessions qui réduisent l'effet), vote par groupe avec discipline, procédure de l'article 49 alinéa 3 et motion de censure (majorité absolue), Sénat simplifié (navette, dernier mot à l'Assemblée). | **réforme rejetée jamais appliquée** (propriété) ; texte adopté ⇒ effets **différés** selon le délai de la proposition ; censure adoptée ⇒ démission du gouvernement ; totaux de votes ≤ sièges. |
| P6-05 | **Économie** (economy-engine) : croissance, inflation, chômage, dette, déficit, pouvoir d'achat, confiance des ménages (valeurs de départ sourcées), tensions sociales (indicateur de jeu) ; effets des réformes, des crises et de la conjoncture (hypothèses) ; facteurs explicatifs affichés. | indicateurs bornés ; décomposition = somme des facteurs ; déterminisme. |
| P6-06 | **Crises** (event-engine) : bibliothèque de crises fictives étiquetées (conditions, probabilité, choix, effets immédiats et différés), décision obligatoire avant de continuer. | une crise exige une décision ; ses effets passent par le registre. |
| P6-07 | **Législatives** (moteur distinct) : import des résultats de 2024 par circonscription (Licence Ouverte 2.0, §3.3 des sources), rattachement des nuances aux familles ; dissolution (élections 20 à 40 jours plus tard, pas de nouvelle dissolution dans l'année) et législatives de fin de législature ; deux tours (seuil de 12,5 % des inscrits, deux premiers qualifiés), répartition des sièges, recomposition de l'Assemblée ; cohabitation possible. | 577 sièges attribués exactement ; résultat de chaque circonscription cohérent (voix ≤ exprimés ≤ votants ≤ inscrits) ; dissolution impossible moins d'un an après les précédentes législatives. |
| P6-08 | **Fin de mandat et poursuite** : bilan du quinquennat (indicateurs, réformes, popularité), campagne et présidentielle 2032 avec le même moteur (le président sortant peut se représenter une fois : art. 6), la partie continue. | fin de quinquennat ⇒ nouvelle présidentielle (critère 17) ; parrainages et comptes remis à zéro. |
| P6-09 | **Interface** : écrans Gouvernement, Parlement (hémicycle, textes, votes par groupe), Économie, Crises, Législatives (résultats par circonscription) ; bilans hebdomadaires du quinquennat ; avance rapide. | tests de composants ; Playwright bureau + mobile (de l'investiture à un vote, puis à la présidentielle suivante) ; axe-core. |
| P6-10 | Documentation (SOURCES, RISQUES, README, ARCHITECTURE, MODELE_DONNEES). | — |

**Règles** : aucune personne réelle n'est nommée à un poste sans l'étiquette « simulé » ; aucun propos ni vote individuel attribué à un député réel (les votes sont ceux des groupes, simulés) ; les indicateurs économiques de départ sont sourcés et datés, leur évolution est une simulation ; les crises sont fictives et étiquetées.

**Prérequis** : `data.assemblee-nationale.fr`, `www.insee.fr` et `www.banque-france.fr` joignables le 21/10/2026 ; `www.data.gouv.fr` joignable par intermittence ; `www.legifrance.gouv.fr` refusé (403) : les articles de la Constitution et du code électoral sont cités d'après leur texte connu et marqués « à vérifier sur Légifrance » tant qu'ils n'y ont pas été relus.

### Phase 7 — Contenu approfondi

Scénarios de départ, bibliothèque d'événements et de crises, conséquences à long terme. Chaque événement fictif est étiqueté.

### Phase 8 — Version publiable

Durcissement sécurité (§14), mesure de performance et fixation des seuils (§15), documentation complète, image Docker, CI de déploiement, sauvegardes automatiques et **test de restauration**, test complet PC et téléphone. **Critères visés** : 1, 13, 14, 15.

**Application Android (APK)** — demandée par l'utilisateur le 21/10/2026 pour la fin du projet : empaquetage de l'interface (enveloppe native, par exemple Capacitor) et signature de l'APK. Le jeu s'appuyant sur un serveur (API et PostgreSQL), l'APK devra soit se connecter à un serveur hébergé (question Q6), soit embarquer un mode hors ligne (moteur et sauvegardes sur l'appareil : changement d'architecture, décision D3 à revoir) — question Q9.

---

## 5. Questions ouvertes

| # | Question | Recommandation par défaut | Bloque |
|---|---|---|---|
| Q1 | Dates officielles des tours de 2027 | **Fait en phase 2** : 18 avril et 2 mai 2027 dans le jeu de règles avec le statut `annonce` ; à passer en `officiel` (nouvelle version du jeu de règles) à la publication du décret ([SOURCES §4](./SOURCES.md#4-calendrier-de-la-présidentielle-2027)). | — |
| Q2 | Personnalités réelles proposées et politique d'affichage (photos, statut) | **Décidé par l'utilisateur le 21/10/2026** : personnalités réelles jouables et adversaires ; seules les candidatures **déclarées** publiquement (date et source de la déclaration) ; photos sous **licence libre** avec auteur et licence affichés ; positionnement d'après la position du parti dans le **Chapel Hill Expert Survey**, étiqueté `estimation`. **Fait en phase 5 bis** (17 personnalités, dont 4 ajoutées à la demande de l'utilisateur avec une position « hypothèse »). | — |
| Q3 | Millésime géographique et source des contours | **Fait en phase 4** : COG 2026 (34 875 communes) et IGN ADMIN EXPRESS COG CARTO 2026, Licence Ouverte 2.0 (décision D8 appliquée). | — |
| Q4 | Périmètre du scrutin | Périmètre officiel complet ; COM et Français de l'étranger dans une liste « Hors carte ». **Fait en phase 4** : périmètre officiel complet ; COM (dont Saint-Pierre-et-Miquelon) et Français de l'étranger dans la liste « Hors carte », comptés dans le total national. | — |
| Q5 | Comptes utilisateurs | Session anonyme par cookie en phase 1 ; comptes plus tard si mise en ligne publique. | phase 1 (non bloquant) |
| Q6 | Hébergeur | Choix avant la phase 8. **21/10/2026** : dépôt relié par l'utilisateur à Cloudflare Workers Builds (Worker `republique-2027`) ; seule l'interface y est publiée (`wrangler.jsonc`), l'API et PostgreSQL restent à héberger (les requêtes `/api/*` y reçoivent une erreur 503 explicite). | phase 8 (API) |
| Q7 | Accès réseau aux domaines publics dans l'environnement cloud | **Phase 4** : `www.data.gouv.fr` et `static.data.gouv.fr` autorisés le temps de l'import (fichiers conservés dans `data/raw/`) ; `static.data.gouv.fr` à nouveau coupé le 21/10 ; les imports peuvent aussi s'exécuter en local. **Phase 5** : aucun accès nécessaire. Constat du 21/10 en fin de phase : `www.data.gouv.fr` et `www.insee.fr` joignables ; `www.legifrance.gouv.fr` refusé (403) ; `data.assemblee-nationale.fr`, `www.conseil-constitutionnel.fr`, `cnccfp.fr`, `www.elections.interieur.gouv.fr` et `www.banque-france.fr` injoignables. | réimport depuis le cloud ; données de la phase 6 |
| Q8 | Réutilisation des résultats 2022 (licence non précisée sur data.gouv.fr) | Clarifier avant de commiter des données dérivées ; à défaut, démo synthétique `fictif`. **Phase 4 : défaut appliqué** (import local, jamais commité ; démonstration fictive). | mise en ligne de données dérivées |
| Q9 | APK Android : enveloppe connectée à un serveur hébergé, ou mode hors ligne sur l'appareil | Enveloppe connectée à un serveur (architecture inchangée), décidée avec l'hébergeur (Q6) ; le mode hors ligne exigerait de faire tourner le moteur et les sauvegardes dans l'application. | phase 8 |

## 6. Prochaine étape

Phase 5 ter terminée et fusionnée dans `main` le 21/10/2026 (PR #1). En cours : **phase 6 — quinquennat jouable** (gouvernement et Premier ministre, législatives sur 577 circonscriptions, Assemblée nationale, économie, crises, bilan de fin de mandat et nouvelle présidentielle), qui exigera `data.assemblee-nationale.fr` et `www.banque-france.fr` (injoignables au 21/10/2026) ; `www.data.gouv.fr` et `www.insee.fr` sont joignables. La question Q8 (licence des résultats 2022) reste ouverte.
