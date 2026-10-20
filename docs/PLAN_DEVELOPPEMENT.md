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

### Phase 3 — Présidentielle jouable

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

### Phase 4 — Carte interactive complète (métropole + DROM)

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
| Q2 | Personnalités réelles proposées et politique d'affichage (photos, statut) | Commencer par le mode personnalisé ; profils réels ajoutés un par un, sourcés, sans photo. | phase 3 |
| Q3 | Millésime géographique et source des contours | COG 2026 (34 875 communes) et IGN ADMIN EXPRESS COG CARTO 2026, Licence Ouverte 2.0 (décision D8). | phase 4 |
| Q4 | Périmètre du scrutin | Périmètre officiel complet ; COM et Français de l'étranger dans une liste « Hors carte ». | phase 3 |
| Q5 | Comptes utilisateurs | Session anonyme par cookie en phase 1 ; comptes plus tard si mise en ligne publique. | phase 1 (non bloquant) |
| Q6 | Hébergeur | Choix avant la phase 8. | phase 8 |
| Q7 | Accès réseau aux domaines publics dans l'environnement cloud | Autoriser `www.data.gouv.fr`, `static.data.gouv.fr`, `object.files.data.gouv.fr`, `geo.api.gouv.fr` (au minimum) ; sinon exécuter les imports en local. | phase 4 |
| Q8 | Réutilisation des résultats 2022 (licence non précisée sur data.gouv.fr) | Clarifier avant de commiter des données dérivées ; à défaut, démo synthétique `fictif`. | phase 4 |

## 6. Prochaine étape

**Phase 3 — présidentielle jouable** (candidats, sondages, participation, deux tours), après validation de la phase 2.
