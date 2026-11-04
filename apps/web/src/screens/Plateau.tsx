import {
  addDays,
  candidateName,
  FAMILLE_LABELS,
  isOptionalDecision,
  MAX_FAST_FORWARD_WEEKS,
  programmeEffect,
  suggestedProgramme,
  weekCombos,
  type ActionDefinition,
  type PlannedAction,
  type Ruleset,
} from '@r2027/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useRuleset, useSupports } from '../api/hooks';
import { spendingCapOf } from '../campaign';
import { ErrorMessage } from '../components/ErrorMessage';
import { boutonOr, buttonSecondary, carton, inputCompact } from '../components/ui';
import { WeeklyDebrief } from '../components/WeeklyDebrief';
import { useGeoManifest, useTopology } from '../map/data';
import { Board } from '../plateau/Board';
import { DepartmentSheet } from '../plateau/DepartmentSheet';
import { boardShapes } from '../plateau/geometry';
import { Hand, type HandCard } from '../plateau/Hand';
import { departmentName, READINGS, type Reading } from '../plateau/readings';
import { TopBar } from '../plateau/TopBar';
import { useWeek } from '../plateau/useWeek';
import { remainingAfter, TargetSelect, unavailableReason } from './dashboard/ActionPlanner';
import { DecisionSpotlight } from './dashboard/DecisionSpotlight';
import { presidencyRestriction } from './dashboard/restrictions';
import { ScreenSection, useOpenSections } from './Espace';
import { useCurrentGame } from './GameLayout';
import { memberInfo } from './Government';

// Écran Plateau (phase 25) : la table de jeu. La France des départements sur le carton, la main
// des cartes de la semaine, les cartes posées et leurs combos, les décisions en cartes plein
// écran, puis « Résoudre la semaine ». Rien n'est calculé ici : l'état vient du serveur (ou du
// moteur local), les combos de la règle partagée, et la requête d'avance est celle du QG.

const percent = (taux: number) => Math.round(taux * 100);

/** Libellé lisible de la cible d'une carte posée. */
function targetName(ruleset: Ruleset, definition: ActionDefinition, cible: string): string {
  switch (definition.cible) {
    case 'departement':
      return departmentName(ruleset, cible);
    case 'media':
      return ruleset.mediasReels.organes.find((o) => o.id === cible)?.libelle ?? cible;
    case 'emission':
      return ruleset.mediasReels.emissions.find((e) => e.id === cible)?.titre ?? cible;
    case 'personnalite': {
      const figure = ruleset.figures.figures.find((f) => f.id === cible);
      return figure ? `${figure.prenom} ${figure.nom}` : cible;
    }
    case 'poste':
      return ruleset.quinquennat.postes.find((p) => p.id === cible)?.libelle ?? cible;
    default:
      return cible;
  }
}

/** Combo que la carte compléterait si on l'ajoutait au plan (annoncé avant la pose). */
function comboHint(
  ruleset: Ruleset,
  plan: readonly PlannedAction[],
  definition: ActionDefinition,
): string | null {
  if (!definition.famille) return null;
  const after = weekCombos([...plan, { actionId: definition.id }], ruleset).series.at(-1);
  if (after && after.index === plan.length)
    return `Série ${FAMILLE_LABELS[after.famille]} ×${after.rang} (+${percent(after.taux)} %)`;
  return null;
}

