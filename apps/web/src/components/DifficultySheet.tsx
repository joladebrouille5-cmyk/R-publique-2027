import { DIFFICULTIES, type Difficulty, type GameMode, type Ruleset } from '@r2027/shared';
import { useId } from 'react';
import {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  formatCount,
  formatEuros,
  formatPoints,
  formatShare,
} from '../labels';

// Fiche d'un niveau de difficulté (phase 18) : ce que le niveau change, à la création comme dans
// la section « La partie » du QG. Chaque chiffre est lu tel quel dans le jeu de règles (moyens de
// départ du joueur, paramètres de l'IA, maîtrise au débat) ; rien n'est recalculé ici.

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Rang du niveau sur l'échelle, de 1 (Découverte) à 5 (Légende). */
export const difficultyRank = (difficulty: Difficulty) => DIFFICULTIES.indexOf(difficulty) + 1;

/** Jauge en escalier : une marche par niveau, dorées jusqu'au niveau choisi. */
export function DifficultyGauge({
  value,
  className = '',
}: {
  value: Difficulty;
  className?: string;
}) {
  const rank = difficultyRank(value);
  return (
    <span aria-hidden="true" className={`flex items-end gap-0.5 ${className}`}>
      {DIFFICULTIES.map((step, index) => (
        <span
          key={step}
          className={`w-1.5 rounded-full transition-colors duration-200 ${index < rank ? 'bg-or-500 dark:bg-dorure' : 'bg-slate-200 dark:bg-white/10'}`}
          style={{ height: `${0.5 + (index + 1) * 0.2}rem` }}
        />
      ))}
    </span>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-2 divide-y divide-slate-200/80 border-y border-slate-200/80 text-sm dark:divide-white/[0.07] dark:border-white/[0.07]">
      {rows.map(([term, value]) => (
        <div key={term} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className="text-slate-600 dark:text-slate-400">{term}</dt>
          <dd className="text-right font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const times = (value: number) => `× ${decimal.format(value)}`;

function debateMastery(bonus: number) {
  const points = Math.round(bonus * 100);
  return points === 0 ? 'inchangée' : `${formatPoints(points)} points sur 100`;
}

export function DifficultySheet({
  ruleset,
  difficulty,
  mode,
}: {
  ruleset: Ruleset;
  difficulty: Difficulty;
  mode: GameMode;
}) {
  const titleId = useId();
  const start = ruleset.jeu.ressourcesInitiales[difficulty];
  const ia = ruleset.ia[difficulty];
  const observer = mode === 'observateur';
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-slate-300 bg-or-50/40 p-4 sm:p-5 dark:border-dorure/15 dark:bg-dorure/[0.035]"
    >
      <div aria-live="polite" aria-atomic="true">
        <h3 id={titleId} className="flex items-center gap-3 text-xl">
          <span>Niveau {DIFFICULTY_LABELS[difficulty]}</span>
          <DifficultyGauge value={difficulty} />
        </h3>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
          {DIFFICULTY_DESCRIPTIONS[difficulty]}
          {observer && ' En observateur, le niveau ne règle que les candidats conduits par l’IA.'}
        </p>
      </div>
      <div className={`mt-4 grid gap-5 ${observer ? 'max-w-md' : 'sm:grid-cols-2'}`}>
        {!observer && (
          <div>
            <h4 className="text-sm font-semibold">Vos moyens de départ</h4>
            <Rows
              rows={[
                ['Budget', formatEuros(start.budgetCentimes)],
                ['Militants', formatCount(start.militants)],
                ['Notoriété', formatShare(start.notoriete)],
                ['Popularité', formatShare(start.popularite)],
                [
                  'Promesses de parrainage',
                  formatCount(ruleset.jeu.promessesInitialesJoueur[difficulty]),
                ],
              ]}
            />
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              {mode === 'candidat_reel'
                ? 'Personnalité incarnée : sa notoriété réelle est conservée ; son budget, ses militants et ses promesses suivent la même proportion par rapport au niveau Standard.'
                : 'Candidat personnalisé, avant le profil, l’orientation et le scénario.'}
            </p>
          </div>
        )}
        <div>
          <h4 className="text-sm font-semibold">
            {observer ? 'Les candidats, conduits par l’IA' : 'Vos adversaires'}
          </h4>
          <Rows
            rows={[
              ['Budget de campagne', times(ia.multiplicateurBudget)],
              ['Notoriété de départ', times(ia.multiplicateurNotoriete)],
              ['Actions par semaine', formatCount(ia.actionsParSemaine)],
              ['Hasard dans leurs choix', decimal.format(ia.temperature)],
              ['Maîtrise au débat', debateMastery(ruleset.debats.ia.difficulte[difficulty])],
            ]}
          />
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Par rapport à leur fiche. Moins il y a de hasard, plus ils jouent la meilleure action.
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
        Le niveau est fixé à la création de la partie. Quel que soit le niveau : mêmes règles
        constitutionnelles, même seuil de parrainages, mêmes plafonds de dépenses, même décompte des
        voix. Valeurs : hypothèses de jeu (jeu de règles {ruleset.version}).
      </p>
    </section>
  );
}
