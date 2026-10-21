import { addDays, isoWeekday, parseIsoDate, RulesetSchema } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { CURRENT_RULESET_KEY, getRuleset, listRulesetKeys, UnknownRulesetError } from './index';
import raw from './presidentielle-2027.json';

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
    const missingDependency = JSON.parse(JSON.stringify(raw)) as typeof raw;
    missingDependency.candidatsFictifs[0]!.programme = ['emploi-garantie-emploi'];
    expect(RulesetSchema.safeParse(missingDependency).success).toBe(false);

    const oneWay = JSON.parse(JSON.stringify(raw)) as typeof raw;
    oneWay.programme.propositions.find((p) => p.id === 'ret-age-60')!.incompatibilites = [];
    expect(RulesetSchema.safeParse(oneWay).success).toBe(false);
  });

  it('refuse les références croisées incohérentes', () => {
    const broken = JSON.parse(JSON.stringify(raw)) as typeof raw;
    broken.calendrier.scrutins[0]!.sourceId = 'source-absente';
    expect(RulesetSchema.safeParse(broken).success).toBe(false);

    const badChoice = JSON.parse(JSON.stringify(raw)) as typeof raw;
    const event = badChoice.evenements.find((e) => e.choix.length > 0)!;
    event.choixParDefaut = 'choix-absent';
    expect(RulesetSchema.safeParse(badChoice).success).toBe(false);

    const duplicate = JSON.parse(JSON.stringify(raw)) as typeof raw;
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
