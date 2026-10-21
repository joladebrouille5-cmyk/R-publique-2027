import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  daysFromCivil,
  FREE_LICENSES,
  isoWeekday,
  parseIsoDate,
  RulesetSchema,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { CURRENT_RULESET_KEY, getRuleset, listRulesetKeys, UnknownRulesetError } from './index';
import assemblee from './assemblee-2026.json';
import economieReelle from './economie-2026.json';
import legislatives2024 from './legislatives-2024.json';
import mediasReels from './medias-2027.json';
import personnalites from './personnalites-2027.json';
import raw from './presidentielle-2027.json';

/** Jeu de règles complet (base + données importées), copié pour les tests de rejet. */
const full = () =>
  JSON.parse(
    JSON.stringify({
      ...raw,
      personnalites,
      mediasReels,
      assemblee,
      economieReelle,
      legislatives2024,
    }),
  ) as typeof raw & {
    personnalites: typeof personnalites;
    mediasReels: typeof mediasReels;
    assemblee: typeof assemblee;
    economieReelle: typeof economieReelle;
    legislatives2024: typeof legislatives2024;
  };

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const date = (id: string) =>
  [...ruleset.calendrier.scrutins, ...ruleset.calendrier.echeances].find((d) => d.id === id)!.date;
const weekday = (iso: string) => isoWeekday(parseIsoDate(iso)!);

describe('jeu de règles presidentielle-2027', () => {
  it('est valide et enregistré sous sa clé', () => {
    expect(listRulesetKeys()).toContain(CURRENT_RULESET_KEY);
    expect(() => getRuleset('inexistant@0.0.0')).toThrow(UnknownRulesetError);
  });

  it('a un premier tour un dimanche et un second tour 14 jours plus tard', () => {
    const t1 = date('presidentielle-2027-t1');
    expect(weekday(t1)).toBe(7);
    expect(date('presidentielle-2027-t2')).toBe(addDays(t1, 14));
  });

  it('déduit correctement les échéances de leur règle (guide CNCCFP)', () => {
    const t1 = date('presidentielle-2027-t1');
    // Sixième vendredi précédant le premier tour : le vendredi précédant est t1 − 2 jours.
    expect(date('presentation-candidatures')).toBe(addDays(t1, -2 - 5 * 7));
    // Onzième vendredi suivant le premier tour : le premier vendredi suivant est t1 + 5 jours.
    expect(date('depot-comptes-campagne')).toBe(addDays(t1, 5 + 10 * 7));
    for (const id of ['presentation-candidatures', 'depot-comptes-campagne']) {
      expect(weekday(date(id))).toBe(5);
    }
  });

  it('étiquette chaque donnée avec un statut et une source', () => {
    for (const item of ruleset.calendrier.scrutins) expect(item.statut).not.toBe('hypothese');
    for (const item of [...ruleset.calendrier.scrutins, ...ruleset.calendrier.echeances]) {
      expect(ruleset.sources[item.sourceId]).toBeDefined();
    }
    // Seule échéance supposée : l'ouverture des présentations, liée à un décret non encore publié.
    const assumed = ruleset.calendrier.echeances.filter((e) => e.statut === 'hypothese');
    expect(assumed.map((e) => e.id)).toEqual(['ouverture-presentations']);
    expect(assumed[0]!.sourceId).toBe('conception-du-jeu');
    expect(assumed[0]!.regle).toMatch(/non encore publié/);
    expect(ruleset.jeu.statut).toBe('hypothese');
    expect(ruleset.sources[ruleset.jeu.sourceId]?.url).toBeNull();
  });

  it('reprend les règles officielles de parrainage et de financement (SOURCES §5 et §6)', () => {
    expect(ruleset.parrainages).toMatchObject({
      statut: 'officiel',
      seuil: 500,
      departementsMin: 30,
      partMaxParDepartement: 0.1,
      clotureEcheanceId: 'presentation-candidatures',
    });
    expect(ruleset.finances).toMatchObject({
      statut: 'officiel',
      sourceId: 'cnccfp-guide-2027',
      plafondT1Centimes: 1_685_100_000,
      plafondT2Centimes: 2_250_900_000,
      donMaxCentimes: 460_000,
      donEspecesMaxCentimes: 15_000,
      avanceForfaitaireCentimes: 20_000_000,
      remboursement: { seuilExprimes: 0.05, tauxSousSeuil: 0.0475, tauxAuDessus: 0.475 },
    });
    const reservoir = Object.values(ruleset.parrainages.reservoir.departements);
    expect(reservoir).toHaveLength(101);
    expect(reservoir.reduce((sum, d) => sum + d.elus, 0)).toBe(34_875);
    expect(ruleset.parrainages.reservoir.statut).toBe('estimation');
  });

  it('couvre les 17 domaines du programme, avec des estimations étiquetées', () => {
    expect(ruleset.programme.statut).toBe('hypothese');
    expect(ruleset.programme.domaines).toHaveLength(17);
    for (const domaine of ruleset.programme.domaines) {
      expect(ruleset.programme.propositions.some((p) => p.domaine === domaine.id)).toBe(true);
    }
  });

  it('refuse un programme incohérent et une incompatibilité non réciproque', () => {
    expect(RulesetSchema.safeParse(full()).success).toBe(true);
    const missingDependency = full();
    missingDependency.candidatsFictifs[0]!.programme = ['emploi-garantie-emploi'];
    expect(RulesetSchema.safeParse(missingDependency).success).toBe(false);

    const oneWay = full();
    oneWay.programme.propositions.find((p) => p.id === 'ret-age-60')!.incompatibilites = [];
    expect(RulesetSchema.safeParse(oneWay).success).toBe(false);
  });

  it('refuse les références croisées incohérentes', () => {
    const broken = full();
    broken.calendrier.scrutins[0]!.sourceId = 'source-absente';
    expect(RulesetSchema.safeParse(broken).success).toBe(false);

    const badChoice = full();
    const event = badChoice.evenements.find((e) => e.choix.length > 0)!;
    event.choixParDefaut = 'choix-absent';
    expect(RulesetSchema.safeParse(badChoice).success).toBe(false);

    const duplicate = full();
    duplicate.actions.push(duplicate.actions[0]!);
    expect(RulesetSchema.safeParse(duplicate).success).toBe(false);
  });

  it('ne contient que des événements fictifs', () => {
    for (const event of ruleset.evenements) expect(event.nature).toBe('fictif');
  });

  it('ne présente que des adversaires et des instituts fictifs, déclarés comme tels', () => {
    for (const candidate of ruleset.candidatsFictifs) {
      expect(candidate.parcours).toMatch(/^Personnage fictif\./);
    }
    for (const institute of ruleset.sondages.instituts)
      expect(institute.libelle).toMatch(/\(fictif\)$/);
  });

  it('reprend les inscrits proclamés en 2022, étiquetés comme estimation pour 2027', () => {
    // Décision n° 2022-197 PDR (docs/SOURCES.md §3.2) : 48 752 339 inscrits au second tour.
    expect(ruleset.electorat.inscrits).toMatchObject({
      valeur: 48_752_339,
      statut: 'estimation',
      sourceId: 'cc-2022-197-pdr',
    });
    expect(ruleset.electorat.statutGroupes).toBe('hypothese');
    expect(ruleset.modele.statut).toBe('hypothese');
  });
});

