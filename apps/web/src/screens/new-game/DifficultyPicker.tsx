import { DIFFICULTIES, type Difficulty, type GameMode } from '@r2027/shared';
import { useCurrentRuleset } from '../../api/hooks';
import { DifficultyGauge, DifficultySheet } from '../../components/DifficultySheet';
import { label, optionTile, radio } from '../../components/ui';
import { DIFFICULTY_LABELS, DIFFICULTY_TAGLINES } from '../../labels';
import { LockNote } from './LockNote';

// Choix de la difficulté (phase 18) : cinq niveaux en escalier, de Découverte à Légende, puis la
// fiche du niveau choisi (moyens de départ, adversaires, débats), lue dans le jeu de règles.

export function DifficultyPicker({
  value,
  onChange,
  mode,
  locks = {},
}: {
  value: Difficulty;
  onChange: (difficulty: Difficulty) => void;
  mode: GameMode;
  /** Phase 20 : niveaux verrouillés, avec la condition de leur déblocage. */
  locks?: Partial<Record<Difficulty, string>>;
}) {
  const ruleset = useCurrentRuleset();
  return (
    <fieldset className="space-y-3">
      <legend className={label}>Difficulté</legend>
      <div className="grid gap-2 md:grid-cols-5">
        {DIFFICULTIES.map((difficulty) => (
          <label
            key={difficulty}
            className={`${optionTile} items-center py-3 md:grid md:grid-cols-[auto_1fr] md:items-start md:gap-x-2 md:gap-y-2 md:px-3`}
          >
            <input
              type="radio"
              name="difficulte"
              value={difficulty}
              checked={value === difficulty}
              onChange={() => onChange(difficulty)}
              className={`${radio} md:mt-1`}
            />
            <DifficultyGauge
              value={difficulty}
              className="order-last ml-auto md:order-none md:ml-0 md:justify-self-end"
            />
            <span className="min-w-0 md:col-span-2">
              <span className="block font-display text-lg leading-tight font-semibold">
                {DIFFICULTY_LABELS[difficulty]}
              </span>
              <span className="block text-xs text-slate-600 dark:text-slate-400">
                {DIFFICULTY_TAGLINES[difficulty]}
              </span>
              {locks[difficulty] && <LockNote condition={locks[difficulty]} />}
            </span>
          </label>
        ))}
      </div>
      {ruleset.data && <DifficultySheet ruleset={ruleset.data} difficulty={value} mode={mode} />}
    </fieldset>
  );
}
