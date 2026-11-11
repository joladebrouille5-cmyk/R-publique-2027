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

### Phase 6 — Quinquennat jouable (terminée)

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

**Avancement** :
- **P6-01, P6-02, P6-03 faites** (21/10/2026) — jeu de règles `presidentielle-2027@6.0.0` : mandat (art. 6, cité d'après Wikipédia, Légifrance refusant l'accès), investiture le 14 mai 2027 et fin le 13 mai 2032 (déduites), cycles 2032 et 2037 (calendrier de 2027 décalé de 261 et 522 semaines, premiers tours dans la fenêtre de l'art. 7 : hypothèses), 10 postes, 14 profils fictifs, acceptation (proximité ≥ 60 : acceptation ; en deçà, 25 % de chances d'accepter Matignon ; au plus 3 candidats de la partie parmi les ministres ; refus mémorisé 26 semaines), usure du pouvoir (0,08 point de popularité par semaine), 4 actions du président (allocution, déplacement, sommet, remaniement) : hypothèses. Format de sauvegarde 8 (présidence et gouvernement ; le Parlement, l'économie et les crises viendront avec leurs étapes, dans les formats suivants) et migration 7 → 8 testée sur une partie réelle gagnée. Moteur 0.7.0 : le second tour ouvre le quinquennat (joueur ou IA) ; nomination du Premier ministre la semaine de l'investiture ; règle du président IA (déterministe hors tirage du département) : allié le plus proche à Matignon s'il en a un, sinon le meilleur profil fictif ; un déplacement par semaine, une action nationale toutes les quatre semaines, remaniement si sa popularité passe sous 25 % avec un gouvernement d'au moins un an. API : avance rapide (au plus 52 semaines, sans action), arrêtée avant toute décision, scrutin, changement de phase, événement majeur ou blocage. Interface : panneau du quinquennat, agenda du président, avance rapide, écran Gouvernement. La fin du quinquennat (campagne de 2032, lundi 29 septembre 2031 pour une partie commencée le 28 septembre 2026) bloque la partie avec un message explicite jusqu'à l'étape P6-08.
- **P6-04 faite** (21/10/2026) — `pnpm data:assemblee` : 12 groupes, 574 députés en exercice, 3 sièges vacants (aucun nom conservé), positions CHES 2024 ou hypothèses motivées. Jeu de règles `presidentielle-2027@7.0.0` : règles des articles 28, 45 et 49 (citées d'après Wikipédia), paramètres de la procédure et du vote (hypothèses, calibrés sur les douze propositions les plus proches de chaque président type : un président centriste en fait adopter un quart sans concession et presque toutes avec deux concessions, un président de gauche radicale aucune sans recours au 49.3). Format de sauvegarde 9 (Parlement, décision « texte ») et migration 8 → 9 testée sur un état réel du format 8. Moteur 0.8.0 : dépôt de la feuille de route (un texte toutes les 4 semaines, deux en cours au plus, dépendances adoptées), commission, séance (vote si la projection est confortable, sinon décision du joueur ou règle de l'IA), concessions, 49.3 et censure, navette et lecture définitive, entrée en vigueur différée avec effet sur la popularité. Écran Parlement. Le Sénat n'est pas modélisé groupe par groupe (accord tiré au sort) ; une personnalité réelle présidente jouée par l'IA ne dépose aucun texte (aucun programme ne lui est prêté).
- **P6-05 et P6-06 faites** (21/10/2026) — `pnpm data:economie` : six indicateurs de départ tirés des séries de l'Insee (pages publiques des séries ; `bdm.insee.fr`, `api.insee.fr` et la Banque de France n'étant pas joignables depuis l'environnement), dont deux déduits par une règle citée. Jeu de règles `presidentielle-2027@8.0.0` : modèle économique simple (hypothèses), huit crises fictives (énergie, finance, mouvement social, inondations, cyberattaque, épidémie, taux d'intérêt, agriculture). Format de sauvegarde 10 et migration 9 → 10 testée sur un état réel du format 9. Moteur 0.9.0 : étape 7 active pendant le quinquennat (indicateurs, facteurs, effet de la conjoncture sur la popularité), réformes chiffrées (solde structurel, impulsion), 49.3 ⇒ tensions sociales, crises tirées après l'investiture (décision du joueur, choix par défaut pour l'IA). Écrans Économie et Crises.
- **P6-07 faite** (21/10/2026) — `pnpm data:legislatives` : résultats définitifs de 2024 dans les 577 circonscriptions (ministère de l'Intérieur, Licence Ouverte 2.0), voix par nuance et nuance de l'élu, sans aucun nom de candidat ; constats conservés (zéros initiaux absents du fichier du premier tour, quatre écarts entre voix et exprimés, nuance de l'élu différente d'un tour à l'autre en Polynésie). Jeu de règles `presidentielle-2027@9.0.0` : article 12 et règles électorales (citées d'après Wikipédia), fin de la législature le 19 juin 2029 (déduite), législatives des 10 et 17 juin 2029 (hypothèse), action « Dissoudre l'Assemblée nationale », cinq blocs (rattachement des nuances et des groupes : hypothèse), modèle de simulation et règle de dissolution du président IA (hypothèses). Format de sauvegarde 11 et migration 10 → 11 testée sur un état réel du format 10. Moteur 0.10.0 : étape 8 active pendant le quinquennat ; dissolution (élections un dimanche au moins 20 jours plus tard, travaux parlementaires suspendus, aucune nouvelle dissolution dans l'année) et législatives de fin de législature ; deux tours dans les 577 circonscriptions (25 % des inscrits et majorité absolue au premier tour, 12,5 % des inscrits pour le second), reports selon la proximité des blocs, recomposition des groupes, cohabitation (le président IA nomme alors un profil proche de la majorité), nouveau gouvernement après chaque élection. Écran Législatives (calendrier, dissolution, sièges et voix par bloc, résultats par circonscription filtrables par département, 2024 réels ou simulés) ; l'écran « Bilan du quinquennat » est annoncé, sans moteur, pour l'étape P6-08. Les désistements entre les deux tours ne sont pas simulés.
- **P6-08 faite** (21/10/2026) — Moteur 0.11.0 : la partie ne se bloque plus à la fin du quinquennat. Le lundi où commence la campagne suivante (29 septembre 2031 pour une partie commencée le 28 septembre 2026), le bilan est arrêté (popularité du président et indicateurs au début et à la fin, réformes adoptées et en vigueur, textes rejetés, retirés ou caducs, 49.3, censures, gouvernements, dernières législatives), la présidentielle et le quinquennat sont archivés, puis la campagne de 2032 s'ouvre avec le même moteur : calendrier de 2027 transposé de 261 semaines (hypothèse étiquetée, partagée par le moteur et l'interface), parrainages et comptes de campagne remis à zéro, militants et notoriété relevés au moins à leur niveau de départ (hypothèse : l'attrition de cinq ans les rendait presque nuls), président sortant candidat, ou inéligible au terme de deux mandats consécutifs (art. 6). Pendant la campagne, l'action du gouvernement sortant, le Parlement et l'économie ne sont pas simulés (simplification signalée à l'écran) ; en conséquence, une dissolution n'est plus possible si les élections pouvaient tomber après l'ouverture de la campagne. Format de sauvegarde 12 et migration 11 → 12 testée sur un état réel du format 11, rejoué jusqu'à la campagne de 2032. Écran « Bilan du quinquennat » (bilans et présidentielles précédentes) ; panneau « Présidentielle 2032 » du tableau de bord. Identifiants des textes uniques sur toute la partie (`texte-2032-1`…). Le jeu de règles ne change pas (cycles 2032 et 2037 déjà déclarés en 6.0.0) ; après le mandat issu de 2037, la partie s'arrête explicitement (aucun cycle prévu au-delà).

- **P6-09 et P6-10 faites** (21/10/2026) — Interface : hémicycle de l'écran Parlement (un point par siège, groupes de gauche à droite, couleur selon la position à l'égard du président : trois teintes de la palette de référence validée, légende chiffrée, infobulle par siège, tableau des groupes) ; bilan hebdomadaire du quinquennat (économie avec ses facteurs, résultats des législatives) dans le tableau de bord et le journal ; écrans Parlement, Économie et Législatives explicites pendant la campagne qui suit un quinquennat (« non simulé ») ; évolution économique mesurée depuis le début du quinquennat en cours. Playwright (bureau et mobile) : de l'investiture à un premier vote à l'Assemblée (hémicycle, votes par groupe, axe-core), puis jusqu'à la campagne de 2032 (bilan, calendrier transposé, campagne jouable, axe-core). Documentation : README (ce qui fonctionne, limites), PLAN, SOURCES, RISQUES (R-35 à R-38), ARCHITECTURE, MODELE_DONNEES (formats 8 à 12), CLAUDE.md.

**Bilan (21/10/2026)** — les dix tâches sont réalisées, avec les limites signalées ci-dessous.

| Vérification | Résultat |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | sans erreur |
| `pnpm test` | 392 tests réussis : moteur 176, import de données 73, interface 72, jeu de règles 37, sauvegardes 26 (migrations 7 → 8 à 11 → 12 sur des états réels), contrats 4, Worker Cloudflare 4 |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 81 tests réussis (avance rapide du quinquennat, nomination, dissolution et deux tours sauvegardés, ouverture de la présidentielle 2032) |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 34 tests réussis, dont présidentielle puis quinquennat (gouvernement, Parlement, économie, crises, législatives), investiture → vote → présidentielle 2032, audits axe-core |
| CI GitHub | verte à chaque étape poussée |

Écarts et limites :
- **Sénat** non modélisé groupe par groupe (accord tiré au sort) ; **désistements** entre les deux tours des législatives non simulés ; législatives simulées **par bloc** (cinq blocs, rattachement des nuances : hypothèse).
- **Président IA personnalité réelle** : aucun programme ne lui est prêté, il ne dépose donc aucun texte.
- **Pendant la campagne** qui suit un quinquennat : gouvernement sortant, Parlement et économie non simulés ; textes en cours caducs ; plus de dissolution à l'approche de la campagne ; militants et notoriété relevés au niveau de départ (hypothèse).
- **Dates de jeu** : législatives de 2029 et présidentielles de 2032 et 2037 (calendrier de 2027 transposé) sont des hypothèses ; la partie s'arrête explicitement à la fin du mandat issu de 2037.
- **Textes officiels** : Constitution et code électoral cités d'après Wikipédia (Légifrance refuse l'accès depuis l'environnement) ; la Banque de France n'est pas joignable (économie de départ : séries de l'Insee).

**Règles** : aucune personne réelle n'est nommée à un poste sans l'étiquette « simulé » ; aucun propos ni vote individuel attribué à un député réel (les votes sont ceux des groupes, simulés) ; les indicateurs économiques de départ sont sourcés et datés, leur évolution est une simulation ; les crises sont fictives et étiquetées.

**Prérequis** : `data.assemblee-nationale.fr`, `www.insee.fr` et `www.banque-france.fr` joignables le 21/10/2026 ; `www.data.gouv.fr` joignable par intermittence ; `www.legifrance.gouv.fr` refusé (403) : les articles de la Constitution et du code électoral sont cités d'après leur texte connu et marqués « à vérifier sur Légifrance » tant qu'ils n'y ont pas été relus.

### Phase 7 — Contenu approfondi (terminée)

Scénarios de départ, bibliothèque d'événements et de crises, conséquences à long terme. Chaque événement fictif est étiqueté.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P7-01 | **Scénarios de départ** (jeu de règles 10.0.0) : un scénario de référence neutre et des situations fictives étiquetées (moyens de départ, fréquence des événements, choc économique et fragilités à l'ouverture du premier quinquennat, fréquence des crises) ; choix à la création ; format de sauvegarde 13. | le scénario « standard » ne change rien ; écarts appliqués et affichés ; migration 12 → 13 testée sur un état réel. |
| P7-02 | **Bibliothèque enrichie** : six crises fictives (canicule — en saison —, logement, affaire dans un cabinet ministériel sans personne réelle, médicaments, accident industriel, guerre commerciale) et six événements de campagne fictifs. | chaque crise et chaque événement est fictif et étiqueté ; une crise de saison ne survient que dans ses mois. |
| P7-03 | **Conséquences à long terme** : effets hebdomadaires durables et fragilités (crises plus ou moins probables) laissés par les crises, les choix du président et le scénario ; archivés dans le bilan du quinquennat. | chaque effet passe par les registres (somme des facteurs = variation) ; durée exacte ; déterminisme. |
| P7-04 | **Interface et documentation** : choix du scénario, conséquences durables et saisons dans l'écran Crises, scénario au tableau de bord, conséquences dans le bilan ; documentation. | tests de composants ; Playwright bureau + mobile. |

