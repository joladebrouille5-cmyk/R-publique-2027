import {
  DEFAULT_START_DATE,
  START_DATE_MAX,
  START_DATE_MIN,
  type Difficulty,
  type GameMode,
  type OpponentSet,
} from '@r2027/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateGame } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, card, input, label } from '../components/ui';
import { DIFFICULTY_LABELS, MODE_LABELS, OPPONENT_SET_LABELS } from '../labels';
import { CandidateForm, EMPTY_CANDIDATE, type CandidateDraft } from './new-game/CandidateForm';
import { PersonalityPicker } from './new-game/PersonalityPicker';

const MODES: { value: GameMode; description: string }[] = [
  {
    value: 'candidat_personnalise',
    description: 'Créez votre candidat et votre parti.',
  },
  {
    value: 'candidat_reel',
    description:
      'Incarnez une personnalité ayant déclaré sa candidature (fiche sourcée) ; tout ce qui se passe dans la partie est simulé.',
  },
  {
    value: 'observateur',
    description: 'Suivez la campagne des candidats sans la contrôler.',
  },
];

const OPPONENTS: { value: OpponentSet; description: string }[] = [
  { value: 'fictifs', description: 'Sept candidats inventés par le jeu.' },
  {
    value: 'reels',
    description:
      'Les personnalités ayant déclaré leur candidature et retenues pour le jeu (fiches sourcées) ; leur comportement est simulé.',
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
  const [candidate, setCandidate] = useState<CandidateDraft>(EMPTY_CANDIDATE);
  const [personality, setPersonality] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<OpponentSet>('fictifs');
  const [missing, setMissing] = useState<string | null>(null);
  const withCandidate = mode === 'candidat_personnalise';
  const withPersonality = mode === 'candidat_reel';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (withCandidate && (!candidate.nom.trim() || !candidate.parti.trim())) {
      setMissing('Indiquez au moins le nom du candidat et son parti.');
      return;
    }
    if (withPersonality && !personality) {
      setMissing('Choisissez la personnalité que vous incarnez.');
      return;
    }
    setMissing(null);
    const { economie, societe, ...identity } = candidate;
    createGame.mutate(
      {
        name,
        mode,
        difficulty,
        startDate,
        ...(seed.trim() ? { seed: seed.trim() } : {}),
        ...(withCandidate
          ? { candidate: { ...identity, positionnement: { economie, societe } } }
          : {}),
        ...(withPersonality && personality ? { personnaliteId: personality } : {}),
        adversaires: opponents,
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
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <input
                type="radio"
                name="mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{MODE_LABELS[option.value]}</span>
                <span className="block text-sm text-slate-600 dark:text-slate-400">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {withCandidate && <CandidateForm value={candidate} onChange={setCandidate} />}
        {withPersonality && <PersonalityPicker value={personality} onChange={setPersonality} />}

        <fieldset className="space-y-2">
          <legend className={label}>Adversaires</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPPONENTS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <input
                  type="radio"
                  name="adversaires"
                  value={option.value}
                  checked={opponents === option.value}
                  onChange={() => setOpponents(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{OPPONENT_SET_LABELS[option.value]}</span>
                  <span className="block text-xs text-slate-600 dark:text-slate-400">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
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

        {missing && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {missing}
          </p>
        )}
        {createGame.isError && <ErrorMessage error={createGame.error} />}

        <button type="submit" className={buttonPrimary} disabled={createGame.isPending}>
          {createGame.isPending ? 'Création…' : 'Créer la partie'}
        </button>
      </form>
    </div>
  );
}
