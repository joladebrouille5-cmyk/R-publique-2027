// Banc d'essai d'équilibrage (phase 24) : `pnpm sim:equilibrage [scénario…] [--parties N]`.
// Résumé en français sur la sortie ; détail des parties en JSONL dans data/sim/ (hors Git).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { formatSummary, runScenario, scenarios, summarize } from '../src/sim/equilibrage';

const args = process.argv.slice(2);
const at = args.indexOf('--parties');
const parties = at >= 0 ? Number(args[at + 1]) : 300;
const wanted = args.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
// Réglage au banc : surcharge JSON fusionnée dans le jeu de règles (jamais en jeu), par exemple
// R2027_SIM_SURCHARGE='{"departSondages":{"decroissance":0.97}}'.
const surcharge = process.env.R2027_SIM_SURCHARGE;
type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
// Objets fusionnés clé par clé ; listes d'objets à `id` fusionnées élément par élément.
const merge = (base: unknown, patch: unknown): unknown => {
  if (Array.isArray(base) && Array.isArray(patch) && patch.every((p) => isObject(p) && 'id' in p))
    return base.map((item) => {
      const match = patch.find((p) => (p as Json).id === (item as Json).id);
      return match ? merge(item, match) : item;
    });
  if (isObject(base) && isObject(patch))
    return Object.fromEntries(
      [...new Set([...Object.keys(base), ...Object.keys(patch)])].map((k) => [
        k,
        k in patch ? merge(base[k], patch[k]) : base[k],
      ]),
    );
  return patch;
};
const ruleset = (
  surcharge
    ? merge(getRuleset(CURRENT_RULESET_KEY), JSON.parse(surcharge))
    : getRuleset(CURRENT_RULESET_KEY)
) as ReturnType<typeof getRuleset>;
const all = scenarios(ruleset);
const ids = wanted.length
  ? wanted.flatMap((w) => Object.keys(all).filter((id) => id === w || id.startsWith(`${w}`)))
  : Object.keys(all);
const OUT = fileURLToPath(new URL('../../../data/sim/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const names = new Map<string, string>();
for (const c of ruleset.candidatsFictifs) names.set(c.id, `${c.prenom} ${c.nom}`);
for (const p of ruleset.personnalites.personnalites) names.set(p.id, `${p.prenom} ${p.nom}`);
names.set('joueur', 'Joueur');
console.log(
  `# Banc d'essai d'équilibrage — ${CURRENT_RULESET_KEY}, ${parties} parties par scénario${surcharge ? ` (surcharge ${surcharge})` : ''}\n`,
);
for (const id of ids) {
  const scenario = all[id]!;
  const started = Date.now();
  const outcomes = runScenario(scenario, ruleset, parties);
  writeFileSync(`${OUT}${id}.jsonl`, outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n');
  console.log(formatSummary(scenario, summarize(outcomes), (a) => names.get(a) ?? a));
  console.error(`${id} : ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
