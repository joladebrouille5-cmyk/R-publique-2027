import { RulesetSchema, rulesetKey, type Ruleset } from '@r2027/shared';
import assemblee2026 from './assemblee-2026.json';
import economie2026 from './economie-2026.json';
import legislatives2024 from './legislatives-2024.json';
import medias2027 from './medias-2027.json';
import personnalites2027 from './personnalites-2027.json';
import presidentielle2027 from './presidentielle-2027.json';

// Registre des jeux de règles disponibles. Une partie référence le sien par « id@version » :
// une nouvelle version s'ajoute ici sans modifier les anciennes (parties en cours inchangées).
// Les fiches des personnalités réelles, les médias réels, la composition de l'Assemblée
// nationale, les indicateurs économiques de départ et les résultats des législatives de 2024
// (importés, sourcés) sont joints au jeu de règles ; leurs empreintes sont vérifiées par les tests.

const RULESETS: ReadonlyMap<string, Ruleset> = new Map(
  [
    {
      ...presidentielle2027,
      personnalites: personnalites2027,
      mediasReels: medias2027,
      assemblee: assemblee2026,
      economieReelle: economie2026,
      legislatives2024,
    },
  ].map((data) => {
    const ruleset = RulesetSchema.parse(data);
    return [rulesetKey(ruleset), ruleset] as const;
  }),
);

/** Jeu de règles utilisé pour les nouvelles parties. */
export const CURRENT_RULESET_KEY = 'presidentielle-2027@12.0.0';

export class UnknownRulesetError extends Error {
  constructor(readonly key: string) {
    super(`Jeu de règles inconnu : ${key}`);
    this.name = 'UnknownRulesetError';
  }
}

export function getRuleset(key: string): Ruleset {
  const ruleset = RULESETS.get(key);
  if (!ruleset) throw new UnknownRulesetError(key);
  return ruleset;
}

export function listRulesetKeys(): string[] {
  return [...RULESETS.keys()];
}
