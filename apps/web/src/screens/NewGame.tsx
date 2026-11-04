import {
  candidateName,
  DEFAULT_START_DATE,
  START_DATE_MAX,
  START_DATE_MIN,
  type Depart,
  type Difficulty,
  type GameFormat,
  type GameMode,
  type OpponentSet,
} from '@r2027/shared';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Flag,
  Hourglass,
  PenLine,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useCreateGame, useCurrentRuleset, useProgression } from '../api/hooks';
import { Affiche } from '../components/Affiche';
import { ErrorMessage } from '../components/ErrorMessage';
import { PersonalityPhoto, SIMULATION_NOTICE } from '../components/RealPersonality';
import {
  buttonPrestige,
  buttonSecondary,
  card,
  cardRaised,
  input,
  label,
  optionTile,
  radio,
  screenTitle,
} from '../components/ui';
import {
  DIFFICULTY_LABELS,
  FORMAT_LABELS,
  formatGameDate,
  MODE_LABELS,
  DEPART_LABELS,
  DEPART_SONDAGES_NOTICE,
  OPPONENT_SET_LABELS,
} from '../labels';
import { familyOf } from '../portraits';
import {
  CandidateForm,
  EMPTY_CANDIDATE,
  ProfilePicker,
  type CandidateDraft,
} from './new-game/CandidateForm';
import { DifficultyPicker } from './new-game/DifficultyPicker';
import { OrientationPicker } from './new-game/OrientationPicker';
import { PersonalityPicker } from './new-game/PersonalityPicker';
import { ScenarioPicker } from './new-game/ScenarioPicker';

// Création de partie en assistant pas à pas (phase 20, choix de l'utilisateur) : une question par
// étape, l'affiche du candidat mise à jour en direct à côté, des boutons Précédent et Suivant.
// Le nom de la partie, la date de départ et la graine sont rangés dans les options avancées de la
// dernière étape (un nom est proposé d'office). La requête envoyée est celle d'avant, plus le
// format de la partie.

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

const DEPARTS: { value: Depart; description: string }[] = [
  {
    value: 'sondages',
    description:
      'Chaque personnalité part de sa moyenne dans les derniers sondages publiés (sources en crédits) ; la suite de la campagne est simulée.',
  },
  {
    value: 'equitable',
    description:
      'Toutes les personnalités partent des seuls moyens de leur fiche, sans socle électoral : la campagne fait la différence.',
  },
];

const FORMATS: { value: GameFormat; description: string; icon: LucideIcon }[] = [
  {
    value: 'complet',
    description:
      'La campagne, la soirée électorale, puis le quinquennat et les élections suivantes : plusieurs soirées de jeu.',
    icon: Hourglass,
  },
  {
    value: 'court',
    description:
      'La campagne jusqu’au soir de l’élection : la partie s’arrête à l’annonce du résultat.',
    icon: Flag,
  },
];

type StepId = 'partie' | 'candidat' | 'parcours' | 'terrain' | 'format';
const STEP_TITLES: Record<StepId, { titre: string; description: string }> = {
  partie: { titre: 'La partie', description: 'Comment voulez-vous jouer ?' },
  candidat: { titre: 'Votre candidat', description: 'Identité, portrait et positionnement.' },
  parcours: {
    titre: 'Votre parcours',
    description: 'D’où vous venez, puis, si vous le voulez, la variante de votre campagne.',
  },
  terrain: {
    titre: 'Le terrain',
    description: 'Qui vous affrontez, avec quelle exigence, dans quelle conjoncture.',
  },
  format: { titre: 'Le format', description: 'Jusqu’où va la partie.' },
};

const validDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`));

function Tiles<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  labelOf,
  columns = 'md:grid-cols-3',
}: {
  name: string;
  legend: string;
  options: { value: T; description: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  labelOf: (value: T) => string;
  columns?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className={label}>{legend}</legend>
      <div className={`grid gap-2.5 ${columns}`}>
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <label key={option.value} className={`${optionTile} md:flex-col`}>
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                  className={radio}
                />
                {Icon && (
                  <Icon
                    aria-hidden="true"
                    className="size-5 text-red-600 md:size-6 dark:text-dorure"
                    strokeWidth={1.75}
                  />
                )}
              </span>
              <span>
                <span className="font-display text-lg font-semibold">{labelOf(option.value)}</span>
                <span className="block text-sm text-encre-2">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Step({
  id,
  index,
  count,
  children,
}: {
  id: StepId;
  index: number;
  count: number;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  // Le focus suit l'étape (lecteurs d'écran, clavier), sauf à l'ouverture de l'écran.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [id]);
  const { titre, description } = STEP_TITLES[id];
  return (
    <section aria-labelledby={`etape-${id}`} className="scroll-mt-24">
      <header className="mb-4 flex items-start gap-4">
        <span
          aria-hidden="true"
          className="w-9 shrink-0 font-display text-[2.6rem] leading-[0.9] font-bold text-red-600 dark:text-dorure"
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-encre-2">
            Étape {index + 1} sur {count}
          </p>
          <h2
            id={`etape-${id}`}
            ref={heading}
            tabIndex={-1}
            className="text-2xl outline-none sm:text-[1.75rem]"
          >
            {titre}
          </h2>
          <p className="mt-0.5 text-sm text-encre-2">{description}</p>
        </div>
      </header>
      <div className={`${card} space-y-7`}>{children}</div>
    </section>
  );
}

export function NewGame() {
  const navigate = useNavigate();
  const createGame = useCreateGame();
  const ruleset = useCurrentRuleset();
  // Phase 20 : verrous (lus dans la progression servie) et défi du jour (`?defi=1`).
  const progression = useProgression();
  const [searchParams] = useSearchParams();
  const defi = searchParams.get('defi') === '1' ? (progression.data?.defi ?? null) : null;
  const locks = (progression.data?.deblocages ?? []).filter((d) => !d.debloque);
  const difficultyLocks = Object.fromEntries(
    locks.filter((d) => d.difficulte !== null).map((d) => [d.difficulte!, d.condition]),
  ) as Partial<Record<Difficulty, string>>;
  const scenarioLocks = Object.fromEntries(
    locks.filter((d) => d.scenarioId !== null).map((d) => [d.scenarioId!, d.condition]),
  );
  const [name, setName] = useState('');
  const [mode, setMode] = useState<GameMode>('candidat_personnalise');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [format, setFormat] = useState<GameFormat>('complet');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [seed, setSeed] = useState('');
  const [candidate, setCandidate] = useState<CandidateDraft>(EMPTY_CANDIDATE);
  const [personality, setPersonality] = useState<string | null>(null);
  const [opponents, setOpponents] = useState<OpponentSet>('fictifs');
  const [depart, setDepart] = useState<Depart>('sondages');
  const [scenario, setScenario] = useState('standard');
  const [orientation, setOrientation] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const withCandidate = mode === 'candidat_personnalise';
  const withPersonality = mode === 'candidat_reel';

  // Le défi impose niveau, scénario et format : pas d'étape « Le format ».
  const steps: StepId[] =
    mode === 'observateur'
      ? ['partie', 'terrain', 'format']
      : defi
        ? ['partie', 'candidat', 'parcours', 'terrain']
        : ['partie', 'candidat', 'parcours', 'terrain', 'format'];
  const index = Math.min(step, steps.length - 1);
  const current = steps[index]!;
  const last = index === steps.length - 1;

  const chosenPersonality = ruleset.data?.personnalites.personnalites.find(
    (p) => p.id === personality,
  );
  /** Nom proposé d'office (modifiable dans les options avancées). */
  const suggestedName = withCandidate
    ? candidate.nom.trim()
      ? `Campagne de ${candidateName({ prenom: candidate.prenom.trim(), nom: candidate.nom.trim() })}`
      : 'Ma campagne'
    : withPersonality
      ? chosenPersonality
        ? `Campagne de ${chosenPersonality.prenom} ${chosenPersonality.nom}`
        : 'Ma campagne'
      : 'Observation de la présidentielle';

  /** Ce qui manque pour quitter une étape, ou null. */
  const blocker = (id: StepId): string | null => {
    if (id === 'candidat' && withCandidate && (!candidate.nom.trim() || !candidate.parti.trim()))
      return 'Indiquez au moins le nom du candidat et son parti.';
    if (id === 'candidat' && withPersonality && !personality)
      return 'Choisissez la personnalité que vous incarnez.';
    if (id === 'partie' && defi && mode === 'observateur')
      return 'Le défi du jour se joue avec un candidat : choisissez un candidat personnalisé ou réel.';
    if (id === 'terrain' && !defi) {
      const lock = locks.find((d) => d.difficulte === difficulty || d.scenarioId === scenario);
      if (lock) return `${lock.libelle} : contenu verrouillé. ${lock.condition} pour le débloquer.`;
    }
    return null;
  };

  const goBack = () => {
    setMissing(null);
    setStep(Math.max(0, index - 1));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!last) {
      const problem = blocker(current);
      setMissing(problem);
      if (!problem) setStep(index + 1);
      return;
    }
    const problem = steps.map(blocker).find((p) => p !== null) ?? null;
    setMissing(problem);
    if (problem) return;
    const { economie, societe, ...identity } = candidate;
    createGame.mutate(
      {
        name:
          name.trim() || (defi ? `Défi du jour du ${formatGameDate(defi.date)}` : suggestedName),
        mode,
        // Défi du jour : graine, date, niveau, scénario et format imposés par le serveur.
        ...(defi
          ? { defi: true }
          : {
              difficulty,
              startDate,
              scenarioId: scenario,
              format,
              ...(seed.trim() ? { seed: seed.trim() } : {}),
            }),
        ...(withCandidate
          ? { candidate: { ...identity, positionnement: { economie, societe } } }
          : {}),
        ...(withPersonality && personality ? { personnaliteId: personality } : {}),
        adversaires: opponents,
        // Phase 24 : le point de départ ne se choisit qu'avec des personnalités réelles.
        ...(opponents === 'reels' ? { depart } : {}),
        ...((withCandidate || withPersonality) && orientation
          ? { orientationId: orientation }
          : {}),
      },
      { onSuccess: (game) => void navigate(`/parties/${game.id}/tableau-de-bord`) },
    );
  };

  const scenarioLabel = (id: string) =>
    ruleset.data?.scenarios.find((s) => s.id === id)?.libelle ?? id;
  const recap: [string, string][] = defi
    ? [
        ['Mode', MODE_LABELS[mode]],
        ['Adversaires', OPPONENT_SET_LABELS[opponents]],
        ...(opponents === 'reels'
          ? ([['Point de départ', DEPART_LABELS[depart]]] as [string, string][])
          : []),
        ['Défi', formatGameDate(defi.date)],
        ['Difficulté', DIFFICULTY_LABELS[defi.difficulte]],
        ['Scénario', scenarioLabel(defi.scenarioId)],
        ['Format', FORMAT_LABELS[defi.format]],
      ]
    : [
        ['Mode', MODE_LABELS[mode]],
        ['Adversaires', OPPONENT_SET_LABELS[opponents]],
        ...(opponents === 'reels'
          ? ([['Point de départ', DEPART_LABELS[depart]]] as [string, string][])
          : []),
        ['Difficulté', DIFFICULTY_LABELS[difficulty]],
        ['Scénario', scenarioLabel(scenario)],
        ['Format', FORMAT_LABELS[format]],
        ['Départ', validDate(startDate) ? formatGameDate(startDate) : 'date à préciser'],
      ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <header className="mb-10 max-w-2xl">
        <h1 className={screenTitle}>{defi ? 'Défi du jour' : 'Nouvelle partie'}</h1>
        <p className="mt-3 text-base text-slate-700 sm:text-lg dark:text-slate-300">
          {defi
            ? `La même campagne pour tous ce ${formatGameDate(defi.date)} : niveau ${DIFFICULTY_LABELS[defi.difficulte]}, format ${FORMAT_LABELS[defi.format].toLocaleLowerCase('fr-FR')}, situation de départ imposée. Votre score : votre part des voix au premier tour.`
            : 'Composez votre candidature, choisissez le terrain, puis entrez en campagne.'}
        </p>
      </header>
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 space-y-6">
          <Step id={current} index={index} count={steps.length}>
            {current === 'partie' && (
              <Tiles
                name="mode"
                legend="Mode de jeu"
                options={defi ? MODES.filter((m) => m.value !== 'observateur') : MODES}
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setMissing(null);
                }}
                labelOf={(v) => MODE_LABELS[v]}
              />
            )}
            {current === 'candidat' && withCandidate && (
              <CandidateForm value={candidate} onChange={setCandidate} />
            )}
            {current === 'candidat' && withPersonality && (
              <PersonalityPicker value={personality} onChange={setPersonality} />
            )}
            {current === 'parcours' && (
              <>
                {withCandidate && (
                  <ProfilePicker
                    value={candidate.profilId}
                    onChange={(profilId) => setCandidate({ ...candidate, profilId })}
                  />
                )}
                <OrientationPicker value={orientation} onChange={setOrientation} />
              </>
            )}
            {current === 'terrain' && (
              <>
                <Tiles
                  name="adversaires"
                  legend="Adversaires"
                  options={OPPONENTS}
                  value={opponents}
                  onChange={setOpponents}
                  labelOf={(v) => OPPONENT_SET_LABELS[v]}
                  columns="sm:grid-cols-2"
                />
                {opponents === 'reels' && (
                  <>
                    <Tiles
                      name="point-de-depart"
                      legend="Point de départ"
                      options={DEPARTS}
                      value={depart}
                      onChange={setDepart}
                      labelOf={(v) => DEPART_LABELS[v]}
                      columns="sm:grid-cols-2"
                    />
                    {depart === 'sondages' && (
                      <p className="text-sm text-encre-2">{DEPART_SONDAGES_NOTICE}.</p>
                    )}
                  </>
                )}
                {!defi && (
                  <>
                    <DifficultyPicker
                      value={difficulty}
                      onChange={setDifficulty}
                      mode={mode}
                      locks={difficultyLocks}
                    />
                    <ScenarioPicker value={scenario} onChange={setScenario} locks={scenarioLocks} />
                  </>
                )}
              </>
            )}
            {current === 'format' && (
              <>
                <Tiles
                  name="format"
                  legend="Format de la partie"
                  options={FORMATS}
                  value={format}
                  onChange={setFormat}
                  labelOf={(v) => FORMAT_LABELS[v]}
                  columns="sm:grid-cols-2"
                />
                <details className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                  <summary className="min-h-11 cursor-pointer content-center font-semibold">
                    Options avancées
                  </summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <label htmlFor="nom" className={label}>
                        Nom de la partie
                      </label>
                      <input
                        id="nom"
                        className={input}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={80}
                        placeholder={suggestedName}
                        aria-describedby="aide-nom"
                      />
                      <p id="aide-nom" className="text-xs text-encre-2">
                        Laissé vide : « {suggestedName} ».
                      </p>
                    </div>
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
                      <p id="aide-depart" className="text-xs text-encre-2">
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
                      <p id="aide-graine" className="text-xs text-encre-2">
                        Même graine et mêmes décisions donnent la même partie.
                      </p>
                    </div>
                  </div>
                </details>
              </>
            )}
          </Step>

          {missing && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {missing}
            </p>
          )}
          {createGame.isError && <ErrorMessage error={createGame.error} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {index > 0 ? (
              <button type="button" className={buttonSecondary} onClick={goBack}>
                <ArrowLeft aria-hidden="true" className="size-4" />
                Précédent
              </button>
            ) : (
              <span />
            )}
            {last ? (
              <button type="submit" className={buttonPrestige} disabled={createGame.isPending}>
                {createGame.isPending ? 'Création…' : defi ? 'Relever le défi' : 'Créer la partie'}
              </button>
            ) : (
              <button type="submit" className={buttonPrestige}>
                Suivant
                <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
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
                <p className="text-sm text-encre-2">
                  Choisissez la personnalité que vous incarnez.
                </p>
              ))}
            {withPersonality && chosenPersonality && (
              <p className="mt-3 text-xs text-encre-2">{SIMULATION_NOTICE}</p>
            )}
            {mode === 'observateur' && (
              <p className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                <Eye aria-hidden="true" className="size-8 shrink-0 text-red-600 dark:text-dorure" />
                Vous suivez la campagne de tous les candidats, sans en diriger aucune.
              </p>
            )}
            <dl className="mt-5 divide-y divide-slate-200 border-t border-slate-200 text-sm dark:divide-white/[0.07] dark:border-white/[0.07]">
              {recap.map(([term, value]) => (
                <div key={term} className="flex justify-between gap-4 py-2">
                  <dt className="text-encre-2">{term}</dt>
                  <dd className="text-right font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </form>
    </div>
  );
}
