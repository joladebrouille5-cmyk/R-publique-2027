import {
  DEFAULT_START_DATE,
  START_DATE_MAX,
  START_DATE_MIN,
  type Difficulty,
  type GameMode,
} from '@r2027/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateGame } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, card, input, label } from '../components/ui';
import { DIFFICULTY_LABELS, MODE_LABELS } from '../labels';

const MODES: { value: GameMode; description: string; available: boolean }[] = [
  {
    value: 'candidat_personnalise',
    description: 'Créez votre candidat et votre parti (création détaillée en phase 3).',
    available: true,
  },
  {
    value: 'observateur',
    description: 'Suivez une partie sans la contrôler.',
    available: true,
  },
  {
    value: 'candidat_reel',
    description: 'Incarnez une personnalité réelle — profils sourcés prévus en phase 3.',
    available: false,
  },
];

const DIFFICULTIES: { value: Difficulty; description: string }[] = [
  { value: 'accessible', description: 'Adversaires moins efficaces, gestion plus souple.' },
  { value: 'standard', description: 'Équilibre recommandé.' },
  { value: 'expert', description: 'Adversaires redoutables, ressources plus contraintes.' },
];

export function NewGame() {
  const navigate = useNavigate();
  const createGame = useCreateGame();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<GameMode>('candidat_personnalise');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [seed, setSeed] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    createGame.mutate(
      {
        name,
        mode,
        difficulty,
        startDate,
        ...(seed.trim() ? { seed: seed.trim() } : {}),
      },
      { onSuccess: (game) => void navigate(`/parties/${game.id}/tableau-de-bord`) },
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Nouvelle partie</h1>
      <form onSubmit={onSubmit} className={`${card} space-y-6`} noValidate>
        <div className="space-y-1">
          <label htmlFor="nom" className={label}>
            Nom de la partie
          </label>
          <input
            id="nom"
            className={input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
        </div>

        <fieldset className="space-y-2">
          <legend className={label}>Mode de jeu</legend>
          {MODES.map((option) => (
            <label
              key={option.value}
              className={`flex gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800 ${option.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
            >
              <input
                type="radio"
                name="mode"
                value={option.value}
                checked={mode === option.value}
                disabled={!option.available}
                onChange={() => setMode(option.value)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{MODE_LABELS[option.value]}</span>
                {!option.available && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                    Non disponible
                  </span>
                )}
                <span className="block text-sm text-slate-600 dark:text-slate-400">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={label}>Difficulté</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DIFFICULTIES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <input
                  type="radio"
                  name="difficulte"
                  value={option.value}
                  checked={difficulty === option.value}
                  onChange={() => setDifficulty(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{DIFFICULTY_LABELS[option.value]}</span>
                  <span className="block text-xs text-slate-600 dark:text-slate-400">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            La difficulté ne modifie jamais les règles constitutionnelles ni le décompte des voix.
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="depart" className={label}>
              Date de départ
            </label>
            <input
              id="depart"
              type="date"
              className={input}
              value={startDate}
              min={START_DATE_MIN}
              max={START_DATE_MAX}
              onChange={(event) => setStartDate(event.target.value)}
              aria-describedby="aide-depart"
            />
            <p id="aide-depart" className="text-xs text-slate-500 dark:text-slate-400">
              Un lundi de l’automne 2026 (le temps avance par semaines).
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="graine" className={label}>
              Graine (facultative)
            </label>
            <input
              id="graine"
              className={input}
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              maxLength={64}
              placeholder="aléatoire"
              aria-describedby="aide-graine"
            />
            <p id="aide-graine" className="text-xs text-slate-500 dark:text-slate-400">
              Même graine et mêmes décisions donnent la même partie.
            </p>
          </div>
        </div>

        {createGame.isError && <ErrorMessage error={createGame.error} />}

        <button type="submit" className={buttonPrimary} disabled={createGame.isPending}>
          {createGame.isPending ? 'Création…' : 'Créer la partie'}
        </button>
      </form>
    </div>
  );
}
