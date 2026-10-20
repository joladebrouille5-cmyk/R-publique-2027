# RÉPUBLIQUE 2027

Simulation politique française : présidentielle, campagne et quinquennat. Jeu de stratégie dans le navigateur (PC et mobile) où l'on incarne une personnalité réelle ou un candidat personnalisé, semaine par semaine, jusqu'aux deux tours, puis pendant le quinquennat. La carte électorale interactive couvre les communes de métropole et des DROM.

> Nom de projet provisoire.

## État du projet

| Phase | Contenu | État |
|---|---|---|
| 0 | Audit, architecture, sources, risques | ✅ terminée (documentation uniquement) |
| 1 | Squelette web, API, base, navigation, sauvegardes | à faire |
| 2–8 | Simulation, présidentielle, carte, campagne, quinquennat, contenu, mise en ligne | à faire |

**Aucun code applicatif n'existe encore** : l'application ne peut pas être lancée pour l'instant. Les instructions d'installation et de démarrage seront ajoutées en phase 1.

## Documentation

- [Cahier des charges (PDF, v1.2)](docs/Cahier_des_charges_Republique_2027.pdf) — référence fonctionnelle
- [Plan de développement](docs/PLAN_DEVELOPPEMENT.md) — état des lieux, phases, tâches testables, questions ouvertes
- [Architecture](docs/ARCHITECTURE.md) — pile technique, moteur, carte métropole + DROM, API
- [Modèle de données](docs/MODELE_DONNEES.md) — entités, schéma Prisma indicatif
- [Sources](docs/SOURCES.md) — sources officielles, licences, état de vérification
- [Risques](docs/RISQUES.md) — registre des risques et informations manquantes

## Pile technique prévue

React + TypeScript strict + Vite, MapLibre GL JS, Node.js + Fastify + Zod, Prisma + PostgreSQL, Vitest + Playwright, Docker. Détails et versions : [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Principes

- Simulation déterministe (graine aléatoire), exécutée côté serveur, testable sans navigateur ni base.
- Données réelles, sondages, projections, résultats simulés et événements fictifs toujours distingués.
- Aucune clé d'API payante requise ; aucun secret dans le dépôt.