export function Plateau() {
  const game = useCurrentGame();
  const { state } = game;
  const ruleset = useRuleset(game.rulesetVersion, state.cycle);
  const data = ruleset.data;
  const week = useWeek(game, data);
  const { plan, changePlan, answers, answer } = week;
  const [reading, setReading] = useState<Reading>('implantation');
  const [selected, setSelected] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [fastWeeks, setFastWeeks] = useState(13);
  // Archives repliées par défaut (une seule section s'ouvrirait d'elle-même) ; une ancre
  // « #journal » ou « #sauvegardes » les déplie.
  const archives = useOpenSections(['archives', 'plateau']);

  const manifest = useGeoManifest();
  const topology = useTopology(manifest.data?.apercu ?? null);
  const shapes = useMemo(
    () => (topology.data?.departements ? boardShapes(topology.data.departements) : null),
    [topology.data],
  );

  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const campaigning =
    actor !== undefined && (actor.status === 'candidat' || actor.status === 'qualifie');
  const quinquennat = state.meta.phase === 'presidence' ? state.quinquennat : null;
  const presiding = quinquennat !== null && quinquennat.mandat.presidentId === actor?.id;
  const mandateStarted = quinquennat !== null && addDays(game.date, 6) >= quinquennat.mandat.debut;
  const playing = !week.observer && !week.blocked && (presiding || (campaigning && !quinquennat));
  const catalog = data ? (presiding ? data.quinquennat.actions : data.actions) : [];
  const supports = useSupports(game.id, game.week, playing && !quinquennat);

  // Cartes de la main : disponibilité (mêmes règles que le QG) et combo annoncé.
  const remaining = actor ? remainingAfter(plan.actions, catalog, actor, week.reservedHours) : null;
  const full = data ? plan.actions.length >= data.jeu.actionsMaxParSemaine : true;
  const restriction =
    data && presiding ? presidencyRestriction(state, data, plan.actions, mandateStarted) : null;
  const cards: HandCard[] =
    data && actor && remaining && playing
      ? catalog.map((definition) => ({
          definition,
          reason:
            unavailableReason(
              definition,
              remaining,
              actor,
              presiding ? 0 : spendingCapOf(state, actor, data),
              full,
              presiding,
            ) ??
            restriction?.(definition) ??
            null,
          combo: presiding ? null : comboHint(data, plan.actions, definition),
        }))
      : [];
  const armedCard = armed ? catalog.find((a) => a.id === armed) : undefined;
  const combos = data ? weekCombos(plan.actions, data) : null;
  const placedCount: Record<string, number> = {};
  for (const p of plan.actions)
    if (p.cible && data?.parrainages.reservoir.departements[p.cible])
      placedCount[p.cible] = (placedCount[p.cible] ?? 0) + 1;

  const place = (actionId: string, cible?: string) => {
    changePlan(cible === undefined ? plan.addAction : (id: string) => plan.addTargeted(id, cible))(
      actionId,
    );
    setArmed(null);
  };
  const pick = (actionId: string) => {
    const definition = catalog.find((a) => a.id === actionId);
    if (!definition) return;
    if (definition.cible === null) place(actionId);
    else setArmed((current) => (current === actionId ? null : actionId));
  };
  const onDepartment = (code: string) => {
    if (armedCard?.cible === 'departement') place(armedCard.id, code);
    else setSelected((current) => (current === code ? null : code));
  };

  // Décisions en cartes plein écran : la décision ouverte, sinon la première sans réponse.
  const spotlight = week.observer
    ? undefined
    : spotlightId
      ? state.pendingDecisions.find((d) => d.id === spotlightId)
      : week.debrief
        ? undefined
        : state.pendingDecisions.find((d) => !answers[d.id] && !dismissed.has(d.id));
  const closeSpotlight = () => {
    if (spotlight) setDismissed((current) => new Set([...current, spotlight.id]));
    setSpotlightId(null);
  };

  // Phase 24 : programme trop court, avec le programme de départ suggéré.
  const plannedProgramme = actor
    ? [...actor.programme.propositions.filter((id) => !plan.retirer.includes(id)), ...plan.ajouter]
    : [];
  const programmeMinimum = data?.programme.minimumRecommande ?? 0;
  const programmeShort =
    campaigning &&
    !quinquennat &&
    actor !== undefined &&
    plannedProgramme.length < programmeMinimum;
  const programmeSuggestion =
    programmeShort && data && actor
      ? suggestedProgramme(actor.candidate.positionnement, plannedProgramme, data)
      : [];
  const programmeWeight = actor ? programmeEffect(state.opinion, actor.id) : null;
  const pendingCount = week.observer
    ? 0
    : state.pendingDecisions.filter((d) => !answers[d.id] && !isOptionalDecision(d)).length;

  return (
    <section
      aria-labelledby="titre-plateau"
      className="feutrine -mx-4 -mt-4 min-h-[calc(100dvh-8rem)] space-y-4 px-3 pt-3 pb-40 sm:-mx-6 sm:px-5"
    >
      <h1 id="titre-plateau" className="sr-only">
        Plateau
      </h1>
      {week.debrief && (
        <WeeklyDebrief
          report={week.debrief}
          state={state}
          gameId={game.id}
          eventFamily={(id) => data?.evenements.find((e) => e.id === id)?.famille ?? null}
          achievement={(id) => data?.succes.liste.find((a) => a.id === id) ?? null}
          onClose={() => week.setDebrief(null)}
        />
      )}
      {spotlight && data && (
        <DecisionSpotlight
          key={spotlight.id}
          decision={spotlight}
          state={state}
          ruleset={data}
          answer={answers[spotlight.id]}
          onAnswer={answer}
          onClose={closeSpotlight}
          announce={spotlightId === null}
        />
      )}
      {data && (
        <TopBar state={state} ruleset={data} actor={actor} hoursLeft={remaining?.time ?? 0} />
      )}

      {week.blocked && (
        <p role="alert" className="rounded-2xl bg-carton px-3 py-2 text-sm text-encre-carton">
          {state.calendar.blockedMessage ??
            'La partie ne peut pas avancer davantage pour l’instant.'}
        </p>
      )}
      {week.debateDue && (
        <p className="rounded-2xl bg-carton px-3 py-2 text-sm font-semibold text-encre-carton">
          {week.debateDue.libelle} vous attend sur le plateau télévisé.{' '}
          <Link to={`../debat/${week.debateDue.id}`} className="underline">
            {week.debateDue.statut === 'en_cours' ? 'Reprendre le débat' : 'Aller sur le plateau'}
          </Link>
        </p>
      )}

      <div className={`${carton} space-y-3 p-3 sm:p-5`}>
        <div role="radiogroup" aria-label="Lecture du plateau" className="flex flex-wrap gap-1.5">
          {READINGS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reading === r.id}
              onClick={() => setReading(r.id)}
              className={`min-h-11 rounded-full px-3.5 font-display text-sm font-bold ${
                reading === r.id ? 'bg-encre-carton text-carton' : 'bg-carton-2 text-encre-carton'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {shapes && data ? (
          <Board
            shapes={shapes}
            state={state}
            ruleset={data}
            reading={reading}
            selected={selected}
            placed={placedCount}
            onSelect={onDepartment}
            onDropCard={playing ? (actionId, code) => place(actionId, code) : undefined}
          />
        ) : topology.isError || manifest.isError ? (
          <ErrorMessage error={topology.error ?? manifest.error} />
        ) : (
          <p className="py-16 text-center text-sm text-encre-carton-2">Chargement du plateau…</p>
        )}
        {selected && data && !armedCard && (
          <DepartmentSheet
            code={selected}
            state={state}
            ruleset={data}
            onPlay={playing ? (actionId) => place(actionId, selected) : () => {}}
          />
        )}
      </div>

      {armedCard && data && actor && (
        <div
          role="group"
          aria-label={`Pose de la carte « ${armedCard.libelle} »`}
          className="sticky top-[calc(var(--sat)+0.5rem)] z-20 space-y-2 rounded-2xl bg-or px-3 py-2 text-sur-or shadow-pion"
        >
          {armedCard.cible === 'departement' ? (
            <>
              <p className="text-sm font-bold">
                Touchez un département du plateau pour y poser « {armedCard.libelle} », ou
                choisissez-le dans la liste.
              </p>
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span>Département de la carte « {armedCard.libelle} »</span>
                <select
                  className={inputCompact}
                  value=""
                  onChange={(event) =>
                    event.target.value && place(armedCard.id, event.target.value)
                  }
                >
                  <option value="">Choisir…</option>
                  {Object.entries(data.parrainages.reservoir.departements)
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([code, dep]) => (
                      <option key={code} value={code}>
                        {dep.nom} ({code})
                      </option>
                    ))}
                </select>
              </label>
            </>
          ) : (
            <TargetSelect
              ruleset={data}
              actor={actor}
              action={armedCard}
              value={undefined}
              index={plan.actions.length}
              onChange={(cible) => cible && place(armedCard.id, cible)}
              showSupport={!presiding}
              supports={{ prospects: supports.data, error: supports.isError }}
              ministries={(quinquennat?.gouvernement?.ministres ?? []).map((m) => ({
                posteId: m.posteId,
                libelle:
                  data.quinquennat.postes.find((p) => p.id === m.posteId)?.libelle ?? m.posteId,
                ministre: memberInfo(state, data, m).name,
              }))}
            />
          )}
          <button
            type="button"
            className="text-sm font-bold underline"
            onClick={() => setArmed(null)}
          >
            Annuler la pose
          </button>
        </div>
      )}

      {plan.actions.length > 0 && data && (
        <section className="space-y-2">
          <ol
            aria-label={`Cartes posées (${plan.actions.length} sur ${data.jeu.actionsMaxParSemaine})`}
            className="flex snap-x gap-2 overflow-x-auto pb-1"
          >
            {plan.actions.map((p, index) => {
              const definition = [...data.actions, ...data.quinquennat.actions].find(
                (a) => a.id === p.actionId,
              );
              const serie = combos?.series.find((s) => s.index === index);
              return (
                <li
                  key={`${p.actionId}-${index}`}
                  className="flex w-36 shrink-0 snap-start flex-col gap-1 rounded-xl border-2 border-bord-carte bg-carton p-2 text-xs text-encre-carton shadow-carte"
                >
                  <span className="font-display text-sm leading-tight font-bold">
                    {definition?.libelle ?? p.actionId}
                  </span>
                  <span className="text-encre-carton-2">
                    {p.cible && definition
                      ? targetName(data, definition, p.cible)
                      : 'Sans lieu précis'}
                  </span>
                  {serie && (
                    <span className="self-start rounded bg-or px-1.5 font-extrabold text-sur-or">
                      Série ×{serie.rang} +{percent(serie.taux)} %
                    </span>
                  )}
                  <button
                    type="button"
                    className="mt-auto self-start font-bold underline"
                    onClick={() => changePlan(plan.removeAction)(index)}
                    aria-label={`Retirer ${definition?.libelle ?? p.actionId}`}
                  >
                    Retirer
                  </button>
                </li>
              );
            })}
          </ol>
          {combos &&
            (combos.series.length > 0 ||
              combos.bastions.length > 0 ||
              combos.toursDeRegion.length > 0) && (
              <div
                role="status"
                aria-label="Combos de la semaine"
                className="flex flex-wrap gap-1.5 text-xs font-extrabold"
              >
                {combos.bastions.map((code) => (
                  <span key={`b-${code}`} className="rounded-full bg-or px-2.5 py-1 text-sur-or">
                    Bastion ×{String(data.combos.bastion.multiplicateur).replace('.', ',')} :{' '}
                    {departmentName(data, code)}
                  </span>
                ))}
                {combos.toursDeRegion.map((region) => (
                  <span key={`t-${region}`} className="rounded-full bg-or px-2.5 py-1 text-sur-or">
                    Tour de région :{' '}
                    {manifest.data?.regions.find((r) => r.code === region)?.nom ?? region} (+
                    {data.combos.tourDeRegion.gain})
                  </span>
                ))}
                {combos.series.map((s) => (
                  <span
                    key={`s-${s.index}`}
                    className="rounded-full bg-craie px-2.5 py-1 text-feutrine"
                  >
                    Série {FAMILLE_LABELS[s.famille]} ×{s.rang} (+{percent(s.taux)} %) :{' '}
                    {data.actions.find((a) => a.id === plan.actions[s.index]?.actionId)?.libelle}
                  </span>
                ))}
              </div>
            )}
        </section>
      )}

      {playing && data && (
        <Hand cards={cards} ruleset={data} presidency={presiding} armed={armed} onPlay={pick} />
      )}
      {week.observer && (
        <p className="text-sm text-craie-2">
          Mode observateur : aucune campagne n’est contrôlée ; les candidats mènent leur campagne de
          façon autonome.
        </p>
      )}
      {quinquennat && !presiding && actor && (
        <p className="text-sm text-craie-2">
          {state.actors[quinquennat.mandat.presidentId]
            ? `${candidateName(state.actors[quinquennat.mandat.presidentId]!.candidate)} préside`
            : 'Le quinquennat suit son cours'}{' '}
          : le quinquennat se déroule sans vous. Utilisez l’avance rapide.
        </p>
      )}

      {programmeShort && (
        <div
          role="note"
          aria-label="Programme trop court"
          className="space-y-2 rounded-2xl bg-carton px-3 py-2 text-sm text-encre-carton"
        >
          <p>
            <strong>Programme trop court :</strong> {plannedProgramme.length} proposition(s), pour
            un minimum recommandé de {programmeMinimum}. Les facteurs « Programme » et « Crédibilité
            » ne vous rapportent{' '}
            {programmeWeight === null || programmeWeight === 0
              ? 'rien pour l’instant'
              : `qu’environ ${(programmeWeight / 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} point d’intentions (estimation)`}
            .
          </p>
          {programmeSuggestion.length > 0 && (
            <button
              type="button"
              className={buttonSecondary}
              onClick={changePlan(() => plan.announceMany(programmeSuggestion))}
            >
              Programme de départ suggéré ({programmeSuggestion.length} proposition
              {programmeSuggestion.length > 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}

      <p className="text-sm">
        <Link to="../tableau-de-bord" className="font-semibold text-craie underline">
          QG détaillé : ressources, parrainages, programme, calendrier
        </Link>
      </p>
      {/* Journal et sauvegardes (section « Archives de la partie », comme au QG). */}
      <div className="rounded-2xl bg-papier text-encre">
        <ScreenSection
          path="archives"
          game={game}
          ruleset={data}
          open={archives.open.has('archives')}
          onToggle={() => archives.toggle('archives')}
        />
      </div>

      {/* Barre de résolution, à portée du pouce au-dessus de la navigation. */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+var(--sab))] z-30 px-3 lg:bottom-4 lg:left-[max(13rem,calc((100vw-80rem)/2+13rem))]">
        <div className="mx-auto max-w-3xl space-y-1.5 rounded-2xl bg-feutrine-3/95 px-3 py-2 text-craie backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${boutonOr} flex-1 sm:flex-none sm:px-10`}
              disabled={!week.canResolve}
              onClick={() => week.submit()}
            >
              {week.advance.isPending
                ? 'Résolution de la semaine…'
                : `Résoudre la semaine ${game.week}`}
            </button>
            {quinquennat && (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="avance-rapide-plateau" className="font-semibold">
                  Avance rapide
                </label>
                <select
                  id="avance-rapide-plateau"
                  className={inputCompact}
                  value={fastWeeks}
                  onChange={(event) => setFastWeeks(Number(event.target.value))}
                >
                  {[4, 13, 26, MAX_FAST_FORWARD_WEEKS].map((n) => (
                    <option key={n} value={n}>
                      {n} semaines
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="min-h-11 rounded-xl border-2 border-craie px-3 font-bold"
                  disabled={!week.canResolve || plan.actions.length > 0}
                  onClick={() => week.submit(fastWeeks)}
                >
                  Avancer
                </button>
              </span>
            )}
          </div>
          {pendingCount > 0 && (
            <button
              type="button"
              className="text-xs font-bold text-or underline"
              onClick={() =>
                setSpotlightId(state.pendingDecisions.find((d) => !answers[d.id])?.id ?? null)
              }
            >
              {pendingCount} décision(s) à trancher avant de résoudre la semaine
            </button>
          )}
          {week.missingTargets > 0 && (
            <p className="text-xs font-bold text-or">Choisissez la cible de chaque carte posée.</p>
          )}
          {week.advance.isError && <ErrorMessage error={week.advance.error} />}
        </div>
      </div>
    </section>
  );
}
