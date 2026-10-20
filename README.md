# RÉPUBLIQUE 2027

Simulation politique française : présidentielle, campagne et quinquennat. Jeu de stratégie dans le navigateur (PC et mobile) où l'on incarne une personnalité réelle ou un candidat personnalisé, semaine par semaine, jusqu'aux deux tours, puis pendant le quinquennat. La carte électorale interactive couvrira les communes de métropole et des DROM.

> Nom de projet provisoire.

## État du projet

| Phase | Contenu | État |
|---|---|---|
| 0 | Audit, architecture, sources, risques | ✅ terminée |
| 1 | Squelette web, API, base, navigation, sauvegardes | ✅ terminée |
| 2 | Calendrier hebdomadaire, actions, ressources, événements, journal | à faire |
| 3–8 | Présidentielle, carte, campagne, quinquennat, contenu, mise en ligne | à faire |

**Ce qui fonctionne aujourd'hui** : créer une partie (mode candidat personnalisé ou observateur, difficulté, date de départ, graine), consulter son tableau de bord, la sauvegarder sur 5 emplacements, la restaurer et la reprendre sans perte (empreinte SHA-256 identique). Tous les écrans du cahier des charges figurent dans la navigation ; ceux qui ne sont pas encore implémentés l'indiquent avec leur phase prévue.

**Ce qui ne fonctionne pas encore** : la progression semaine par semaine (phase 2), les candidats et l'élection (phase 3), la carte (phase 4), le mode « candidat réel » (phase 3).

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
| `pnpm test` | tests unitaires, de propriétés et de composants (moteur, sauvegardes, interface) | aucun |
| `pnpm test:integration` | API réelle contre PostgreSQL : parties, sessions, sauvegardes, restauration, isolation, sécurité | `DATABASE_URL_TEST` |
| `pnpm test:e2e` | Playwright, navigateur bureau + mobile : création, sauvegarde, restauration, reprise | `DATABASE_URL_TEST` ; navigateur : `pnpm exec playwright install chromium` |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | qualité du code | aucun |
| `pnpm check` | lint + format + typecheck + tests unitaires | aucun |

La base `DATABASE_URL_TEST` est **vidée** par les tests d'intégration : ne jamais y mettre de données à conserver. L'intégration continue (GitHub Actions, `.github/workflows/ci.yml`) exécute toutes ces commandes à chaque push.

## Structure

```
apps/api            API Fastify + Prisma (sessions, parties, sauvegardes)
apps/web            Interface React (Vite, React Router, TanStack Query, Zustand, Tailwind)
apps/web/e2e        Tests Playwright
packages/engine     Moteur de simulation pur et déterministe (aucune E/S)
packages/save-engine  Sérialisation canonique et empreintes des sauvegardes
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
