# RÉPUBLIQUE 2027

Simulation politique française : présidentielle, campagne et quinquennat. Jeu de stratégie dans le navigateur (PC et mobile) et en **application Android hors ligne**, où l'on incarne une personnalité réelle ou un candidat personnalisé, semaine par semaine, jusqu'aux deux tours, puis pendant le quinquennat. La carte électorale interactive couvre les communes de métropole et des cinq DROM.

> Nom de projet provisoire.

## État du projet

| Phase | Contenu | État |
|---|---|---|
| 0 | Audit, architecture, sources, risques | ✅ terminée |
| 1 | Squelette web, API, base, navigation, sauvegardes | ✅ terminée |
| 2 | Calendrier hebdomadaire, actions, ressources, événements, journal | ✅ terminée |
| 3 | Candidats, adversaires autonomes, sondages, participation, deux tours | ✅ terminée |
| 4 | Carte interactive (communes de métropole et des DROM), résultats territoriaux | ✅ terminée |
| 5 | Campagne approfondie : programme, parrainages, financement, médias, débats, alliances | ✅ terminée |
| 5 bis | Personnalités politiques réelles (jouables et adversaires, candidatures déclarées, sources et photos sous licence libre) | ✅ terminée |
| 5 ter | Médias réels (presse, télévision, radio), émissions et journalistes politiques | ✅ terminée |
| 6 | Quinquennat jouable : gouvernement (personnalités réelles possibles), Assemblée nationale réelle et dissolution, législatives, économie, crises, présidentielle 2032 | ✅ terminée |
| 7 | Contenu approfondi : scénarios de départ, crises et événements supplémentaires, conséquences à long terme | ✅ terminée |
| 8 | Version publiable : application Android (APK) hors ligne, sécurité, robustesse | ✅ terminée |
| 9 | Refonte de l'interface (identité « soirée électorale », navigation mobile, avatars), réseaux sociaux et nouveaux médias, direct de la soirée électorale | ✅ terminée |
| 10 | Débats télévisés jouables (premier tour et entre-deux-tours) et interview longue révisée | ✅ terminée |
| 11 | Rythme de la soirée électorale, personnalités réelles au gouvernement, Paramètres et crédits, débriefing de la semaine, sondages expliqués, plateaux sans aléa | ✅ terminée |
| 12 | Ergonomie : navigation à plat en cinq espaces, sections dépliables, QG « en un coup d'œil », détails en tiroir | ✅ terminée |

