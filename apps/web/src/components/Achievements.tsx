import type { GameState, Ruleset } from '@r2027/shared';
import { Award, Lock } from 'lucide-react';

// Succès de la partie (phase 15) : jalons débloqués une fois par le moteur (convention du jeu,
// sans valeur d'évaluation réelle), avec la semaine où ils l'ont été ; les autres restent à
// conquérir, avec leur condition.

export function Achievements({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const unlocked = new Map(state.succes.map((s) => [s.id, s.semaine]));
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600 dark:text-slate-400">
        {unlocked.size} succès débloqué(s) sur {ruleset.succes.liste.length}. Convention du jeu :
        des jalons de votre partie, sans valeur d’évaluation réelle.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ruleset.succes.liste.map((a) => {
          const week = unlocked.get(a.id);
          const done = week !== undefined;
          return (
            <li
              key={a.id}
              className={`flex items-start gap-3 rounded-card border p-3 ${
                done
                  ? 'border-slate-300 bg-or-50 dark:border-or-700 dark:bg-or-900/40'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <span
                className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${
                  done
                    ? 'bg-or-500 text-white'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                {done ? (
                  <Award aria-hidden="true" className="size-5" />
                ) : (
                  <Lock aria-hidden="true" className="size-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{a.libelle}</span>
                <span className="block text-slate-600 dark:text-slate-400">{a.description}</span>
                <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {done ? `Débloqué en semaine ${week}` : 'À débloquer'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
