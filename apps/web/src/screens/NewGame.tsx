import {
  DEFAULT_START_DATE,
  START_DATE_MAX,
  START_DATE_MIN,
  type Difficulty,
  type GameMode,
  type OpponentSet,
} from '@r2027/shared';
import { Eye, PenLine, ScrollText, type LucideIcon } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useCreateGame, useCurrentRuleset } from '../api/hooks';
import { Affiche } from '../components/Affiche';
import { ErrorMessage } from '../components/ErrorMessage';
import { PersonalityPhoto, SIMULATION_NOTICE } from '../components/RealPersonality';
import {
  buttonPrestige,
  card,
  cardRaised,
  input,
  label,
  optionTile,
  radio,
  screenTitle,
} from '../components/ui';
import { DIFFICULTY_LABELS, formatGameDate, MODE_LABELS, OPPONENT_SET_LABELS } from '../labels';
import { familyOf } from '../portraits';
import { CandidateForm, EMPTY_CANDIDATE, type CandidateDraft } from './new-game/CandidateForm';
import { DifficultyPicker } from './new-game/DifficultyPicker';
import { OrientationPicker } from './new-game/OrientationPicker';
import { PersonalityPicker } from './new-game/PersonalityPicker';
import { ScenarioPicker } from './new-game/ScenarioPicker';

// Création de partie (phase 16) : des chapitres numérotés, dans l'ordre où l'on compose une
// candidature, et un récapitulatif (l'affiche du candidat en direct, les choix faits, le bouton
// de création) collé à droite sur ordinateur, à la fin du formulaire sur téléphone. Mêmes champs,
// mêmes libellés et même requête qu'avant la refonte.