**Ce qui fonctionne aujourd'hui** :
- créer une partie avec son candidat (prénom, nom, parti, positionnement économique et sociétal, parcours, profil de départ) ou en observateur, avec difficulté, date de départ et graine ;
- incarner une **personnalité politique réelle** ayant déclaré sa candidature (17 fiches sourcées : faits publics datés, photo sous licence libre créditée, position d'après l'enquête d'experts Chapel Hill, étiquetée « estimation » ou « hypothèse »), ou l'affronter : tout ce que font ces personnalités dans la partie est **simulé** et signalé comme tel, aucun propos ne leur est attribué ;
- affronter 7 adversaires **fictifs**, ou les personnalités réelles, qui mènent leur campagne seuls, avec le même catalogue d'actions, les mêmes coûts et les mêmes règles : chacun a un objectif (victoire, qualification, visibilité), analyse sa situation, choisit chaque semaine une priorité motivée (parrainages, financement, notoriété…) et des actions ciblées ; ils peuvent se rallier à un autre candidat avant le premier tour ;
- composer son **programme** parmi les propositions des 17 domaines (coût, délai, faisabilité, dépendances, incompatibilités, électeurs sensibles, niveau de confiance — estimations de jeu affichées comme telles) ; un revirement se paie en crédibilité ;
- réunir ses **parrainages** département par département (promesses, intentions, présentations reçues puis validées par le Conseil constitutionnel, quelques-unes invalidées) selon la règle officielle des 500 présentations d'au moins 30 départements, au plus 50 comptées par département ; à la clôture du 12 mars 2027, un candidat sous le seuil est écarté, joueur compris ;
- tenir son **compte de campagne** : recettes par origine (apport du parti, apport personnel, dons, emprunts, avance forfaitaire), dépenses, plafond légal de 16 851 000 € (22 509 000 € au second tour), dons des personnes physiques plafonnés à 4 600 €, dons de personnes morales et en espèces au-delà de 150 € refusés et journalisés, emprunts bancaires bornés par le remboursement attendu, remboursement forfaitaire prévisionnel ;
- suivre la couverture de 26 **médias réels** (12 chaînes de télévision, 6 radios, 7 quotidiens nationaux et la presse quotidienne régionale) : audiences publiées (Médiamétrie, ACPM), temps de parole des partis relevés par l’Arcom, logos sous licence libre crédités ; à la télévision et à la radio, l’exposition d’un candidat suit l’exposition mesurée de son parti, la presse écrite traite tous les candidats de la même façon ; donner une interview à un média choisi ou être l’invité de l’une des 7 **émissions politiques** réelles retenues (chaîne et présentateurs sourcés) — couverture et interviews **simulées**, aucun propos attribué aux journalistes ;
- **débattre à la télévision** : grand débat à cinq (TF1), débat de tous les candidats (BFMTV) et débat d'entre-deux-tours (France 2), à des dates hypothèses du jeu ; sur le plateau en direct, une carte par séquence (défendre ou répondre, attaquer un adversaire sous un angle choisi, rester au-dessus de la mêlée ou tenter une petite phrase), courbe d'approbation du public, temps de parole, sondage flash « le plus convaincant », relecture ; une attaque fondée sur un fait faux se retourne contre son auteur ; la chaise vide se paie ; l'effet sur le vote est borné et s'estompe ; aucune réplique n'est prêtée à une personnalité réelle ni aucun journaliste nommé ;
- proposer un **ralliement** à un autre candidat (il accepte ou refuse) ;
- suivre les sondages simulés de deux instituts fictifs (fiche technique complète, marge d'erreur, cote de popularité distincte, hypothèses de second tour) ;
- jouer la présidentielle jusqu'au bout : premier tour (18 avril 2027), consignes de vote, débat d'entre-deux-tours, second tour (2 mai 2027), avec des résultats simulés en voix entières (inscrits, votants, blancs, nuls, exprimés), dépouillés **commune par commune** puis additionnés exactement (départements, régions, national), et le détail par groupe d'électeurs ;
- explorer la **carte électorale** : métropole et cinq encarts DROM, niveaux région / département / commune, recherche par nom ou code INSEE, fiche de chaque territoire, couleurs « candidat en tête », participation, score d'un candidat ou écart entre deux candidats, motifs en option (daltonisme, impression), tableau équivalent accessible au clavier et liste des territoires « hors carte » (collectivités d'outre-mer, Français de l'étranger) ;
- afficher sur la carte les **résultats officiels de la présidentielle 2022** commune par commune, après un import local (`pnpm data:resultats`), qui sert aussi de géographie électorale à la partie ;
- la jouer semaine par semaine : programmer des actions (meeting, tournée, interview dans le média choisi, invitation dans une émission politique, campagne numérique, recrutement, collecte, emprunt, porte-à-porte, rencontre d'élus dans le département choisi, préparation du débat) avec leur coût, leur effet attendu, leur incertitude et leur risque ; trancher les décisions nées d'événements fictifs ; résoudre la semaine ;
- regarder une partie en **observateur** : les adversaires collectent leurs parrainages, financent leur campagne et motivent leurs choix sans aucun joueur ;
- lire le bilan de chaque semaine, où chaque variation de ressource est décomposée en facteurs, et le journal complet de la partie ;
- suivre le calendrier électoral officiel (dates annoncées ou déduites, avec leur source) ;
- sauvegarder (5 emplacements manuels, sauvegarde automatique chaque semaine et avant un événement majeur), restaurer, exporter en JSON et importer dans une nouvelle partie, sans perte (empreinte SHA-256 identique) ;
- **présider** après une victoire (ou suivre en avance rapide le quinquennat d'un président IA après une défaite) : investiture le 14 mai 2027, nomination du Premier ministre et des ministres (personnalités de la partie, dont les réelles, qui peuvent refuser — réponses simulées — ou profils fictifs), feuille de route tirée du programme, agenda hebdomadaire du président (allocution, déplacement, sommet, remaniement, dissolution) ;
- gouverner avec l'**Assemblée nationale réelle** (12 groupes et leurs sièges d'après la liste ouverte de l'Assemblée, sans aucun nom de député, hémicycle) : dépôt des textes, commission, séance, amendements négociés, article 49 alinéa 3 et motion de censure, navette ; votes **simulés par groupe** ; une réforme rejetée n'est jamais appliquée, une réforme adoptée entre en vigueur après son délai ;
- suivre l'**économie** (croissance, inflation, chômage, solde public, dette, confiance des ménages : valeurs de départ de l'Insee ; pouvoir d'achat et tensions sociales : conventions du jeu), dont l'évolution simulée est décomposée en facteurs, et affronter des **crises fictives** (décision obligatoire) ;
- vivre les **législatives** : résultats réels de 2024 dans les 577 circonscriptions (sans nom de candidat), dissolution (élections 20 jours plus tard, pas de nouvelle dissolution dans l'année), législatives de fin de législature en juin 2029, deux tours simulés par bloc, nouvelle Assemblée, cohabitation possible ;
- choisir un **scénario de départ** (situation actuelle, ou situations fictives : tempête économique, colère sociale, monde instable, candidature d'outsider) et affronter **14 crises fictives** (dont la canicule en été) et **12 événements de campagne**, dont les choix laissent des **conséquences durables** (effets semaine après semaine, crises rendues plus ou moins probables), détaillées dans l'écran Crises et le bilan ;
- jouer sur **Android sans réseau** : l'application (APK) embarque le moteur, les règles et la carte de démonstration, enregistre les parties sur l'appareil, ne demande aucune permission et exporte une partie par la feuille de partage d'Android ([apps/mobile/README.md](apps/mobile/README.md)) ;
- miser sur les **réseaux sociaux et nouveaux médias** (interview longue sur YouTube, format décryptage, vidéos courtes, direct sur Twitch : formats réels sourcés, sans ligne éditoriale prêtée) : deux jauges, Jeunesse et Dynamique, comptent dans le vote ; publications et réactions de comptes **fictifs** ; l'interview longue (format « Legend », parcours personnel) rapporte beaucoup de sympathie, de notoriété et d'écho chez les jeunes, mais une contradiction avec son parcours peut être relevée, plus probable après des revirements de programme ou des interviews répétées ;
- vivre la **soirée électorale en direct** le soir de chaque tour : de 20 h à minuit, la carte se colore département par département puis commune par commune (Somme et Amiens compris dans la démonstration) aux couleurs du candidat en tête, un bandeau fait défiler les estimations, puis tombe le résultat définitif — rythme et estimations simulés, chiffres identiques au résultat du tour ;
- à la fin du mandat, lire le **bilan du quinquennat** puis repartir en campagne pour la **présidentielle 2032** avec le même moteur (parrainages et comptes remis à zéro ; le président sortant peut se représenter une fois : art. 6), et ainsi de suite jusqu'au mandat issu de 2037.

**Ce qui ne fonctionne pas encore** : dépôt et contrôle du compte de campagne par la CNCCFP (le remboursement affiché reste prévisionnel) ; le Sénat n'est pas modélisé groupe par groupe (accord tiré au sort) ; les désistements entre les deux tours des législatives ne sont pas simulés ; pendant une campagne présidentielle qui suit un quinquennat, l'action du gouvernement sortant, le Parlement et l'économie ne sont pas simulés ; la partie s'arrête explicitement à la fin du mandat issu de la présidentielle de 2037 (aucun cycle prévu au-delà). Les dates des législatives de 2029 et des présidentielles de 2032 et 2037 sont des hypothèses de jeu, affichées comme telles. Les personnalités réelles sont celles de la révision importée de la liste des candidatures (21/10/2026) : une nouvelle déclaration exige une réimportation. Sans import local, la carte n'a que le jeu de démonstration (communes de l'Ain, de la Corse, de la Somme et des DROM ; base électorale **fictive**, aux contrastes inventés, affichée comme telle) ; c'est toujours le cas dans l'application Android, qui n'embarque pas les résultats de 2022. Pas d'application iOS. La version web n'est pas encore hébergée (API et PostgreSQL : hébergeur à choisir, question Q6).

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

## Application Android (APK hors ligne)

L'application `apps/mobile` (Capacitor 8) contient tout le jeu et fonctionne sans serveur ni réseau ; elle ne demande aucune permission Android.

- **Sans rien installer** : chaque push lance le workflow GitHub **Android (APK)**, qui construit l'APK et l'essaie sur un émulateur Android 14 en mode avion. Onglet **Actions** → **Android (APK)** → dernière exécution réussie → section **Artifacts** → `republique-2027-apk-debug` (zip contenant `app-debug.apk`).
- **Sur votre ordinateur** (JDK 21, Android Studio ou SDK Android, `ANDROID_HOME` défini) :

```bash
pnpm install
pnpm --filter @r2027/mobile build
cd apps/mobile && npx cap sync android
cd android && ./gradlew assembleDebug        # Windows : gradlew.bat assembleDebug
# → apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Installation sur le téléphone (`adb install -r app-debug.apk`, ou copie du fichier puis ouverture), APK de publication signé (clé hors du dépôt, variables `R2027_KEYSTORE_*`) et fonctionnement détaillé : [apps/mobile/README.md](apps/mobile/README.md).

## Déploiement sur Cloudflare Workers (interface seule)

Le dépôt est relié à Cloudflare Workers Builds (Worker `republique-2027`). La configuration est dans `wrangler.jsonc` :

- `wrangler deploy` installe les dépendances de l'interface et la compile (`corepack pnpm install --frozen-lockfile --filter @r2027/web...` puis `corepack pnpm --filter @r2027/web run build` : Workers Builds n'installe pas lui-même les dépendances du projet), puis publie `apps/web/dist` en fichiers statiques, avec repli sur `index.html` pour les routes de l'application ;
- **l'API du jeu (Fastify + PostgreSQL) ne s'exécute pas sur Workers** : `cloudflare/worker.js` répond à toute requête `/api/*` par une erreur 503 explicite (`api_non_deployee`), et l'interface affiche « Serveur ou base de données indisponible ». Aucune partie ne peut donc être jouée depuis ce déploiement tant que le serveur n'est pas hébergé ailleurs (hébergeur à choisir, question Q6 du [plan](docs/PLAN_DEVELOPPEMENT.md#5-questions-ouvertes)) ;
- la version de Node.js est fixée par `.node-version` (22.22.0) : `.npmrc` impose `engine-strict=true`, et une version plus ancienne fait échouer `pnpm install`.

Réglages attendus dans le tableau de bord Cloudflare (Workers & Pages → `republique-2027` → Settings → Build) : répertoire racine `/`, commande de déploiement `npx wrangler deploy` (valeur par défaut) ; la commande de build peut rester vide (Wrangler compile l'interface lui-même). Vérification locale sans compte Cloudflare : `npx wrangler deploy --dry-run`.

## Données géographiques et électorales (facultatif)

Le dépôt contient un **jeu de démonstration** (`packages/data-import/demo/`) : la carte et la partie fonctionnent sans réseau, avec les communes de l'Ain, de la Corse et des DROM. Pour la France entière :

| Commande | Effet | Réseau requis |
|---|---|---|
| `pnpm data:geo` | Télécharge le COG 2026 (INSEE) et les contours IGN ADMIN EXPRESS COG CARTO 2026 (125 Mo), vérifie qu'à chaque commune correspond exactement une géométrie, simplifie et écrit `data/processed/geo/cog-2026/` (34 875 communes). Plusieurs minutes, 8 Go de mémoire au plus. | `www.insee.fr`, `data.geopf.fr` |
| `pnpm data:resultats` | Après `pnpm data:geo` : importe les résultats communaux de la présidentielle 2022 (deux tours), les ramène au COG 2026 et vérifie qu'ils somment **à l'unité** aux totaux proclamés. Écrit `data/processed/resultats/presidentielle-2022/`. | `www.data.gouv.fr`, `static.data.gouv.fr`, `www.insee.fr` |
| `pnpm data:geo --demo` | Régénère le jeu de démonstration commité. | comme `data:geo` |
| `pnpm data:personnalites` | Réimporte les fiches des personnalités réelles (candidatures déclarées sur Wikipédia, partis sur Wikidata, positions de l'enquête Chapel Hill, photos et licences sur Wikimedia Commons) en vérifiant chaque fait ; écrit `packages/rulesets/src/personnalites-2027.json` et `apps/web/public/personnalites/` (**commités** : une réimportation impose une nouvelle version du jeu de règles, voir [docs/SOURCES.md §8 quater](docs/SOURCES.md)). Requiert ImageMagick (`convert`). | `fr.wikipedia.org`, `www.wikidata.org`, `query.wikidata.org`, `commons.wikimedia.org`, `upload.wikimedia.org`, `www.chesdata.eu`, `github.com` et `release-assets.githubusercontent.com`, `www.insee.fr` |
| `pnpm data:gouvernement` | Réimporte les personnalités nominables au gouvernement (phase 11) : fonctions et dates de l’infobox de chaque article Wikipédia (révision consultée), appartenance en cours au parti et photo sur Wikidata, licence et auteur de la photo sur Wikimedia Commons, position du parti dans l’enquête Chapel Hill ; compétence estimée et notoriété déduites par des règles documentées ; une appartenance non attestée, un parti hors de l’enquête ou un groupe inconnu font échouer l’import ; écrit `packages/rulesets/src/gouvernement-2027.json` et `apps/web/public/gouvernement/` (**commités** : une réimportation impose une nouvelle version du jeu de règles, voir [docs/SOURCES.md §8 nonies](docs/SOURCES.md)). Requiert ImageMagick (`convert`). | `fr.wikipedia.org`, `query.wikidata.org`, `commons.wikimedia.org`, `upload.wikimedia.org`, `github.com` et `release-assets.githubusercontent.com` |
| `pnpm data:assemblee` | Réimporte la composition de l'Assemblée nationale : nombre de députés en exercice par groupe politique (liste ouverte de l'Assemblée, Licence Ouverte ; **aucun nom de député n'est conservé**), position de chaque groupe d'après l'enquête Chapel Hill 2024 (parti de référence) ou hypothèse motivée ; un groupe absent de la sélection fait échouer l'import ; écrit `packages/rulesets/src/assemblee-2026.json` (**commité** : une réimportation impose une nouvelle version du jeu de règles, voir [docs/SOURCES.md §7](docs/SOURCES.md)). | `data.assemblee-nationale.fr`, `github.com` et `release-assets.githubusercontent.com` |
| `pnpm data:economie` | Réimporte les indicateurs économiques de départ depuis les pages publiques des séries de l'Insee (croissance du PIB sur un an déduite des quatre dernières évolutions trimestrielles, inflation, chômage au sens du BIT, dette au sens de Maastricht, solde public sur quatre trimestres, confiance des ménages) ; une série absente ou des trimestres incohérents font échouer l'import ; écrit `packages/rulesets/src/economie-2026.json` (**commité** : une réimportation impose une nouvelle version du jeu de règles, voir [docs/SOURCES.md §7 bis](docs/SOURCES.md)). | `www.insee.fr` |
| `pnpm data:legislatives` | Réimporte les résultats définitifs des législatives de 2024 par circonscription (ministère de l'Intérieur, data.gouv.fr, Licence Ouverte 2.0) : inscrits, votants, exprimés, **voix par nuance** et nuance de l'élu ; **aucun nom de candidat n'est conservé** ; zéros initiaux des codes rétablis, écarts publiés conservés ; un total incohérent ou une circonscription manquante font échouer l'import ; écrit `packages/rulesets/src/legislatives-2024.json` (**commité** : une réimportation impose une nouvelle version du jeu de règles, voir [docs/SOURCES.md §3.3](docs/SOURCES.md)). | `static.data.gouv.fr` |
| `pnpm data:medias` | Réimporte les médias réels : temps de parole des partis par chaîne et par station sur les douze derniers mois publiés (Arcom), parts d'audience (Médiamétrie : Médiamat mensuel, EAR National), lectorats (ACPM OneNext), émissions politiques et présentateurs (infobox Wikipédia, révision consultée), logos sous licence libre (Commons) ; chaque contrôle d'acceptation fait échouer l'import (organe sans audience, émission sans chaîne ni présentateur, temps de parole ne totalisant pas 100 %, logo sans licence libre ni auteur) ; écrit `packages/rulesets/src/medias-2027.json` et `apps/web/public/medias/` (**commités** : une réimportation impose une nouvelle version du jeu de règles, voir [docs/SOURCES.md §8 quinquies](docs/SOURCES.md)). Requiert ImageMagick (`convert`). | `www.arcom.fr`, `www.mediametrie.fr`, `www.acpm.fr`, `fr.wikipedia.org`, `commons.wikimedia.org`, `upload.wikimedia.org` |
| `pnpm mesure:carte` | Après `pnpm data:geo` : rejoue la mesure des formats de carte sur téléphone émulé ([docs/MESURES_CARTE.md](docs/MESURES_CARTE.md)). | aucun |

Les fichiers téléchargés sont gardés dans `data/raw/` (avec leur empreinte SHA-256, revérifiée à chaque import) et les imports se rejouent ensuite hors ligne. `data/raw/` et `data/processed/` ne sont jamais commités : la licence des résultats 2022 n'est pas précisée ([docs/SOURCES.md](docs/SOURCES.md)). L'API utilise automatiquement l'import complet s'il existe (sinon la démonstration) ; voir `GEO_DATA_DIR` et `RESULTS_DATA_DIR` dans `.env.example`. Une partie déjà jouée avec la démonstration garde ses résultats départementaux, mais le détail communal de ses tours passés n'est plus recalculable avec une autre base (l'interface l'indique).

## Tests

| Commande | Contenu | Prérequis |
|---|---|---|
| `pnpm test` | tests unitaires, de propriétés et de composants (moteur, jeu de règles, sauvegardes, import de données, interface, Worker Cloudflare) | aucun |
| `pnpm test:integration` | API réelle contre PostgreSQL : parties, progression idempotente, sauvegardes, journal, export/import, migrations, isolation, sécurité, référentiel cartographique, résultats communaux, campagne (actions ciblées, programme, parrainages jusqu'à la clôture, ralliements), personnalités réelles (candidat réel, adversaires réels), médias réels (interview ciblée, émission politique) | `DATABASE_URL_TEST` |
| `pnpm test:e2e` | Playwright, navigateur bureau + mobile : création du candidat, actions, progression, bilan, sauvegarde, restauration, journal, export/import, reprise, présidentielle complète jusqu'aux résultats, carte (encarts DROM, recherche, sélection, résultats, motifs, audit d'accessibilité axe-core), campagne (programme, actions ciblées, parrainages, finances, candidat écarté à la clôture, partie en observateur, audit axe-core), personnalités réelles (choix illustré, fiches, crédits, audit axe-core), médias réels (émission politique, interview simulée, logos crédités, audit axe-core) | `DATABASE_URL_TEST` ; navigateur : `pnpm exec playwright install chromium` |
| `pnpm test:mobile` | Playwright, téléphone émulé : le paquet de l'application Android servi tel quel, **tout le réseau coupé** (aucune requête ne doit sortir, aucune violation de la politique de sécurité du contenu) : création, semaine, reprise après rechargement, carte, export et import | navigateur : `pnpm exec playwright install chromium` |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | qualité du code | aucun |
| `pnpm check` | lint + format + typecheck + tests unitaires | aucun |

La base `DATABASE_URL_TEST` est **vidée** par les tests d'intégration : ne jamais y mettre de données à conserver. L'intégration continue (GitHub Actions, `.github/workflows/ci.yml`) exécute toutes ces commandes à chaque push ; le workflow `.github/workflows/android.yml` construit l'APK et l'essaie sur un émulateur Android (`apps/mobile/scripts/essai-android.mjs`).

## Structure

```
apps/api            API Fastify + Prisma (sessions, parties, sauvegardes, carte)
apps/web            Interface React (Vite, React Router, TanStack Query, Zustand, Tailwind, MapLibre GL)
apps/web/e2e        Tests Playwright
apps/mobile         Application Android hors ligne (Capacitor) : écrans de apps/web + moteur local ; projet Android dans android/
packages/local-api  Contrat de l'API exécuté sur l'appareil (moteur, sauvegardes, journal, carte) avec stockage IndexedDB
packages/engine     Moteur de simulation pur et déterministe (aucune E/S)
packages/rulesets   Jeux de règles versionnés et sourcés (calendrier, actions, événements, électorat, adversaires, programme, parrainages, financement, médias, alliances, fiches des personnalités réelles)
packages/save-engine  Sérialisation canonique, empreintes, migrations et export/import des sauvegardes
packages/data-import  Imports sourcés (COG, contours IGN, résultats 2022, personnalités réelles) et jeu de démonstration commité
packages/shared     Schémas Zod et contrats d'API partagés
docs/               Cahier des charges, plan, architecture, sources, risques
scripts/            Outils de développement (base locale, mesure des formats de carte)
data/raw, data/processed  Téléchargements et imports locaux (ignorés par Git)
```

## Documentation

- [Cahier des charges (PDF, v1.2)](docs/Cahier_des_charges_Republique_2027.pdf) — référence fonctionnelle
- [Plan de développement](docs/PLAN_DEVELOPPEMENT.md) — phases, tâches testables, état d'avancement, questions ouvertes
- [Architecture](docs/ARCHITECTURE.md) — pile technique, moteur, carte métropole + DROM, API
- [Modèle de données](docs/MODELE_DONNEES.md) — entités, schéma de base
- [Sources](docs/SOURCES.md) — sources officielles, licences, état de vérification
- [Risques](docs/RISQUES.md) — registre des risques et informations manquantes
- [Mesure des formats de carte](docs/MESURES_CARTE.md) — spike de la phase 4

## Principes

- Simulation déterministe (graine aléatoire), exécutée côté serveur (ou sur l'appareil dans l'application Android, derrière le même contrat), jamais par l'interface ; testable sans navigateur ni base.
- Données réelles, sondages, projections, résultats simulés et événements fictifs toujours distingués.
- Aucune clé d'API payante requise ; aucun secret dans le dépôt.

## Dépannage

- **« Configuration invalide »** au démarrage de l'API : une variable manque dans `.env` (le message liste lesquelles).
- **« Serveur ou base de données indisponible »** dans l'interface : vérifier que PostgreSQL tourne (`docker compose ps`) et que les migrations sont appliquées (`pnpm db:deploy`).
- **Port déjà utilisé** : changer `API_PORT` dans `.env` (le proxy de l'interface suit automatiquement) ; le port 5173 de l'interface est fixe.
- **Tester depuis un téléphone** : par défaut, les serveurs n'écoutent que sur la machine locale. Lancer `pnpm --filter @r2027/web exec vite --host 0.0.0.0` puis ouvrir `http://<adresse-IP-du-PC>:5173` depuis le téléphone, sur le même réseau Wi-Fi.
