// Banc d'essai d'équilibrage (phase 24) : `pnpm sim:equilibrage [scénario…] [--parties N]`.
// Résumé en français sur la sortie ; détail des parties en JSONL dans data/sim/ (hors Git).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { formatSummary, runScenario, scenarios, summarize } from '../src/sim/equilibrage';

const args = process.argv.slice(2);
const at = args.indexOf('--parties');
const parties = at >= 0 ? Number(args[at + 1]) : 300;
const wanted = args.filter((a, i) => !a.startsWith('--') && i !== at + 1);
const ruleset = getRuleset(CURRENT_RULESET_KEY);
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
  `# Banc d'essai d'équilibrage — ${CURRENT_RULESET_KEY}, ${parties} parties par scénario\n`,
);
for (const id of ids) {
  const scenario = all[id]!;
  const started = Date.now();
  const outcomes = runScenario(scenario, ruleset, parties);
  writeFileSync(`${OUT}${id}.jsonl`, outcomes.map((o) => JSON.stringify(o)).join('\n') + '\n');
  console.log(formatSummary(scenario, summarize(outcomes), (a) => names.get(a) ?? a));
  console.error(`${id} : ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
