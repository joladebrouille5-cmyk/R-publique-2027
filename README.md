# RÉPUBLIQUE 2027

Simulation politique française : présidentielle, campagne et quinquennat. Jeu de stratégie dans le navigateur (PC et mobile) où l'on incarne une personnalité réelle ou un candidat personnalisé, semaine par semaine, jusqu'aux deux tours, puis pendant le quinquennat. La carte électorale interactive couvrira les communes de métropole et des DROM.

> Nom de projet provisoire.

## État du projet

| Phase | Contenu | État |
|---|---|---|
| 0 | Audit, architecture, sources, risques | ✅ terminée |
| 1 | Squelette web, API, base, navigation, sauvegardes | ✅ terminée |
| 2 | Calendrier hebdomadaire, actions, ressources, événements, journal | ✅ terminée |
| 3 | Candidats, adversaires autonomes, sondages, participation, deux tours | ✅ terminée |
| 4–8 | Carte, campagne, quinquennat, contenu, mise en ligne | à faire |

**Ce qui fonctionne aujourd'hui** :
- créer une partie avec son candidat (prénom, nom, parti, positionnement économique et sociétal, parcours, profil de départ) ou en observateur, avec difficulté, date de départ et graine ;
- affronter 7 adversaires **fictifs** qui mènent leur campagne seuls, avec le même catalogue d'actions et les mêmes coûts ;
- suivre les sondages simulés de deux instituts fictifs (fiche technique complète, marge d'erreur, cote de popularité distincte, hypothèses de second tour) ;
- jouer la présidentielle jusqu'au bout : premier tour (18 avril 2027), consignes de vote, débat, second tour (2 mai 2027), avec des résultats simulés en voix entières (inscrits, votants, blancs, nuls, exprimés) et le détail par groupe d'électeurs ;
- la jouer semaine par semaine : programmer des actions (meeting, tournée, interview, campagne numérique, recrutement, collecte, porte-à-porte, rencontre d'élus) avec leur coût, leur effet attendu, leur incertitude et leur risque ; trancher les décisions nées d'événements fictifs ; résoudre la semaine ;
- lire le bilan de chaque semaine, où chaque variation de ressource est décomposée en facteurs, et le journal complet de la partie ;
- suivre le calendrier électoral officiel (dates annoncées ou déduites, avec leur source) ;
- sauvegarder (5 emplacements manuels, sauvegarde automatique chaque semaine et avant un événement majeur), restaurer, exporter en JSON et importer dans une nouvelle partie, sans perte (empreinte SHA-256 identique).

**Ce qui ne fonctionne pas encore** : la suite après le second tour (gouvernement, législatives, quinquennat : phase 6) — la partie s'arrête explicitement une fois le président élu ; carte et résultats territoriaux (phase 4) ; programme, parrainages, finances réglementées, médias, alliances (phase 5) ; mode « candidat réel » (en attente de la décision Q2 : profils sourcés et validation juridique).

## Prérequis

| Outil | Version | Remarque |
|---|---|---|
| Node.js | ≥ 22.22 | https://nodejs.org (version LTS 22 ou plus récente) |
| pnpm | 10.28 | fourni par Corepack : `corepack enable` |
| PostgreSQL | 16 | via Docker Desktop **ou** installation locale |

Aucune clé d'API ni aucun service payant n'est nécessaire.

## Installation

```bash
git clone <url-du-depot> Republique-2027
cd Republique-2027
corepack enable
pnpm install
```

Copier le modèle de configuration et l'adapter :

```bash
cp .env.example .env        # Windows PowerShell : Copy-Item .env.example .env
```

Dans `.env`, remplacer `SESSION_SECRET` par une valeur aléatoire d'au moins 32 caractères. Le fichier `.env` n'est jamais commité.

## Base de données

**Option A — Docker (Windows, macOS, Linux)** : avec Docker Desktop démarré,

```bash
docker compose up -d db
```

Les URL par défaut de `.env.example` (`postgres:r2027_dev@localhost:5432`) correspondent à ce conteneur, qui crée aussi la base de test `r2027_test`.

**Option B — PostgreSQL installé localement** : créer les bases `r2027` et `r2027_test`, puis adapter `DATABASE_URL` et `DATABASE_URL_TEST` dans `.env`. Sous Linux ou macOS sans Docker, le script `scripts/pg-local.sh start` initialise et démarre une instance de développement dans `.local/postgres` (authentification sans mot de passe, limitée à `localhost`) ; retirer alors `:r2027_dev` des URL.

Appliquer ensuite les migrations :

```bash
pnpm db:deploy
```

## Lancer l'application

```bash
pnpm dev
```

- Interface : http://127.0.0.1:5173
- API : http://127.0.0.1:3001 (santé : http://127.0.0.1:3001/api/health)

Le pied de page de l'interface indique « Serveur connecté » quand l'API et la base répondent. Pour tester sur un téléphone du même réseau, voir la section Dépannage.

## Tests

| Commande | Contenu | Prérequis |
|---|---|---|
| `pnpm test` | tests unitaires, de propriétés et de composants (moteur, jeu de règles, sauvegardes, interface) | aucun |
| `pnpm test:integration` | API réelle contre PostgreSQL : parties, progression idempotente, sauvegardes, journal, export/import, migrations, isolation, sécurité | `DATABASE_URL_TEST` |
| `pnpm test:e2e` | Playwright, navigateur bureau + mobile : création du candidat, actions, progression, bilan, sauvegarde, restauration, journal, export/import, reprise, présidentielle complète jusqu'aux résultats | `DATABASE_URL_TEST` ; navigateur : `pnpm exec playwright install chromium` |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | qualité du code | aucun |
| `pnpm check` | lint + format + typecheck + tests unitaires | aucun |

La base `DATABASE_URL_TEST` est **vidée** par les tests d'intégration : ne jamais y mettre de données à conserver. L'intégration continue (GitHub Actions, `.github/workflows/ci.yml`) exécute toutes ces commandes à chaque push.

## Structure

```
apps/api            API Fastify + Prisma (sessions, parties, sauvegardes)
apps/web            Interface React (Vite, React Router, TanStack Query, Zustand, Tailwind)
apps/web/e2e        Tests Playwright
packages/engine     Moteur de simulation pur et déterministe (aucune E/S)
packages/rulesets   Jeux de règles versionnés et sourcés (calendrier, actions, événements, électorat, adversaires)
packages/save-engine  Sérialisation canonique, empreintes, migrations et export/import des sauvegardes
packages/shared     Schémas Zod et contrats d'API partagés
docs/               Cahier des charges, plan, architecture, sources, risques
scripts/            Outils de développement
```

## Documentation

- [Cahier des charges (PDF, v1.2)](docs/Cahier_des_charges_Republique_2027.pdf) — référence fonctionnelle
- [Plan de développement](docs/PLAN_DEVELOPPEMENT.md) — phases, tâches testables, état d'avancement, questions ouvertes
- [Architecture](docs/ARCHITECTURE.md) — pile technique, moteur, carte métropole + DROM, API
- [Modèle de données](docs/MODELE_DONNEES.md) — entités, schéma de base
- [Sources](docs/SOURCES.md) — sources officielles, licences, état de vérification
- [Risques](docs/RISQUES.md) — registre des risques et informations manquantes

## Principes

- Simulation déterministe (graine aléatoire), exécutée côté serveur, testable sans navigateur ni base.
- Données réelles, sondages, projections, résultats simulés et événements fictifs toujours distingués.
- Aucune clé d'API payante requise ; aucun secret dans le dépôt.

## Dépannage

- **« Configuration invalide »** au démarrage de l'API : une variable manque dans `.env` (le message liste lesquelles).
- **« Serveur ou base de données indisponible »** dans l'interface : vérifier que PostgreSQL tourne (`docker compose ps`) et que les migrations sont appliquées (`pnpm db:deploy`).
- **Port déjà utilisé** : changer `API_PORT` dans `.env` (le proxy de l'interface suit automatiquement) ; le port 5173 de l'interface est fixe.
- **Tester depuis un téléphone** : par défaut, les serveurs n'écoutent que sur la machine locale. Lancer `pnpm --filter @r2027/web exec vite --host 0.0.0.0` puis ouvrir `http://<adresse-IP-du-PC>:5173` depuis le téléphone, sur le même réseau Wi-Fi.
