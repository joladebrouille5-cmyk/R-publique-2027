# Modèle de données — RÉPUBLIQUE 2027

> Statut : **phases 1 à 5 ter réalisées** pour les tables techniques (`User`, `Game`, `GameSave`, `GameAdvance`, `GameAction`, `GameEvent`, `SimulationLog`) — schéma réel : [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) ; état de partie réel (format 7) : [`packages/shared/src/game.ts`](../packages/shared/src/game.ts). Depuis la phase 4, le référentiel territorial et les résultats historiques sont des **fichiers versionnés** produits par `packages/data-import` (décision D9), et non des tables. Le reste du schéma ci-dessous reste indicatif et sera complété phase par phase.
> Voir aussi [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-persistance-et-sauvegardes-12).

## 1. Principe : trois familles de données

| Famille | Stockage | Exemples | Mutabilité |
|---|---|---|---|
| **Référence** (partagée par toutes les parties) | tables relationnelles | territoires, base électorale 2022, sources, imports, catalogue de médias, profils réels | ré-importée par version, jamais modifiée par une partie |
| **État dynamique d'une partie** | instantané `GameState` (JSON validé par Zod, colonne `jsonb`) | candidats en jeu, ressources, alliances, gouvernement, projets de loi | remplacé à chaque semaine, versionné |
| **Historique et projections d'une partie** | tables relationnelles en ajout seul | actions, événements, journal, sauvegardes, résultats, sondages, indicateurs | immuable (historique, §15) |

## 2. Correspondance des entités du cahier des charges (§12)

| Entité (§12) | Famille | Emplacement |
|---|---|---|
| User | historique | table `User` |
| Game | historique | table `Game` (+ instantané courant) |
| GameSave | historique | table `GameSave` |
| GameEvent | historique | table `GameEvent` |
| GameAction | historique | table `GameAction` |
| Candidate | référence + état | table `CandidateProfile` (personnalités réelles, sourcées) ; instance de jeu dans `GameState.actors` |
| PoliticalParty | référence + état | table `PartyProfile` ; instance dans `GameState.parties` |
| CampaignTeam | état | `GameState.campaign[acteur].team` |
| CampaignResource | état | `GameState.campaign[acteur].resources` |
| Endorsement (parrainages, soutiens) | état | `GameState.campaign[acteur].endorsements` |
| CampaignAccount | état | `GameState.campaign[acteur].account` (centimes entiers) |
| PolicyProposal | état | `GameState.campaign[acteur].program` |
| Territory | référence | **phase 4** : fichiers du référentiel (`manifest.json`, `index.json`, TopoJSON), schémas `GeoManifestSchema` et `CommuneIndexSchema` ; correspondance des codes Intérieur ⇄ INSEE dans l'importeur |
| ElectoralBaseline | référence | **phase 4** : résultats 2022 ramenés au COG 2026 (`HistoricalRoundSchema`), puis base territoriale calculée en mémoire par le moteur (`TerritorialBaseline`, identifiée par une empreinte) |
| Poll | projection | table `Poll` |
| Election | projection | table `Election` |
| ElectionRound | projection | table `ElectionRound` |
| ElectoralResult | projection | **phase 4** : agrégats départementaux, régionaux et hors carte dans `elections.t1/t2.territoire` ; communes recalculées à la demande (décision D10) |
| MediaOutlet | référence + état | table `MediaOutlet` ; audience/priorités courantes dans `GameState.media` |
| Alliance | état | `GameState.relations.alliances` |
| PoliticalRelationship | état | `GameState.relations.relationships` (graphe, §7) |
| Government | état | `GameState.institutions.government` |
| Minister | état | `GameState.institutions.government.ministers` |
| Parliament | état | `GameState.institutions.parliament` |
| ParliamentaryGroup | état | `GameState.institutions.parliament.groups` |
| Bill | état + journal | `GameState.institutions.parliament.bills` ; chaque vote est un `GameEvent` |
| EconomicIndicator | projection | table `EconomicIndicator` (séries hebdomadaires) |
| Crisis | état + journal | `GameState.crises` ; ouverture / résolution = `GameEvent` |
| DataSource | référence | table `DataSource` |
| DataImport | référence | table `DataImport` |
| SimulationLog | historique | table `SimulationLog` |

## 3. Volume : ce que l'instantané ne contient pas