describe('personnalités réelles (phase 5 bis)', () => {
  const list = ruleset.personnalites.personnalites;
  const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public');

  it('a l’empreinte déclarée par le jeu de règles : une réimportation impose une nouvelle version', () => {
    const hash = createHash('sha256').update(JSON.stringify(personnalites)).digest('hex');
    expect(ruleset.personnalitesReelles.empreinte).toBe(hash);
    expect(ruleset.personnalitesReelles.statut).toBe('hypothese');
  });

  it('retient les candidatures décidées le 21/10/2026, et liste les autres avec leur motif', () => {
    expect(list.map((p) => p.id)).toEqual([
      'reel-arthaud',
      'reel-asselineau',
      'reel-attal',
      'reel-becht',
      'reel-bertrand',
      'reel-bouamrane',
      'reel-dupont-aignan',
      'reel-glucksmann',
      'reel-le-pen',
      'reel-lisnard',
      'reel-melenchon',
      'reel-philippe',
      'reel-retailleau',
      'reel-roussel',
      'reel-ruffin',
      'reel-tondelier',
      'reel-zemmour',
    ]);
    expect(ruleset.personnalites.nonIntegrees.length).toBeGreaterThan(0);
    for (const n of ruleset.personnalites.nonIntegrees) expect(n.motif).toMatch(/CHES/);
  });

  it('source chaque fiche : candidature datée, position étiquetée, sources importées avec empreinte', () => {
    for (const p of list) {
      expect(p.candidature.source.url).toMatch(/^https:\/\//);
      expect(p.candidature.date <= ruleset.personnalites.verifieLe).toBe(true);
      expect(p.position.statut).toBe(
        p.position.methode === 'parti' || p.position.methode === 'parti_soutien'
          ? 'estimation'
          : 'hypothese',
      );
      expect(p.position.detail.length).toBeGreaterThan(10);
    }
    const ids = ruleset.personnalites.sources.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(['wikipedia-candidatures-2027', 'ches-2024', 'wikidata-partis']),
    );
  });

  it('ne reprend que des photos sous licence libre, créditées, présentes et sans fichier orphelin', () => {
    const files = new Set<string>();
    for (const p of list) {
      if (p.photo) {
        expect(p.photo.licence).toMatch(FREE_LICENSES);
        expect(p.photo.auteur.length).toBeGreaterThan(0);
        expect(existsSync(join(PUBLIC, p.photo.fichier))).toBe(true);
        files.add(p.photo.fichier.split('/')[1]!);
      } else {
        expect(p.photoAbsente).toMatch(/\S/);
      }
    }
    expect(new Set(readdirSync(join(PUBLIC, 'personnalites')))).toEqual(files);
  });

  it('refuse une fiche sans source de candidature ou avec une licence non libre', () => {
    const noSource = full();
    (noSource.personnalites.personnalites[0]!.candidature as { source: unknown }).source = null;
    expect(RulesetSchema.safeParse(noSource).success).toBe(false);
    const nonFree = full();
    nonFree.personnalites.personnalites.find((p) => p.photo)!.photo!.licence = 'CC BY-NC 4.0';
    expect(RulesetSchema.safeParse(nonFree).success).toBe(false);
  });
});