**Bilan (21/10/2026)** — les quatre tâches sont réalisées. Moteur 0.12.0, format de sauvegarde 13, jeu de règles `presidentielle-2027@10.0.0` : 5 scénarios (standard, Tempête économique, Colère sociale, Monde instable, Candidature d'outsider), 14 crises, 12 événements de campagne, conséquences durables sur 8 crises existantes et sur les nouvelles. Limites : effets, probabilités, durées et fragilités sont des hypothèses de jeu, sans valeur de prévision ; les conséquences durables ne s'appliquent pas pendant une campagne présidentielle (le quinquennat n'y est pas simulé) ; les réformes adoptées n'ont pas encore d'effet structurel propre au-delà de leur coût et de leur effet sur la popularité.

### Phase 8 — Version publiable

Durcissement sécurité (§14), mesure de performance et fixation des seuils (§15), documentation complète, image Docker, CI de déploiement, sauvegardes automatiques et **test de restauration**, test complet PC et téléphone. **Critères visés** : 1, 13, 14, 15.

**Application Android (APK)** — demandée par l'utilisateur le 21/10/2026 pour la fin du projet ; **mode hors ligne local** décidé par l'utilisateur le 21/10/2026 (Q9) : moteur, règles, carte de démonstration et parties sur l'appareil, sans serveur (décision D13 de l'[architecture](./ARCHITECTURE.md#14-application-android-hors-ligne-phase-8)). Périmètre de la phase recentré par l'utilisateur sur l'APK hors ligne, la sécurité et la robustesse.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P8-01 | **Moteur local** `@r2027/local-api` : mêmes routes, schémas et codes d'erreur que l'API (parties, progression idempotente, avance rapide, sauvegardes automatiques et manuelles, journal paginé, export/import, résultats communaux, carte, règles) au-dessus d'un stockage IndexedDB transactionnel. | tests de contrat ; parties relues après fermeture et réouverture de la base ; une écriture qui échoue n'applique rien (transaction annulée en bloc). |
| P8-02 | **Interface à transport remplaçable** : client d'API, plateforme (export, avertissement de stockage), entrée `mountApp` commune ; l'interface ne calcule toujours pas l'état. | tests de composants inchangés ; règle de lint « pas de moteur dans `apps/web` » respectée. |
| P8-03 | **Application `apps/mobile`** (Vite + Capacitor 8) : référentiel cartographique de démonstration embarqué, stockage persistant demandé (avertissement sinon), export par la feuille de partage d'Android, erreur de démarrage explicite, politique de sécurité du contenu stricte. | Playwright sur le paquet de l'APK avec tout le réseau coupé : création, semaine, reprise, carte, export, import ; aucune requête sortante, aucune violation CSP. |
| P8-04 | **Projet Android et APK** : aucune permission (pas d'`INTERNET`), partage limité aux exports, icônes, signature de publication hors du dépôt ; workflow GitHub qui construit l'APK, le publie en artefact et l'essaie sur un émulateur Android 14 en mode avion. | APK construit en CI ; essai sur émulateur réussi (permissions, pont natif, partie, carte, export, relance de l'application). |
| P8-05 | **Sécurité et robustesse** : audit des dépendances, revue de sécurité de l'API, du moteur local et de l'application, corrections testées. | `pnpm audit` sans vulnérabilité connue ; constats de la revue corrigés ou consignés dans le registre des risques. |
| P8-06 | **Documentation** : commandes exactes de construction de l'APK (CI et locale), signature, installation ; architecture, risques, consignes. | README, `apps/mobile/README.md`, ARCHITECTURE §14, RISQUES R-40 à R-44. |

Hors périmètre de cette phase (inchangé, lié à l'hébergement de la version web, Q6) : image Docker, CI de déploiement, sauvegardes `pg_dump` et test de restauration du serveur, seuils de performance.

**Bilan (21/10/2026)** — les six tâches sont réalisées. Application Android `apps/mobile` 1.0.0 (Capacitor 8.5.3, Android 7 à 16, `minSdk` 24, `targetSdk` 36), sans aucune permission ; moteur local `@r2027/local-api` (mêmes schémas et codes d'erreur que l'API, base IndexedDB version 2) ; APK de débogage construit par le workflow GitHub « Android (APK) » (artefact `republique-2027-apk-debug`, 5,1 Mo zippé)  et essayé sur un émulateur Android 14 en mode avion (exécution n° 4 du workflow, 21/10/2026) : installation sans aucune permission, démarrage hors ligne avec le pont natif, partie créée et semaine jouée, carte rendue, export écrit puis feuille de partage, relance de l'application avec la partie conservée. Deux premiers essais interrompus par l'environnement d'essai, pas par l'application : espace disque du runner insuffisant pour l'émulateur, puis carte rendue en logiciel plus lente que le délai de 5 s (délais portés à 2 min). Mesure de robustesse : une partie observée de bout en bout (816 semaines, jusqu'au 19 mai 2042) se simule en 62 s sur le moteur local ; son export pèse au plus 568 Ko (limite d'import : 1 Mo) et se réimporte. Revue de sécurité : aucun problème élevé (accès aux parties d'autrui, injection, traversée de chemin, secret commité : rien) ; constats moyens et faibles corrigés et testés (session créée à la première écriture, limite des écritures coûteuses, caractère NUL, configuration de production, proxy de confiance, pagination du journal, CSP du paquet web, signature réservée à `main` et aux étiquettes, clés ignorées par Git, essai Android limité aux émulateurs, rétention des réponses d'idempotence sur l'appareil). Limites : croissance de `game_advance` côté serveur à traiter avant l'hébergement (R-45) ; l'application n'embarque que la carte de démonstration et une base électorale fictive ; pas d'iOS ; l'APK de débogage n'est pas destiné à un magasin d'applications (APK signé dès que les secrets de signature sont configurés).

### Phase 9 — Refonte de l'interface, nouveaux médias et soirée électorale (terminée)

Demandée par l'utilisateur le 22/10/2026 (« carte blanche totale sur l'UI/UX »), puis précisée le même jour (« identité visuelle type plateau TV / soirée électorale », « dépouillement en direct heure par heure », « détail communal de la Somme », « compilation de l'APK finale »). Aucune règle du jeu n'est inventée pour l'habillage : les chiffres affichés restent ceux du moteur, les nouveaux paramètres (médias numériques, rythme de la soirée) sont des hypothèses étiquetées.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P9-01/02 | **Design system et coque** : jetons Tailwind 4 (couleurs, ombres, rayons, animations), en-tête collant (argent, temps, popularité, photo du candidat), barre de navigation basse sur téléphone, rail sur ordinateur. | tests de composants ; Playwright bureau + mobile ; aucun défilement horizontal ; axe-core. |
| P9-03 | **Avatars** : photo libre de chaque personnalité réelle (dont Raphaël Glucksmann, fichier Commons sous licence libre), repli en initiales sur la couleur de la famille politique si l'image manque ou échoue. | test de composant (photo, échec, absence) ; source et licence dans SOURCES. |
| P9-04 | **Actions rapides** : tuiles à icône, calculs (coûts, effets, risques) dans des infobulles et une confirmation. | tests de composants ; e2e de campagne inchangés. |
| P9-05 | **Carte immersive** : scène pleine hauteur, filtres et fiche escamotables, vols de caméra (mouvement réduit respecté). | e2e carte bureau + mobile ; axe-core. |
| P9-06 | **Nouveaux médias et réseaux sociaux** (jeu de règles 11.0.0, format de sauvegarde 14) : jauges « jeunesse » et « dynamique » passées par le registre, formats réels sourcés (interview longue, décryptage, vidéos courtes, direct de streaming) sans ligne éditoriale prêtée, publications et réactions de comptes fictifs. | migration 13 → 14 testée sur un état réel ; somme des facteurs = variation ; déterminisme. |
| P9-08 | **Identité « soirée électorale »** : bleu nuit de plateau, néons tricolores, typographie condensée (Archivo, axe de largeur) pour titres et chiffres. | contrastes WCAG AA (axe-core) en thème sombre et clair. |
| P9-09 | **Direct de la soirée électorale** : le soir de chaque tour, la partie passe en direct (tranches de 20 h à minuit) ; la carte se colore département par département puis commune par commune aux couleurs du candidat en tête ; bandeau défilant des estimations ; estimation simulée qui converge vers le résultat du moteur. | chiffres = parts exactes du résultat du moteur, croissants, identiques au résultat à minuit ; déterminisme (graine) ; e2e bureau + mobile ; axe-core. |
| P9-10 | **Somme (80)** au détail communal dans le jeu de démonstration (771 communes, dont Amiens). | carte, recherche et soirée sur la Somme. |
| P9-07 | Écrans restants, fluidité de la carte sur téléphone, documentation, CI verte, APK. | `pnpm check`, intégration, e2e, test hors ligne du paquet mobile, workflow « Android (APK) ». |

**Avancement** :
- **P9-01 à P9-06, P9-08 et P9-10 faites** (22/10/2026) — jeu de règles `presidentielle-2027@11.0.0`, format de sauvegarde 14, moteur 0.13.0.
- **P9-09 faite** (22/10/2026) — module pur `soiree` de `@r2027/shared` (aucun aléa ni horloge : tirages par hachage de la graine, du tour et du code INSEE) : 9 tranches de 20 h 00 à 0 h 00 ; outre-mer annoncé à 20 h, départements les moins peuplés plus tôt (hypothèses de présentation) ; chaque chiffre affiché est une fraction exacte (arrondie au plus bas) du résultat du moteur ; Français de l'étranger et collectivités hors carte comptés à minuit. Écran « Soirée électorale » ouvert automatiquement après la semaine d'un scrutin et accessible depuis Résultats (« Revivre la soirée électorale ») : horloge, bandeau défilant (masqué aux lecteurs d'écran, annonce polie à chaque tranche), estimation, fil des départements dépouillés, suivi communal (Ain, Corse, Somme, outre-mer dans la démonstration), éclat lumineux des territoires qui viennent d'être dépouillés. Lecture automatique en pause d'office si le mouvement réduit est demandé.
- **P9-07 faite** (22/10/2026) — titres de tous les écrans au style de l'identité (titre condensé) ; carte plus fluide sur téléphone (densité de rendu plafonnée à 2, plus de flou d'arrière-plan au-dessus de la carte, une seule instance MapLibre dans la soirée) ; base de démonstration fictive contrastée (composantes régionale, départementale et communale) pour que la carte et la soirée montrent plusieurs candidats en tête ; badge « Démonstration fictive » dans la soirée ; audit axe-core de la soirée en thème sombre et clair ; essai Android corrigé pour Android 14 (activité au premier plan lue dans les activités reprises) ; application 1.1.0 (`versionCode` 2).

**Bilan (22/10/2026)** — les dix tâches sont réalisées.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | sans erreur ; 463 tests réussis |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 92 tests réussis |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 38 tests réussis, dont la soirée électorale (passage automatique en direct, Somme commune par commune, axe-core en thème sombre et clair, aucun défilement horizontal) |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | 1 test réussi |
| Workflow « Android (APK) » | APK construit et essayé sur un émulateur Android 14 en mode avion (exécution 39742050582) : installation sans permission, partie, carte, export et feuille de partage, relance |

Écarts et limites :
- **Soirée électorale** : horaires, rythme et estimations sont des hypothèses de présentation ; les heures réelles de fermeture des bureaux ne sont pas modélisées ; le second tour se rejoue avec le même déroulé ; les législatives n'ont pas de soirée en direct.
- **Fluidité sur téléphone** non mesurée sur un appareil réel (l'émulateur de la CI rend la carte sans GPU) : à mesurer avant une publication (R-47).
- **Démonstration** : contrastes territoriaux inventés (R-48) ; l'application Android n'embarque toujours que cette base fictive.
- **APK** : version de débogage en artefact ; l'APK signé n'est produit que sur `main` ou une étiquette `v…`, une fois les secrets de signature configurés.

### Phase 10 — Débats et grands entretiens (terminée)

Demandée par l'utilisateur le 22/10/2026 : débats avant le premier tour où l'on peut attaquer les autres candidats, débat d'entre-deux-tours jouable, événements qui font gagner ou perdre des points ; format « Legend » (interview longue, parcours personnel) avec un fort bonus de sympathie et de notoriété chez les jeunes, et un risque si une contradiction sur le passé du candidat est relevée. Cadrage validé le 22/10/2026 (26 propositions par défaut acceptées en bloc).

Décisions :
- **Legend** : la « sympathie » est la Popularité ; bonus de Popularité, Notoriété et Jeunesse (la jauge Jeunesse pèse déjà le plus chez les électeurs éloignés de la politique) ; risque « contradiction avec son parcours » dont la probabilité monte avec les revirements de programme et la répétition des interviews longues, effet étalé sur 2 à 3 semaines ; pour une personnalité réelle, l'événement reste abstrait (aucun contenu inventé).
- **Débats du premier tour** : un débat à cinq (les cinq premiers du dernier sondage) environ quatre semaines avant le vote, un débat à tous les candidats environ deux semaines avant ; dates : hypothèses du jeu (calendrier transposé pour 2032 et 2037) ; chaînes réelles de la liste des médias, sans journaliste nommé ni question attribuée.
- **Déroulé** : 4 séquences thématiques et une conclusion (premier tour), 5 et une conclusion (entre-deux-tours) ; à chaque séquence, 3 cartes : défendre (ou répondre à une attaque reçue), attaquer (cible et angle), et une carte de circonstance (rester au-dessus de la mêlée ou tenter une petite phrase).
- **Attaques** : seulement sur des faits de la partie (crédibilité du programme, revirements, dons refusés, ralliements, bilan d'un président sortant) ; une attaque dont le fait est faux se retourne contre l'attaquant ; les personnalités réelles n'ont pas de programme dans le jeu (attaque « programme » contre elles : fausse).
- **Chaise vide** : le joueur et l'IA peuvent refuser (petit malus) ; un favori IA large refuse parfois.
- **Effets** : sondage flash « le plus convaincant » (simulé) ; popularité, notoriété (forte pour les petits candidats), dynamique (petite phrase réussie) par le registre ; facteur de vote « Débats télévisés » qui s'estompe (au plus environ ±2 points d'intentions au premier tour, ±3 au second).
- **Hasard** : environ 30 % ; préparation commune (heures) qui s'use de 10 % par semaine ; IA meilleure débatteuse en difficulté experte.
- **Répliques** : écrites (modèles du jeu de règles) pour le joueur et les candidats fictifs seulement ; aucune réplique pour une personnalité réelle (l'action seule est décrite).
- **Interface** : écran « Débat en direct » (pupitres, chronomètre du temps de parole, courbe d'approbation, réactions de comptes fictifs), 3 à 5 minutes, « simuler la fin », chronomètre optionnel ; débat d'un autre candidat ou en observateur : relecture accélérée et résumé.
- Toutes les présidentielles (2027, 2032, 2037) ; pas de débat aux législatives.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P10-01 | **Jeu de règles 12.0.0** : séances de débat (échéances datées, invitations, thèmes, cartes, angles, effets, IA, répliques, réactions), interview longue révisée et risque majoré. | schéma et contrôles croisés (échéances, médias, thèmes, domaines du programme) ; aucune réplique ne nomme une personne réelle (test) ; dates étiquetées hypothèses. |
| P10-02 | **Format de sauvegarde 15** : séances de débat dans l'état ; migration 14 → 15. | migration testée sur un état réel du format 14. |
| P10-03 | **Moteur des débats** : programmation, invitations, chaise vide, cartes proposées, coups de l'IA, attaques factuelles et retour de bâton, approbation, sondage flash, effets par le registre, facteur de vote décroissant, débat d'entre-deux-tours jouable, usure de la préparation, risque de l'interview longue. | déterminisme (même graine et mêmes choix ⇒ même débat) ; attaque fausse ⇒ toujours défavorable à l'attaquant ; somme des facteurs = variation ; écart d'intentions dû à un débat ≤ 2 points (1er tour) et ≤ 3 points (2nd tour) ; aucune réplique pour une personnalité réelle. |
| P10-04 | **API et moteur local** : `POST /api/games/:id/debats/:debatId` (ouvrir, jouer une carte, refuser, simuler la fin), mêmes schémas et codes d'erreur des deux côtés. | tests de contrat ; tests d'intégration (PostgreSQL). |
| P10-05 | **Interface** : annonce au tableau de bord, écran « Débat en direct », relecture, résultats. | tests de composants ; aucune donnée calculée par le navigateur. |
| P10-06 | E2E, documentation, CI, APK. | Playwright bureau + mobile (débat du premier tour joué, entre-deux-tours, axe-core) ; CI verte ; APK construit. |

**Avancement** :
- **P10-01 à P10-03 faites** (22/10/2026) — jeu de règles `presidentielle-2027@12.0.0`, format de sauvegarde 15, moteur 0.14.0 : module `election/debats.ts` (programmation, invitations, refus d'un favori IA, cartes, attaques factuelles et retour de bâton, approbation, sondage flash, effets par le registre, facteur de vote « Débats télévisés »), débat d'entre-deux-tours jouable à la place de l'ancien débat automatique ; interview longue : risque majoré par les revirements et la répétition (historique `numerique.passages`), pénalité de répétition de l'IA.
- **P10-04 faite** — route `POST /api/games/:id/debats/:debatId` dans l'API et dans `@r2027/local-api` (mêmes schémas, mêmes codes d'erreur), tests de contrat et d'intégration.
- **P10-05 faite** — écran « Débat en direct », panneau « Débats télévisés » du tableau de bord, section des débats dans Résultats ; débat annulé (chaise vide face à un seul invité) affiché comme tel, sans sondage flash.
- **P10-06 faite** — scénarios Playwright bureau et mobile : débat de tous les candidats joué (carte, attaque ciblée, fin simulée, sondage flash, relecture, Résultats) et débat d'entre-deux-tours revu après la résolution ; axe-core en thème sombre et clair ; application 1.2.0 (`versionCode` 3).

**Bilan (22/10/2026)** — les six tâches sont réalisées.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | sans erreur ; 489 tests réussis (dont 13 du moteur des débats et 7 de l'interface des débats) |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 93 tests réussis |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 42 tests réussis, dont les deux scénarios de débat |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | 1 test réussi |

Écarts et limites :
- **Calibrage** : tous les paramètres des débats sont des hypothèses non calibrées ; l'effet d'un débat sur les intentions est borné par les tests, pas mesuré sur des données réelles.
- **Refus d'un favori IA** : 35 % dès 8 points d'avance ; au second tour, le débat d'entre-deux-tours est donc souvent annulé quand un finaliste domine (2 graines sur 6 dans un essai). Un réglage plus rare demanderait une nouvelle version du jeu de règles (R-50).
- **Répliques** : modèles génériques du jeu de règles (deux ou trois par carte, deux par angle d’attaque), qui reviennent d’un débat à l’autre ; aucune pour les personnalités réelles, dont les coups sont seulement décrits.
- **Personnalités réelles** : sans programme dans le jeu, elles ne peuvent être attaquées que sur des faits de la partie (revirements, dons refusés, ralliements, bilan) ; l'angle « programme » est toujours faux contre elles.
- **Partie migrée** : un débat d'entre-deux-tours déjà tenu par l'ancien moteur (format 14) n'est pas rejoué ; il reste visible dans « Entre-deux-tours » (Résultats).
- Pas de débat aux législatives (décision de cadrage).

### Phase 11 — Finitions : soirée, gouvernement, interface, équilibrage, variété (terminée)

Demandée par l'utilisateur le 22/10/2026 (« Applique ces 9 correctifs et ajouts majeurs pour finaliser l'application »). Trois demandes touchent des règles du projet (CLAUDE.md) ; elles sont appliquées dans le respect de ces règles, comme suit (décisions par défaut, révisables) :
- **Sources à l'écran** (demande 3) : les sources, liens, licences, méthodes et notes de bas de page quittent les écrans de jeu pour l'écran **Paramètres → Crédits et mentions légales** ; restent à l'écran les seules **étiquettes courtes** (« Simulé », « Hypothèse », « Estimation », « Fictif »), qu'exige la règle « ne jamais présenter une donnée inventée comme officielle ».
- **Ligne des chaînes** (demande 8) : aucune ligne éditoriale n'est prêtée à un média (règle du projet). La réussite d'un passage dépend de la préparation, de la posture choisie, du **format** de l'exercice (interview, émission politique, entretien long, décryptage, vidéo courte, direct : hypothèses du jeu sur le format, non sur la chaîne), de la situation du candidat et des données mesurées de l'organe (audience, temps de parole du parti relevé par l'Arcom).
- **Personnalités du gouvernement** (demande 2) : fiches importées et sourcées comme les autres personnalités (faits publics datés, photo sous licence libre, position d'après le Chapel Hill Expert Survey) ; compétence estimée à partir de faits publics (fonctions exercées) selon une méthode documentée et étiquetée « estimation » ; popularité de départ : hypothèse du jeu tirée de la notoriété, jamais présentée comme un sondage ; aucune parole ni décision réelle ne leur est prêtée (nominations et refus simulés).

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P11-01 | **Rythme de la soirée électorale** : horloge à la minute (20 h 00 → 0 h 00) ; pause, temps réel, lent (une minute par seconde), ×2, ×5 ; coloration des départements et des communes (Somme, Amiens) synchronisée. | chiffres = fractions exactes du résultat, croissants, identiques au résultat à minuit ; l'état affiché à une heure donnée ne dépend pas de la vitesse (test) ; déterminisme ; e2e bureau + mobile. |
| P11-02 | **Personnalités pour le gouvernement** : figures clés des partis (dont celles citées par l'utilisateur), nominables à Matignon et aux ministères régaliens par le joueur ; compétence et popularité influent sur la popularité du président, le soutien des groupes non alignés aux textes, la gestion des crises et le risque de censure. | importeur et fiches sourcées ; jeu de règles 13.0.0 ; effets passés par le registre ; déterminisme ; aucune parole attribuée (test). |
| P11-03 | **Paramètres et crédits** : écran Paramètres (thème, crédits et mentions légales, à propos) ; écrans de jeu débarrassés des sources et notes. | toutes les attributions (données, licences, photos, logos) présentes dans Crédits (test) ; aucun lien de source sur les écrans de jeu (test) ; axe-core. |
| P11-04 | **Marges de sécurité mobiles** : en-tête et HUD sous la barre d'état (insets de Capacitor 8 et `env(safe-area-inset-*)`), barre de navigation et bouton « Résoudre la semaine » qui ne masquent plus les cartes d'actions. | test Playwright mobile avec insets simulés (en-tête sous la barre d'état, dernière carte atteignable) ; essai Android. |
| P11-05 | **Événements contextuels** : faits divers locaux, polémiques, opportunités, vie de campagne, déclenchés selon le contexte (période, rang dans les sondages, départements visités, actions récentes) ; tirage pondéré sans biais d'ordre, fraîcheur. | événements fictifs étiquetés ; déterminisme ; variété mesurée sur une campagne simulée (test) ; somme des facteurs = variation. |
| P11-06 | **Débriefing de la semaine** : écran plein après « Résoudre la semaine » (actions et leur impact, imprévus, passages médias et leurs raisons, initiatives adverses, sondages ±). | données du bilan du moteur seulement ; tests de composants ; e2e ; axe-core. |
| P11-07 | **Sondages stables et expliqués** : incertitude de l'opinion persistante d'une semaine à l'autre, vagues lissées (moyenne pondérée avec la vague précédente du même institut) ; chaque variation décomposée en faits (programme, médias, popularité, réseaux, débats, ralliements…) et part d'échantillon. | amplitude des variations sans fait nouveau bornée (test) ; décomposition = variation (test) ; format de sauvegarde 16. |
| P11-08 | **Plateaux sans aléa** : posture (offensive, pédagogique, rassembleuse) choisie pour chaque passage ; résultat déterministe ; raison affichée dans le bilan ; l'IA choisit sa posture. | même entrée ⇒ même résultat ; plus de préparation ⇒ jamais moins bien (test) ; raison dans le bilan. |
| P11-09 | **Réactions variées** : plus de 100 modèles (ironie, langage du web, débat, militants et opposants selon la famille politique), comptes inventés plus nombreux, aucune répétition récente. | au moins 100 modèles (test) ; aucun nom de personne réelle (test) ; pas de texte repris dans les 40 dernières réactions (test). |
| P11-10 | Format 16 et migration 15 → 16, documentation, e2e, CI, APK 1.3.0. | `pnpm check`, intégration, e2e, test hors ligne ; CI verte ; APK essayé sur émulateur. |

Avancement (22/10/2026, branche `claude/new-session-lmxg1t`) :
- **P11-04 faite** (3716bd2) — en-tête et HUD sous la barre d'état, navigation basse et bouton « Résoudre la semaine » qui ne masquent plus les cartes d'actions.
- **P11-01 faite** (774dc01) — horloge de la soirée électorale à la minute, pause, lent, temps réel, ×2, ×5 ; état affiché indépendant de la vitesse.
- **P11-09 faite** (eebbbd4) — 255 modèles de réactions ; jeu de règles 13.0.0 et format 16 ouverts.
- **P11-07 faite** (31700f9) — incertitude de l'opinion persistante, vagues lissées, variation décomposée en faits et part d'échantillon.
- **P11-08 faite** (37dd3b2) — passages dans les médias notés sans aléa (préparation, posture, format, situation) ; raison dans le bilan ; l'IA choisit sa posture.
- **P11-05 faite** (ede071c) — 40 événements fictifs en quatre familles, déclenchés selon le contexte ; tirage pondéré sans biais d'ordre, fraîcheur.
- **P11-06 faite** (74f2d03) — débriefing plein écran après « Résoudre la semaine », données du bilan du moteur seulement.
- **P11-03 faite** (d7c3409) — écran Paramètres (apparence, crédits et mentions légales, à propos) ; aucun lien de source sur les écrans de jeu (e2e sur tous les écrans de la partie).
- **P11-02 faite** — `pnpm data:gouvernement` : 22 personnalités nominables (dont Jordan Bardella et Jean-Philippe Tanguy ; RN, UDR, LFI, Renaissance, PS, LR, Écologistes, MoDem, Horizons, PCF), fonctions datées tirées de l'infobox de chaque article Wikipédia (révision figée), appartenance au parti vérifiée sur Wikidata, 19 photos sous licence libre, position du parti d'après CHES 2024 ; compétence estimée (somme de facteurs documentés, plafond 0,90) et notoriété déduites des fonctions ([SOURCES §8 nonies](./SOURCES.md)). Moteur : le président (joueur ou IA) peut nommer ces figures à Matignon ; le Premier ministre propose ses ministres (acteurs et figures proches, puis profils fictifs) ; le président joueur pourvoit ensuite chaque ministère régalien (décisions `nomination-ministre`) ; refus simulés selon la proximité (ou accord de la majorité en cohabitation). Effets, tous par le registre : popularité prêtée à la nomination, action hebdomadaire du gouvernement selon la compétence de l'équipe, gestion des crises selon la compétence du ministre concerné (chaque crise a un poste), ouverture (soutien aux textes et censure des groupes non alliés représentés), censure modulée par la compétence du Premier ministre. Interface : fiches et photos sur l'écran Gouvernement, liste des personnalités nominables, options de nomination groupées en lignes compactes, crédits et méthode dans Paramètres.

- **P11-10** — format 16 et migration 15 → 16 (sondages déjà publiés sans variation, aucune vague de référence ; gouvernements en place inchangés), documentation (SOURCES §8 nonies, modèle de données, architecture, risques R-51, README, application mobile), application **1.3.0** (`versionCode` 4).

**Bilan (22/10/2026)** — les dix tâches sont réalisées ; deux vérifications attendent GitHub Actions.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | sans erreur ; 552 tests réussis |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 94 tests réussis |
| `pnpm test:e2e` (Playwright, bureau + mobile) | 51 tests réussis (1 ignoré, comme avant) |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | 1 test réussi |
| APK 1.3.0 de débogage | construit localement (JDK 21, SDK Android 36) : `versionCode` 4, aucune permission réseau, 6,1 Mo |
| CI GitHub et essai sur émulateur | **non exécutés** : depuis 74f2d03, chaque tâche GitHub Actions se termine en 2 à 3 secondes sans démarrer d'étape (journal indisponible) — blocage du compte (minutes, limite de dépenses ou facturation), signalé sur la PR #2 ; pas d'émulateur dans l'environnement de développement (pas de KVM) |

Écarts et limites :
- **Calibrage** : effets de l'équipe gouvernementale, des événements, des passages dans les médias et de l'inertie des sondages = hypothèses du jeu de règles 13.0.0, bornées par les tests, non mesurées sur des données réelles.
- **Figures du gouvernement** : fonctions telles que l'infobox de Wikipédia les donne à la révision importée (peuvent être en retard sur un remaniement) ; compétence estimée par une règle simple (fonctions exercées), pas une évaluation ; trois figures sans photo libre (initiales affichées).
- **Ministères régaliens** : le président joueur doit confirmer ou remplacer cinq ministres après chaque nomination de Premier ministre (décisions obligatoires, la proposition du Premier ministre par défaut) ; les autres ministères restent composés par le Premier ministre.
- **Rattachement aux groupes** : par l'étiquette du parti ; une personnalité sans parti de la table (Place publique, Debout !, Reconquête…) n'ouvre le gouvernement à aucun groupe.


### Phase 12 — Ergonomie : navigation à plat, QG en un coup d'œil, tiroirs (terminée)

Demandée par l'utilisateur le 23/10/2026 (retour de test : « Focus sur l'ergonomie, la simplification de la navigation et l'immersion »). Aucune règle du jeu ne change : ni moteur, ni jeu de règles, ni format de sauvegarde ; l'interface n'affiche que des données servies par l'API (ou `@r2027/local-api`).

Décisions de conception (révisables) :
- **Cinq espaces** au lieu de seize écrans répartis en trois groupes et d'une feuille « Tous les écrans » : **QG** (vue d'ensemble, plan de la semaine, décisions, journal, sauvegardes), **Carte** (inchangée, plein écran), **Campagne** (programme, candidats et alliances, médias et réseaux, finances), **Opinion** (sondages, résultats), **Pouvoir** (gouvernement, Parlement, économie, crises, législatives, bilan). Même barre sur ordinateur (rail) et sur téléphone (barre du bas, cinq onglets) : aucun menu dans un menu.
- Dans un espace, chaque écran devient une **section dépliable** (accordéon) avec une ligne d'état ; son contenu n'est chargé qu'à l'ouverture. Les anciennes adresses (`…/programme`, `…/sondages`…) restent valides : elles ouvrent l'espace avec la section dépliée.
- Les **détails** (fiche d'une action, compte de campagne, sondages, calendrier, membres du gouvernement…) s'ouvrent dans un **tiroir** — panneau coulissant à droite sur ordinateur, depuis le bas sur téléphone — sans quitter le QG.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P12-01 | **Navigation à plat** : cinq espaces, rail et barre du bas identiques, plus de feuille « Tous les écrans » ; redirection des anciennes adresses vers l'espace et la section. | aucun menu imbriqué ; chaque écran du cahier des charges atteint en deux gestes au plus (onglet, section) (test) ; anciennes adresses redirigées (test) ; axe-core. |
| P12-02 | **Sections dépliables** : écrans secondaires en accordéons dans les espaces Campagne, Opinion et Pouvoir (et Journal, Sauvegardes dans le QG), chacun avec une ligne d'état. | un seul titre de niveau 1 par page ; section fermée = contenu non rendu ; ouverture au clavier et par l'adresse (test) ; e2e bureau et mobile. |
| P12-03 | **QG en un coup d'œil** : vue d'ensemble en tête — budget, notoriété, popularité, temps, actions programmées, sondage clé (rang, part, variation), décisions en attente, prochaine échéance ; présidence : gouvernement, Parlement, économie, législatives. Panneaux secondaires (bilan de la semaine, parrainages et compte, calendrier, la partie) repliés. | la vue d'ensemble tient dans le premier écran d'un téléphone 390 × 844 sous le bandeau (test) ; données du moteur seulement ; tests de composants. |
| P12-04 | **Tiroirs de détail** : fiche d'une action (avec « Ajouter au plan ») et détails des chiffres du QG dans un panneau coulissant. | l'adresse ne change pas à l'ouverture d'un détail (test) ; dialogue accessible (titre, focus piégé puis rendu, Échap) ; marges de sécurité ; axe-core. |
| P12-05 | Tests responsive (bureau, 360 et 390 px), e2e et essai hors ligne mis à jour, documentation, APK 1.4.0. | `pnpm check`, intégration, e2e, test hors ligne ; aucun défilement horizontal dans chaque espace (test) ; APK construit. |

Avancement (23/10/2026, branche `claude/new-session-lmxg1t`) :
- **P12-01 faite** — barre `Espaces de la partie` à cinq onglets (rail sur ordinateur, barre du bas sur téléphone), plus de feuille « Tous les écrans » ni de groupe « Raccourcis » ; chaque écran du registre est un espace ou une section d'un espace (test : deux gestes au plus) ; les anciennes adresses redirigent vers `espace#section` (test).
- **P12-02 faite** — `Disclosure` : titre de niveau 2 contenant le bouton (`aria-expanded`, `aria-controls`), ligne d'état lue dans l'état servi (`sections.tsx`), région nommée par le bouton exposée seulement une fois dépliée, contenu non rendu tant que la section est repliée ; l'ancre de l'adresse déplie la section et l'amène à l'écran ; un écran intégré garde sa région nommée sans second titre visible (`ScreenHeading`, contexte `Embedded`) ; un seul titre de niveau 1 par page, toutes sections dépliées (e2e).
- **P12-03 faite** — vue d'ensemble « En un coup d'œil » sous le titre du QG : actions programmées (n/max, budget et temps restants après le plan), décisions, sondage clé (rang, part, institut, variation), parrainages, compte de campagne, programme, élan ; en présidence gouvernement (Matignon vacant signalé), Parlement, économie (simulée), crises, législatives ; prochaine échéance et résultats. Budget, popularité, notoriété et militants restent dans le bandeau. Le reste du QG est replié en bas de page : bilan de la semaine, toutes les ressources, parrainages et compte, calendrier, journal, sauvegardes, la partie (scénario dans la ligne d'état). Test e2e : sur un téléphone de 390 × 844, toutes les tuiles tiennent au-dessus de la barre « Résoudre la semaine », sans défiler.
- **P12-04 faite** — `Drawer` (portail, dialogue modal nommé, focus piégé puis rendu, Échap, clic sur le fond, feuille par le bas sur téléphone sous la barre d'état, panneau à droite sur ordinateur, pied au-dessus de la barre de gestes) ; `useModal` partagé avec le débriefing de la semaine. Les tuiles ouvrent sondages, parrainages, finances, programme, gouvernement, Parlement, économie, crises, législatives, calendrier ou résultats en tiroir ; la fiche d'une action du plan (coût, effets, risque, raison d'indisponibilité) s'ouvre en tiroir avec « Ajouter au plan ». L'adresse ne change pas (tests unitaires et e2e) ; axe-core sur le tiroir.
- **P12-05 faite** — tests unitaires (navigation, redirection, sections, tuiles, tiroirs), e2e réécrits pour les espaces (aide `openScreen` : onglet puis section), nouveaux essais mobiles (premier écran 390 × 844, tiroir dans les marges de sécurité, aucun débordement à 360 et 390 px toutes sections dépliées), essai hors ligne et essai Android adaptés ; application **1.4.0** (`versionCode` 5).

**Bilan (23/10/2026)** — les cinq tâches sont réalisées ; aucune règle du jeu, aucune donnée ni aucun format de sauvegarde ne change.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | sans erreur ; 560 tests réussis |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 94 tests réussis |
| `pnpm test:e2e` (Playwright, bureau + mobile Pixel 7) | 53 tests réussis, 3 ignorés (essais propres au téléphone, sautés sur le projet bureau) |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | 1 test réussi |
| APK 1.4.0 de débogage | construit localement (JDK 21, SDK Android 36) : `versionCode` 5, aucune permission réseau, 6,1 Mo |
| CI GitHub et essai sur émulateur | **non exécutés** : GitHub Actions reste bloqué au niveau du compte, et l'utilisateur ne souhaite pas modifier son budget ; pas d'émulateur dans l'environnement de développement (pas de KVM) |

Écarts et limites :
- **Essai sur appareil** : la mise en page du téléphone est vérifiée dans Chromium (Pixel 7, 390 × 844, 360 px, marges de sécurité simulées), pas sur un téléphone ni un émulateur Android.
- **Sections du QG** : le bilan détaillé de la semaine est replié (le débriefing plein écran le présente déjà après chaque résolution) ; son ouverture reste à un geste.
- **Tuiles** : leur choix et leur ordre sont des décisions de conception (révisables) ; sur un écran étroit, le détail d'une tuile est tronqué sur une ligne (texte complet dans le nom accessible et dans le tiroir).
- **Carte** : inchangée (déjà plein écran avec ses panneaux escamotables depuis la phase 9).


### Phase 13 — Mandat vivant : Parlement lisible, législatives et alliances, actions présidentielles, portraits (terminée)

Demandée par l'utilisateur le 27/10/2026 (retour de test de William) : simplification de l'interface, législatives interactives avec alliances, hémicycle lisible et dynamique du mandat, actions du chef de l'État plus variées, photo du candidat personnalisé et portraits des figures qui n'en ont pas. Contraintes inchangées : moteur pur, tout effet par les registres (ressources, économie), aucune donnée officielle inventée, aucun nom de député ni vote individuel attribué à un député réel, aucun propos ni aucune citation prêtés à une personne réelle, interface sans calcul d'état.

Décisions de conception (révisables) :
- **Simplification** : la navigation à plat de la phase 12 (APK 1.4.0 : cinq espaces, sections dépliables, détails en tiroir) répond déjà au retour sur les sous-menus. La phase 13 ajoute en tête de l'espace Pouvoir une **vue du mandat** toujours visible (hémicycle, majorité, tension parlementaire, prochain vote clé, gouvernement et effets de ses ministres, indicateurs) et, au QG pendant la présidence, des tuiles « Majorité » et « Tension ». Plus de volet dans une section dépliée de l'espace Pouvoir (détail dans le détail) : le contenu court s'affiche, la liste longue s'ouvre en tiroir ; de même pour les paramètres techniques du QG et les résultats par groupe d'électeurs. Les volets propres à un élément d'une liste (fiche d'un sondage ou d'un candidat, semaine du journal, domaine du programme, bilan détaillé des adversaires) restent repliables, pour garder des pages courtes.
- **Hémicycle** : couleurs des groupes = **convention du jeu**, pas des couleurs officielles (rouge LFI-NFP, rouge sombre GDR, rose SOC, vert EcoS, jaunes du centre EPR, Dem, HOR, bleu DR, bleu marine RN, bleu-violet UDR, gris LIOT et non-inscrits) ; jamais seules (légende chiffrée, infobulle, tableau). **Groupe du joueur** : celui de sa personnalité réelle (table de rattachement) ou, à défaut, le groupe le plus proche de son positionnement (convention du jeu, affichée comme telle) ; ses sièges sont cerclés d'un liseré lumineux. Jauge de **majorité** : majorité des membres de l'Assemblée (289 quand les 577 sièges sont pourvus, 288 avec les trois sièges vacants de 2026). Jauge de **tension parlementaire** (0 à 100) calculée par le moteur avec ses facteurs.
- **Tension parlementaire** (hypothèses du jeu de règles) : part de l'opposition, absence de majorité, impopularité du président, engagements de responsabilité (49.3) de la session, frondeurs, motions récentes, coalition (−), apaisement après un discours devant le Congrès, une commémoration ou un sommet (−, décroissant). Effets : propension à censurer, coût du 49.3 (popularité et tensions sociales, majorés avec la tension), **motions de censure spontanées** (art. 49 al. 2) au-delà d'un seuil, au plus trois par session ordinaire (chaque député ne peut signer plus de trois motions par session, art. 49 al. 2).
- **Frondeurs** : nombre de députés des groupes qui soutiennent le président (jamais de nom) votant contre un texte, selon l'éloignement du texte, l'impopularité, la tension et la compétence du ministre concerné ; une fronde de fond par groupe monte après un 49.3 et baisse après une réunion de la majorité ou un discours devant le Congrès. Nouveau choix sur un texte incertain : **négocier avec les frondeurs** (moins d'effet perdu qu'une concession à tous les groupes).
- **Opposition** : aux **votes clés** (projection serrée, 49.3, motion de censure), le premier groupe d'opposition intervient (simulé) et pèse sur les groupes non alignés. Il n'est mené par une personne nommée que si un candidat **fictif** battu de la partie en est proche ; sinon l'intervention est celle du groupe. Aucune personnalité réelle ni aucun député réel n'est mis en scène, aucun propos n'est rapporté.
- **Ministres** : chaque poste couvre des domaines du programme et des indicateurs (table du jeu de règles). La compétence du ministre (écart à 0,5) donne un bonus ou un malus de soutien aux textes de ses domaines, un effet hebdomadaire sur ses indicateurs et module les actions du président qui relèvent de son poste. Formules dans `@r2027/shared`, employées à l'identique par le moteur et par l'affichage.
- **Législatives vivantes** : quand des législatives sont annoncées (dissolution ou fin de législature), le joueur (son camp) choisit une **stratégie d'alliance** avec un autre bloc : **investitures communes** (un candidat commun, une part des voix du partenaire reportée), **désistements réciproques** (au second tour, le moins bien placé des alliés se retire), **front républicain** (désistement contre le bloc d'extrême droite) ou aucune ; acceptation du partenaire simulée selon la proximité ; les autres blocs suivent une règle de l'IA. Après un second tour sans majorité : **coalition** (les groupes du bloc partenaire soutiennent le président, au prix de frondeurs plus nombreux) ou gouvernement minoritaire. Pendant la campagne, chaque déplacement du président dans un département y **mobilise** son camp (bonus local, hypothèse). Carte : législatives simulées (premier tour, second tour) et législatives 2024 (officiel) au niveau du département — bloc en tête, sièges par bloc, fiche avec les circonscriptions — et **dépouillement rejouable** département par département (sans animation si le mouvement réduit est demandé). Aucune projection de sièges n'est montrée avant le vote.
- **Actions du chef de l'État** (jeu de règles 14.0.0) : visite d'usine, visite de CHU, déplacement en région (existant), sommet de crise à l'Élysée (après une crise récente), négociation avec les partenaires sociaux à l'Élysée, discours devant le Parlement réuni en Congrès à Versailles (art. 18 ; fréquence : hypothèse de jeu), commémoration nationale, panthéonisation (figure non nommée). Effets sur les ressources, l'économie (registre), la tension et la fronde ; délai minimal entre deux usages ; le président IA les emploie.
- **Portraits** : photo importée à la création d'un candidat personnalisé, recadrée et réduite sur l'appareil (carré de 256 px), contrôlée par le serveur (type, taille, signature du fichier), conservée dans l'état de la partie (export et import compris). Portraits **illustrés générés** (SVG déterministe, style dessiné, aucune ressemblance recherchée) pour les adversaires fictifs, les profils fictifs du gouvernement et le candidat personnalisé sans photo. Figure réelle sans photo libre : silhouette neutre et initiales — **aucun visage généré pour une personne réelle** ; nouvelle recherche de photos libres sur Wikimedia Commons si l'accès le permet.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P13-01 | Schémas, jeu de règles 14.0.0 (actions, tension, frondeurs, alliances, thèmes ministériels, art. 18 sourcé), format de sauvegarde 17 et migration 16 → 17. | schémas et jeu de règles validés (empreintes) ; migration 16 → 17 testée ; règles officielles citées dans SOURCES.md, le reste étiqueté hypothèse. |
| P13-02 | Moteur : tension parlementaire, frondeurs, interventions de l'opposition, motions spontanées, coût du 49.3, effets thématiques des ministres. | chaque effet par un registre, avec ses facteurs ; tests du moteur (déterminisme, bornes, cas limites) ; aucun député ni aucune personne réelle mis en scène (test). |
| P13-03 | Moteur : actions présidentielles élargies (délais, conditions, économie, tension, fronde) et président IA. | rejet motivé (délai, condition) ; effets par les registres ; l'IA les emploie (tests). |
| P13-04 | Moteur : législatives vivantes (investitures communes, désistements, front républicain, coalition, mobilisation). | tests de chaque mécanisme et du déterminisme ; décisions du joueur ; règle de l'IA. |
| P13-05 | API et moteur local : création avec photo (contrôles), nouvelles décisions ; mêmes schémas et codes d'erreur. | tests d'intégration et du moteur local ; photo refusée si type, taille ou signature invalides. |
| P13-06 | Interface : vue du mandat, hémicycle (couleurs, liseré du joueur, frondeurs), jauges, textes et votes, législatives et alliances, carte des législatives, nouvelles actions, portraits générés, import de photo. | tests de composants ; e2e bureau et mobile ; axe-core ; aucun calcul d'état dans le navigateur. |
| P13-07 | Documentation, e2e, essai hors ligne, APK 1.5.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK construit en local. |

Avancement (28/10/2026, branche `claude/new-session-lmxg1t`) :
- **P13-01 faite** — jeu de règles `presidentielle-2027@14.0.0` (actions du chef de l'État, `parlement.tension`, `parlement.frondeurs`, `parlement.opposition`, `legislatives.alliances`, thèmes des postes ministériels, art. 18 et usage du Panthéon cités) ; format de sauvegarde **17** et migration 16 → 17, testée sur un état réel du format 16 produit par le moteur de la phase 12 (`v16-phase-12.json` : président IA, gouvernement de figures réelles, textes votés ; partie poursuivie six semaines avec le jeu de règles 14) et sur les états réels des formats 2 à 15 ; moteur 0.16.0.
- **P13-02 faite** — tension parlementaire (somme exacte de facteurs nommés, recalculée en fin de semaine), frondeurs par groupe (nombres, jamais de nom ; fronde de fond accrue par un 49.3, jamais négative), négociation avec les frondeurs, intervention de l'opposition aux votes clés **comptée dans la projection** du gouvernement (`projectVote`), motions de censure spontanées (au plus trois par session), coût du 49.3 majoré par la tension, effets de domaine des ministres par les registres ; décisions sur les textes actualisées en fin de semaine (`refreshBillDecisions`). Tests du moteur : déterminisme, bornes, cas limites, aucun député ni aucune personne réelle mis en scène.
- **P13-03 faite** — huit actions du chef de l'État (visite d'usine, visite de CHU, sommet de crise, négociation sociale, discours devant le Congrès, réunion de la majorité, commémoration, panthéonisation) : délais (`quinquennat.usages`), condition « crise récente », rejet motivé, effets sur les ressources, l'économie, la tension et la fronde, modulation par le ministre du poste ; le président IA les emploie (tests).
- **P13-04 faite** — campagne des législatives (stratégie d'alliance du camp du joueur, décision avec option par défaut ; règle de l'IA pour les autres blocs, **aucun accord de l'IA avec le bloc visé par le front républicain**, convention écrite dans le jeu de règles), investitures communes, désistements réciproques, front républicain, mobilisation par les déplacements, coalition après un second tour sans majorité ; tests de chaque mécanisme et du déterminisme, test d'intégration de la dissolution.
- **P13-05 faite** — création de partie avec photo (API et moteur local : mêmes schémas, mêmes codes d'erreur ; photo refusée si son type, sa taille ou la signature du fichier ne conviennent pas) ; le journal des événements ne garde que la présence d'une photo (`candidateForJournal`) ; nouvelles décisions servies par les deux transports.
- **P13-06 faite** — vue du mandat en tête de l'espace Pouvoir ; hémicycle par groupe (couleurs de convention, liseré lumineux du groupe du joueur, sièges évidés des frondeurs, intervalles et sigles) ; jauges de majorité et de tension ; tuiles du QG ; Parlement (frondeurs, interventions, motions, coalition), sans second hémicycle quand la vue du mandat est affichée ; législatives (campagne, accords) ; carte des législatives par bloc avec fiche et dépouillement rejouable ; fiches des nouvelles actions ; portraits illustrés générés, silhouette pour une personnalité réelle sans photo libre ; import de la photo (recadrage, réduction, encodage sur l'appareil) ; volets imbriqués de l'espace Pouvoir aplatis. Tests de composants, e2e bureau et mobile, axe-core. Revue visuelle sur ordinateur et téléphone (dates des accords en toutes lettres après correction).
- **P13-07 faite** — documentation (ce plan, SOURCES §8 decies, MODELE_DONNEES format 17, ARCHITECTURE, README), e2e et essai hors ligne, application **1.5.0** (`versionCode` 6).

**Bilan (28/10/2026)** — les sept tâches sont réalisées : jeu de règles 14.0.0, format de sauvegarde 17, moteur 0.16.0, application 1.5.0.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | sans erreur ; 612 tests réussis (560 à la fin de la phase 12) |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 95 tests réussis |
| `pnpm test:e2e` (Playwright, bureau + mobile Pixel 7) | 57 tests réussis, 3 ignorés (essais propres au téléphone, sautés sur le projet bureau) ; audits axe-core sans violation, vue du mandat comprise |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | 1 test réussi |
| APK 1.5.0 de débogage | construit localement (JDK 21, SDK Android 36) : `versionCode` 6, aucune permission réseau, 6,1 Mo |
| CI GitHub et essai sur émulateur | **non exécutés** : GitHub Actions reste bloqué au niveau du compte (les tâches du commit 6d2fdae échouent sans qu'aucun exécuteur leur soit attribué), et l'utilisateur ne souhaite pas modifier son budget ; pas d'émulateur dans l'environnement de développement (pas de KVM) |

Écarts et limites :
- **Calibrage** : tension, frondeurs, interventions de l'opposition, motions spontanées, effets des ministres, actions du chef de l'État, accords et mobilisation sont des hypothèses du jeu de règles 14.0.0 (§8 decies de SOURCES), bornées par les tests, non mesurées sur des données réelles (R-50).
- **Volets restants** : seuls les volets imbriqués dans les sections de l'espace Pouvoir, les paramètres techniques du QG et les résultats par groupe d'électeurs sont aplatis ; les volets propres à un élément d'une liste (fiche d'un sondage ou d'un candidat, semaine du journal, domaine du programme, bilan détaillé des adversaires) restent repliables, à revoir après un nouveau test de jeu.
- **Couleurs des groupes** : imposées par la demande (rouge, rose, vert, jaune, bleu, bleu marine) ; le validateur de palette signale encore des écarts de clarté (gris de LIOT et des non-inscrits, bleu marine du RN en mode clair, jaunes du centre), compensés par la légende chiffrée, les sigles, le tableau et les intervalles entre groupes : la couleur n'est jamais seule.
- **Portraits** : trois figures du gouvernement restent sans photo libre (licences GFDL seule ou « European Parliament » non retenues) ; nouvelle recherche impossible depuis l'environnement (API Wikimedia : réponse 429). Aucun visage n'est généré pour une personne réelle.
- **Carte des législatives** : au niveau du département seulement (bloc en tête, sièges, fiche avec les circonscriptions) ; pas de contours de circonscriptions (licence du fichier INSEE à vérifier, §9 de SOURCES).
- **Opposition** : son intervention n'est menée par une personne que si un candidat fictif en est proche ; sinon c'est celle du groupe, sans aucun nom ni propos.
- **Essai sur appareil** : mise en page vérifiée dans Chromium (bureau, Pixel 7), pas sur un téléphone ni un émulateur Android.


### Phase 14 — Personnalités réelles en nombre, expertise ministérielle, figures des blocs (terminée)

Demandée par l'utilisateur le 28/10/2026 : « augmenter significativement le nombre de personnalités politiques présentes avec leurs photos pour tous, pour plus de réalisme pour les ministères, législatives, etc. », « trouver des idées pour améliorer le jeu » et retirer du pied de page la ligne « Hors ligne ». Contraintes inchangées : aucune donnée officielle inventée (fonctions relevées dans les sources, compétence estimée par une méthode documentée, popularité prêtée = hypothèse), photos sous licence libre créditées, aucun propos ni aucune citation attribués, nominations et refus simulés ; Assemblée inchangée (votes par groupe, aucun nom de député dans les groupes ni dans les votes), législatives sans nom de candidat par circonscription.

Décisions de conception (révisables) :
- **Vivier élargi** : de 22 à au moins 60 personnalités réelles nominables. Sélection éditoriale documentée : membres du gouvernement en fonction rattachés à un parti (composition de l'article « Gouvernement Lecornu II », révision 240680163), anciens Premiers ministres et ministres encore actifs couvrant chaque ministère du jeu, dirigeants nationaux et présidents de groupe (Assemblée et Sénat) des partis représentés à l'Assemblée ; hors candidats déclarés à la présidentielle (acteurs de la partie). Même méthode d'import (infobox de Wikipédia, Wikidata, CHES, Commons) ; une fiche qui ne passe pas les contrôles est **écartée avec son motif** (liste publiée) au lieu de faire échouer tout l'import.
- **Photos pour tous** : toutes les photos de Wikidata (P18) sont essayées, puis les fichiers de la catégorie Commons de la personne (P373) dont le titre porte son nom ; seule une licence libre reconnue est acceptée (auteur et licence affichés) ; chaque photo retenue est revue. À défaut, silhouette et initiales, motif affiché. Aucun visage généré pour une personne réelle.
- **Expertise ministérielle** : chaque fonction ministérielle, passée ou présente, relevée dans l'infobox donne une expertise sur un poste du jeu (table de mots-clés du jeu de règles). Compétence sur un poste = compétence estimée + bonus d'expertise (hypothèses : ministre du domaine, secrétaire d'État ou ministre délégué du domaine ; plafonds). Formule dans `@r2027/shared`, employée à l'identique par le moteur et l'affichage.
- **Ministères** : tous les ministères sont ouverts aux personnalités réelles ; le Premier ministre (IA) place chacune là où elle est la plus experte, les profils fictifs ne comblant que les postes restants. Le président joueur garde ses choix (Matignon, ministères régaliens), présentés avec l'expertise de chacun.
- **Législatives** : « figures des blocs » — pour chaque bloc, les personnalités réelles de ses partis (dirigeants, ministres, présidents de groupe, candidats à la présidentielle) avec photo et fonction, dans l'écran Législatives et la décision d'alliance. Information sourcée seulement : aucune candidature ni aucun propos prêtés.
- **Pied de page** : sur l'application Android, la ligne « Hors ligne · moteur … sur l'appareil » disparaît ; seuls un démarrage en cours ou une panne du moteur local s'affichent. Avertissement de stockage et rappel de simulation conservés.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P14-01 | Importeur : sélection élargie, contrôles par fiche (fiches écartées avec motif), lots d'articles, reprise selon `Retry-After`, photos de repli (toutes les P18, catégorie Commons), libellés à plusieurs lignes lisibles. | tests de l'importeur ; import réel ; ≥ 60 figures ; une photo libre pour chacune ou un motif ; revue visuelle des photos ; SOURCES à jour. |
| P14-02 | Jeu de règles 15.0.0 (table d'expertise, paramètres), format de sauvegarde 18 et migration 17 → 18. | empreintes vérifiées ; migration testée sur un état réel du format 17 ; références des figures existantes conservées. |
| P14-03 | Moteur : compétence par poste, composition du gouvernement par expertise, tous ministères ouverts, IA. | tests (expertise, composition, déterminisme, aucun propos attribué). |
| P14-04 | Interface : vivier (recherche, filtres par parti et par ministère), expertise affichée (gouvernement, décisions, vue du mandat), figures des blocs aux législatives, pied de page. | tests de composants ; e2e bureau et mobile ; axe-core ; aucun calcul d'état dans le navigateur. |
| P14-05 | Idées d'amélioration du jeu : liste chiffrée (valeur, effort) soumise à l'utilisateur. | liste dans ce plan et dans le compte rendu. |
| P14-06 | Documentation, e2e, essai hors ligne, APK 1.6.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK construit en local. |

Avancement (28/10/2026, branche `claude/new-session-lmxg1t`) :
- **P14-01 faite** — sélection d'environ 120 personnes : **108 fiches retenues**, toutes avec une photo sous licence libre, **12 écartées** avec leur motif (aucun parti dans l'infobox, parti non suivi par le jeu, personne décédée) au lieu de faire échouer l'import. Parti lu dans le champ `parti` de l'infobox (`gouvernement/party.ts`), Wikidata réduit à l'identifiant, aux photos (P18), à la catégorie Commons (P373) et au décès (P570) (`gouvernement/wikidata.ts`) ; licences par l'API `imageinfo` de Commons par lots, reprise selon `Retry-After`, photos de repli (toutes les P18, puis la catégorie Commons) et motif de chaque choix (`gouvernement/photos.ts`) ; 18 photos choisies à la main après revue d'une planche contact (scène de groupe, plan large ou en pied) ; libellés de fonctions sur plusieurs lignes lus en une phrase ; présidence de la République reconnue. Tests de l'importeur (réponses synthétiques au format des sources).
- **P14-02 faite** — jeu de règles `presidentielle-2027@15.0.0` (table d'expertise par poste, bonus et plafond, `ministresActeursMax` 10, empreinte des fiches) ; format de sauvegarde **18** et migration 17 → 18, testée sur un état réel du format 17 (`v17-phase-13.json` : président IA, gouvernement de figures réelles, semaine 49) ; une sauvegarde citant une personnalité absente du vivier est refusée ; moteur 0.17.0.
- **P14-03 faite** — expertise et compétence sur un poste dans `@r2027/shared` (`expertise.ts`), employées par le moteur partout où la compétence d'un ministre compte (équipe, crises, textes, actions, domaines) ; composition du gouvernement par expertise (choix glouton déterministe, indépendant de l'ordre des fiches, aucun expert laissé de côté quand son domaine revient à un non-expert) ; décisions de nomination qui présentent d'abord les experts du poste ; fonction principale signalée « fonction passée » quand elle a pris fin (règle partagée `figureMainFunction`). Tests du moteur.
- **P14-04 faite** — barre de filtres du vivier (recherche, parti, ministère d'expertise) dans le tiroir « Personnalités nominables » et dans les décisions de nomination (groupes repliés non rendus) ; portrait de chaque option ; compétence « sur ce poste » et fonction qui fonde l'expertise (écran Gouvernement, options, vue du mandat) ; figures des blocs (écran Législatives, options d'accord électoral) ; pied de page de l'application Android sans la ligne « Hors ligne · moteur … sur l'appareil » ; barre « Résoudre la semaine » compacte sur téléphone (218 px de haut sur un écran de 839 px pendant le mandat, 137 px après correction : le sélecteur d'avance rapide s'étirait sur toute la largeur). Tests de composants, e2e bureau et mobile (`vivier.spec.ts`) avec axe-core, revue visuelle au format Pixel 7 (nominations filtrées, gouvernement, vivier, figures des blocs, accords).
- **P14-05 faite** — idées ci-dessous, soumises à l'utilisateur.
- **P14-06 faite** — documentation (ce plan, SOURCES §8 undecies, MODELE_DONNEES format 18, ARCHITECTURE, README, apps/mobile/README), e2e et essai hors ligne, application **1.6.0** (`versionCode` 7).

**Idées d'amélioration du jeu (P14-05)** — valeur pour le joueur et effort estimés, à arbitrer par l'utilisateur ; aucune n'est commencée. Contraintes de CLAUDE.md rappelées quand elles pèsent.

| # | Idée | Ce que le joueur y gagne | Valeur | Effort | Contraintes |
|---|---|---|---|---|---|
| I1 | **Remaniement ciblé** : remplacer un seul ministre (poste, personnalité, refus possible) au lieu de tout le gouvernement | tirer parti du vivier et de l'expertise en cours de mandat ; répondre à une crise par une nomination | haute | faible | refus simulés ; aucun propos |
| I2 | **Objectifs de mandat et note finale** : trois à cinq objectifs tirés du programme (chômage, dette, réformes adoptées, popularité), suivis dans la vue du mandat, notés au bilan | un but clair et une raison de rejouer | haute | moyen | objectifs = paramètres de jeu étiquetés, jamais des prévisions |
| I3 | **Tutoriel guidé** : les deux premières semaines accompagnées (actions, décisions, résolution, lecture du bilan) | prise en main plus rapide pour un nouveau joueur | haute | moyen | — |
| I4 | **Intégrer les 13 candidatures déclarées non retenues** (Bernard Cazeneuve, Florian Philippot, Natacha Polony…) avec une position `hypothese` documentée | plus de réalisme au premier tour | moyenne à haute | faible | position étiquetée hypothèse ; nouvelle version du jeu de règles ; photos libres ou initiales |
| I5 | **Usure et popularité des ministres** : popularité prêtée qui évolue (crises gérées, textes adoptés, durée), démission simulée d'un ministre très usé | un gouvernement vivant, des remaniements motivés | moyenne à haute | moyen | popularité prêtée = hypothèse, jamais un sondage ; aucun propos ni scandale prêtés à une personne réelle |
| I6 | **Déplacements du président choisis sur la carte** : toucher un département pour y programmer un déplacement, trace des déplacements du mandat | la carte devient un outil de jeu pendant le mandat | moyenne | moyen | effets par les registres |
| I7 | **Conseil des ministres hebdomadaire** : chaque semaine, deux ou trois propositions de ministères (textes, mesures fictives) à arbitrer | des choix de gouvernement plus fréquents et plus lisibles | moyenne | moyen | mesures fictives étiquetées |
| I8 | **Mode défi** : scénarios à objectif fixé, graine imposée et classement local (ex. gagner sans parrainages d'avance, tenir une majorité relative) | rejouabilité, parties courtes | moyenne | faible à moyen | — |
| I9 | **Succès** débloqués en jeu (premier 49.3 évité, coalition formée, réélection…) | motivation, découverte des mécaniques | moyenne | faible | — |
| I10 | **Sénat par groupes** (effectifs réels, sans nom) au lieu de l'accord tiré au sort | navette parlementaire réaliste | moyenne | élevé | import sourcé des effectifs ; aucun nom ni vote individuel de sénateur |
| I11 | **Primaire ou investiture du parti** avant la campagne | un début de partie plus politique | moyenne | élevé | candidats fictifs ou personnalités déclarées seulement |
| I12 | **Sons** de la soirée électorale et des résultats (désactivables) | ambiance | faible à moyenne | faible | sans vibreur : il demanderait une permission Android supplémentaire |

Recommandation : un premier lot I1 + I2 + I4 (valeur haute, effort faible à moyen, appuyé sur les données déjà en place), puis I3.

**Bilan (28/10/2026)** — les six tâches sont réalisées : jeu de règles 15.0.0, format de sauvegarde 18, moteur 0.17.0, application 1.6.0.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | sans erreur ; 641 tests réussis (612 à la fin de la phase 13) |
| `pnpm test:integration` (API + PostgreSQL 16 réel) | 95 tests réussis |
| `pnpm test:e2e` (Playwright, bureau + mobile Pixel 7) | 59 tests réussis, 3 ignorés (essais propres au téléphone, sautés sur le projet bureau) ; audits axe-core sans violation, tiroir du vivier filtré et figures d'un bloc compris |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | 1 test réussi |
| APK 1.6.0 de débogage | construit localement (JDK 21, SDK Android 36) : `versionCode` 7, aucune permission réseau, 6,9 Mo (108 photos du vivier comprises, 1,1 Mo) |
| CI GitHub et essai sur émulateur | **non exécutés** : GitHub Actions reste bloqué au niveau du compte et l'utilisateur ne souhaite pas modifier son budget ; pas d'émulateur dans l'environnement de développement (pas de KVM) |

Écarts et limites :
- **Infobox de Wikipédia** : fonctions et partis sont ceux de la révision importée, sans correction manuelle ; une infobox en retard ou en avance sur l'actualité se retrouve dans le jeu (Gérald Darmanin figure « Sans étiquette » parce que son infobox clôt ses appartenances à Renaissance et à Populaires en 2025). Une réimportation impose une nouvelle version du jeu de règles.
- **« Sans étiquette »** (trois fiches) : position du dernier parti suivi quitté (`hypothese`), aucun groupe ; elles n'apportent le soutien d'aucun groupe au gouvernement.
- **Fiches écartées** : les membres du gouvernement sans parti dans leur infobox (Jean-Pierre Farandou, Monique Barbut, Serge Papin, Édouard Geffray, Philippe Baptiste, Alice Rufo, Michel Fournier) et ceux d'un parti non suivi par le jeu (UDI, Les Centristes, Régions et peuples solidaires, indépendants) ne sont pas nominables ; François Patriat est écarté (décès indiqué par Wikidata). Liste et motifs dans Paramètres → Crédits.
- **Expertise par mots-clés** : la table rattache un libellé de fonction à un poste par des mots-clés (hypothèse) ; un rattachement discutable reste possible (le numérique compte pour Bercy) et seules les fonctions de ministre, de secrétaire d'État ou de ministre délégué comptent (pas une présidence de commission). Bonus (+ 0,10, + 0,05, plafond 0,95) non calibrés (R-50).
- **Taille de l'état** : la semaine où les cinq décisions de nomination des ministères régaliens sont en attente (119 options chacune), l'état d'une partie passe d'environ 250 Ko à environ 416 Ko (descriptions des options) ; il reste sous la limite d'import de 1 Mo et redescend une fois les décisions prises.
- **Photos** : 18 choisies à la main après revue d'une planche contact ; auteurs repris tels que les donnent les métadonnées de Commons (un libellé garde la mention « talk · contribs » du fichier).
- **Essai sur appareil** : mise en page vérifiée dans Chromium (bureau, Pixel 7), pas sur un téléphone ni un émulateur Android.


### Phase 15 — Pré-campagne dynamisée, ministres vivants, Conseil des ministres, QAG, objectifs et succès (terminée)

Demandée par l'utilisateur le 28/10/2026 : idées I1 (remaniement ciblé), I2 (objectifs de mandat et note finale), I5 (usure et popularité des ministres), I6 (déplacements choisis sur la carte) et I9 (succès), plus : dynamiser la pré-campagne (parrainages des élus, négociations de soutien ou de ralliement avec les personnalités du jeu, orientation stratégique initiale du mouvement), pop-ups d'urgences ministérielles avec la photo du ministre et des choix binaires, Conseil des ministres hebdomadaire (loyauté, popularité, actions du gouvernement), questions au gouvernement (QAG) en direct, et conserver la page unique à accordéons et la lisibilité de l'hémicycle. Contraintes inchangées : moteur pur, effets par les registres, aucune donnée officielle inventée, aucun propos ni aucune citation prêtés à une personne réelle, aucun nom de député ni vote individuel, nominations, refus, soutiens et départs simulés et étiquetés, interface sans calcul d'état.

Décisions de conception (révisables ; tous les paramètres sont des hypothèses du jeu de règles 16.0.0, sauf les règles citées) :
- **Orientation stratégique** (création de partie, joueur candidat) : rassembler au-delà de son camp, mobiliser son camp, s'appuyer sur les élus locaux, mouvement numérique, candidature de rupture. Chacune modifie les ressources et les promesses de parrainage de départ et donne une **base électorale de départ** : un facteur du score latent dans certains groupes d'électeurs, qui décroît jusqu'à s'éteindre après une durée fixée.
- **Course aux parrainages** : panneau dédié au QG (présentations comptées, départements, rivaux, compte à rebours) ; **rendez-vous d'élus** pendant la course aux parrainages (jusqu'à la semaine qui précède la clôture des présentations) : une délégation d'élus d'un département (anonyme, fictive) propose des promesses de parrainage ; choix binaire (la recevoir : promesses dans la limite des élus libres, heures réservées sur la semaine ; décliner).
- **Négociations de soutien** : action de campagne « négocier le soutien d'une personnalité » (une des 108 figures réelles), avec ou sans promesse d'un ministère ; acceptation simulée (proximité, rapport de forces, contrepartie) ; une personnalité ne soutient qu'un candidat et refuse si un candidat de son parti est en lice ; le soutien pèse sur le vote des groupes proches de sa position et sur les ressources. Un ministère promis place la personnalité en tête des propositions à l'investiture ; une promesse non tenue coûte de la popularité. Les candidats de l'IA négocient aussi, selon les mêmes règles (au plus une fois toutes les trois semaines, seulement quand l'accord est probable). Ralliements des candidats : inchangés.
- **Ministres vivants** (I5) : chaque membre du gouvernement a une **popularité prêtée** (hypothèse, jamais un sondage) et une **loyauté** envers le président (de 0 à 100), chacune avec ses facteurs (usure au poste, gestion des crises et des urgences de son domaine, textes adoptés ou rejetés, popularité du président) ; sous des seuils, un **départ simulé** devient possible (motif neutre : usure ou loyauté, aucun propos ni scandale prêtés) et le poste est repourvu.
- **Remaniement ciblé** (I1) : action du président « remplacer un ministre » (cible : un ministère) ; la décision de nomination de ce seul poste suit, experts en tête ; délai entre deux emplois.
- **Urgences ministérielles** : bibliothèque d'urgences sectorielles fictives (grève, pénurie, incendies, cyberattaque, tensions diplomatiques…) rattachées à un ministère ; au plus une par semaine ; **pop-up** avec la photo et le nom du ministre en charge (nomination simulée, aucun propos) et deux choix à effet direct (popularité du président, déficit, tensions sociales, popularité et loyauté du ministre) ; le président IA retient le choix par défaut.
- **Conseil des ministres** : compte rendu hebdomadaire produit par le moteur (Constitution, art. 9 : le président préside le Conseil des ministres ; rythme hebdomadaire : usage) : pour chaque ministre, popularité et loyauté avec leur variation, faits de la semaine (effets de son domaine, crises, urgences) ; nouvelle section de l'espace Pouvoir et temps fort du débriefing.
- **Questions au gouvernement** : chaque semaine de session ordinaire (art. 48 : une séance par semaine au moins réservée aux questions des parlementaires et aux réponses du gouvernement), un **groupe d'opposition** (jamais un député nommé) interpelle le gouvernement sur un thème de la semaine ; trois répliques (répondre sur le fond, annoncer une mesure, contre-attaquer) ; effets sur la **tension parlementaire** (facteur nommé, décroissant) et la popularité du président, modulés par la compétence du ministre du thème ; présentation « en direct » (hémicycle, groupe qui interpelle) ; aucun propos prêté à une personne réelle. La séance est **facultative** : sans réponse, le gouvernement répond sur le fond (option par défaut, signalée comme automatique), et l'avance rapide ne s'y arrête pas (sinon elle s'arrêterait chaque semaine de session).
- **Objectifs de mandat** (I2) : à la formation du premier gouvernement, quatre objectifs tirés du programme et de la situation de départ (chômage, déficit, réformes adoptées, popularité, absence de censure…), suivis dans la vue du mandat ; **note finale** sur 20 et mention au bilan du quinquennat. Cibles = paramètres de jeu, jamais des prévisions.
- **Succès** (I9) : dix-huit succès débloqués une fois par partie (parrainages, soutiens, élection, gouvernement d'experts, QAG, crises, objectifs, réélection…), annoncés au débriefing ; section du QG.
- **Déplacements sur la carte** (I6) : pendant le mandat, la fiche d'un département propose de programmer un déplacement (terrain, usine, CHU) dans le plan de la semaine ; la carte montre la trace des déplacements du mandat.
- **Continuité** : page unique à accordéons ; hémicycle inchangé (couleurs de convention des groupes, liseré lumineux du groupe du joueur, jauge de majorité à 289 sièges quand les 577 sont pourvus, jauge de tension), vérifié par les tests.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P15-01 | Schémas, jeu de règles 16.0.0 (orientations, rendez-vous d'élus, soutiens, ministres vivants, remaniement ciblé, urgences, QAG, objectifs, succès ; art. 9 et 48 cités), format de sauvegarde 19 et migration 18 → 19. | schémas et jeu de règles validés (empreintes) ; migration testée sur un état réel du format 18 et sur les formats 2 à 17 ; règles officielles citées dans SOURCES, le reste étiqueté hypothèse. |
| P15-02 | Moteur, pré-campagne : orientation stratégique, base électorale de départ, rendez-vous d'élus, négociations de soutien (contrepartie, promesse de ministère). | tests : déterminisme, facteurs nommés et décroissance, promesses dans la limite des élus libres et de la période, une personnalité pour un candidat, aucun propos attribué, ministre promis en tête à l'investiture. |
| P15-03 | Moteur, mandat : ministres vivants et départs, remaniement ciblé, urgences ministérielles, compte rendu du Conseil des ministres, QAG, objectifs et note, succès, trace des déplacements ; président IA. | tests : bornes et facteurs, départ seulement sous les seuils et poste repourvu, délais, au plus une urgence par semaine, QAG seulement en session ordinaire et par un groupe, effets par les registres, note au bilan, succès débloqués une fois, déterminisme. |
| P15-04 | API et moteur local : création avec orientation, nouvelles décisions et actions ; mêmes schémas et codes d'erreur. | tests d'intégration et du moteur local. |
| P15-05 | Interface : orientation à la création, course aux parrainages, négociations (vivier filtré), pop-ups (urgences avec photo, QAG en direct, rendez-vous d'élus), Conseil des ministres, objectifs et note, succès, carte (déplacement, trace), remaniement ciblé. | tests de composants ; e2e bureau et mobile ; axe-core ; aucun calcul d'état dans le navigateur ; hémicycle et accordéons non régressés. |
| P15-06 | Documentation, e2e, essai hors ligne, APK 1.7.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK construit en local. |

Avancement (29/10/2026, branche `claude/new-session-lmxg1t`) :
- **P15-01 faite** — jeu de règles `presidentielle-2027@16.0.0` (orientations, rendez-vous d'élus, négociations, suivi des ministres, remaniement ciblé, douze urgences fictives, questions au gouvernement, objectifs, dix-huit succès ; art. 9 et 48 cités d'après Wikipédia, SOURCES §8 duodecies) ; format de sauvegarde **19** et migration 18 → 19, testée sur un état réel du format 18 (`v18-phase-14.json`) et sur les formats 2 à 17 ; moteur 0.18.0.
- **P15-02 faite** — orientation stratégique (moyens et promesses de départ, base électorale de départ, facteur nommé qui s'éteint en 26 semaines), rendez-vous d'élus (délégation fictive et anonyme, promesses dans la limite des élus libres, heures réservées avant les actions par une règle partagée avec l'interface), négociations de soutien (refus d'office sans coût, issue tirée, soutien qui pèse sur le vote, ministère promis placé au premier gouvernement, promesse non tenue coûteuse) ; négociations de l'IA.
- **P15-03 faite** — Conseil des ministres à chaque semaine du mandat (popularité prêtée et loyauté par facteurs nommés, faits, départs simulés et remplaçant proposé), remaniement ciblé (joueur et IA), urgences ministérielles, séances de questions au gouvernement (échauffement de l'hémicycle, facteur de la tension), objectifs et note du mandat au bilan, succès, déplacements tracés par département ; décisions facultatives (`isOptionalDecision`, règle commune au moteur, à l'API, au moteur local et à l'interface).
- **P15-04 faite** — création avec `orientationId`, route `GET /api/games/:id/soutiens` (même contrat et mêmes codes d'erreur dans `@r2027/local-api`), avance rapide qui ne s'arrête plus sur une décision facultative ; tests d'intégration et du moteur local.
- **P15-05 faite** — orientation à la création, panneau « Course aux parrainages », carte « Soutiens et ralliements » et vivier de la négociation (accords exclus désactivés, probabilité servie par l'API), pop-ups d'intervention (urgence avec la photo du ministre en charge ; séance « en direct » avec l'hémicycle où le groupe qui interpelle reste en pleine couleur et les autres s'estompent, jauge de tension ; rendez-vous d'élus à la demande), section « Conseil des ministres » (popularité prêtée, loyauté, facteurs du dernier compte rendu), objectifs et note provisoire dans la vue du mandat (la mention n'est donnée qu'au bilan), note finale au bilan, succès au QG et au débriefing, classement de la course aux parrainages avec son critère de départage (promesses et intentions en réserve), déplacement programmé depuis la fiche d'un département et trace sur la carte, remaniement ciblé dans l'agenda. Tests de composants (`precampagne.test.tsx`, `institutions.test.tsx`), e2e bureau et mobile avec axe-core (`precampagne.spec.ts`, `institutions.spec.ts`), revue visuelle au format Pixel 7.
- **P15-06 faite** — documentation (ce plan, SOURCES §8 duodecies, MODELE_DONNEES format 19, ARCHITECTURE, README, apps/mobile/README), e2e, essai hors ligne, application **1.7.0** (`versionCode` 8).

**Bilan (29/10/2026)** — les six tâches sont réalisées : jeu de règles 16.0.0, format de sauvegarde 19, moteur 0.18.0, application 1.7.0.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | sans erreur ; 707 tests réussis (641 à la fin de la phase 14) |
| `pnpm test:integration` (API + PostgreSQL réel) | 99 tests réussis (95 à la fin de la phase 14) |
| `pnpm test:e2e` (Playwright, bureau + mobile Pixel 7) | 65 tests réussis, 3 ignorés (essais propres au téléphone, sautés sur le projet bureau) ; nouveaux scénarios de la pré-campagne et du mandat d’un président joueur (pop-ups d’urgence et de questions au gouvernement, Conseil des ministres, déplacement programmé depuis la carte), audits axe-core sans violation, dialogues ouverts compris |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | 1 test réussi |
| APK 1.7.0 de débogage | construit localement (JDK 21, SDK Android 36) : `versionCode` 8, aucune permission réseau, 7,0 Mo |
| CI GitHub et essai sur émulateur | **non exécutés** : GitHub Actions reste bloqué au niveau du compte et l'utilisateur ne souhaite pas modifier son budget ; pas d'émulateur dans l'environnement de développement (pas de KVM) |

Écarts et limites :
- **Président joueur dans les e2e** : un joueur qui se contente des rencontres d'élus est toujours éliminé au premier tour (vérifié sur une quarantaine de graines, candidats personnalisés et personnalités réelles) ; les scénarios du mandat importent donc un état produit par le moteur où le joueur est déclaré élu (`apps/web/e2e/fixtures/README.md`), comme les tests de composants.
- **Équilibre** : avec les adversaires fictifs, le même candidat de l'IA l'emporte sur toutes les graines essayées ; les soutiens simulés ne déplacent le premier tour que d'environ un point. Paramètres de la phase 15 non calibrés (R-50).
- **Conseil des ministres** : tenu chaque semaine, août compris (la pause d'usage n'est pas simulée) ; motifs de départ neutres (loyauté au plus bas, usure au poste), sans aucun propos ni scandale prêté.
- **Questions au gouvernement** : une interpellation par semaine de session ordinaire ; sessions extraordinaires non simulées ; aucun député nommé.
- **Pop-ups** : refermés, ils se rouvrent au retour sur le QG tant que la décision est sans réponse (les réponses de la semaine vivent dans la page, comme depuis la phase 2).
- **Essai sur appareil** : mise en page vérifiée dans Chromium (bureau, Pixel 7), pas sur un téléphone ni un émulateur Android.
### Phase 16 — Refonte « Grand Soir » de l'interface (terminée)

Demandée par l'utilisateur le 29/10/2026 : « Refonte UI/UX à fond, je te laisse carte blanche, montre tes capacités à 100 % comme si tu devais sortir le jeu en vente. Je veux que ce soit beau, incroyable. » Constat de l'audit (captures bureau et mobile) : une interface propre mais générique — un tableau de bord sombre découpé en cartes identiques, des titres condensés partout, un écran d'accueil réduit à un titre, une création de partie en un long formulaire, aucun moment de jeu entre deux semaines, des sondages sans couleur de candidat.

Direction retenue (« Grand Soir ») : la République la nuit d'une élection — bleu de nuit, dorure des salons de l'Élysée, velours rouge de l'hémicycle, papier blanc des affiches et des bulletins. Deux objets du monde réel portent l'identité : **l'affiche de campagne** (sur les panneaux d'affichage électoral numérotés) et **l'hémicycle**.
- **Typographie** : un Didone d'héritage français (Bodoni Moda, axe de taille optique, licence SIL OFL, embarqué) pour les titres, les noms sur les affiches et les grands chiffres ; Hanken Grotesk pour l'interface et les données ; le condensé Archivo réservé à l'habillage télévisé (soirée électorale, débats), élément du monde du jeu.
- **Surfaces** : une hiérarchie au lieu d'un seul modèle de carte — scène pleine largeur pour les moments forts, dossiers liserés d'or pour ce qui engage le joueur, listes sobres à filets pour le reste ; l'affiche est un objet de papier à angles vifs.
- **Mouvement** : un seul moment orchestré par écran (affiches collées sur le mur à l'ouverture, bascule de la semaine au débriefing), réponses aux gestes du joueur, transitions de vue entre les espaces ; tout est coupé quand le mouvement réduit est demandé.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P16-01 | Design system « Grand Soir » : polices, jetons, surfaces, boutons, focus, transitions de vue, sections dépliables, en-tête, navigation, pied de page. | polices embarquées (hors ligne) ; contrastes AA dans les deux thèmes ; cibles tactiles de 44 px ; aucun défilement horizontal à 390 px ; mouvement réduit respecté. |
| P16-02 | Affiche de campagne et écran-titre : mur d'affichage des candidats fictifs (portraits illustrés, jamais une personne réelle), reprise de la dernière partie avec son candidat, liste des parties. | tests de composants ; e2e ; axe-core ; écran utilisable sans le jeu de règles (panneaux vides, accès conservé). |
| P16-03 | Création de partie : chapitres numérotés, affiche mise à jour en direct, tuiles de mode, boussole politique. | mêmes champs, mêmes libellés accessibles et même requête envoyée ; tests mis à jour ; e2e. |
| P16-04 | QG et débriefing : bandeau de campagne, vue d'ensemble hiérarchisée, catalogue d'actions par familles, barre de résolution, débriefing avec bascule de semaine et compteurs. | aucun chiffre recalculé dans le navigateur (lecture de l'état et du bilan) ; tests ; e2e. |
| P16-05 | Écrans : couleurs des candidats dans les sondages, Pouvoir et hémicycle, pop-ups, chrome de la carte ; habillage télé conservé. | hémicycle et accordéons non régressés ; tests ; e2e. |
| P16-06 | Tests, accessibilité, revue visuelle avant/après, documentation, APK 1.8.0. | `pnpm check`, intégration, e2e bureau et mobile (axe dans les deux thèmes), `pnpm test:mobile` ; APK construit en local. |

Aucune modification du moteur, des règles ni du format de sauvegarde : la refonte ne touche que l'interface.

- **P16-01 faite** — jetons « Grand Soir » (`index.css`) : Bodoni Moda embarquée (`@fontsource-variable/bodoni-moda`, axe de taille optique), dorure et papier, ombres dorées, grain de papier, halo de scène du thème Soirée, animations `colle`, `bascule` et `titre` coupées sous mouvement réduit, transitions de vue entre les espaces. `ui.ts` : bouton doré `buttonPrestige` (un par écran), dossier liseré d'or, liste à filets, tuile de choix. En-tête : écharpe tricolore et raison sociale en Didone ; sélecteur de thème réduit à sa pastille sur téléphone. Navigation : signet doré sur l'espace ouvert. Bandeau de partie : portrait en affiche, mouvement, compte à rebours doré, ressources séparées par des filets. Sections dépliables en lignes à filets (`DisclosureGroup`).
- **P16-02 faite** — `components/Affiche.tsx` ; écran-titre (`Home.tsx`) : titre en Didone, mur de huit panneaux numérotés (sept candidats fictifs du jeu de règles, portraits illustrés, et un panneau libre « Votre affiche »), affiches collées l'une après l'autre, carte « Dernière partie » (candidat en affiche, semaine, compte à rebours, bouton doré « Reprendre la partie »), liste des parties à filets triée par date de modification. Tests de composants (`home.test.tsx`) et e2e (`refonte.spec.ts`).
- **P16-03 faite** — création en cinq chapitres numérotés (la partie, le candidat ou la personnalité, le mouvement, le terrain, le calendrier), tuiles de choix dorées, boussole politique (`new-game/Compass.tsx`, groupes d'électeurs du jeu de règles), récapitulatif collé avec l'affiche du candidat mise à jour en direct (une personnalité réelle garde sa fiche avec photo et l'avertissement de simulation, jamais une affiche) et le seul bouton « Créer la partie ». Mêmes champs, libellés et requête : les tests de création existants passent sans modification.
- **P16-04 faite** — QG : vue d'ensemble en tableau d'affichage à filets, catalogue d'actions aux pastilles teintées par famille d'affichage (terrain, médias, numérique, élus, finances, crise ; regroupement propre à l'interface), barre de résolution dorée ; débriefing : page de calendrier qui bascule, variations de la semaine qui défilent jusqu'à la valeur du moteur (`useCountUp`, présentation seule ; valeur finale lue par les lecteurs d'écran), bouton doré « Continuer ».
- **P16-05 faite** — sondages et résultats aux couleurs de la famille politique de chaque candidat (`colorOf`, convention du jeu ; nom écrit à côté, liseré clair pour les teintes sombres sur fond de nuit), portraits dans le tableau du dernier sondage ; options de décision et pop-ups dorés ; titres en Didone dans Pouvoir, la vue du mandat et le bilan ; habillage télévisé de la soirée électorale et des débats conservé en Archivo condensé.
- **P16-06 faite** — e2e `refonte.spec.ts` (écran-titre, mouvement réduit, création, QG et débriefing en thème clair, cibles de 44 px, largeurs de 360 et 390 px), documentation (ce plan, ARCHITECTURE §8, README, apps/mobile/README), application **1.8.0** (`versionCode` 9).

**Bilan (29/10/2026)** — les six tâches sont réalisées ; moteur, jeu de règles (16.0.0) et format de sauvegarde (19) inchangés ; application 1.8.0.

| Vérification | Résultat |
|---|---|
| `pnpm check` (lint, format, types, tests unitaires) | 72 fichiers, 709 tests réussis |
| `pnpm test:integration` | réussi |
| `pnpm test:e2e` (bureau et mobile, axe-core) | 73 tests réussis, dont `refonte.spec.ts` (thèmes Soirée et Clair, mouvement réduit, cibles de 44 px, 360 et 390 px) |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | réussi |
| APK 1.8.0 de débogage | construit localement (JDK 21, SDK Android 36) : `versionCode` 9, aucune permission réseau, polices embarquées, 7,1 Mo |

Correctifs apportés pendant la vérification : la page du calendrier du débriefing bascule sans fondu (contraste entier pendant l'animation) ; le tableau d'évolution des sondages, défilant sur téléphone, se prend au clavier ; deux tests de bout en bout attendent la fin des fondus ou de la transition de vue avant de mesurer.

**Limites** — les familles d'actions sont un regroupement d'affichage (le jeu de règles n'en porte pas) ; la couleur d'un candidat est celle de sa famille politique, partagée par deux candidats proches (le nom reste écrit) ; le décompte animé du débriefing interpole l'affichage jusqu'à la valeur servie, qu'il ne modifie pas ; la boussole est un raccourci de pointeur (les curseurs restent le contrôle au clavier) ; le formulaire de création reste long sur téléphone (les effets chiffrés des scénarios et orientations sont tous affichés, par transparence) ; les captures pleine page de longueur supérieure à 16 384 px sont tronquées par le navigateur (revue faite par morceaux).


### Phase 17 — Débats télévisés obligatoires (terminée)

Demandée par l'utilisateur le 29/10/2026 : « Il faut bloquer quand il y a les débats : qu'on doive faire les débats obligatoirement. » Constat : un débat de la semaine où le joueur est invité était, s'il ne l'ouvrait pas, mené à son terme par le moteur à la résolution de la semaine (interventions choisies automatiquement) ; rien n'obligeait à y participer.

Règle retenue : tant qu'un débat télévisé de la semaine compte le joueur sur le plateau (invité, présent, toujours en lice) et n'est pas terminé, la semaine ne se résout pas. Le blocage ne se lève que par un choix explicite du joueur : jouer le débat jusqu'au bout, « Simuler la fin du débat » depuis le plateau, ou le refuser avant le premier échange (chaise vide, malus inchangé). La règle est commune au moteur, à l'API, au moteur local et à l'interface (`debateAwaitingPlayer` de `@r2027/shared`).

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P17-01 | Règle partagée et moteur : `advanceWeek` refuse la semaine (`debat_requis`, 422) tant que le débat attend le joueur. | tests du moteur ; observateur, joueur non invité ou éliminé et mandat inchangés ; fin simulée depuis le plateau par le même mécanisme que l'ancienne fin automatique (cartes du joueur choisies comme pour l'IA). |
| P17-02 | API et moteur local : arrêt de l'avance rapide avant la semaine du débat (motif `debat`), même contrat et mêmes codes d'erreur. | tests d'intégration et du moteur local. |
| P17-03 | Interface : bouton « Résoudre la semaine » désactivé, message explicite et lien vers le plateau ; textes des débats mis à jour. | tests de composants ; e2e ; axe-core. |
| P17-04 | Tests, documentation, moteur 0.19.0, APK 1.9.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK construit en local. |

Aucune modification du jeu de règles ni du format de sauvegarde (une partie enregistrée pendant la semaine d'un débat demande simplement de le jouer).

- **P17-01 faite** — `playerOnDebateStage` et `debateAwaitingPlayer` dans `@r2027/shared` (le moteur et le plateau de l'interface emploient la même règle) ; `advanceWeek` refuse la semaine (`debat_requis`, 422) ; outils de test du moteur et de l'interface : `concludeDebates` mène le débat par la fin simulée, comme le joueur depuis le plateau ; tests : blocage, carte jouée insuffisante, levée par le débat joué, la fin simulée ou la chaise vide (malus appliqué), observateur, joueur non invité ou éliminé.
- **P17-02 faite** — motif d'arrêt `debat` de l'avance rapide (examiné avant les décisions) dans l'API et le moteur local ; tests d'intégration et du moteur local : avance rapide arrêtée avant le débat, semaine refusée (422 `debat_requis`), puis résolue après la fin simulée.
- **P17-03 faite** — QG : encadré du débat de la semaine (« Aller sur le plateau », ou « Reprendre le débat »), bouton « Résoudre la semaine » désactivé avec son motif et un lien vers le plateau, panneau des débats qui annonce le débat obligatoire ; test de composant (blocage puis levée par la chaise vide) et e2e (`debats.spec.ts` : blocage, accessibilité, levée après le débat).
- **P17-04 faite** — documentation (ce plan, ARCHITECTURE §4.7 et §6, README, apps/mobile/README), moteur **0.19.0**, application **1.9.0** (`versionCode` 10).

**Bilan (29/10/2026)** — les quatre tâches sont réalisées ; jeu de règles (16.0.0) et format de sauvegarde (19) inchangés.

| Vérification | Résultat |
|---|---|
| `pnpm check` | 72 fichiers, 714 tests réussis |
| `pnpm test:integration` | 100 tests réussis |
| `pnpm test:e2e` (bureau et mobile, axe-core) | 73 tests réussis |
| `pnpm test:mobile` (paquet de l'APK, réseau coupé) | réussi |
| APK 1.9.0 de débogage | construit localement : `versionCode` 10, aucune permission réseau, 7,1 Mo |

**Limites** — la chaise vide reste possible (choix explicite, malus de popularité) : le débat est obligatoire au sens où il ne peut plus être sauté sans décision du joueur ; la préparation achetée pendant la semaine du débat ne compte plus pour ce débat (il se joue avant la résolution de la semaine), comme c'était déjà le cas pour un débat joué sur le plateau ; une partie importée d'une version antérieure dont le débat de la semaine n'a pas encore été programmé garde l'ancien comportement pour ce seul débat.


### Phase 18 — Cinq niveaux de difficulté (terminée)

Demandée par l'utilisateur le 29/10/2026 : « Créer un système de niveau de difficulté. » Précisions obtenues : **cinq niveaux nommés**, chacun avec une fiche claire de ses effets à la création et dans la partie ; **niveau figé à la création** (pas de changement en cours de partie).

Constat (mesure sur six graines, candidat actif qui compose son programme) : les trois niveaux existants (Accessible, Standard, Expert) ne changent que les moyens de départ du joueur et l'efficacité des adversaires IA ; ils sont bien ordonnés (3,9 %, 2,0 % et 0,2 % des voix au premier tour), mais le bas de l'échelle n'est pas « accessible » : les adversaires fictifs partent avec 15 à 70 % de notoriété, quel que soit le niveau. Décision : garder les trois niveaux tels quels (parties en cours inchangées) et ajouter **Découverte** (moyens confortables ; adversaires moins actifs, moins fortunés et moins connus au départ : nouveau paramètre `multiplicateurNotoriete`) et **Légende** (moyens maigres ; adversaires impitoyables et plus connus). Mesure des valeurs retenues : Découverte 11,6 % (candidat dans la course), Légende 0 % avec deux rencontres d'élus par semaine (1,0 % avec quatre : jouable, plus dur qu'Expert). La difficulté ne modifie jamais les règles constitutionnelles, le seuil des parrainages ni le décompte des voix.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P18-01 | Schémas et données : cinq niveaux (`decouverte`, `accessible`, `standard`, `expert`, `legende`), jeu de règles 17.0.0 (paramètres des cinq niveaux, `multiplicateurNotoriete` de l'IA, 1 pour les trois niveaux existants), format de sauvegarde 20 (format 19 figé à trois niveaux) et migration 19→20, énumération de la base (migration Prisma versionnée). | parties des formats antérieurs relues et migrées ; tests du jeu de règles (échelle ordonnée) et des migrations. |
| P18-02 | Moteur : notoriété de départ des adversaires (fictifs et personnalités réelles) selon le niveau ; moteur 0.20.0. | tests : moyens du joueur décroissants et adversaires croissants de Découverte à Légende ; trois niveaux existants inchangés. |
| P18-03 | API et moteur local : création d'une partie aux cinq niveaux, mêmes refus. | tests d'intégration et du moteur local. |
| P18-04 | Interface : échelle de cinq tuiles à la création et fiche du niveau (vos moyens, vos adversaires, débats), lue dans le jeu de règles ; même fiche dans la section « La partie » du QG. | aucun chiffre recalculé hors du jeu de règles ; tests de composants ; e2e ; axe-core. |
| P18-05 | Documentation, vérifications, APK 1.10.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK construit en local. |

- **P18-01 faite** — `DIFFICULTIES` de `@r2027/shared` (cinq niveaux) ; jeu de règles `presidentielle-2027@17.0.0` (moyens et promesses de départ du joueur, paramètres de l'IA avec `multiplicateurNotoriete`, maîtrise au débat, pour les cinq niveaux ; valeurs des trois niveaux existants inchangées, testé) ; format de sauvegarde **20** (format 19 figé à trois niveaux) et migration 19 → 20, testée sur un état réel du format 19 produit par le moteur de la phase 17 (`v19-phase-17.json`, niveau Expert) ; énumération `Difficulty` de la base étendue (migration Prisma `20261029130524_phase18_difficulte`).
- **P18-02 faite** — moteur 0.20.0 : notoriété de départ des adversaires fictifs et des personnalités réelles adverses multipliée selon le niveau (×0,5 en Découverte, ×1,15 en Légende, ×1 ailleurs) ; la personnalité incarnée garde sa notoriété réelle. Tests : échelle ordonnée sur les cinq niveaux (moyens du joueur décroissants, budget et notoriété des adversaires croissants, actions planifiées croissantes), décompte des voix, seuil des parrainages et plafonds indépendants du niveau (propriétés étendues aux cinq niveaux).
- **P18-03 faite** — API et moteur local : création d'une partie à chacun des cinq niveaux, niveau enregistré en base et relu dans la liste ; niveau inconnu refusé (`requete_invalide`) par les deux.
- **P18-04 faite** — interface : échelle de cinq tuiles en escalier (jauge à cinq marches) et fiche du niveau choisi (`DifficultySheet` : vos moyens de départ, vos adversaires, maîtrise au débat, ce qui ne change jamais), chaque chiffre lu dans le jeu de règles ; en observateur, la fiche ne règle que les candidats conduits par l'IA ; même fiche, sans sélecteur, dans la section « La partie » du QG. Tests de composants (`difficulte.test.tsx`), e2e (`difficulte.spec.ts` : axe dans les deux thèmes, 360 et 390 px, partie créée en Légende et fiche relue au QG).
- **P18-05 faite** — documentation (ce plan, ARCHITECTURE, MODELE_DONNEES format 20, SOURCES, RISQUES, README, apps/mobile/README), application **1.10.0** (`versionCode` 11).

**Bilan (29/10/2026)** — les cinq tâches sont réalisées : jeu de règles 17.0.0, format de sauvegarde 20, moteur 0.20.0, application 1.10.0. Limites : les valeurs des niveaux sont des hypothèses de jeu, mesurées sur six graines seulement (R-24) ; aucun niveau ne fait gagner une stratégie faible (en Découverte, un candidat qui compose son programme sans rien d'autre reste loin derrière les favoris : 11,6 % en moyenne au premier tour) ; le niveau ne se change pas en cours de partie (choix de l'utilisateur).


### Phase 19 — Le son : musique d'ambiance et jingles des moments forts (terminée)

Demandée par l'utilisateur le 29/10/2026 (« création de partie trop de paramètres […] rendre le jeu vivant, réel et addictif »), cadrée par un questionnaire : le jeu est jugé peu vivant (trop de lecture, peu de surprises, personnages muets, **ni son ni mouvement**). Décisions de l'utilisateur pour le son : **musique d'ambiance** et **jingles des moments forts** (pas de sons d'interface ni d'ambiances de foule) ; origine **mixte** : musique en fichiers sous licence libre, crédités, embarqués (le jeu reste hors ligne) ; jingles fabriqués par le jeu. Ordre demandé : « commence juste par le son et donne l'APK, ensuite continue tout le reste » (phase 20).

Décisions de conception (révisables) :
- **Musique** : morceaux de Kevin MacLeod sous licence CC BY 3.0, hébergés sur Wikimedia Commons (licence et auteur vérifiés sur la page du fichier par l'importeur) ; trois ambiances : accueil (écran-titre, création, Paramètres), campagne (campagne et entre-deux-tours), mandat (présidence, législatives, bilan) ; silence pendant la soirée électorale et les débats, qui ont leurs jingles. Extrait, volume normalisé (EBU R128) et MP3 96 kbit/s : chaque modification est déclarée dans les crédits, comme l'exige la licence.
- **Jingles** : synthétisés à la volée (Web Audio, aucun fichier) : résultat à 20 h (ouverture de la soirée électorale), victoire et défaite (fin du dépouillement, selon le résultat du candidat du joueur), ouverture d'un débat, nouvelle importante (événement majeur au débriefing, urgence ministérielle).
- **Règles des navigateurs et de l'appareil** : aucun son avant le premier geste du joueur ; musique coupée quand la page ou l'application passe en arrière-plan ; bouton « Couper le son » toujours visible dans l'en-tête ; réglages persistants (musique, jingles, volumes) dans Paramètres. Musique activée par défaut, à volume modéré.
- **Périmètre** : interface seule. Ni le moteur, ni les règles, ni le format de sauvegarde ne changent ; aucune permission Android n'est ajoutée.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P19-01 | Musique : importeur `pnpm data:sons` (Commons, licence et auteur lus sur la page du fichier, original archivé dans `data/raw/sons`, extrait et volume normalisé par ffmpeg), fichiers dans `apps/web/public/sons/`, manifeste validé par un schéma de `@r2027/shared`, SOURCES. | licence libre et auteur vérifiés pour chaque morceau ; empreintes et tailles du manifeste égales aux fichiers commités ; crédits complets (titre, auteur, licence, source, modifications). |
| P19-02 | Moteur audio de l'interface (`apps/web/src/audio`) : synthèse des cinq jingles, lecteur à fondus enchaînés par ambiance, atténuation de la musique pendant un jingle, démarrage au premier geste, pause en arrière-plan ; préférences persistantes. | tests unitaires (partitions, résolution des ambiances, lecteur avec des doubles, préférences) ; chaque jingle rendu hors ligne dans Chromium : durée attendue, ni silence ni saturation. |
| P19-03 | Branchements : ambiances par écran et par phase, jingles aux moments forts, bouton « Couper le son » dans l'en-tête, section « Son » des Paramètres (réglages, écoute des jingles, crédits de la musique). | tests de composants (chaque moment déclenche son jingle, une seule fois) ; e2e : musique lancée après un geste, réglages conservés au rechargement, axe dans les deux thèmes, en-tête sans débordement à 360 px. |
| P19-04 | Android : pause de la musique en arrière-plan ; documentation ; vérifications ; APK 1.11.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` (fichiers servis par le paquet, aucune requête externe) ; APK construit en local, sans nouvelle permission. |

- **P19-01 faite** — importeur `pnpm data:sons` (`packages/data-import/src/cli/sons.ts`) : licence et auteur lus sur la page Commons de chaque fichier (l'analyse de l'auteur ignore désormais la feuille de style du modèle « Creator », et les années de vie ne sont pas reprises dans le crédit), original archivé avec son empreinte, extrait, normalisation EBU R128 en deux passes et MP3 96 kbit/s par ffmpeg, reproductible (même empreinte à chaque relance) ; cinq morceaux de Kevin MacLeod (CC BY 3.0) : « Inspired » (accueil), « Investigations » et « Impact Moderato » (campagne), « Deliberate Thought » et « Lasting Hope » (mandat), 7,8 Mo ; manifeste validé par `MusicManifestSchema` ; SOURCES §8 terdecies. Le débit de Wikimedia, limité sur la connexion partagée, est respecté (délai `retry-after` attendu).
- **P19-02 faite** — `apps/web/src/audio` : partitions des cinq jingles et synthétiseur Web Audio (rendus hors temps réel dans Chromium : crêtes de 0,46 à 0,82, sonie de −15,5 à −22,7 LUFS, énergie au-dessus de 8 kHz comparable à celle de la musique), lecteur à deux platines (fondus enchaînés, atténuation pendant un jingle, fondus figés tant que la lecture n'est pas permise), système sonore (premier geste, arrière-plan, son coupé, anti-répétition), réglages persistants. Tests unitaires (partitions, ambiances, verdict, lecteur et système avec des doubles, réglages, manifeste octet pour octet).
- **P19-03 faite** — ambiances (accueil, campagne ou mandat selon la phase, silence pendant la soirée et le débat), jingles aux moments forts, bouton « Couper le son » dans l'en-tête (tient à 360 px), section « Son » des Paramètres (réglages, écoute de chaque jingle, crédits de la musique). Tests de composants (`son.test.tsx`, soirée, débat, débriefing, urgences) ; e2e `son.spec.ts` (rendu des jingles, décodage de chaque morceau, musique lancée après un geste puis suivant l'écran, son coupé, réglages conservés au rechargement, axe dans les deux thèmes).
- **P19-04 faite** — application Android : musique coupée quand l'application passe en arrière-plan (`@capacitor/app`, déjà présent ; aucune permission ajoutée) ; essai hors ligne : la musique de la campagne joue depuis les fichiers du paquet, sans requête externe. Documentation (ce plan, ARCHITECTURE, SOURCES, RISQUES R-53, README, apps/mobile/README, CLAUDE.md) ; application **1.11.0** (`versionCode` 12).

**Bilan (29/10/2026)** — les quatre tâches sont réalisées ; moteur, jeu de règles (17.0.0) et format de sauvegarde (20) inchangés ; application 1.11.0. Limites : le son n'a pas été écouté sur un téléphone réel (R-53 : rendu mesuré, pas entendu) ; la campagne ne compte que deux morceaux, répétés au fil des semaines ; aucun son d'interface ni ambiance de foule (non demandés) ; les jingles sont des synthèses du jeu, d'un timbre plus électronique qu'un orchestre enregistré.


### Phase 20 — Création en assistant, récit, surprises, réel et progression (terminée)

Suite de la demande du 29/10/2026 (« création de partie trop de paramètres […] rendre le jeu vivant, réel et addictif ») ; décisions de l'utilisateur au questionnaire, appliquées telles quelles : création en **assistant pas à pas** avec l'affiche en direct (boutons Précédent et Suivant, ni récapitulatif, ni « Passer », ni frise) ; nom de la partie, date de départ et graine dans des options avancées ; candidat saisi en entier ; profil de départ et orientation **fusionnés en un seul choix « Votre parcours »** (parcours principal, variante facultative) ; **format choisi à la création** (complet, ou court : la partie s'arrête au soir du second tour) ; **l'équipe de campagne raconte la semaine**, visuels plutôt que tableaux, une phrase et le détail au toucher, **moins d'écrans** (liste proposée puis validée par l'utilisateur avant toute suppression) ; **événements en chaîne** et **coups des adversaires** fictifs ; **calendrier, lieux et rouages réels** (sourcés, sinon étiquetés) ; **palmarès, déblocages** (une partie de l'existant verrouillée jusqu'à une première victoire), **niveau de joueur**, **défi du jour** (score au premier tour) et **notifications locales**.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P20-01 | Format court : choix à la création (API, moteur local), la partie s'arrête au soir du second tour ; format de sauvegarde 21, migration 20 → 21 (parties existantes au format complet) ; moteur 0.21.0. | tests du moteur (fin au second tour, aucun quinquennat), migration testée sur un état réel du format 20, mêmes refus API / moteur local. |
| P20-02 | Création en assistant : étapes (partie, candidat, parcours, terrain, format), affiche en direct, Précédent / Suivant, options avancées, même requête qu'avant. | tests de composants et e2e (axe, 360 px) ; requête envoyée identique pour les mêmes choix. |
| P20-03 | Récit et lisibilité : débriefing raconté par une équipe de campagne fictive (lu dans le bilan du moteur, rien de recalculé), visuels et résumés d'une phrase ; liste d'écrans à regrouper soumise à l'utilisateur. | tests de composants ; aucun propos prêté à une personne réelle ; liste validée avant tout retrait. |
| P20-04 | Surprises : événements fictifs en chaîne (suites programmées) et coups des adversaires fictifs ; jeu de règles 18.0.0. | tests du moteur (déterminisme, suites programmées une seule fois, registre). |
| P20-05 | Réel : calendrier réel 2026-2027 (jours fériés selon la loi, campagne officielle) sourcé ou étiqueté ; effets dans la campagne. | sources dans SOURCES ; tests. |
| P20-06 | Progression : palmarès et niveau de joueur calculés par l'API et le moteur local à partir des parties, déblocages, défi du jour ; notifications locales si l'extension est disponible hors ligne. | tests d'intégration et du moteur local ; e2e. |
| P20-07 | Documentation, vérifications, APK. | `pnpm check`, intégration, e2e, `pnpm test:mobile`, APK. |

- **P20-01 faite** — format court (`player.format`), fin de partie au soir du second tour (`blockedBy: 'fin-de-partie'`), format de sauvegarde 21 et migration 20 → 21 testée sur un état réel du format 20 (`v20-phase-19.json`) ; mêmes refus dans l'API et le moteur local.
- **P20-02 faite** — assistant de création en cinq étapes (la partie, votre candidat, votre parcours, le terrain, le format), affiche en direct, options avancées (nom, date, graine).
- **P20-03 faite** — l'équipe de campagne fictive (Inès, Paul, Maya, Hugo) raconte la semaine en une phrase chacun, tirée du bilan du moteur (`CampaignTeam`) ; liste des regroupements validée par l'utilisateur le 03/11/2026 et appliquée sans retirer aucun écran : « Archives de la partie » (journal et sauvegardes), « Sondages et résultats », « Gouvernement et Conseil des ministres », « Économie et crises » ; les anciennes adresses (`/resultats`, `/conseil`, `#crises`…) déplient la section commune et amènent l'écran à la vue.
- **P20-04 faite** — jeu de règles `presidentielle-2027@18.0.0` : suites d'événements (`suites`, selon le choix du joueur ou dès l'événement, probabilité et délai), événements qui ne surviennent qu'en suite (`enSuiteSeulement`), famille « coup adverse » (sept coups simulés du rival le plus proche dans les intentions, marque `{adversaire}`, effets du rival par le registre, aucun propos prêté) ; validations croisées dans `RulesetSchema` ; format de sauvegarde **22** (`suites` programmées) et migration 21 → 22 testée sur un état réel du format 21 (`v21-phase-20.json`) ; moteur 0.22.0. Le débriefing rappelle l'origine d'une suite (« Suite de « … » ») et la directrice de campagne signale le coup du rival.
- **P20-05 faite** — jeu de règles `presidentielle-2027@19.0.0` : **jours fériés** du code du travail calculés pour toute année (`publicHolidays`, Pâques par le comput grégorien, aucune date en dur), affichés au calendrier électoral et dans les échéances proches, et une semaine fériée retire 6 h de campagne aux candidats en lice (hypothèse de jeu, par le registre) ; **ouverture de la campagne officielle** le lundi 5 avril 2027 (hypothèse fondée sur le précédent de 2022) et, jusqu'au second tour, **égalité stricte des temps de parole** à la télévision et à la radio (règle de l'Arcom relue le 03/11/2026) : la part de l'exposition qui suit la notoriété y est la même pour chaque candidat ; **lieux réels** : deux coups adverses localisés dans un département réel de campagne. Sources : SOURCES §4.2. Moteur inchangé dans son format (format 22).
- **P20-06 faite** — progression entre les parties (jeu de règles `presidentielle-2027@20.0.0`, section `progression`, hypothèses de jeu) : **palmarès** (parties, victoires, qualifications, meilleur premier tour), **niveau de joueur** (sept niveaux, de « Militant » à « Chef de l’État », points par partie jouée, premier tour, qualification, victoire et défi), **déblocages** d'une partie de l'existant (niveau Légende et scénario « Candidature d’outsider », jusqu'à une première présidentielle gagnée ; consultables, refusés à la création avec le code 403 `verrouille`), **défi du jour** (graine `defi-AAAA-MM-JJ` réservée, niveau Standard, format court et situation de départ imposés ; date de Paris pour l'API, de l'appareil pour le moteur local ; score : part des voix au premier tour). Calcul pur `computeProgression` et règle `creationParameters` de `@r2027/shared`, employés à l'identique par l'API et le moteur local (route `GET /api/progression`, mêmes codes d'erreur, tests d'intégration et du moteur local). Interface : « Votre palmarès » à l'écran-titre, tuiles verrouillées dans l'assistant, assistant du défi (`/nouvelle-partie?defi=1`). **Notifications locales** (application Android) : rappel quotidien du défi, désactivé par défaut, extension `@capacitor/local-notifications` 8.3.1 ; seule permission ajoutée : `POST_NOTIFICATIONS` (les trois autres de l'extension retirées du manifeste).
- **P20-07 faite** — documentation (ce plan, ARCHITECTURE, MODELE_DONNEES formats 21 et 22, SOURCES §4.2, RISQUES R-54 à R-56, README, apps/mobile/README, CLAUDE.md) ; `pnpm check`, intégration, e2e, `pnpm test:mobile` ; application **1.12.0** (`versionCode` 13).

**Bilan (03/11/2026)** — les sept tâches sont réalisées : jeu de règles 20.0.0, format de sauvegarde 22, moteur 0.22.0, application 1.12.0. Limites : les nouveautés (coups adverses, suites, semaine fériée, égalité des temps de parole) modifient l'équilibre sans nouvelle mesure des niveaux (R-54) ; la date d'ouverture de la campagne officielle et celle de l'égalité restent des hypothèses fondées sur 2022 jusqu'au décret et à la recommandation de l'Arcom ; les jours fériés sont relus sur Wikipédia, Légifrance étant inaccessible ; la progression est locale à la session (serveur) ou à l'appareil, sans compte ni classement partagé, et contournable par un export modifié (R-55) ; le rappel n'est pas exact et ne survit pas à un redémarrage tant que l'application n'est pas rouverte (R-56) ; l'équipe de campagne ne parle que de la campagne (pas encore du mandat).

### Phase 21 — Refonte « Tract » de l'interface et nouveaux sons (terminée)

Demande de l'utilisateur du 03/11/2026 : « refais-moi toute l'interface UI/UX du jeu, donne le meilleur de toi-même, et change toutes les musiques et tous les sons également ; carte blanche ». Direction retenue : **« Tract »**, la campagne telle qu'on l'imprime au local de campagne. Deux encres républicaines en aplat (bleu, rouge) et leur **surimpression** (l'encre du texte), le **surligneur** jaune des sondages imprimés pour ce qui change et ce qui décide, un papier froid le jour et une encre de nuit le soir ; titres et chiffres en **Anybody** (grotesque à largeur variable, condensée pour les titres, large pour les chiffres), texte et données en **Atkinson Hyperlegible Next** (lisibilité) ; une seule audace : l'affiche-titre imprimée en surimpression et le **coup de tampon** qui boucle la semaine. Interface seule : ni le moteur, ni les règles, ni le format de sauvegarde ne changent ; mêmes rôles et mêmes libellés accessibles (tests conservés).

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P21-01 | Design system « Tract » : polices embarquées (OFL), jetons des deux thèmes, classes partagées (boutons, feuilles, tuiles, champs, badges, sections), focus visible. | contraste WCAG AA vérifié par axe-core dans les deux thèmes ; aucune police téléchargée à l'exécution. |
| P21-02 | Coque (en-tête, navigation, bandeau de partie), écran-titre (affiche en surimpression, mur d'affiches, palmarès), création. | e2e et axe ; 360 px sans défilement horizontal ; mouvement réduit respecté. |
| P21-03 | QG (la semaine d'abord, résolution toujours à portée), tampon de fin de semaine, débriefing, espaces, pop-ups, carte, soirée électorale et débat accordés. | mêmes tests de composants et e2e ; revue visuelle (captures bureau et téléphone). |
| P21-04 | Nouvelles musiques sous licence libre (importeur `pnpm data:sons`, licence et auteur lus sur Commons, crédits) et nouveaux jingles synthétisés (nouvelles partitions et timbres, son du tampon). | manifeste validé, rendu des jingles sans silence ni saturation (e2e), crédits complets. |
| P21-05 | Tests, accessibilité, documentation, APK 1.13.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK sans nouvelle permission. |

- **P21-01 faite** — jetons d'`index.css` redéfinis (papier froid, encres bleue et rouge, surimpression, surligneur ; thème de nuit à l'encre sur papier sombre, thème « système » par défaut), polices embarquées sous licence OFL (Anybody, Atkinson Hyperlegible Next ; Archivo gardée pour l'habillage télévisé ; Bodoni Moda et Hanken Grotesk retirées), classes partagées de `components/ui.ts` réécrites (boutons d'encre aplatie, bouton décisif surligné avec calage bleu, feuilles, dossiers à bandeau, tuiles, champs), badges et sections dépliables. Contraste vérifié par axe-core dans les deux thèmes (accueil, création, QG, Campagne, Opinion, Pouvoir : aucune violation) ; deux contrastes corrigés en cours de route (texte blanc sur rouge 600 : 4,3 → pavés en rouge 700 ; gris 400 de nuit sur tuile cochée : 4,25 → gris éclairci).
- **P21-02 faite** — coque (en-tête, marque aux deux carrés d'encre, navigation en onglets d'encre pleine, bandeau de campagne fileté avec compte à rebours sur pavé rouge ; chiffres resserrés par la largeur variable d'Anybody sur téléphone : « 3,09 M € » et « 12 345 » tiennent à 360 px), écran-titre (« RÉPUBLIQUE » en bleu condensé, « 2027 » en rouge large imprimé en surimpression, `mix-blend-mode`), palmarès (niveau en grand chiffre rouge, jauge surlignée, défi du jour en tract rouge), création.
- **P21-03 faite** — QG en pupitre sur grand écran (vue d'ensemble et barre de résolution dans un rail collant à droite ; sur téléphone, la barre reste fixée au-dessus de la navigation et la vue d'ensemble tient dans le premier écran de 390 × 844, chevrons décoratifs masqués), tuiles d'actions et de décisions accordées, décisions au bandeau de la couleur de leur genre (plus de double liseré), débriefing ouvert par un coup de tampon « Semaine bouclée » (animation `tampon`, coupée sous mouvement réduit) ; carte, soirée électorale et débat relus en captures (bureau et téléphone, clair et nuit) : ils gardent leur habillage télévisé, sur les nouveaux jetons.
- **P21-04 faite** — jingles réécrits (nouvelles partitions des cinq moments forts, nouveaux timbres : marimba, cordes pincées, caisse claire, claquements, cliquetis de téléscripteur, tampon) et un sixième jingle, le **tampon** de la semaine bouclée ; musique remplacée par `pnpm data:sons` : *Orient et Occident* (Saint-Saëns) à l'accueil, *Catalyst* (Scott Buckley) et la *Marche hongroise* (Berlioz) en campagne, *Hiraeth* et *Born of the Sky* (Scott Buckley) pendant le mandat ; marches par l'US Marine Band (domaine public : partition et interprétation), Scott Buckley sous CC BY 4.0 ; 9,5 Mo, import reproductible (même empreinte à la relance). L'importeur retient désormais la **licence de l'interprétation** d'un enregistrement (`recordingLicense`) : la règle de la phase 19 (première licence libre de la page) aurait étiqueté « domaine public » une interprétation sous CC BY-SA de Satie ; crédits rendus en français (« compositeur (composition), interprète (interprétation) ») ; SOURCES §8 terdecies.
- **P21-05 faite** — `pnpm check` (85 fichiers, 792 tests), intégration (11 fichiers, 105 tests), e2e (85 réussis sur les projets bureau et téléphone, 3 propres au téléphone sautés sur le bureau), `pnpm test:mobile` (paquet de l’APK, réseau coupé : réussi) ; docs (ARCHITECTURE, RISQUES R-57, README, SOURCES), application 1.13.0 (`versionCode` 14), APK sans nouvelle permission.

**Bilan (03/11/2026)** — les cinq tâches sont réalisées ; moteur, jeu de règles (20.0.0) et format de sauvegarde (22) inchangés ; application 1.13.0. Limites : la musique a été choisie et contrôlée par mesure (niveau toutes les 10 s, durée, sonie), pas à l'écoute (R-57) ; le son n'est toujours pas éprouvé sur un téléphone réel (R-53) ; la soirée électorale et le débat gardent leur habillage télévisé (Archivo) plutôt que l'esthétique du tract, par choix : ce sont des plateaux ; le rendu n'a été relu qu'en captures Chromium (bureau 1280 px, téléphone 360 et 390 px), pas sur un appareil Android réel.


### Phase 22 — Refonte globale : architecture de l'information, données, mouvement (terminée)

Demande de l'utilisateur du 03/11/2026 : « refonte globale en utilisant les skills, tous, pour un design optimal ; carte blanche, donne tout ce que tu as ». Démarche outillée : cadrage (brainstorming), audit visuel, parcours du joueur et architecture du design system sur captures complètes (bureau et téléphone, clair et nuit, sections dépliées), spécification (`docs/superpowers/specs/2026-11-03-refonte-globale-design.md`), plan d'implémentation (`docs/superpowers/plans/2026-11-03-refonte-globale.md`), exécution en TDD, visualisation de données (dataviz), mouvement (motion-design) et audit d'accessibilité WCAG 2.2 AA. Décision (carte blanche) : l'identité « Tract » de la phase 21 est conservée ; l'audit montrait des faiblesses de structure, pas d'identité. Interface seule : ni le moteur, ni les règles, ni le format de sauvegarde, ni l'API ne changent.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P22-01 | Jetons sémantiques d'encre (`encre`, `encre-2`, `encre-3`, `filet`, `feuille`) ; mouvement réduit sans délai. | contraste ≥ 4,5:1 vérifié par un test dans les deux thèmes ; rendu identique au pixel ; affiches visibles en moins de 150 ms sous mouvement réduit (e2e). |
| P22-02 | Sommaire collant des espaces et de Paramètres. | une pastille déplie et amène sa section sous le bandeau ; entrée courante ; « Tout replier » ; rien pour une seule section ; 360 px sans débordement ; axe-core. |
| P22-03 | Évolution des sondages en courbes. | une ligne par candidat, lignes interrompues sans point inventé, étiquettes écartées avec fil de rappel ; clavier ; résumé textuel ; tableau à portée ; axe-core de jour et de nuit. |
| P22-04 | Éditeur de programme en tuiles. | tuiles avec jauge et compte écrit ; un panneau à la fois ; contrôles et validation inchangés ; observateur. |
| P22-05 | Paramètres : thème en tuiles, jingles en cartes, crédits par catégories filtrables, crédits des polices. | `radiogroup` du thème ; filtre sans accents ni casse ; tout le texte des crédits reste dans la page. |
| P22-06 | Accueil et mouvement : défi du jour sans vide, retours d'action. | tuile ajoutée « imprimée » puis rendue ordinaire ; compteur qui rebondit seulement après un changement. |
| P22-07 | Accessibilité, revue visuelle, documentation, APK 1.14.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK sans nouvelle permission. |

- **P22-01 faite** — jetons d'encre dans `index.css` (jour dans `@theme`, nuit sous `html.dark`) et test de contraste (`design/contraste.test.ts`) ; 326 paires de classes clair/nuit remplacées (212 `text-encre-2`, 114 `text-encre-3`), rendu identique au pixel près (comparaison d'images de l'espace Opinion, clair et nuit : 0 pixel différent) ; sous mouvement réduit, plus aucun délai d'animation ni de transition : les affiches de l'écran-titre, jusque-là invisibles jusqu'à 1 s, sont opaques en moins de 50 ms.
- **P22-02 faite** — `components/SectionNav.tsx` : pastilles collées sous le bandeau de campagne (qui publie sa hauteur dans `--hud`), défilement horizontal sur place, entrée courante suivie par `IntersectionObserver`, marque des sections dépliées, « Tout replier » ; liens vers les ancres (`#finances`).
- **P22-03 faite** — `components/pollTrend.ts` (géométrie pure : échelle au multiple de 5 points, lignes interrompues, étiquettes écartées de 14 px au moins) et `components/PollTrend.tsx` : toute la campagne au premier tour, focus + contexte (le joueur et les trois premiers à la couleur de leur famille, étiquetés en bout de ligne avec un fil de rappel ; les autres en lignes neutres), lecture de la vague choisie au survol et au clavier (flèches, Début, Fin) annoncée aux lecteurs d'écran, légende, résumé textuel, tableau des derniers sondages repliable. La palette des familles échoue aux contrôles du script de la compétence dataviz (bande de clarté, chroma, écart pour les daltoniens 4,7, écart en vision normale 7,6 entre les deux rouges de la gauche) : elle n'est pas changée (convention du jeu sur les affiches, les barres et la carte), le graphique compense par l'encodage secondaire (étiquettes, fils) et éclaircit les couleurs la nuit (`color-mix`).
- **P22-04 faite** — `screens/Programme.tsx` : tuiles de domaine (jauge de trois propositions, « 1 retenue sur 3 »), un panneau ouvert à la fois et amené à la vue, ouvert d'emblée sur le premier domaine retenu ; cartes, boutons et validation par le serveur inchangés.
- **P22-05 faite** — `components/ThemeChoice.tsx` (tuiles Clair, Soirée, Système avec vignette), jingles en cartes, crédits en catégories `<details>` (titres de niveau 3, nombre d'entrées, mentions légales ouvertes), filtre (région d'état permanente : « 12 crédits trouvés. »), crédits des polices (mentions de droit d'auteur lues dans le fichier LICENSE de chaque paquet).
- **P22-06 faite** — tuile d'action ajoutée « imprimée » (aplat de surligneur qui s'efface en 420 ms, opacité seule) et compteur du plan qui rebondit (220 ms, transformation seule) ; défi du jour avec la date frappée comme un tampon à côté du score.
- **P22-07 faite** — audit WCAG 2.2 AA : focus jamais masqué sous les barres collantes (critère 2.4.11, marge de défilement calculée sur `--hud`), titres conservés dans les crédits (1.3.1), messages d'état annoncés (4.1.3) ; revue visuelle en captures ; `pnpm check` (89 fichiers, 816 tests), intégration (11 fichiers, 105 tests), e2e (97 réussis sur les projets bureau et téléphone, 3 propres au téléphone sautés sur le bureau), `pnpm test:mobile` (paquet de l’APK, réseau coupé : réussi) ; revue finale de la branche (relecture par l’auteur) : lecture du graphique perdue au doigt levé, corrigée et testée ; application 1.14.0 (`versionCode` 15), APK sans nouvelle permission.

**Bilan (04/11/2026)** — les sept tâches sont réalisées ; moteur (0.22.0), jeu de règles (20.0.0) et format de sauvegarde (22) inchangés ; application 1.14.0. Limites : la palette des familles reste hors des contrôles de lisibilité pour les daltoniens (compensée dans le graphique, pas sur les affiches ni la carte, R-58) ; Firefox et Safari ne sont pas installés ici : le correctif du critère 2.4.11 y est vérifié par la marge réservée, pas par un essai réel ; rendu relu en captures Chromium seulement, pas sur un téléphone réel ; la soirée électorale, le débat et la carte gardent leur présentation (hors périmètre de la spécification).

### Phase 23 — Présidentielle suivante : candidatures et poids du bilan (terminée)

Demande de l'utilisateur du 04/11/2026 : « faire en sorte que les candidats et personnalités politiques puissent choisir de se présenter ou non dans la présidentielle qui suit le premier quinquennat, pas forcément les mêmes ; impact du quinquennat sur les intentions pour le président sortant ». Décisions de l'utilisateur (questionnaire) : le joueur dont le candidat ne se représente pas **passe la main à un successeur de son camp** et joue sa campagne ; entrent des personnages **fictifs** et des **personnalités réelles déjà présentes dans la partie** (candidature simulée et étiquetée, aucun propos prêté). Spécification : `docs/superpowers/specs/2026-11-04-presidentielle-suivante-candidatures-design.md` ; plan : `docs/superpowers/plans/2026-11-04-presidentielle-suivante-candidatures.md`. Jeu de règles 21.0.0, format de sauvegarde 23, moteur 0.23.0.

| # | Tâche | Critère d'acceptation |
|---|---|---|
| P23-01 | Schémas, jeu de règles 21.0.0 (`succession`), format 23 et migration 22 → 23. | paramètres `hypothese` aux valeurs de la spécification, bornes contrôlées ; une personnalité réelle renvoie à exactement une fiche ; un état réel du format 22 migré sans perte. |
| P23-02 | Poids du bilan sur les intentions. | formule bornée à ± 0,6 ; facteur « Bilan du quinquennat » pendant la seule campagne suivante ; somme exacte des facteurs. |
| P23-03 | Candidatures des autres et entrants. | probabilités bornées, inéligible au terme de deux mandats, déterminisme par graine ; héritier, ministre ambitieux, familles sans candidat ; au plus 12 candidats, deux au moins ; annonces sans propos. |
| P23-04 | Décision du joueur et passation. | décision quatre semaines avant la campagne, jamais en observateur ; pas de « se représenter » au terme de deux mandats ; successeur nouveau ou déjà acteur (sans doublon), militants transmis par le registre ; 2037 de nouveau. |
| P23-05 | API et moteur local. | aucune route nouvelle ; avance rapide arrêtée sur la décision ; même état final que le moteur. |
| P23-06 | Interface. | cartes des successeurs (portrait, nature), section « Candidatures » du bilan et du débriefing, badges de l'écran Candidats ; e2e bureau et téléphone, axe-core. |
| P23-07 | Documentation, vérifications, APK 1.15.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK sans nouvelle permission. |

- **P23-01 faite** — `DECISION_KINDS` + `candidature` ; formats 17 à 22 figés (`ActorV22Schema`, `CandidateIdentityV22Schema`, `PendingDecisionV22Schema`, `GameStateV22Schema`) ; `SuccessionSchema` ; identité avec `figureId` facultatif ; bloc `succession` contrôlé (bornes ordonnées, successeurs sous le plafond) ; migration 22 → 23 (`succession: null`) sur une fixture réelle de fin de quinquennat (`v22-phase-22.json`).
- **P23-02 faite** — `presidency/succession.ts` : `recordScore` (popularité finale, note, chômage) et `recordFactors`, ajouté par `campaignFactors` à l'année du cycle seulement.
- **P23-03 faite** — `runProbability` et `applySuccession`, appelée par `openNextCampaign` : tirages dans l'ordre des probabilités, plafond, héritier (Premier ministre, sinon le ministre le plus populaire), ministre ambitieux, profils des familles sans candidat ; entrants `entrant-<année>-<fiche>` (figure : `figureId`, position CHES, aucun programme) ; seuls les candidats déclarés reçoivent leurs moyens de départ ; annonces « Candidature simulée : … » avec un motif chiffré.
- **P23-04 faite** — `requestCandidacy`, `successorOptions`, `answerCandidacy` et la passation (acteur existant repris, sinon entrant ; ancien candidat retiré, jamais de retour) ; règle de participation : un acteur resté à l'écart n'est annoncé que s'il revient. Contrôle par mutation : sans la décision ou sans la passation, 5 et 3 tests échouent.
- **P23-05 faite** — intégration (président joueur, avance rapide arrêtée sur la décision, passation, état relu au format 23) ; moteur local (partie du format 22 importée sur l'appareil, même empreinte finale que le moteur seul).
- **P23-06 faite** — `CandidacyOptions.tsx` (pop-up automatique et cartes), `Candidacies.tsx` (bilan, journal, débriefing), badges « Nouveau en 2032 » et « Ne se présente pas », photo libre d'une figure entrante ; fixture e2e `president-fin-de-mandat.json` ; captures relues (bureau, téléphone) : mention de nature en double retirée des cartes, motifs rendus épicènes.
- **P23-07 faite** — revue finale de la branche (relecture par l'auteur) : un choix de successeur était ignoré si le gouvernement changeait entre la décision et l'ouverture de la campagne (remaniement) ; corrigé (le successeur doit seulement exister encore) et testé. `pnpm check` (92 fichiers, 853 tests), intégration (11 fichiers, 106 tests), e2e (99 réussis sur les projets bureau et téléphone, 3 propres au téléphone sautés sur le bureau), `pnpm test:mobile` (paquet de l'APK, réseau coupé : réussi) ; application 1.15.0 (`versionCode` 16), APK sans nouvelle permission.

**Bilan (04/11/2026)** — les sept tâches sont réalisées ; moteur 0.23.0, jeu de règles 21.0.0, format de sauvegarde 23 ; application 1.15.0 (`versionCode` 16). Limites : paramètres des candidatures et du bilan non calibrés (hypothèses, R-59) ; pas de primaires, ni d'annonces au fil des semaines, ni d'alliances avant le premier tour (hors périmètre) ; les entrants n'ont ni implantation régionale ni programme ; un ancien candidat du joueur ne revient jamais ; le reclassement des annonces dans l'interface repose sur la copie fixe du moteur.

### Phase 24 — Rééquilibrage de la présidentielle (terminée, critères partiellement atteints)

Demande de l'utilisateur du 04/11/2026 (brief « Phase 24 : rééquilibrage », choix « Rééquilibrage d'abord ») : un banc d'essai reproductible, puis des corrections mesurées par lui. Spécification : `docs/superpowers/specs/2026-11-04-reequilibrage-design.md` ; plan : `docs/superpowers/plans/2026-11-04-reequilibrage.md` ; mesures : [docs/equilibrage](./equilibrage/) (référence [avant](./equilibrage/reference-phase-24-avant.md) et [après](./equilibrage/reference-phase-24-apres.md)). Jeu de règles 22.0.0, format de sauvegarde 24, moteur 0.24.0, application 1.16.0.

| # | Tâche | Critère d'acceptation | État |
|---|---|---|---|
| P24-01 | Banc d'essai et référence. | `pnpm sim:equilibrage`, déterministe graine par graine, 300 parties par scénario ; référence avant commitée. | fait |
| P24-02 | Schémas, jeu de règles 22.0.0, format 24, sondages sourcés. | cinq enquêtes et 25 duels relus dans une révision figée, chacun avec sa notice ; migration 23 → 24 sans variation des intentions. | fait |
| P24-03 | Départ « Sondages actuels ». | semaine 0 à ± 2 points de la moyenne, seconds tours à ± 4 points des duels ; facteur « Socle électoral (sondages au JJ/MM/AAAA) » ; refus sans personnalité réelle (API et moteur local) ; étiquette fixe à l'étape « Le terrain ». | fait |
| P24-04 | Candidat personnalisé jouable. | Découverte 35–60 %, Standard 15–30 %, Expert 5–15 %, Légende 1–8 %, strictement décroissant. | fait : 50 / 35,7 / 16,7 / 12,7 / 2 % |
| P24-05 | Programme visible et programme de départ suggéré. | alerte du QG avec l'effet estimé ; bouton qui ajoute les propositions au plan ; sans programme en Standard, au moins 5 points de victoires de moins. | fait : 0 % contre 16,7 % |
| P24-06 | Avantage du centre. | fictifs : aucun > 45 %, au moins 4 vainqueurs, 3 qualifiés > 10 % ; réels équitable : aucun > 55 % ; miroirs : écart ≤ 3 points. | en partie : 49 %, 4, 3 ; 41 % ; miroirs non atteints |
| P24-07 | « Naïf < passif », parrainages, essai Android. | diagnostic écrit ; parrainages documentés ; script adapté à l'assistant. | fait (non reproduit ; ralliements et échec de justesse documentés ; script non exécuté faute d'émulateur) |
| P24-08 | Vérifications, documentation, APK 1.16.0. | `pnpm check`, intégration, e2e, `pnpm test:mobile` ; APK sans nouvelle permission. | voir le bilan |

- **Critères non atteints** (chiffres de la référence après) : candidat fictif le plus victorieux à 49 % (cible 45 %) ; positions miroirs à 13,7 % (droite) contre 0 % (gauche), recul par rapport à la référence ; en « Sondages actuels », Marine Le Pen gagne 86,7 % (cible 55–85 %) et Philippe, Glucksmann et Mélenchon incarnés restent sous 2 % (cible 5 %). Cause commune : le second tour reste très déterministe une fois les qualifiés connus ; une règle générale de second tour moins joué d'avance est à concevoir dans une phase suivante, sans règle ciblée sur une personne.
**Bilan (04/11/2026)** — moteur 0.24.0, jeu de règles 22.0.0, format de sauvegarde 24 ; application 1.16.0 (`versionCode` 17), APK construit et vérifié en local (`aapt2` : 1.16.0, 17, aucune permission nouvelle, pas d'`INTERNET` ; `apksigner` : signature valide). `pnpm check` (98 fichiers, 883 tests), intégration (11 fichiers, 108 tests), e2e (bureau et téléphone ; boucle complète mise à jour des moyens de départ), `pnpm test:mobile` (paquet de l'APK, réseau coupé : réussi). Limites : quatre critères du brief non atteints (ci-dessus) ; parrainages de Zemmour et ralliements d'Étincelle documentés, non réglés ; essai Android non exécuté faute d'émulateur (GitHub Actions bloqué au niveau du compte).
- **Proposition non implémentée (brief)** : un événement « décision de la Cour de cassation » concernant l'éligibilité d'une personnalité réelle. Il ne pourrait s'appuyer que sur une décision publiée, datée et sourcée (jamais anticipée ni inventée), et être présenté comme tel ; à instruire avec l'utilisateur avant toute écriture.
### Phase 25 — Le plateau : jeu de plateau et de cartes (terminée)

Demande de l'utilisateur du 04/11/2026 : « je veux que ce soit totalement différent, addictif et incroyablement magnifique ». Décisions de l'utilisateur (questionnaire et maquettes) : **plateau + cartes** (la France des départements, toujours visible, est le plateau ; les actions sont des cartes en main que l'on pose ; la semaine se résout en verdict animé), **résolution spectaculaire** et **combos**, **téléphone Android d'abord**, direction visuelle **« mélange A + B »** (feutrine bleu nuit, plateau en carton, cartes épaisses, pions dorés, énergie d'un jeu mobile), couleur de la carte = **implantation** par département. Après un premier rendu jugé éloigné de la maquette validée (« Je m'attendais à ça c'est ce qui était prévu »), le plateau et le verdict ont été refaits d'après elle. Spécification : `docs/superpowers/specs/2026-11-04-plateau-de-jeu-design.md` ; plan : `docs/superpowers/plans/2026-11-04-plateau-de-jeu.md` ; banc : [référence de la phase 25](./equilibrage/reference-phase-25.md). Jeu de règles 23.0.0, format de sauvegarde 25, moteur 0.25.0, application 1.17.0.

| # | Tâche | Critère d'acceptation | État |
|---|---|---|---|
| P25-01 | Schémas, jeu de règles 23.0.0, format 25, règles partagées. | blocs `implantation` et `combos` (hypothèses), familles des cartes ; migration 24 → 25 sur des états réels ; `implantationTier`, militants par département, `weekCombos` partagés. | fait |
| P25-02 | Implantation et combos dans le moteur. | départ, gains par carte et par région, érosion, plafond, série, bastion, tour de région au registre (facteurs publiés) ; déplacements du président. | fait |
| P25-03 | Effets électoraux. | facteur « Implantation » national, multiplicateur local du dépouillement (total national conservé), projection par département déterministe. | fait |
| P25-04 | IA et banc d'essai. | les adversaires visent des départements ; critères atteints en phase 24 tenus. | fait (un critère toujours manqué, ci-dessous) |
| P25-05 | Identité « Feutrine ». | jetons clair et nuit, contrastes testés, police d'affichage embarquée. | fait |
| P25-06 | Le plateau. | carte SVG des départements, trois lectures (implantation, qui mène, sondage local) avec légende chiffrée, fiche de département, clavier. | fait |
| P25-07 | Main et pose. | cartes indisponibles grisées avec leur raison, combo annoncé, pose au toucher, au glisser et par la liste ; même requête d'avance que le QG. | fait |
| P25-08 | Verdict. | séquence (cartes retournées, combos, paliers, sondage), accélération au toucher, mouvement réduit, bruitages. | fait |
| P25-09 | Boîte de jeu. | chaque écran dans un panneau par-dessus le plateau ; anciennes adresses redirigées ; focus rendu. | fait |
| P25-10 | Restylage et maquette. | écran-titre et création sur la feutrine ; plateau et verdict conformes à la maquette validée. | fait |
| P25-11 | Vérifications, documentation, APK 1.17.0. | `pnpm check`, intégration (plan à cibles départementales : même état final par l'API et le moteur local), e2e téléphone et bureau (semaine jouée au plateau, panneaux, axe-core), `pnpm test:mobile` ; APK sans nouvelle permission. | voir le bilan |

- **Règles (jeu de règles 23.0.0, hypothèses)** : implantation de 0 à 100 par acteur et par département ; départ 30 dans la région d'origine ; gains des cartes Terrain (porte-à-porte +8, rencontre d'élus +10, recrutement +6, meeting +12, grand meeting +20 et +5 dans sa région, tournée +6 dans chaque département de sa région), déplacement du président +8 ; érosion de 1 point par semaine hors des départements joués ; plafond 100. Combos : série (2e carte d'une famille +25 %, suivantes +50 %), bastion (deux cartes dans un département : gain ×1,5), tour de région (trois départements d'une région : +5 dans toute la région). Effet sur le vote : facteur « Implantation » (poids 0,5, pivot 15) et multiplicateur local (α 0,6) renormalisé sur la base territoriale.
- **Interface** : le plateau est l'écran d'ouverture de la partie, plein cadre sur la feutrine (sans bandeau de campagne ni barre des espaces) : semaine, compte à rebours, rang au dernier sondage, trois jauges ; la France en carton du crème à l'orange brûlé ; la main en éventail fixée au-dessus du bouton doré « Jouer la semaine N » ; aperçu de la carte au-dessus du département visé, éclair du gain et bannière dorée des combos formés. Le verdict : « Le verdict » en lettres dorées, carte et gains d'implantation, tuiles retournées une à une, bannière des combos, « Votre sondage » avant → après ; le bilan détaillé reste. La boîte de jeu ouvre tous les autres écrans en panneaux ; le QG détaillé reste à son adresse.
- **Défauts trouvés et corrigés en fin de phase** (revue des captures et audits axe-core des e2e) : carte noire (teintes non émises par Tailwind 4) ; gain du verdict absent (cible du bilan en libellé, code retrouvé dans le jeu de règles) ; contraste des effets en vert sur le carton (4,24:1, encres « gain » et « perte » ajoutées) ; focus non rendu à « Boîte de jeu » à la fermeture d'un panneau ; carte « Dernière partie » de l'écran-titre écrite à la craie sur fond clair (1,09:1) ; bruitages « carte posée » et « carte retournée » trop faibles ; mention « Simulation » du pied de page cachée par la main fixée en bas du plateau.

**Bilan (05/11/2026)** — les onze tâches sont réalisées ; moteur 0.25.0, jeu de règles 23.0.0, format de sauvegarde 25 ; application 1.17.0 (`versionCode` 18). Banc : les critères atteints en phase 24 sont tenus ; Marine Le Pen gagne désormais 82 % des parties « Sondages actuels » (cible 55–85 % atteinte) ; le candidat fictif le plus victorieux reste au-dessus de 45 % (Rivière 52 %, 100 parties). Limites : la main n'est pas tirée au hasard (toutes les cartes jouables), pas d'objectifs de la semaine ni de combos du quinquennat (hors périmètre) ; les espaces, la barre des espaces et le QG détaillé restent hors du plateau (accessibles par la boîte de jeu) ; la soirée électorale et les débats gardent leur habillage télévisé ; l'aperçu de pose montre le gain d'implantation de la règle, pas l'effet en points d'intentions que seul le moteur calcule ; paramètres d'implantation non calibrés (hypothèses).

### Phase 25 bis — La carte des intentions de vote (terminée)

Brief de l'utilisateur du 05/11/2026 (intitulé « Phase 24 bis — La carte des intentions de vote »), après essai de la version 1.17.0 : la carte calculait déjà la projection des intentions de vote par département (`opinion.departements`) sans la montrer — « Qui mène » en deux couleurs (le joueur, tous les adversaires), scores cachés dans les noms accessibles, aucun classement local. Phase d'**affichage** seulement : ni moteur, ni modèle de vote, ni équilibrage, ni charte visuelle ; le jeu de règles (23.0.0), le format de sauvegarde (25) et le moteur (0.25.0) sont inchangés. Application 1.18.0.

| # | Travail | Critère d'acceptation | État |
|---|---|---|---|
| 1 | Fiche du département : mini-sondage local. | les cinq premiers chiffrés, le joueur mis en évidence (ajouté à son rang s'il est plus loin), sur le modèle du tableau des intentions de vote ; implantation et militants conservés ; « Projection disponible après une semaine de campagne » sans projection. | fait |
| 2 | « Qui mène » lisible. | une couleur par candidat en tête (le joueur garde l'or), légende qui nomme chaque leader avec son nombre de départements ; deux leaders différents, deux couleurs différentes. | fait |
| 3 | « Sondage local » chiffré. | votre score écrit sur les départements où le chiffre tient (arrondi, note en légende), et dans l'infobulle avec le leader et son score. | fait |
| 4 | Infobulle de lecture. | commune aux trois lectures, au survol, au clavier (focus) et au toucher ; noms accessibles exacts complétés par le classement (« Aisne (02) : … ; intentions : Rivière 27,4 %, Laborde 19,1 %, vous 8,8 % »). | fait |
| 5 | Accessibilité. | chiffre ou nom du leader visible ou accessible dans chaque mode ; audits axe-core des lectures « Qui mène » et « Sondage local » (e2e) ; étiquettes à l'encre sur liseré de carton. | fait |
| 6 | Tests. | tri et mise en forme (égalités, candidats inconnus, projection vide), carte des trois lectures, fiche (cinq premiers, joueur plus loin, observateur, sans projection), infobulle ; pose des cartes inchangée. | fait |

- **Palette des leaders** : les couleurs de famille des sondages ne suffisent pas sur une carte (validateur de palettes : trois bleus et deux rouges indiscernables, jaune du centre libéral confondu avec l'or du joueur). Palette dédiée de quatre couleurs (violet `#6250d6`, magenta `#e87ba4`, marine `#0d366b`, sarcelle `#2e7d7d`) avec l'or du joueur : toutes paires comparées sur le carton de jour et de nuit, écart perceptif ≥ 20,9 en vision normale et ≥ 9,2 en daltonisme. Couleurs attribuées dans l'ordre des acteurs de la partie ; au-delà de quatre adversaires en tête à la fois, les suivants partagent une couleur « Autres en tête », nommés dans la légende. Les noms (légende, infobulle, fiche, noms accessibles) portent toujours l'information, jamais la couleur seule.
- **Défaut corrigé en passant** : sur téléphone, toucher le centre d'un archipel d'outre-mer (Guadeloupe) tombait dans la mer et ne choisissait rien ; tout l'encart d'un territoire d'outre-mer se touche désormais pour son département.
- **Vérification manuelle** (paquet hors ligne, téléphone 390 × 844, semaine 0 jouée) : Marine Le Pen contre des personnalités réelles mène les 101 départements (« Qui mène » d'une seule couleur, l'or) ; Jean-Luc Mélenchon contre des personnalités réelles ne mène nulle part (Marine Le Pen en tête partout) ; Marine Le Pen contre les adversaires fictifs : Antoine Rivière (72 départements) et Mathieu Laborde (29) en tête, deux couleurs. Départements contrastés relevés : le meilleur score du joueur, son pire, la Guadeloupe.
- **Hors périmètre, noté pour la suite** : socle « Sondages actuels » sans effet quand une personnalité réelle affronte des adversaires fictifs (à signaler à la création ou à étendre) ; chevauchement de la main avec la légende et le bas de la carte sur téléphone, titres de cartes tronqués (identité visuelle du plateau) ; écart de rendu du « Qui mène » en réels contre réels (un seul leader : la projection reflète des intentions nationales très dominées, sujet d'équilibrage).

**Bilan (05/11/2026)** — application 1.18.0 (`versionCode` 19) ; jeu de règles 23.0.0, format 25 et moteur 0.25.0 inchangés (aucune règle ni paramètre modifiés : pas de nouvelle version du jeu de règles, qui imposerait une migration des sauvegardes).

### Phase 25 ter — Le mandat présidentiel approfondi et Teddy Riner (terminée)

Brief de l'utilisateur du 10/11/2026 (intitulé « Phase 24-ter : le jeu post-élection »), après une partie complète gagnée avec David Lisnard : choix du Premier ministre sans aide à la décision, questions au gouvernement trop longues aux répliques toujours identiques, décisions ministérielles sans suivi ; plus Teddy Riner, candidature annoncée le 9 novembre 2026. Numérotée « 25 ter » ici (la phase 25 est faite). Hors périmètre : moteur de campagne, équilibrage, identité visuelle. Jeu de règles **24.0.0**, format de sauvegarde **26**, moteur **0.26.0**, application **1.19.0**.

| # | Travail | Critère d'acceptation | État |
|---|---|---|---|
| 1 | Matignon : cinq propositions. | 5 propositions justifiées (profil, une ou deux forces ou limites, phrase de justification), cohérentes avec le camp du président et l'Assemblée ; en cohabitation, issues de la majorité ; contexte écrit (« Assemblée … X sièges pour votre camp …, cohabitation probable/improbable ») ; liste complète sous « Voir toutes les personnalités ». Test : 120 Assemblées tirées au hasard, 100 % des propositions cohérentes. | fait |
| 2 | QAG : moins de texte. | introduction en une phrase (groupe, ministre, sujet), le reste en légende discrète, mentions de simulation conservées ; −30 % au moins. | fait : −77 % sur 40 séances (425 → 96 caractères en moyenne) ; légende comprise, le texte total baisse moins |
| 3 | QAG : répliques variées. | au moins 4 banques (5 nouvelles + la classique) tirées selon le contexte (majorité solide ou fragile, cohabitation, nature du sujet), effets variés (ministre, Premier ministre, économie), aléa contrôlé ; 20 séances : jamais 4 jeux identiques de suite. | fait : jamais deux séances de suite avec la même banque |
| 4 | Suivi des décisions. | chaque urgence tranchée reçoit un bilan 2 à 5 semaines plus tard, rappel de la décision, bilan favorable ou défavorable chiffré (part différée de l'effet, popularité du ministre), journal « Suivi des décisions » au Conseil des ministres. | fait |
| 5 | Teddy Riner. | fiche sourcée (faits seulement), notoriété haute, implantation nulle, aucune organisation ; banc : cibles existantes tenues ; qualification de Riner rare. | en partie : fiche et cibles tenues ; parrainages pas assez difficiles (banc ci-dessous) |
| 6 | Tests et Android. | tests existants verts ou mis à jour (justifié) ; essai Android non dégradé. | fait |

- **Décisions** : une proposition est « cohérente » si, en cohabitation (règle du moteur : majorité d'opposition aux dernières législatives), elle est plus proche de la position moyenne de cette majorité que du président ; sinon, si sa proximité avec le président atteint le seuil d'acceptation. Quatre personnalités (acteurs, figures réelles) et un profil fictif. Les banques de répliques sont des hypothèses du jeu ; « relation avec un groupe parlementaire » n'est pas modélisée (aucun indicateur existant), seuls la tension, la popularité, le ministre et le Premier ministre le sont. Suivi : 40 % de l'effet sur l'opinion attend le bilan, dans le sens du bilan (au moins 0,2 point) ; probabilité d'un bilan favorable 55 %, + 0,6 × (compétence − 0,5), ± 15 points selon que le choix ménage ou heurte l'opinion (hypothèses).
- **Teddy Riner** : fiche ajoutée à la main dans la sélection de l'importeur (candidature postérieure à la révision importée de Wikipédia), source RTS du 9 novembre 2026 (SOURCES §8 quater). Aucun propos, slogan ni programme repris, conformément aux règles du projet : le positionnement « ni de droite, ni de gauche » et le slogan du brief ne sont pas affichés ; position au milieu de l'échelle (0, 0), méthode « sans parti » (hypothèse). Notoriété 3 (règle étendue : personnalité de premier plan hors politique), organisation « aucune », aucune implantation. Photo de l'infobox Wikipédia, choisie sur Wikimedia Commons (Georges Biard, CC BY-SA 3.0), créditée comme les autres. Les parrainages et le financement passent par les mécanismes existants (moyens du niveau « aucune » : budget et promesses faibles) — aucun paramètre ni mécanisme modifié.
- **Banc** (`pnpm sim:equilibrage … --parties 100`, [référence](./equilibrage/reference-phase-25-ter.md)) : les cibles écrites des phases 24 et 25 sont tenues (fictifs inchangés ; Le Pen qualifiée 100 %, victorieuse 85 %, à la borne ; Mélenchon 2e qualifié 78 % ; réels équitables : Attal 52 %, sous 55 %). Teddy Riner incarné : 0 % de qualification sur 100 parties (cible < 10 % atteinte ; « pas impossible » non démontré), mais il obtient toujours ses parrainages : les mécanismes existants ne rendent pas les 500 signatures difficiles sans organisation (à traiter dans une phase d'équilibrage). Effet de bord : avec un candidat de plus auprès des élus, Zemmour échoue aux parrainages dans 100 % des parties « Sondages actuels » (65 % avant) et Roussel dans 15 à 20 %.

**Bilan (10/11/2026)** — application 1.19.0 (`versionCode` 20), puis 1.19.1 (`versionCode` 21) avec la photo de Teddy Riner ; jeu de règles 24.0.0, format 26 (parties existantes migrées, journal vide), moteur 0.26.0.

### Phase 26 — Scènes 3D des moments forts (terminée, critères de performance non vérifiables ici)

Brief de l'utilisateur du 10/11/2026 (« Phase 26 : scènes 3D ») : la 3D marque les moments forts (questions au gouvernement, soirée électorale, débat, meeting, ralliement, investiture, écran-titre) et laisse le reste du jeu en 2D ; three.js par react-three-fiber, chargé à la demande ; aucune personnalité réelle en 3D. **Changement de direction du 11/11/2026**, à la vue des premiers rendus (aplats, pavés de couleur) jugés « enfantins » : rendu **réaliste**. Le moteur, les règles et le format de sauvegarde ne changent pas (jeu de règles 24.0.0, format 26, moteur 0.26.0).

| # | Critère d'acceptation | État |
|---|---|---|
| 1 | QAG : hémicycle 3D, 577 sièges selon les groupes de la partie, 3 plans de caméra, groupe interpellateur en surbrillance, 3 réactions liées à la tension, textes en HTML. | fait : 577 fauteuils instanciés aux effectifs de la partie ; plans large, plongée sur le groupe (projecteur), retour sur le banc du gouvernement ; réactions apaisement, échauffement, contre-attaque d'après les points de tension de la réplique (jeu de règles) et la tension parlementaire |
| 2 | Soirée électorale : carte 3D départementale extrudée, coloration progressive, rotation et zoom au doigt, légende HTML, déclenchement sur les résultats et bouton « vue 3D ». | fait : ouverte en 3D les soirs de scrutin, bouton « Vue 2D / Vue 3D » ; relief = score du candidat en tête |
| 3 | Main en CSS 3D : éventail, tilt au toucher, plus de chevauchement avec la légende, plus de titre tronqué. | fait : éventail qui suit le défilement, carte qui penche sous le doigt, pose animée ; le plateau tient au-dessus de la main (hauteur mesurée), légende repliée ; mesuré sur 390 × 844 : bas de la légende à 548 px, haut de la main à 566 px, 0 titre tronqué sur 18 |
| 4 | Ralliement et investiture : présentes, sautables, écran statique en mouvement réduit. | fait (fin de la soirée du premier et du second tour) |
| 5 | ≥ 55 images par seconde en moyenne sur un appareil de milieu de gamme ; repli 2D vérifié (WebGL indisponible, moins de 30 images par seconde). | **non vérifié** pour la cadence : cet environnement n'a ni téléphone ni processeur graphique (rendu logiciel, quelques images par seconde, sans rapport avec un appareil réel) ; repli 2D : fait et testé |
| 6 | Surcoût ≤ 2 Mo compressés, three.js absent du paquet initial. | fait : 275 Ko compressés (gzip), entièrement chargés à la demande ; paquet initial sans three.js (vérifié sur le paquet construit et par un test) |
| 7 | Tests existants verts, essai Android non dégradé. | fait (un scénario mis à jour : il déplie la légende) |
| 8 | Nouveaux tests : sièges, repli 2D, chargement à la demande. | fait (33 tests) |
| 9 | Débat : plateau 3D, au moins 3 plans, lumière réactive à la tension, aucune personnalité. | fait : 4 plans (large, serré, champ-contrechamp, écran partagé) ; pupitres vides |
| 10 | Meeting : foule en un seul appel de dessin, corrélée aux données de la partie. | fait : un seul maillage instancié pour toute la foule (2 779 silhouettes dans l'essai, 32 appels de dessin pour la scène entière, décor et post-traitement compris ; l'écart d'un appel avec et sans foule a été mesuré sur la première version de la scène, 14 contre 13, pas remesuré depuis) ; test fief réussi contre meeting raté |
| 11 | Reports de voix : arcs proportionnels, dans l'entre-deux-tours et réutilisables. | fait : arcs sur la carte du second tour et dans la transition de ralliement, liste écrite en repli ; test de proportionnalité |
| 12 | Écran-titre : drapeau en shader de tissu, onde au toucher, chargement initial non dégradé. | fait : drapeau statique (CSS) pendant le chargement |
| 13 | Trois paliers forçables, « éco » sans post-traitement, confettis et vague aux deux autres. | fait (Paramètres → Scènes 3D) |

- **Rendu réaliste, sans aucun fichier** : matériaux physiques éclairés par un environnement, ombres douces, courbe de tons ACES, profondeur de champ (palier élevé), bloom, vignette et grain ; textures de bois, pierre, velours, gravier, ardoise et béton fabriquées à l'ouverture de la scène (bruit fractal, cartes de normales et de rugosité). Hémicycle : gradins de moquette rouge, pupitres de chêne, fauteuils de velours, colonnade. Débat : sol laqué qui reflète le décor (scène dessinée en miroir), pupitres de métal à face lumineuse. Meeting et ralliement : foule de silhouettes humaines sans visage, à contre-jour dans la brume, faisceaux de projecteurs. Investiture : cour de l'Élysée stylisée sous un ciel calculé (diffusion atmosphérique), garde suggérée par des silhouettes casquées. Carte : maquette posée sur une table laquée.
- **Limite du réalisme** : tout est procédural. Un rendu photographique demanderait des modèles et des textures d'après photo (plusieurs dizaines de Mo) ; les sites d'actifs libres (Poly Haven, ambientCG) ne sont pas joignables depuis cet environnement. Les personnes restent des silhouettes sans visage, par règle du projet (aucune personnalité réelle en 3D).
- **Décisions** : la tension du débat n'existe pas dans le moteur ; elle est lue dans ce qu'il produit déjà (part d'attaques et de petites phrases, coups retournés, écart d'approbation), pour la mise en scène seulement. Le poids d'un report de voix est le nombre de voix du premier tour du candidat rallié (réservoir orienté par sa consigne, pas un transfert mesuré). La foule d'un meeting se déduit de l'implantation, des militants et du gain obtenu : mise en scène, aucune jauge de salle affichée. En automatique, un rendu logiciel vaut WebGL indisponible ; un palier forcé passe outre et n'est jamais abaissé. Le meeting ne s'affiche qu'en 3D (le verdict dit déjà le résultat) ; ralliement et investiture gardent leur écran statique.
- **Reste à faire** : mesurer la cadence sur un vrai téléphone de milieu de gamme et ajuster les paliers ; la règle des immuables du compilateur React est désactivée pour `scenes3d/three` (three.js se pilote par mutation).

**Bilan (11/11/2026)** — application 1.20.0 (`versionCode` 22) ; `three` 0.187.0 et `@react-three/fiber` 9.8.2 ajoutés à l'interface.

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
| Q9 | APK Android : enveloppe connectée à un serveur hébergé, ou mode hors ligne sur l'appareil | **Décidé par l'utilisateur le 21/10/2026 : mode 100 % local et hors ligne.** **Fait en phase 8** : moteur et parties sur l'appareil (`@r2027/local-api`, IndexedDB), décision D13. | — |

## 6. Prochaine étape

Phases 6 à 12 terminées le 23/10/2026, phases 13 et 14 le 28/10/2026, phases 15 à 19 le 29/10/2026, phases 20 et 21 le 03/11/2026, phases 22 et 23 le 04/11/2026, phases 24 et 25 le 05/11/2026, sur la branche `claude/new-session-lmxg1t` (PR #2) : le jeu est jouable dans le navigateur (avec le serveur) et en application Android hors ligne (1.17.0), sur un plateau de jeu et de cartes (la France des départements colorée par l'implantation, la main en éventail, combos, verdict spectaculaire, boîte de jeu), avec une présidentielle suivante renouvelée (se représenter ou passer la main à un successeur, candidatures simulées, entrants, poids du bilan du sortant), dans une interface refondue « Tract » puis ordonnée (sommaire collant des espaces, évolution des sondages en courbes, programme en tuiles, crédits filtrables) (encres bleue et rouge en surimpression, surligneur, QG en pupitre, coup de tampon de fin de semaine) avec de nouvelles musiques sous licence libre et des jingles réécrits, avec une création en assistant pas à pas et un format court, une équipe de campagne qui raconte la semaine, des événements en chaîne et des coups des adversaires, le calendrier réel (jours fériés, campagne officielle et égalité des temps de parole), un palmarès avec niveau de joueur, déblocages et défi du jour (rappel quotidien sur Android), de la musique d'ambiance et des jingles aux moments forts, à cinq niveaux de difficulté (de Découverte à Légende, avec la fiche de leurs effets), avec des débats télévisés obligatoires pour le candidat invité, avec des sondages aux couleurs des candidats, avec une pré-campagne dynamisée (orientation du mouvement, course aux parrainages, rendez-vous d'élus, négociations de soutien), un mandat vivant (urgences ministérielles et questions au gouvernement en pop-up, Conseil des ministres, remaniement ciblé, objectifs et note du mandat, succès, déplacements choisis sur la carte), un vivier de 108 personnalités réelles nominables (photos libres, expertise ministérielle, figures des blocs aux législatives), une navigation à plat en cinq espaces, un QG lisible en un coup d'œil et les détails en tiroir, une vue du mandat (hémicycle, majorité, tension parlementaire, frondeurs, ministres), des actions du chef de l'État variées, des législatives avec accords électoraux et coalition, la photo du candidat personnalisé, la soirée électorale au rythme réglable, les débats télévisés, le gouvernement ouvert aux personnalités réelles et les crédits regroupés dans Paramètres. Phase 25 bis (carte des intentions de vote, application 1.18.0) terminée le 05/11/2026 ; phase 25 ter (mandat présidentiel approfondi : Matignon, questions au gouvernement, suivi des décisions ; Teddy Riner ; application 1.19.0) le 10/11/2026. Prochaine phase : la phase 26 (limites des candidatures), dans l’ordre décidé par l’utilisateur le 04/11/2026. Restent ouverts : la CI GitHub et l’essai de l’APK sur émulateur (GitHub Actions bloqué au niveau du compte ; APK construits et vérifiés en local), l'hébergement de la version web (Q6 : image Docker, déploiement, sauvegardes du serveur, R-45), la licence des résultats 2022 (Q8), une mesure de fluidité sur un téléphone réel (R-47), le calibrage des hypothèses de jeu (R-50, R-54), le choix d'un lot parmi les idées restantes de la phase 14 (I3, I4, I8, I10 à I12 ; I7 en partie couverte par les urgences et le Conseil des ministres) et, avant une publication sur un magasin d'applications, la clé de signature et l'identifiant définitif de l'application.