Stocker des valeurs par commune dans chaque instantané hebdomadaire serait prohibitif (≈ 35 000 communes × 12 candidats ≈ 420 000 nombres par semaine, sur plus de 300 semaines de partie). Donc :

- l'instantané contient l'opinion au niveau **national et départemental** (≈ 101 départements + territoires hors carte), plus une table **creuse** de modificateurs communaux (villes visitées, événements locaux) ;
- la valeur d'une commune est **dérivée de façon déterministe** : base historique de la commune × modificateurs départementaux et nationaux × modificateurs communaux ;
- les résultats communaux ne sont matérialisés qu'**au moment d'un scrutin** (`ElectoralResultBlock`) ;
- sauvegardes automatiques : conservation des N dernières semaines + toutes les sauvegardes manuelles + sauvegardes « avant événement majeur » ; les semaines intermédiaires se reconstruisent en rejouant le journal d'actions (déterminisme).

## 4. Esquisse du schéma `GameState` (Zod, `packages/shared`)

> Phase 2 : le format 2 contenait `meta`, `player`, `actors` (campagne du joueur et ses ressources), `scheduled` (effets différés), `pendingDecisions`, `eventHistory` et `calendar` (blocage avant scrutin). L'aléa n'est plus stocké : il est dérivé de la graine.
>
> **Phase 3 — format 3** (implémenté) :
> - `actors` : le joueur et les 7 adversaires fictifs, chacun avec `candidate` (prénom, nom, parti, positionnement économie/société de −100 à +100, parcours, `nature` `personnalise` | `fictif`, profil de départ), `style` et `toleranceRisque` (IA), `resources`, `status` (`candidat`, `qualifie`, `elimine`, `elu`, `battu`) et `history.popularite` (8 dernières semaines, pour la dynamique) ;
> - `pendingDecisions[].kind` : `evenement` ou `consigne` (consigne de vote du joueur éliminé) ;
> - `opinion` : intentions attendues de la semaine (centièmes de point des exprimés), participation attendue et décomposition moyenne des facteurs par candidat — internes au modèle, non présentées comme un sondage ;
> - `polls` : sondages publiés (`nature: 'sondage'`, institut, terrain, publication, échantillon, méthode, marge, limites) ;
> - `elections` : `t1`, `t2` (résultats entiers nationaux et par groupe d'électeurs, `nature: 'simule'`), `consignes`, `debate` ;
> - `calendar.blockedMessage` : message affiché quand la partie est bloquée (fin de la présidentielle).
>
> Migration 2 → 3 : identité par défaut pour le candidat d'une partie existante (« Candidat du joueur », sans étiquette, au centre), adversaires ajoutés avec leurs moyens de départ, ressources et historique d'événements conservés, blocage du premier tour levé (le scrutin est désormais simulé), jeu de règles `presidentielle-2027@2.0.0`. Testé sur un état réel produit par le moteur de la phase 2 (`packages/save-engine/src/fixtures/v2-phase-2.json`).
>
> **Phase 4 — format 4** (implémenté) : chaque résultat de tour porte `territoire` (nullable) : `baselineId` (empreinte de la base électorale), `nature` (`reel`, `fictif`, `national`), ordre des `candidats`, `comportement` de chaque groupe (participation, blancs, nuls, probabilités), agrégats exacts `departements`, `regions`, `horsCarte`. Migration 3 → 4 : `territoire: null` pour les tours déjà dépouillés (testé sur un état réel de la phase 3, entre les deux tours) ; jeu de règles `presidentielle-2027@2.1.0`.
>
> **Phase 5 — format 5** (implémenté, schémas dans [`packages/shared/src/campaign.ts`](../packages/shared/src/campaign.ts)) :
> - chaque acteur gagne `equipe` (qualité de l'équipe, 0 à 1), `implantation` (départements d'ancrage), `objectif` (IA : `victoire`, `qualification`, `visibilite` ; `null` pour le joueur), `programme` (`propositions`, `revirements`), `parrainages` (`promesses`, `intentions`, `recues`, `validees` par code de département en chaîne, `invalides` par motif), `finances` (`recettes` par origine — `parti`, `apportPersonnel`, `dons`, `emprunts`, `avance`, `autres` —, `depenses`, `donateurs`, `refus` : nombre, montant et 12 derniers dons refusés avec leur motif, `emprunts`, `depassement`, `remboursementPrevisionnel`), `preparationDebat` (heures) et `strategie` (IA : priorité, motif, semaine) ; statuts `ecarte` (parrainages insuffisants) et `retire` (ralliement) ;
> - `campagne` : régime de la partie (`parrainages` `modelise` | `non_modelise`, `finances` `complet` | `partiel`) ;
> - `medias` : couverture de la semaine (exposition 0 à 10 000 et tonalité −100 à +100 par organe et par candidat, indice −1 à 1) ;
> - `relations` (clé `a|b` triée) : `confiance`, `proximite`, `rivalite`, `historique` (10 derniers faits) ; `alliances` : ralliements (`de`, `vers`, `semaine`, `origine` `ia` | `joueur`) ;
> - `elections.debateDetail` : composantes de la prestation de chaque finaliste.
>
> Invariant du compte : budget = Σ recettes − dépenses, chaque variation du budget passant par le registre (`FinanceBook`). Migration 4 → 5 : programmes des adversaires repris du jeu de règles, compte ouvert avec le budget courant comme apport, parrainages vides et régime `non_modelise` (une partie déjà avancée ne peut pas reconstituer sa collecte : personne n'y est écarté), finances `partiel`, relations initiales calculées, aucun ralliement ; testé sur un état réel de la phase 4 (semaine 29, entre les deux tours) ; jeu de règles `presidentielle-2027@3.0.0`.
>
> **Phase 5 ter — format 7** (implémenté) : `medias` porte la couverture de la semaine par **organe réel** (identifiants du fichier `medias-2027.json` du jeu de règles `presidentielle-2027@5.0.0`, schéma [`medias.ts`](../packages/shared/src/medias.ts)) et la liste `interviews` (émission, candidat) des passages simulés dans les émissions politiques. Organes, mesures, temps de parole et émissions ne sont pas copiés dans l'état : ils appartiennent au jeu de règles. Migration 6 → 7 : la couverture de la dernière semaine, qui portait sur les organes fictifs, est effacée (`medias: null`, recalculée dès la semaine suivante) et la partie passe au jeu de règles courant ; testée sur un état réel produit par le moteur de la phase 5 bis (Marine Tondelier face aux personnalités réelles, semaine 10), poursuivi ensuite avec une interview dans une émission réelle.

> **Phase 5 bis — format 6** (implémenté) : l'identité d'un candidat peut être une **personnalité réelle** (`nature: 'reel'`, `personnaliteId` vers sa fiche du jeu de règles, nul pour les autres natures) ; `player.adversaires` vaut `fictifs` ou `reels`. Les fiches elles-mêmes (faits sourcés, position estimée, crédit photo) ne sont pas copiées dans l'état : elles appartiennent au jeu de règles de la partie (`presidentielle-2027@4.0.0`, schéma [`personalities.ts`](../packages/shared/src/personalities.ts)). Migration 5 → 6 : `personnaliteId: null` pour chaque candidat, adversaires `fictifs`, rien d'autre ne change ; testée sur un état réel produit par le moteur de la phase 5 (semaine 29, entre les deux tours, un ralliement), mené ensuite au second tour.
>
> L'esquisse ci-dessous décrit la cible des phases suivantes.

```ts
type GameState = {
  meta: {
    gameId: string; seed: string; week: number; date: string /* AAAA-MM-JJ */;
    phase: 'campagne' | 'entre_deux_tours' | 'presidence' | 'legislatives' | 'bilan';
    engineVersion: string; rulesetVersion: string; saveSchemaVersion: number;
  };
  rng: { master: RngState };                 // flux dérivés recalculés à la volée
  player: { actorId: string | null; mode: 'candidat_reel' | 'candidat_personnalise' | 'observateur' };
  actors: Record<ActorId, Actor>;            // Candidate : profil, notoriété, popularité, crédibilité…
  parties: Record<PartyId, Party>;
  campaign: Record<ActorId, {
    team: CampaignTeam; resources: CampaignResource; account: CampaignAccount;
    endorsements: Endorsement[];             // parrainages : promesse | intention | reçu | validé
    program: PolicyProposal[];               // coût, délai, faisabilité, dépendances, effets, confiance
  }>;
  relations: { alliances: Alliance[]; relationships: PoliticalRelationship[] };
  media: Record<MediaId, MediaState>;
  opinion: {
    popularity: Record<ActorId, number>;      // distincte des intentions (§5.2)
    national: Record<ActorId, number>;
    byDepartement: Record<DeptCode, Record<ActorId, number>>;
    communeModifiers: Array<{ code: string; actorId: ActorId; delta: number; untilWeek: number }>;
  };
  events: { scheduled: ScheduledEffect[] };   // effets différés (§8)
  crises: Crisis[];
  institutions: { government: Government | null; parliament: Parliament | null };
  economy: Record<IndicatorKey, number>;
  calendar: { deadlines: Deadline[] };
  pendingDecisions: Decision[];               // stoppe l'accélération (§2)
};
```

Chaque valeur affichable qui n'est pas issue d'une source officielle porte `nature: 'estimation' | 'simule' | 'fictif'`.

## 5. Esquisse du schéma Prisma (tables)

```prisma
enum DataNature    { reel estimation sondage projection simule fictif systeme }  // systeme : événement technique (création, sauvegarde)
enum TerritoryType { pays region departement commune collectivite_outre_mer etranger }
enum GameMode      { candidat_reel candidat_personnalise observateur }
enum Difficulty    { accessible standard expert }
enum SaveKind      { auto manuelle avant_evenement import }
enum ActionStatus  { validee rejetee }
enum ResultLevel   { national region departement commune hors_carte }

model User {
  id          String   @id @default(uuid())
  displayName String?
  createdAt   DateTime @default(now())
  games       Game[]
}

model Game {
  id                String     @id @default(uuid())
  userId            String
  user              User       @relation(fields: [userId], references: [id])
  name              String
  mode              GameMode
  difficulty        Difficulty
  seed              String                       // chaîne : pas de perte de précision
  engineVersion     String
  rulesetVersion    String
  saveSchemaVersion Int
  week              Int                          // index de semaine depuis le départ
  version           Int        @default(0)       // verrou optimiste (409 si conflit)
  state             Json                         // GameState courant
  stateHash         String                       // SHA-256 de l'état canonique
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  saves             GameSave[]
  actions           GameAction[]
  events            GameEvent[]
  logs              SimulationLog[]
  elections         Election[]
  polls             Poll[]
  indicators        EconomicIndicator[]
  @@index([userId])
}

model GameSave {
  id                String   @id @default(uuid())
  gameId            String
  game              Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  kind              SaveKind
  slot              String?                      // emplacements multiples (manuelles)
  label             String?
  week              Int
  state             Json
  stateHash         String
  engineVersion     String
  saveSchemaVersion Int
  createdAt         DateTime @default(now())
  @@index([gameId, week])
}

model GameAdvance {                                // progression idempotente (phase 2)
  id             String   @id @default(uuid())
  gameId         String
  idempotencyKey String
  requestHash    String                           // même clé + autre requête ⇒ refus
  fromWeek       Int
  toWeek         Int
  response       Json                             // rejouée telle quelle
  @@unique([gameId, idempotencyKey])
}

model GameAction {
  id              String       @id @default(uuid())
  gameId          String
  game            Game         @relation(fields: [gameId], references: [id], onDelete: Cascade)
  advanceId       String                         // progression qui l'a résolue
  week            Int
  position        Int                            // ordre dans le plan de la semaine
  actorId         String                         // joueur ou adversaire IA
  type            String
  payload         Json
  status          ActionStatus
  rejectionReason String?
  createdAt       DateTime     @default(now())
  @@index([gameId, week])
}

model GameEvent {
  id        String     @id @default(uuid())
  gameId    String
  game      Game       @relation(fields: [gameId], references: [id], onDelete: Cascade)
  week      Int
  type      String
  nature    DataNature                           // `fictif` pour un événement inventé (§8)
  payload   Json
  createdAt DateTime   @default(now())
  @@index([gameId, week])
}

model SimulationLog {
  id        String   @id @default(uuid())
  gameId    String
  game      Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  week      Int
  step      Int                                   // 1..12, ordre du §2
  module    String
  message   String
  factors   Json?                                 // décomposition explicable (§13)
  createdAt DateTime @default(now())
  @@index([gameId, week])
}

model Territory {
  id             String        @id                // "<millésime COG>:<code>", ex. "2026:2A004"
  cogYear        Int
  code           String                           // code INSEE (chaîne : 2A/2B, 97x)
  type           TerritoryType
  name           String
  parentId       String?
  parent         Territory?    @relation("Hierarchy", fields: [parentId], references: [id])
  children       Territory[]   @relation("Hierarchy")
  population     Int?
  populationYear Int?
  indicators     Json?                            // indicateurs agrégés avec millésimes
  mapped         Boolean                          // false : hors carte (étranger, COM)
  dataImportId   String
  dataImport     DataImport    @relation(fields: [dataImportId], references: [id])
  baselines      ElectoralBaseline[]
  @@unique([cogYear, code])
  @@index([parentId])
}

model TerritoryCodeMapping {                      // tables de passage (fusions, changements de code)
  id           String     @id @default(uuid())
  fromYear     Int
  fromCode     String
  toYear       Int
  toCode       String
  weight       Float                              // 1 pour une fusion ; part de population pour une scission
  nature       DataNature                         // `estimation` si ventilation au prorata
  dataImportId String
  @@index([fromYear, fromCode])
}

model ElectoralBaseline {
  id           String     @id @default(uuid())
  territoryId  String
  territory    Territory  @relation(fields: [territoryId], references: [id])
  electionKey  String                             // ex. "presidentielle-2022"
  round        Int
  inscrits     Int
  votants      Int
  blancs       Int
  nuls         Int
  exprimes     Int
  voix         Json                               // { candidatKey: voix }
  nature       DataNature                         // reel, ou estimation si ventilée
  dataImportId String
  @@unique([territoryId, electionKey, round])
}

model DataSource {
  id          String       @id @default(uuid())
  key         String       @unique                // ex. "insee-cog", "interieur-pres-2022"
  name        String
  publisher   String
  url         String
  licence     String
  description String?
  imports     DataImport[]
}

model DataImport {                                // §10 : source, URL, date, millésime, licence,
  id              String     @id @default(uuid()) // validité, transformation, empreinte, version
  dataSourceId    String
  dataSource      DataSource @relation(fields: [dataSourceId], references: [id])
  url             String
  retrievedAt     DateTime
  millesime       String
  licence         String
  validFrom       DateTime?
  validUntil      DateTime?
  transformation  String                          // description des traitements appliqués
  sha256          String
  importerVersion String
  rowCount        Int
  status          String                          // ok | rejete | remplace
  createdAt       DateTime   @default(now())
  territories     Territory[]
}

model CandidateProfile {                          // personnalités réelles uniquement, sourcées
  id               String   @id @default(uuid())
  key              String   @unique
  fullName         String
  partyKey         String?
  candidacyStatus  String                         // non_declaree | declaree | officielle (liste du Conseil constitutionnel)
  facts            Json                           // [{ champ, valeur, sourceUrl, date }]
  estimatedParams  Json                           // paramètres de jeu, tous étiquetés `estimation`
  lastVerifiedAt   DateTime
}

model PartyProfile {
  id        String   @id @default(uuid())
  key       String   @unique
  name      String
  facts     Json
  estimated Json
  lastVerifiedAt DateTime
}

model MediaOutlet {
  id          String     @id @default(uuid())
  key         String     @unique
  name        String
  kind        String                              // tv | radio | presse | numerique
  reach       Float
  credibility Float
  priorities  Json
  nature      DataNature                          // réel (paramètres estimés) ou fictif
}

model Election {
  id             String          @id @default(uuid())
  gameId         String
  game           Game            @relation(fields: [gameId], references: [id], onDelete: Cascade)
  type           String                           // presidentielle | legislatives
  rulesetVersion String
  perimeter      Json                             // territoires inclus (métropole, DROM, COM, étranger)
  rounds         ElectionRound[]
}

model ElectionRound {
  id        String            @id @default(uuid())
  electionId String
  election  Election          @relation(fields: [electionId], references: [id], onDelete: Cascade)
  number    Int
  date      DateTime          @db.Date
  status    String                                // prevu | clos
  qualified Json?
  results   ElectoralResult[]
  blocks    ElectoralResultBlock[]
  @@unique([electionId, number])
}

model ElectoralResult {                            // agrégats : national, région, département, hors carte
  id            String        @id @default(uuid())
  roundId       String
  round         ElectionRound @relation(fields: [roundId], references: [id], onDelete: Cascade)
  level         ResultLevel
  territoryCode String
  nature        DataNature
  inscrits      Int
  votants       Int
  blancs        Int
  nuls          Int
  exprimes      Int
  voix          Json
  winnerKey     String?
  @@unique([roundId, level, territoryCode])
}

model ElectoralResultBlock {                       // communes d'un département, format colonnes compact
  id              String        @id @default(uuid())
  roundId         String
  round           ElectionRound @relation(fields: [roundId], references: [id], onDelete: Cascade)
  departementCode String
  data            Json                            // { codes[], inscrits[], votants[], …, voix: { cand: [] } }
  @@unique([roundId, departementCode])
}

model Poll {
  id           String   @id @default(uuid())
  gameId       String
  game         Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  week         Int
  kind         String                             // intentions_t1 | intentions_t2 | popularite
  institute    String                             // fictif
  fieldStart   DateTime @db.Date
  fieldEnd     DateTime @db.Date
  publishedAt  DateTime @db.Date
  sampleSize   Int
  method       String
  marginOfError Float
  scenario     Json
  results      Json
  limits       String
  @@index([gameId, week])
}

model EconomicIndicator {
  id           String     @id @default(uuid())
  gameId       String?                            // null : valeur initiale réelle de référence
  game         Game?      @relation(fields: [gameId], references: [id], onDelete: Cascade)
  week         Int
  key          String                             // croissance, inflation, chomage, dette, deficit…
  value        Float
  unit         String
  nature       DataNature
  dataImportId String?
  @@index([gameId, key, week])
}
```

## 6. Invariants vérifiés par tests

- `Σ voix = exprimes`, `votants = blancs + nuls + exprimes`, `inscrits ≥ votants`, valeurs ≥ 0 (phase 3 : vérifié sur chaque groupe et sur le national ; `abstentions = inscrits − votants`).
- Phase 4 : national = Σ régions + hors carte ; région = Σ départements ; département = Σ communes (recalculées à l'identique) ; somme des lignes 2022 importées = totaux proclamés à l'unité ; fusions de communes sommées exactement, scissions ventilées sans perte (propriété) ; import refusé si une commune n'a pas exactement une géométrie.
- Phase 3 : résultat national = somme exacte des groupes d'électeurs ; répartition au plus fort reste exacte (propriété) ; une consigne de vote ne transfère qu'une partie des électeurs de l'éliminé ; le décompte ne dépend pas de la difficulté ; un aller-retour JSON de l'état ne change rien (aucun `−0`).
- Phase 5 : budget = Σ recettes − dépenses pour chaque candidat à chaque semaine (propriété) ; aucune dépense acceptée au-delà du plafond légal (dépassement détecté et signalé) ; dons de personnes morales et en espèces au-delà de 150 € refusés, part d'un don au-delà de 4 600 € refusée, chaque refus journalisé ; présentations comptées ≤ 50 par département, présentations invalidées jamais comptées ; un candidat sous le seuil à la clôture n'est pas au premier tour ; un candidat rallié non plus ; la difficulté ne change ni le décompte des voix ni les règles (propriété).
- Phase 5 ter : couverture par les seuls organes réels du jeu de règles ; interview = émission connue du jeu de règles ; temps de parole d'un organe = 100 % ; presse sans temps de parole ; logo sous licence libre avec auteur (ou motif d'absence) ; empreinte des médias = celle déclarée par le jeu de règles.
- Phase 5 bis : une personnalité réelle, et elle seule, renvoie à sa fiche ; adversaires réels = fiches retenues sauf la personnalité incarnée ; fiches : chaque fait cité figure dans la révision importée, photo sous licence libre avec auteur (ou motif d'absence), empreinte des fiches = celle déclarée par le jeu de règles.
- Agrégat d'un niveau = somme exacte des enfants inclus dans le périmètre.
- Chaque `Territory` de type `commune` avec `mapped = true` a une et une seule géométrie (contrôlé à l'import).
- Les tables d'historique (`GameAction`, `GameEvent`, `SimulationLog`, `ElectoralResult*`) ne sont jamais modifiées après écriture. Depuis la phase 1, des déclencheurs PostgreSQL refusent toute mise à jour de `game_action`, `game_event` et `simulation_log`, et depuis la phase 2 de `game_advance` (testé).
- `Game.stateHash` = SHA-256 de la sérialisation canonique de `Game.state`.