describe('médias réels (phase 5 ter)', () => {
  const media = ruleset.mediasReels;
  const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public');

  it('a l’empreinte déclarée par le jeu de règles : une réimportation impose une nouvelle version', () => {
    const hash = createHash('sha256').update(JSON.stringify(mediasReels)).digest('hex');
    expect(ruleset.medias.empreinte).toBe(hash);
    expect(ruleset.medias.statut).toBe('hypothese');
  });

  it('remplace les organes fictifs par des organes réels, chacun avec sa mesure d’audience sourcée', () => {
    const sourceIds = new Set(media.sources.map((s) => s.id));
    expect(media.organes.length).toBeGreaterThanOrEqual(20);
    for (const type of ['television', 'radio', 'presse'] as const) {
      const ofType = media.organes.filter((o) => o.type === type);
      expect(ofType.length).toBeGreaterThan(0);
      const total = ofType.reduce((sum, o) => sum + o.audience.partDuType, 0);
      expect(total).toBeCloseTo(1, 3);
    }
    for (const o of media.organes) {
      expect(sourceIds.has(o.audience.sourceId)).toBe(true);
      expect(o.article).toMatch(
        /^https:\/\/fr\.wikipedia\.org\/w\/index\.php\?title=.+&oldid=\d+$/,
      );
      expect(JSON.stringify(o)).not.toMatch(/fictif/);
    }
    for (const s of media.sources) expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('donne à chaque chaîne et station des temps de parole totalisant 100 %, rien à la presse', () => {
    for (const o of media.organes) {
      if (o.type === 'presse') {
        expect(o.tempsDeParole).toBeNull();
        continue;
      }
      const t = o.tempsDeParole!;
      const total = Object.values(t.parts).reduce((sum, v) => sum + v, t.autres);
      expect(Math.abs(total - 1)).toBeLessThanOrEqual(0.002);
      expect(t.partisSecondes).toBeGreaterThan(0);
    }
    expect(media.periodeArcom.debut < media.periodeArcom.fin).toBe(true);
  });

  it('rattache chaque personnalité réelle à un parti mesuré, ou à l’exposition moyenne avec un motif', () => {
    expect(media.rattachements.map((r) => r.personnaliteId).sort()).toEqual(
      ruleset.personnalites.personnalites.map((p) => p.id).sort(),
    );
    for (const r of media.rattachements) expect(r.motif.length).toBeGreaterThan(5);
  });

  it('présente des émissions réelles avec chaîne et présentateurs sourcés, sans aucun propos', () => {
    expect(media.emissions.length).toBeGreaterThan(0);
    const ids = new Set(media.organes.map((o) => o.id));
    for (const e of media.emissions) {
      expect(ids.has(e.organeId)).toBe(true);
      expect(e.presentateurs.length).toBeGreaterThan(0);
      expect(e.article).toMatch(/&oldid=\d+$/);
      expect(Object.keys(e).sort()).toEqual(
        [
          'article',
          'autresOrganes',
          'diffusion',
          'id',
          'organeId',
          'presentateurs',
          'titre',
        ].sort(),
      );
    }
    expect(ruleset.actions.find((a) => a.id === 'emission-politique')!.cible).toBe('emission');
  });

  it('ne reprend que des logos sous licence libre, crédités, présents et sans fichier orphelin', () => {
    const files = new Set<string>();
    for (const o of media.organes) {
      if (o.logo) {
        expect(o.logo.licence).toMatch(FREE_LICENSES);
        expect(o.logo.auteur.length).toBeGreaterThan(0);
        expect(existsSync(join(PUBLIC, o.logo.fichier))).toBe(true);
        files.add(o.logo.fichier.split('/')[1]!);
      } else {
        expect(o.logoAbsent).toMatch(/\S/);
      }
    }
    expect(new Set(readdirSync(join(PUBLIC, 'medias')))).toEqual(files);
  });

  it('refuse un logo non libre, des parts qui ne font pas 100 % ou une émission sans présentateur', () => {
    const nonFree = full();
    nonFree.mediasReels.organes.find((o) => o.logo)!.logo!.licence = 'Marque déposée';
    expect(RulesetSchema.safeParse(nonFree).success).toBe(false);

    const parts = full();
    const tv = parts.mediasReels.organes.find((o) => o.tempsDeParole)!;
    tv.tempsDeParole!.autres += 0.05;
    expect(RulesetSchema.safeParse(parts).success).toBe(false);

    const noHost = full();
    noHost.mediasReels.emissions[0]!.presentateurs = [];
    expect(RulesetSchema.safeParse(noHost).success).toBe(false);

    const unknownOutlet = full();
    unknownOutlet.mediasReels.emissions[0]!.organeId = 'chaine-inconnue';
    expect(RulesetSchema.safeParse(unknownOutlet).success).toBe(false);

    const pressMeasured = full();
    const press = pressMeasured.mediasReels.organes.find((o) => o.type === 'presse')!;
    (press as { tempsDeParole: unknown }).tempsDeParole = tv.tempsDeParole;
    expect(RulesetSchema.safeParse(pressMeasured).success).toBe(false);
  });
});

describe('quinquennat (phase 6)', () => {
  const q = ruleset.quinquennat;
  const days = (a: string, b: string) =>
    daysFromCivil(parseIsoDate(b)!) - daysFromCivil(parseIsoDate(a)!);

  it('déduit les dates du mandat de la proclamation de 2022 et de l’article 6', () => {
    expect(q.mandat).toMatchObject({
      dureeAnnees: 5,
      mandatsConsecutifsMax: 2,
      statut: 'officiel',
      sourceId: 'constitution-art-6',
    });
    // Mandat proclamé « à compter du 14 mai 2022 à 0 heure » (décision n° 2022-197 PDR).
    expect(q.investiture).toMatchObject({
      date: '2027-05-14',
      statut: 'deduit',
      sourceId: 'cc-2022-197-pdr',
    });
    expect(q.finMandat).toMatchObject({ date: '2032-05-13', statut: 'deduit' });
    expect(addDays(q.finMandat.date, 1)).toBe(`2032${q.investiture.date.slice(4)}`);
    for (const id of ['constitution-art-6', 'constitution-art-7']) {
      expect(ruleset.sources[id]!.url).toMatch(
        /^https:\/\/fr\.wikipedia\.org\/w\/index\.php\?title=Article_\d_.+&oldid=\d+$/,
      );
      expect(ruleset.sources[id]!.titre).toMatch(/Légifrance non relu/);
    }
  });

  it('place chaque premier tour un dimanche, dans la fenêtre de l’article 7', () => {
    const t1 = date('presidentielle-2027-t1');
    const t2 = date('presidentielle-2027-t2');
    expect(q.cycles.map((c) => [c.annee, c.statut])).toEqual([
      [2032, 'hypothese'],
      [2037, 'hypothese'],
    ]);
    for (const cycle of [{ annee: 2027, decalageSemaines: 0 }, ...q.cycles]) {
      const first = addDays(t1, 7 * cycle.decalageSemaines);
      expect(first.slice(0, 4)).toBe(String(cycle.annee));
      expect(weekday(first)).toBe(7);
      expect(addDays(t2, 7 * cycle.decalageSemaines)).toBe(addDays(first, 14));
      // « Vingt jours au moins et trente-cinq jours au plus avant l'expiration des pouvoirs du
      // président en exercice », qui expirent à la veille du 14 mai à minuit.
      const expiry = `${cycle.annee}${q.investiture.date.slice(4)}`;
      expect(days(first, expiry)).toBeGreaterThanOrEqual(20);
      expect(days(first, expiry)).toBeLessThanOrEqual(35);
    }
  });

  it('ne propose que des profils fictifs déclarés, plus nombreux que les postes', () => {
    expect(q.profils.length).toBeGreaterThan(q.postes.length);
    for (const p of q.profils) {
      expect(p.nature).toBe('fictif');
      expect(p.parcours).toMatch(/^Personnage fictif\./);
    }
    const names = new Set(
      ruleset.personnalites.personnalites.map((p) => `${p.prenom} ${p.nom}`.toLowerCase()),
    );
    for (const p of q.profils) expect(names.has(`${p.prenom} ${p.nom}`.toLowerCase())).toBe(false);
    expect(q.acceptation.statut).toBe('hypothese');
    expect(q.opinion.statut).toBe('hypothese');
  });

  it('refuse une action du président coûteuse, mal ciblée, ou un remaniement absent', () => {
    const costly = full();
    costly.quinquennat.actions[0]!.cout.budgetCentimes = 100;
    expect(RulesetSchema.safeParse(costly).success).toBe(false);
    const media = full();
    (media.quinquennat.actions[0] as { cible: string | null }).cible = 'media';
    expect(RulesetSchema.safeParse(media).success).toBe(false);
    const noReshuffle = full();
    noReshuffle.quinquennat.actions = noReshuffle.quinquennat.actions.filter(
      (a) => !('institution' in a),
    );
    expect(RulesetSchema.safeParse(noReshuffle).success).toBe(false);
    const clash = full();
    clash.quinquennat.actions[0]!.id = clash.actions[0]!.id;
    expect(RulesetSchema.safeParse(clash).success).toBe(false);
  });
});

describe('Assemblée nationale (phase 6)', () => {
  const an = ruleset.assemblee;

  it('a l’empreinte déclarée par le jeu de règles : une réimportation impose une nouvelle version', () => {
    const hash = createHash('sha256').update(JSON.stringify(assemblee)).digest('hex');
    expect(ruleset.parlement.empreinte).toBe(hash);
    expect(ruleset.parlement.fichier).toBe('assemblee-2026.json');
  });

  it('reprend les groupes et sièges de la 17e législature, sans aucun nom de député', () => {
    expect(an.legislature).toBe(17);
    expect(an.groupes.reduce((sum, g) => sum + g.sieges, 0) + an.vacants).toBe(577);
    expect(an.groupes.map((g) => g.sigle)).toEqual(
      expect.arrayContaining(['RN', 'EPR', 'LFI-NFP', 'SOC', 'DR', 'EcoS', 'Dem', 'HOR']),
    );
    for (const g of an.groupes)
      expect(Object.keys(g).sort()).toEqual(
        [
          'ches',
          'id',
          'libelle',
          'nonInscrits',
          'position',
          'positionDetail',
          'positionStatut',
          'sieges',
          'sigle',
        ].sort(),
      );
    const source = an.sources.find((s) => s.id === 'an-deputes-en-exercice')!;
    expect(source.url).toMatch(/^https:\/\/data\.assemblee-nationale\.fr\//);
    expect(source.licence).toMatch(/Licence Ouverte/);
    expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('positionne chaque groupe d’après CHES (estimation) ou une hypothèse motivée', () => {
    for (const g of an.groupes) {
      expect(g.positionStatut).toBe(g.ches ? 'estimation' : 'hypothese');
      if (g.ches) expect(g.positionDetail).toMatch(/enquête CHES 2024/);
      else expect(g.positionDetail).toMatch(/hypothèse de jeu/);
    }
  });

  it('cite les règles de la Constitution et étiquette les paramètres de jeu', () => {
    const p = ruleset.parlement;
    expect(p.regles).toMatchObject({
      statut: 'officiel',
      sourceIds: ['constitution-art-28', 'constitution-art-45', 'constitution-art-49'],
      signaturesCensure: 0.1,
      autres49_3ParSession: 1,
      moisOuvertureSession: 10,
    });
    for (const id of p.regles.sourceIds) expect(ruleset.sources[id]!.url).toMatch(/oldid=\d+$/);
    for (const block of [p.calendrier, p.vote, p.concessions, p.senat, p.censure, p.reformes])
      expect(block.statut).toBe('hypothese');
    expect(p.vote.seuilOpposition).toBeLessThan(p.vote.seuilSoutien);
  });
});

describe('économie et crises (phase 6)', () => {
  it('a l’empreinte déclarée par le jeu de règles : une réimportation impose une nouvelle version', () => {
    const hash = createHash('sha256').update(JSON.stringify(economieReelle)).digest('hex');
    expect(ruleset.economie.empreinte).toBe(hash);
    expect(ruleset.economie.fichier).toBe('economie-2026.json');
  });

  it('source chaque valeur de départ dans une série de l’Insee, avec sa période et son statut', () => {
    const real = ruleset.economieReelle;
    for (const source of real.sources) {
      expect(source.url).toMatch(/^https:\/\/www\.insee\.fr\/fr\/statistiques\/serie\/\d{9}$/);
      expect(source.titre).toMatch(/^Insee — .+ \(idbank \d{9}\)$/);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const indicator of Object.values(real.indicateurs)) {
      expect(['estimation', 'deduit']).toContain(indicator.statut);
      expect(indicator.periode.length).toBeGreaterThan(3);
    }
    expect(real.indicateurs.deficit.valeur).toBeLessThan(0);
    expect(real.indicateurs.dette.valeur).toBeGreaterThan(0);
    expect(ruleset.economie.statut).toBe('hypothese');
  });

  it('ne contient que des crises fictives, déclarées comme telles', () => {
    expect(ruleset.crises.length).toBeGreaterThanOrEqual(6);
    for (const crisis of ruleset.crises) {
      expect(crisis.nature).toBe('fictif');
      expect(crisis.description).toMatch(/^Crise fictive inventée pour le jeu\./);
      expect(crisis.choix.map((c) => c.id)).toContain(crisis.choixParDefaut);
    }
    const unknownDefault = full();
    unknownDefault.crises[0]!.choixParDefaut = 'absent';
    expect(RulesetSchema.safeParse(unknownDefault).success).toBe(false);
  });
});

describe('législatives (phase 6)', () => {
  it('a l’empreinte déclarée par le jeu de règles : une réimportation impose une nouvelle version', () => {
    const hash = createHash('sha256').update(JSON.stringify(legislatives2024)).digest('hex');
    expect(ruleset.legislatives.empreinte).toBe(hash);
    expect(ruleset.legislatives.fichier).toBe('legislatives-2024.json');
  });

  it('cite les règles de la Constitution et du code électoral, et étiquette le reste', () => {
    const l = ruleset.legislatives;
    expect(l.regles).toMatchObject({
      statut: 'officiel',
      premierTourInscrits: 0.25,
      qualificationInscrits: 0.125,
      delaiMinJours: 20,
      delaiMaxJours: 40,
      moratoireJours: 365,
      dureeAnnees: 5,
    });
    for (const id of l.regles.sourceIds) expect(ruleset.sources[id]!.url).toMatch(/oldid=\d+$/);
    expect(l.finLegislature).toMatchObject({ date: '2029-06-19', statut: 'deduit' });
    expect(l.echeance.statut).toBe('hypothese');
    expect(weekday(l.echeance.t1)).toBe(7);
    expect(addDays(l.echeance.t1, 7)).toBe(l.echeance.t2);
    expect(l.modele.statut).toBe('hypothese');
    for (const source of ruleset.legislatives2024.sources) {
      expect(source.licence).toMatch(/Licence Ouverte/);
      expect(source.url).toMatch(/^https:\/\/static\.data\.gouv\.fr\//);
    }
  });

  it('rattache chaque nuance de 2024 et chaque groupe de l’Assemblée à un seul bloc', () => {
    const orphan = full();
    orphan.legislatives.blocs[0]!.nuances = orphan.legislatives.blocs[0]!.nuances.filter(
      (n) => n !== 'UG',
    );
    expect(RulesetSchema.safeParse(orphan).success).toBe(false);
    const twice = full();
    twice.legislatives.blocs[1]!.groupes.push('rn');
    expect(RulesetSchema.safeParse(twice).success).toBe(false);
  });
});
