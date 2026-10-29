import {
  mandateGrade,
  memberPostCompetence,
  objectiveDefinition,
  objectiveProgress,
  candidateName,
  groupOfActor,
  themeIndicatorEffects,
  themeOfPost,
  themeSupport,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { ChevronRight } from 'lucide-react';
import { createContext, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../components/Badge';
import { Hemicycle, seatingOrder } from '../../components/Hemicycle';
import { InfoPopover } from '../../components/InfoPopover';
import { MajorityGauge, TensionGauge } from '../../components/ParliamentGauges';
import { card } from '../../components/ui';
import {
  formatGameDate,
  formatIndicator,
  formatIndicatorDelta,
  INDICATOR_LABELS,
} from '../../labels';
import { memberInfo, postExpertiseInfo } from '../Government';

// Vue du mandat (phase 13) : en tête de l'espace Pouvoir, toujours visible, l'essentiel du
// quinquennat sans rien déplier — hémicycle et jauges, Parlement de la semaine, gouvernement et
// effets de ses ministres, indicateurs, législatives. Tout est lu dans l'état servi par l'API ;
// les effets des ministres sont ceux des formules partagées avec le moteur (`@r2027/shared`).

/** La vue du mandat s'affiche : présidence en cours, Assemblée en jeu. */
export const showsMandate = (state: GameState) =>
  state.quinquennat !== null && state.parlement !== null;

/**
 * Vrai dans l'espace Pouvoir quand la vue du mandat est affichée au-dessus des sections : la
 * section Parlement n'y répète pas l'hémicycle ni les jauges.
 */
export const MandateOverviewShown = createContext(false);

const STAGES = {
  commission: 'en commission',
  seance: 'en séance',
  navette: 'au Sénat',
  lecture_definitive: 'en lecture définitive',
} as const;

const KEY_INDICATORS = ['chomage', 'croissance', 'inflation', 'confiance', 'tensions'] as const;

function Block({
  id,
  title,
  onMore,
  more,
  children,
}: {
  id: string;
  title: string;
  /** Déplie la section détaillée de l'espace. */
  onMore?: () => void;
  more?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`${card} space-y-3 text-sm`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="text-base font-bold">
          {title}
        </h3>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-full px-2 text-xs font-semibold text-republique-700 hover:bg-slate-100 dark:text-republique-300 dark:hover:bg-slate-800"
          >
            {more}
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Valeur d'une mesure d'objectif, dans son unité (indicateur, popularité, nombre). */
function measureText(ruleset: Ruleset, id: string, value: number): string {
  const definition = objectiveDefinition(ruleset, id);
  if (definition.mesure === 'indicateur' && definition.indicateur)
    return formatIndicator(definition.indicateur, value);
  if (definition.mesure === 'popularite') return `${Math.round(value / 100)} %`;
  return String(value);
}

/**
 * Objectifs du mandat (phase 15) : départ, valeur actuelle et cible de chacun, et la note qu'ils
 * donneraient aujourd'hui — règles partagées avec le moteur (`@r2027/shared`), hypothèses du jeu.
 */
function Objectives({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const grade = mandateGrade(state, ruleset);
  if (!grade) return null;
  return (
    <Block id="mandat-objectifs" title="Objectifs du mandat">
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-2xl font-extrabold tabular-nums">{grade.valeur}/20</span>
        <span className="text-xs text-slate-600 dark:text-slate-400">
          note provisoire, si le mandat s’arrêtait aujourd’hui (la mention est donnée au bilan)
        </span>
      </p>
      <ul className="space-y-2" aria-label="Objectifs du mandat">
        {grade.objectifs.map((o) => {
          const definition = objectiveDefinition(ruleset, o.id);
          const progress = o.atteint ? 1 : objectiveProgress(ruleset, o, o.fin);
          return (
            <li key={o.id}>
              <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-medium">{definition.libelle}</span>
                <Badge tone={o.atteint ? 'succes' : 'neutre'}>
                  {o.atteint ? 'Atteint' : 'En cours'}
                </Badge>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Départ {measureText(ruleset, o.id, o.depart)} · aujourd’hui{' '}
                {measureText(ruleset, o.id, o.fin)} · cible{' '}
                {definition.sens === 'baisse' ? '≤' : '≥'} {measureText(ruleset, o.id, o.cible)}
              </p>
              <span
                aria-hidden="true"
                className="mt-1 block h-1.5 rounded-full bg-slate-200 dark:bg-slate-800"
              >
                <span
                  className={`block h-full rounded-full ${o.atteint ? 'bg-emerald-500' : 'bg-republique-500'}`}
                  style={{ width: `${progress * 100}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Objectifs tirés de votre programme à la formation du gouvernement ; cibles et barème (1
        point par objectif atteint, la moitié du chemin parcouru sinon) : hypothèses du jeu, jamais
        des prévisions.
      </p>
    </Block>
  );
}

export function MandateOverview({
  state,
  ruleset,
  onShow,
}: {
  state: GameState;
  ruleset: Ruleset;
  /** Déplie une section de l'espace (gouvernement, parlement, économie, législatives…). */
  onShow: (path: string) => void;
}) {
  const q = state.quinquennat;
  const parliament = state.parlement;
  if (!q || !parliament) return null;
  const president = state.actors[q.mandat.presidentId];
  const presiding = q.mandat.presidentId === state.player.actorId;
  const playerActor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const mine = playerActor ? groupOfActor(ruleset, playerActor) : null;
  const assembly = ruleset.assemblee;
  const proposals = new Map(ruleset.programme.propositions.map((p) => [p.id, p.libelle]));
  const domains = new Map(ruleset.programme.domaines.map((d) => [d.id, d.libelle]));
  const postes = new Map(ruleset.quinquennat.postes.map((p) => [p.id, p.libelle]));
  const pendingBill = state.pendingDecisions.find((d) => d.kind === 'texte');
  const inProgress = parliament.textes.filter((b) => b.etape in STAGES);
  const lastVote = parliament.textes
    .flatMap((b) => b.votes.map((v) => ({ bill: b, vote: v })))
    .sort((a, b) => b.vote.semaine - a.vote.semaine)[0];
  const lastMotion = parliament.motions.at(-1);
  const government = q.gouvernement;
  const coalition = parliament.coalition;
  const coalitionBloc = coalition
    ? (ruleset.legislatives.blocs.find((b) => b.id === coalition.bloc)?.libelle ?? coalition.bloc)
    : null;
  const legislatives = state.legislatives;

  return (
    <section aria-labelledby="titre-mandat" className="space-y-3">
      <div className="space-y-0.5">
        <h2 id="titre-mandat" className="text-xl font-bold">
          Vue du mandat
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {presiding
            ? 'Vous présidez'
            : `${president ? candidateName(president.candidate) : 'Le président'} préside`}{' '}
          jusqu’au {formatGameDate(q.mandat.fin)}. L’essentiel en un écran ; chaque bloc ouvre son
          détail ci-dessous.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Block
          id="mandat-assemblee"
          title="Assemblée nationale"
          onMore={() => onShow('parlement')}
          more="Groupes et sièges"
        >
          <Hemicycle
            title="Hémicycle de l’Assemblée nationale (vue du mandat)"
            total={assembly.siegesTotal}
            playerGroup={mine?.groupe ?? null}
            playerConvention={mine?.convention ?? false}
            groups={seatingOrder(assembly.groupes.filter((g) => parliament.groupes[g.id])).map(
              (g) => ({
                id: g.id,
                sigle: g.sigle,
                libelle: g.libelle,
                sieges: parliament.groupes[g.id]!.sieges,
                alignement: parliament.groupes[g.id]!.alignement,
                fronde: parliament.fronde[g.id] ?? 0,
              }),
            )}
          />
          <MajorityGauge
            parliament={parliament}
            coalition={
              coalition && coalitionBloc
                ? {
                    libelle: coalitionBloc,
                    sieges: coalition.groupes.reduce(
                      (sum, g) => sum + (parliament.groupes[g]?.sieges ?? 0),
                      0,
                    ),
                  }
                : null
            }
          />
        </Block>

        <div className="space-y-3">
          <Block id="mandat-tension" title="Climat parlementaire">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <TensionGauge
                  tension={parliament.tension}
                  seuilMotion={ruleset.parlement.tension.seuilMotion}
                  details={false}
                />
              </div>
              <InfoPopover
                label="Facteurs de la tension parlementaire"
                title="Facteurs de la tension"
                className="-mt-2 -mr-2"
              >
                <ul className="space-y-1">
                  {parliament.tension.facteurs.map((f) => (
                    <li key={f.libelle} className="flex justify-between gap-3">
                      <span>{f.libelle}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {f.valeur > 0 ? `+${f.valeur}` : `−${Math.abs(f.valeur)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Somme exacte des facteurs calculés par le moteur (hypothèses du jeu).
                </p>
              </InfoPopover>
            </div>
          </Block>

          <Block
            id="mandat-parlement"
            title="Au Parlement"
            onMore={() => onShow('parlement')}
            more="Textes et votes"
          >
            {pendingBill ? (
              <p className="rounded-xl bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                <span className="font-semibold">Vote à préparer : </span>
                {pendingBill.label}.{' '}
                <Link
                  to="../tableau-de-bord"
                  className="font-semibold underline underline-offset-2"
                >
                  Décider au QG
                </Link>
              </p>
            ) : inProgress.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400">Aucun texte en cours d’examen.</p>
            ) : null}
            {inProgress.length > 0 && (
              <ul className="space-y-1" aria-label="Textes en cours">
                {inProgress.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-medium">
                      {proposals.get(b.propositionId) ?? b.propositionId}
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {STAGES[b.etape as keyof typeof STAGES]}, semaine {b.echeance}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {lastVote && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Dernier vote (semaine {lastVote.vote.semaine}) :{' '}
                {proposals.get(lastVote.bill.propositionId) ?? lastVote.bill.propositionId}{' '}
                {lastVote.vote.adopte ? 'adopté' : 'rejeté'} ({lastVote.vote.pour} pour,{' '}
                {lastVote.vote.contre} contre)
                {lastVote.vote.intervention ? ', vote clé disputé par l’opposition' : ''}.
              </p>
            )}
            {lastMotion && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Dernière motion de censure (semaine {lastMotion.semaine}) :{' '}
                {lastMotion.adoptee ? 'adoptée' : 'rejetée'}, {lastMotion.pour} voix pour{' '}
                {lastMotion.majorite} requises.
              </p>
            )}
          </Block>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Block
          id="mandat-gouvernement"
          title="Gouvernement et effets des ministres"
          onMore={() => onShow('gouvernement')}
          more="Gouvernement"
        >
          {government ? (
            <>
              <p>
                <span className="font-semibold">
                  {memberInfo(state, ruleset, government.premierMinistre).name}
                </span>{' '}
                <span className="text-slate-600 dark:text-slate-400">
                  Premier ministre · gouvernement n° {government.numero}
                </span>
              </p>
              <ul
                className="divide-y divide-slate-100 dark:divide-slate-800"
                aria-label="Ministres et effets de leur domaine"
              >
                {government.ministres.map((m) => {
                  const info = memberInfo(state, ruleset, m);
                  // Compétence sur le poste, expertise comprise : celle qu'emploie le moteur.
                  const competence = memberPostCompetence(ruleset, m, m.posteId);
                  const expertise = postExpertiseInfo(ruleset, m, m.posteId);
                  const theme = themeOfPost(ruleset, m.posteId);
                  const indicators = themeIndicatorEffects(ruleset, m.posteId, competence);
                  const support = themeSupport(ruleset, competence);
                  const effects = [
                    ...indicators.map(
                      (e) =>
                        `${INDICATOR_LABELS[e.indicateur].label.split(' (')[0]} ${formatIndicatorDelta(e.valeur)}/sem.`,
                    ),
                    ...(theme && theme.domaines.length > 0 && Math.abs(support) >= 0.005
                      ? [
                          `${support > 0 ? 'bonus' : 'malus'} de soutien aux textes (${theme.domaines
                            .map((d) => domains.get(d) ?? d)
                            .join(', ')})`,
                        ]
                      : []),
                  ];
                  return (
                    <li
                      key={m.posteId}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5"
                    >
                      <span className="w-full text-xs font-semibold text-slate-500 sm:w-40 dark:text-slate-400">
                        {postes.get(m.posteId) ?? m.posteId}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{info.name}</span>{' '}
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          compétence {Math.round(competence * 100)} %
                          {expertise && ', expertise du domaine'}
                        </span>
                        <span className="block text-xs">
                          {effects.length > 0 ? (
                            <span
                              className={
                                competence >= 0.5
                                  ? 'text-emerald-800 dark:text-emerald-300'
                                  : 'text-red-800 dark:text-red-300'
                              }
                            >
                              {effects.join(' · ')}
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                              aucun effet de domaine (compétence moyenne)
                            </span>
                          )}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Effets de domaine : hypothèses du jeu, proportionnels à l’écart de compétence à 50 %
                ; ils passent par les registres de l’économie et du Parlement.
              </p>
            </>
          ) : (
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              Matignon est vacant : un Premier ministre doit être nommé.
            </p>
          )}
        </Block>

        <div className="space-y-3">
          <Objectives state={state} ruleset={ruleset} />
          {state.economie && (
            <Block
              id="mandat-economie"
              title="Indicateurs (simulés)"
              onMore={() => onShow('economie')}
              more="Économie"
            >
              <dl className="grid grid-cols-2 gap-2">
                {KEY_INDICATORS.map((indicator) => (
                  <div key={indicator} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
                    <dt className="text-xs text-slate-600 dark:text-slate-400">
                      {INDICATOR_LABELS[indicator].label.split(' (')[0]}
                    </dt>
                    <dd className="font-display text-base font-extrabold tabular-nums">
                      {formatIndicator(indicator, state.economie!.indicateurs[indicator] ?? 0)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}
          {legislatives && (
            <Block
              id="mandat-legislatives"
              title="Législatives"
              onMore={() => onShow('legislatives')}
              more="Législatives"
            >
              {legislatives.prochaine ? (
                <p>
                  {legislatives.prochaine.motif === 'dissolution'
                    ? 'Assemblée dissoute : '
                    : 'Prochaines législatives : '}
                  premier tour le {formatGameDate(legislatives.prochaine.t1)}.
                </p>
              ) : (
                <p>Assemblée élue ; aucune élection annoncée.</p>
              )}
              {legislatives.campagne && (
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={legislatives.campagne.strategieArretee ? 'succes' : 'alerte'}>
                    {legislatives.campagne.strategieArretee
                      ? 'Stratégie arrêtée'
                      : 'Stratégie d’alliance à choisir'}
                  </Badge>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {legislatives.campagne.alliances.length} accord(s) simulé(s) entre blocs
                  </span>
                </p>
              )}
            </Block>
          )}
        </div>
      </div>
    </section>
  );
}
