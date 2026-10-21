import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, FREE_LICENSES, isoWeekday, parseIsoDate, RulesetSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { CURRENT_RULESET_KEY, getRuleset, listRulesetKeys, UnknownRulesetError } from './index';
import personnalites from './personnalites-2027.json';
import raw from './presidentielle-2027.json';

/** Jeu de règles complet (base + fiches importées), copié pour les tests de rejet. */
const full = () =>
  JSON.parse(JSON.stringify({ ...raw, personnalites })) as typeof raw & {
    personnalites: typeof personnalites;
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
    for (const outlet of ruleset.medias.organes) expect(outlet.nature).toBe('fictif');
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
