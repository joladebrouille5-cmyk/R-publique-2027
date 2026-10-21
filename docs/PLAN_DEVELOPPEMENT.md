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
| CI GitHub Actions | à compléter après le push |

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

### Phase 5 — Campagne approfondie

Programme (17 domaines du §6 : coût, délai, faisabilité, dépendances, effets, confiance) ; parrainages (promesses → intentions → reçus → validés, règle des 500 du *ruleset*) ; financement (recettes, dépenses, dons autorisés, emprunts, plafonds, compte de campagne) ; médias (portée, audience, crédibilité, priorités) et débats (préparation, maîtrise, cohérence, réponse) ; IA adverse complète avec graphe d'alliances (§7) ; niveaux de difficulté et mode observateur (§1.3).

**Tests clés** : dépassement de plafond détecté ; dons interdits refusés ; parrainages invalides exclus ; la difficulté ne modifie jamais le décompte des voix ; adversaires autonomes. **Critères visés** : 5.

### Phase 6 — Quinquennat jouable

Gouvernement et Premier ministre, feuille de route ; législatives (moteur distinct, 577 circonscriptions) ; Assemblée nationale (groupes, sièges, coalitions, discipline, amendements, procédures) ; économie ; crises ; bilan de fin de mandat et poursuite.

**Tests clés** : réforme rejetée jamais appliquée ; effets différés des réformes ; fin de quinquennat ⇒ nouvelle présidentielle. **Critères visés** : 10, 11, 17.

### Phase 7 — Contenu approfondi

Scénarios de départ, bibliothèque d'événements et de crises, conséquences à long terme. Chaque événement fictif est étiqueté.

### Phase 8 — Version publiable

Durcissement sécurité (§14), mesure de performance et fixation des seuils (§15), documentation complète, image Docker, CI de déploiement, sauvegardes automatiques et **test de restauration**, test complet PC et téléphone. **Critères visés** : 1, 13, 14, 15.

---

## 5. Questions ouvertes

| # | Question | Recommandation par défaut | Bloque |
|---|---|---|---|
| Q1 | Dates officielles des tours de 2027 | **Fait en phase 2** : 18 avril et 2 mai 2027 dans le jeu de règles avec le statut `annonce` ; à passer en `officiel` (nouvelle version du jeu de règles) à la publication du décret ([SOURCES §4](./SOURCES.md#4-calendrier-de-la-présidentielle-2027)). | — |
| Q2 | Personnalités réelles proposées et politique d'affichage (photos, statut) | Commencer par le mode personnalisé ; profils réels ajoutés un par un, sourcés, sans photo. **Phase 3 : défaut appliqué** (candidat personnalisé + adversaires fictifs) ; le mode « candidat réel » reste refusé tant que la liste et la politique ne sont pas validées. | mode « candidat réel » |
| Q3 | Millésime géographique et source des contours | **Fait en phase 4** : COG 2026 (34 875 communes) et IGN ADMIN EXPRESS COG CARTO 2026, Licence Ouverte 2.0 (décision D8 appliquée). | — |
| Q4 | Périmètre du scrutin | Périmètre officiel complet ; COM et Français de l'étranger dans une liste « Hors carte ». **Fait en phase 4** : périmètre officiel complet ; COM (dont Saint-Pierre-et-Miquelon) et Français de l'étranger dans la liste « Hors carte », comptés dans le total national. | — |
| Q5 | Comptes utilisateurs | Session anonyme par cookie en phase 1 ; comptes plus tard si mise en ligne publique. | phase 1 (non bloquant) |
| Q6 | Hébergeur | Choix avant la phase 8. | phase 8 |
| Q7 | Accès réseau aux domaines publics dans l'environnement cloud | **Phase 4** : `www.data.gouv.fr` et `static.data.gouv.fr` autorisés le temps de l'import (fichiers conservés dans `data/raw/`) ; `static.data.gouv.fr` à nouveau coupé le 21/10 ; les imports peuvent aussi s'exécuter en local. | réimport depuis le cloud |
| Q8 | Réutilisation des résultats 2022 (licence non précisée sur data.gouv.fr) | Clarifier avant de commiter des données dérivées ; à défaut, démo synthétique `fictif`. **Phase 4 : défaut appliqué** (import local, jamais commité ; démonstration fictive). | mise en ligne de données dérivées |

## 6. Prochaine étape

**Phase 5 — campagne approfondie** (programme, parrainages, financement, médias et débats, IA adverse avec alliances, difficulté et mode observateur), après validation de la phase 4. Elle exigera de sourcer les règles de parrainage et de financement (Légifrance et CNCCFP, refusés par le proxy de l'environnement cloud au 21/10/2026 : [SOURCES §9](./SOURCES.md#9-points-restant-non-vérifiés), point 1) ; les questions Q2 (personnalités réelles) et Q8 (licence des résultats 2022) restent ouvertes.
