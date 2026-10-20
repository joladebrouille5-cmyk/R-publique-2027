import { buttonPrimary, card } from '../components/ui';
import { DIFFICULTY_LABELS, formatGameDate, MODE_LABELS, PHASE_LABELS } from '../labels';
import { useCurrentGame } from './GameLayout';

export function Dashboard() {
  const game = useCurrentGame();
  const facts = [
    { label: 'Date en jeu', value: formatGameDate(game.date) },
    { label: 'Semaine', value: String(game.week) },
    { label: 'Phase', value: PHASE_LABELS[game.phase] },
    { label: 'Mode', value: MODE_LABELS[game.mode] },
    { label: 'Difficulté', value: DIFFICULTY_LABELS[game.difficulty] },
  ];

  return (
    <section aria-labelledby="titre-tableau" className="space-y-6">
      <h1 id="titre-tableau" className="text-2xl font-bold">
        Tableau de bord
      </h1>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className={card}>
            <dt className="text-sm text-slate-500 dark:text-slate-400">{fact.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">Progression hebdomadaire</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Les actions de campagne, les ressources et l’avancée semaine par semaine arrivent en phase
          2. Le bouton est inactif tant que le moteur correspondant n’existe pas.
        </p>
        <button type="button" className={buttonPrimary} disabled>
          Semaine suivante (phase 2)
        </button>
      </div>

      <details className={card}>
        <summary className="cursor-pointer font-semibold">Paramètres techniques</summary>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-slate-500 dark:text-slate-400">Graine</dt>
          <dd className="font-mono break-all">{game.seed}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Version du moteur</dt>
          <dd className="font-mono">{game.engineVersion}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Jeu de règles</dt>
          <dd className="font-mono">{game.rulesetVersion}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Format de sauvegarde</dt>
          <dd className="font-mono">{game.saveSchemaVersion}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Empreinte de l’état</dt>
          <dd className="font-mono break-all" data-testid="empreinte">
            {game.stateHash}
          </dd>
        </dl>
      </details>
    </section>
  );
}
