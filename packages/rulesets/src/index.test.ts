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
    for (const item of [...ruleset.calendrier.scrutins, ...ruleset.calendrier.echeances]) {
      expect(ruleset.sources[item.sourceId]).toBeDefined();
      expect(item.statut).not.toBe('hypothese');
    }
    expect(ruleset.jeu.statut).toBe('hypothese');
    expect(ruleset.sources[ruleset.jeu.sourceId]?.url).toBeNull();
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
});