const MODES: { value: GameMode; description: string; icon: LucideIcon }[] = [
  {
    value: 'candidat_personnalise',
    description: 'Créez votre candidat et votre parti.',
    icon: PenLine,
  },
  {
    value: 'candidat_reel',
    description:
      'Incarnez une personnalité ayant déclaré sa candidature (fiche sourcée) ; tout ce qui se passe dans la partie est simulé.',
    icon: ScrollText,
  },
  {
    value: 'observateur',
    description: 'Suivez la campagne des candidats sans la contrôler.',
    icon: Eye,
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

/** Chapitre du formulaire : numéro doré, titre en Didone, une ligne d'explication. */
function Chapitre({
  numero,
  titre,
  description,
  children,
}: {
  numero: number;
  titre: string;
  description: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <header className="mb-4 flex items-start gap-4">
        <span
          aria-hidden="true"
          className="w-9 shrink-0 font-display text-[2.6rem] leading-[0.9] font-bold text-or-600 dark:text-dorure"
        >
          {numero}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-2xl sm:text-[1.75rem]">
            {titre}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>
      </header>
      <div className={`${card} space-y-7`}>{children}</div>
    </section>
  );
}

const validDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`));

export function NewGame() {
  const navigate = useNavigate();
  const createGame = useCreateGame();
  const ruleset = useCurrentRuleset();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<GameMode>('candidat_personnalise');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [seed, setSeed] = useState('');
  const [candidate, setCandidate] = useState<CandidateDraft>(EMPTY_CANDIDATE);
  const [personality, setPersonality] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<OpponentSet>('fictifs');
  const [scenario, setScenario] = useState('standard');
  const [orientation, setOrientation] = useState<string | null>(null);
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
        scenarioId: scenario,
        ...((withCandidate || withPersonality) && orientation
          ? { orientationId: orientation }
          : {}),
      },
      { onSuccess: (game) => void navigate(`/parties/${game.id}/tableau-de-bord`) },
    );
  };

  let chapter = 0;
  const next = () => ++chapter;
  const chosenPersonality = ruleset.data?.personnalites.personnalites.find(
    (p) => p.id === personality,
  );
  const recap: [string, string][] = [
    ['Mode', MODE_LABELS[mode]],
    ['Adversaires', OPPONENT_SET_LABELS[opponents]],
    ['Difficulté', DIFFICULTY_LABELS[difficulty]],
    ['Scénario', ruleset.data?.scenarios.find((s) => s.id === scenario)?.libelle ?? scenario],
    ...(withCandidate || withPersonality
      ? ([
          [
            'Orientation',
            ruleset.data?.orientations.liste.find((o) => o.id === orientation)?.libelle ??
              'Sans orientation particulière',
          ],
        ] as [string, string][])
      : []),
    ['Départ', validDate(startDate) ? formatGameDate(startDate) : 'date à préciser'],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <header className="mb-10 max-w-2xl">
        <h1 className={screenTitle}>Nouvelle partie</h1>
        <p className="mt-3 text-base text-slate-700 sm:text-lg dark:text-slate-300">
          Composez votre candidature, choisissez le terrain, puis entrez en campagne.
        </p>
      </header>
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 space-y-12">
          <Chapitre
            numero={next()}
            titre="La partie"
            description="Son nom, et la façon dont vous la jouez."
          >
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
              <div className="grid gap-2.5 md:grid-cols-3">
                {MODES.map((option) => {
                  const Icon = option.icon;
                  return (
                    <label key={option.value} className={`${optionTile} md:flex-col`}>
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="mode"
                          value={option.value}
                          checked={mode === option.value}
                          onChange={() => setMode(option.value)}
                          className={radio}
                        />
                        <Icon
                          aria-hidden="true"
                          className="size-5 text-or-600 md:size-6 dark:text-dorure"
                          strokeWidth={1.75}
                        />
                      </span>
                      <span>
                        <span className="font-display text-lg font-semibold">
                          {MODE_LABELS[option.value]}
                        </span>
                        <span className="block text-sm text-slate-600 dark:text-slate-400">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Chapitre>

          {withCandidate && (
            <Chapitre
              numero={next()}
              titre="Votre candidat"
              description="Identité, portrait, positionnement et profil de départ."
            >
              <CandidateForm value={candidate} onChange={setCandidate} />
            </Chapitre>
          )}
          {withPersonality && (
            <Chapitre
              numero={next()}
              titre="Personnalité incarnée"
              description="Une candidature déclarée, retenue pour le jeu ; son parcours est simulé."
            >
              <PersonalityPicker value={personality} onChange={setPersonality} />
            </Chapitre>
          )}
          {(withCandidate || withPersonality) && (
            <Chapitre
              numero={next()}
              titre="Le mouvement"
              description="Sur quoi votre campagne s’appuie pour partir."
            >
              <OrientationPicker value={orientation} onChange={setOrientation} />
            </Chapitre>
          )}

          <Chapitre
            numero={next()}
            titre="Le terrain"
            description="Qui vous affrontez, avec quelle exigence, dans quelle conjoncture."
          >
            <fieldset className="space-y-2">
              <legend className={label}>Adversaires</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {OPPONENTS.map((option) => (
                  <label key={option.value} className={optionTile}>
                    <input
                      type="radio"
                      name="adversaires"
                      value={option.value}
                      checked={opponents === option.value}
                      onChange={() => setOpponents(option.value)}
                      className={radio}
                    />
                    <span>
                      <span className="font-semibold">{OPPONENT_SET_LABELS[option.value]}</span>
                      <span className="block text-sm text-slate-600 dark:text-slate-400">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <DifficultyPicker value={difficulty} onChange={setDifficulty} mode={mode} />

            <ScenarioPicker value={scenario} onChange={setScenario} />
          </Chapitre>

          <Chapitre
            numero={next()}
            titre="Le calendrier"
            description="Le lundi où tout commence, et la graine du hasard."
          >
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
                <p id="aide-depart" className="text-xs text-slate-600 dark:text-slate-400">
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
                <p id="aide-graine" className="text-xs text-slate-600 dark:text-slate-400">
                  Même graine et mêmes décisions donnent la même partie.
                </p>
              </div>
            </div>
          </Chapitre>
        </div>

        <aside aria-label="Récapitulatif" className="space-y-4 lg:sticky lg:top-6">
          <div className={cardRaised}>
            {withCandidate && (
              <Affiche
                portrait={{
                  prenom: candidate.prenom.trim() || 'Prénom',
                  nom: candidate.nom.trim() || 'Votre nom',
                  photo: candidate.photo,
                  famille: familyOf(
                    { economie: candidate.economie, societe: candidate.societe },
                    ruleset.data,
                  ),
                  illustration: `personnalise:${candidate.prenom} ${candidate.nom}`,
                }}
                parti={candidate.parti.trim() || 'Votre mouvement'}
                className="mx-auto w-44 text-[15px] lg:w-full lg:max-w-[14rem] lg:text-[17px]"
              />
            )}
            {withPersonality &&
              (chosenPersonality ? (
                <div className="flex items-center gap-4">
                  <PersonalityPhoto personality={chosenPersonality} ruleset={ruleset.data} />
                  <div className="min-w-0">
                    <p className="font-display text-xl leading-tight font-bold">
                      {chosenPersonality.prenom} {chosenPersonality.nom}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {chosenPersonality.parti}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Choisissez la personnalité que vous incarnez.
                </p>
              ))}
            {withPersonality && chosenPersonality && (
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">{SIMULATION_NOTICE}</p>
            )}
            {mode === 'observateur' && (
              <p className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                <Eye aria-hidden="true" className="size-8 shrink-0 text-or-600 dark:text-dorure" />
                Vous suivez la campagne de tous les candidats, sans en diriger aucune.
              </p>
            )}
            <dl className="mt-5 divide-y divide-slate-200 border-t border-slate-200 text-sm dark:divide-white/[0.07] dark:border-white/[0.07]">
              {recap.map(([term, value]) => (
                <div key={term} className="flex justify-between gap-4 py-2">
                  <dt className="text-slate-600 dark:text-slate-400">{term}</dt>
                  <dd className="text-right font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {missing && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {missing}
            </p>
          )}
          {createGame.isError && <ErrorMessage error={createGame.error} />}

          <button
            type="submit"
            className={`${buttonPrestige} w-full`}
            disabled={createGame.isPending}
          >
            {createGame.isPending ? 'Création…' : 'Créer la partie'}
          </button>
        </aside>
      </form>
    </div>
  );
}
