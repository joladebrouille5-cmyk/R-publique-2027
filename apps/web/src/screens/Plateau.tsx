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
  type Famille,
  type PlannedAction,
  type Ruleset,
} from '@r2027/shared';
import { Package, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useRuleset, useSupports } from '../api/hooks';
import { sound } from '../audio/systeme';
import { spendingCapOf } from '../campaign';
import { Drawer } from '../components/Drawer';
import { ErrorMessage } from '../components/ErrorMessage';
import { SoundToggle } from '../components/SoundToggle';
import { boutonOr, carton, inputCompact } from '../components/ui';
import { Verdict } from '../plateau/Verdict';
import { useGeoManifest, useTopology } from '../map/data';
import { Board } from '../plateau/Board';
import { DepartmentSheet } from '../plateau/DepartmentSheet';
import { GameBox } from '../plateau/GameBox';
import { Panel } from '../plateau/Panel';
import { boardShapes } from '../plateau/geometry';
import { Hand, type HandCard } from '../plateau/Hand';
import { departmentName, READINGS, type Reading } from '../plateau/readings';
import { TopBar } from '../plateau/TopBar';
import { useWeek } from '../plateau/useWeek';
import {
  effectLines,
  remainingAfter,
  TargetSelect,
  unavailableReason,
} from './dashboard/ActionPlanner';
import { DecisionSpotlight } from './dashboard/DecisionSpotlight';
import { presidencyRestriction } from './dashboard/restrictions';
import { useCurrentGame } from './GameLayout';
import { memberInfo } from './Government';

// Écran Plateau (phase 25, maquette validée) : la table de jeu, plein cadre sur la feutrine. En
// tête la semaine, le compte à rebours, le rang et trois jauges ; la France des départements sur
// le carton ; la main en éventail ; le gros bouton doré « Jouer la semaine ». Une carte prise
// montre son aperçu au-dessus du département visé ; posée, son gain s'affiche et un combo formé
// claque en bannière. Rien n'est calculé ici : l'état vient du serveur (ou du moteur local), les
// combos de la règle partagée, et la requête d'avance est celle du QG.

const percent = (taux: number) => Math.round(taux * 100);
const decimal = (n: number) => String(n).replace('.', ',');

const FAMILY_BAND: Record<Famille, string> = {
  terrain: 'bg-famille-terrain',
  medias: 'bg-famille-medias',
  numerique: 'bg-famille-numerique',
  organisation: 'bg-famille-organisation',
};

/** Durée de l'éclair de gain et de la bannière de combo après une pose. */
const FLASH_MS = 1800;

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
  const [hovered, setHovered] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ code: string; content: ReactNode; id: number } | null>(null);
  const [burst, setBurst] = useState<{
    id: number;
    items: { title: string; detail: string }[];
  } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);
  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [burst]);
  // Boîte de jeu (phase 25) : `?panneau=boite` ouvre la grille, `?panneau=<écran>` son panneau.
  const [params, setParams] = useSearchParams();
  const panneau = params.get('panneau');
  const boxButton = useRef<HTMLButtonElement>(null);
  const flashCount = useRef(0);
  const openPanel = (screen: string) => setParams({ panneau: screen });
  const closePanel = () => setParams({});
  // Panneau refermé : le focus revient au bouton « Boîte de jeu », une fois le plateau
  // redevenu actif (il est inerte tant qu'un panneau est ouvert).
  const panelWasOpen = useRef(false);
  useEffect(() => {
    if (panneau) panelWasOpen.current = true;
    else if (panelWasOpen.current) {
      panelWasOpen.current = false;
      boxButton.current?.focus();
    }
  }, [panneau]);
  // Arrivée sur la table (création, accueil) : en haut, le bandeau et la carte.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  // Anciennes ancres du plateau (« #journal », « #sauvegardes », « #archives ») : leur panneau.
  const { hash } = useLocation();
  useEffect(() => {
    const target = hash === '#archives' ? 'journal' : hash.slice(1);
    if (target === 'journal' || target === 'sauvegardes') setParams({ panneau: target });
  }, [hash, setParams]);

  const manifest = useGeoManifest();
  const topology = useTopology(manifest.data?.apercu ?? null);
  const shapes = useMemo(
    () => (topology.data?.departements ? boardShapes(topology.data.departements) : null),
    [topology.data],
  );

  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const withRealPeople = Object.values(state.actors).some((a) => a.candidate.nature === 'reel');
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
    const definition = catalog.find((a) => a.id === actionId);
    if (data && definition) {
      // Combo formé par cette pose : comparaison des combos de la règle avant et après.
      const before = weekCombos(plan.actions, data);
      const after = weekCombos([...plan.actions, { actionId, ...(cible ? { cible } : {}) }], data);
      const serie = after.series.find((s) => s.index === plan.actions.length);
      const bastion = after.bastions.find((c) => !before.bastions.includes(c));
      const tour = after.toursDeRegion.find((r) => !before.toursDeRegion.includes(r));
      const id = ++flashCount.current;
      // Bannière : chaque combo que cette pose vient de former.
      const items = [
        ...(bastion
          ? [
              {
                title: `Bastion ×${decimal(data.combos.bastion.multiplicateur)}`,
                detail: `${data.combos.bastion.cartesMin} cartes dans ${departmentName(data, bastion)}`,
              },
            ]
          : []),
        ...(tour
          ? [
              {
                title: 'Tour de région',
                detail: `${regionName(tour)} : +${data.combos.tourDeRegion.gain} dans ses départements`,
              },
            ]
          : []),
        ...(serie
          ? [
              {
                title: `Série ×${serie.rang}`,
                detail: `${serie.rang}e carte ${FAMILLE_LABELS[serie.famille]} d’affilée : +${percent(serie.taux)} %`,
              },
            ]
          : []),
      ];
      if (items.length > 0) setBurst({ id, items });
      if (definition.cible === 'departement' && cible) {
        const gain = presiding
          ? data.implantation.deplacementPresident
          : data.implantation.gains[actionId];
        setFlash({
          id,
          code: cible,
          content: (
            <>
              <strong className="block font-display text-sm">{departmentName(data, cible)}</strong>
              <span className="block font-extrabold text-or">
                {definition.libelle} posée{gain ? ` : +${gain} d’implantation` : ''}
              </span>
            </>
          ),
        });
      }
    }
    changePlan(cible === undefined ? plan.addAction : (id: string) => plan.addTargeted(id, cible))(
      actionId,
    );
    setArmed(null);
    setHovered(null);
    // Bruitage (phase 25) : la carte glisse sur la table.
    sound().play('glisser');
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

  const regionName = (code: string) =>
    manifest.data?.regions.find((r) => r.code === code)?.nom ?? code;

  // Aperçu de la carte prise au-dessus du département visé, puis éclair du gain une fois posée.
  const bubbleFor = (definition: ActionDefinition, code: string) => {
    if (!data) return null;
    const gain = presiding
      ? data.implantation.deplacementPresident
      : data.implantation.gains[definition.id];
    const now = actor ? (state.implantation[actor.id]?.[code] ?? 0) : 0;
    const bastion = (placedCount[code] ?? 0) + 1 >= data.combos.bastion.cartesMin;
    return (
      <>
        <strong className="block font-display text-sm">{departmentName(data, code)}</strong>
        <span className="block">
          {definition.libelle}
          {gain ? ` : +${gain} d’implantation` : ''} (aujourd’hui {now} sur 100)
        </span>
        {effectLines(definition)[0] && (
          <span className="block text-craie-2">{effectLines(definition)[0]}</span>
        )}
        {bastion && (
          <span className="mt-1 block font-extrabold text-or">
            Bastion ×{decimal(data.combos.bastion.multiplicateur)} si vous la posez ici
          </span>
        )}
      </>
    );
  };
  const bubble =
    armedCard?.cible === 'departement' && hovered
      ? { code: hovered, content: bubbleFor(armedCard, hovered) }
      : flash
        ? { code: flash.code, content: flash.content }
        : null;

  const placed = (
    <section aria-label="Cartes posées et combos" className="space-y-2">
      <ol
        aria-label={`Cartes posées (${plan.actions.length} sur ${data?.jeu.actionsMaxParSemaine ?? 0})`}
        className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
      >
        {data &&
          plan.actions.map((p, index) => {
            const definition = [...data.actions, ...data.quinquennat.actions].find(
              (a) => a.id === p.actionId,
            );
            const serie = combos?.series.find((s) => s.index === index);
            const famille = definition?.famille ?? 'organisation';
            return (
              <li
                key={`${p.actionId}-${index}`}
                className="flex w-36 shrink-0 snap-start flex-col overflow-hidden rounded-xl border-2 border-bord-carte bg-carton text-xs text-encre-carton shadow-carte"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 ${presiding ? 'bg-encre-carton' : FAMILY_BAND[famille]}`}
                />
                <span className="flex flex-1 flex-col gap-0.5 p-2">
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
                    className="mt-auto min-h-8 self-start font-bold underline"
                    onClick={() => changePlan(plan.removeAction)(index)}
                    aria-label={`Retirer ${definition?.libelle ?? p.actionId}`}
                  >
                    Retirer
                  </button>
                </span>
              </li>
            );
          })}
      </ol>
      {data &&
        combos &&
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
                Bastion ×{decimal(data.combos.bastion.multiplicateur)} :{' '}
                {departmentName(data, code)}
              </span>
            ))}
            {combos.toursDeRegion.map((region) => (
              <span key={`t-${region}`} className="rounded-full bg-or px-2.5 py-1 text-sur-or">
                Tour de région : {regionName(region)} (+{data.combos.tourDeRegion.gain})
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
  );

  return (
    <section
      aria-labelledby="titre-plateau"
      // Un panneau de la boîte de jeu ouvert : le plateau, dessous, est inerte (fenêtre modale).
      inert={panneau ? true : undefined}
      aria-hidden={panneau ? true : undefined}
      className={`feutrine min-h-dvh px-3 pt-[calc(var(--sat)+0.75rem)] pr-[max(0.75rem,var(--sar))] pl-[max(0.75rem,var(--sal))] text-craie sm:px-5 pb-6`}
    >
      <h1 id="titre-plateau" className="sr-only">
        Plateau
      </h1>
      {week.debrief && (
        <Verdict
          report={week.debrief}
          state={state}
          gameId={game.id}
          eventFamily={(id) => data?.evenements.find((e) => e.id === id)?.famille ?? null}
          achievement={(id) => data?.succes.liste.find((a) => a.id === id) ?? null}
          ruleset={data}
          shapes={shapes}
          onDone={() => week.setDebrief(null)}
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
      {panneau === 'boite' ? (
        <Drawer title="Boîte de jeu" onClose={closePanel}>
          <GameBox game={game} ruleset={data} onOpen={openPanel} />
        </Drawer>
      ) : (
        panneau && <Panel screen={panneau} onClose={closePanel} />
      )}

      <div className="mx-auto max-w-6xl space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:space-y-0">
        <div className="space-y-4 lg:sticky lg:top-[calc(var(--sat)+0.75rem)]">
          {data && (
            <TopBar
              state={state}
              ruleset={data}
              actor={actor}
              hoursLeft={remaining?.time ?? 0}
              menu={
                <span className="flex gap-2">
                  <button
                    ref={boxButton}
                    type="button"
                    onClick={() => openPanel('boite')}
                    aria-haspopup="dialog"
                    title="Boîte de jeu"
                    className="inline-flex size-11 items-center justify-center rounded-2xl bg-feutrine-2 text-craie shadow-pion focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-or"
                  >
                    <Package aria-hidden="true" className="size-5" strokeWidth={2.2} />
                    <span className="sr-only">Boîte de jeu</span>
                  </button>
                  <SoundToggle felt />
                </span>
              }
            />
          )}

          {week.blocked && (
            <p role="alert" className="rounded-2xl bg-carton px-3 py-2 text-sm text-encre-carton">
              {state.calendar.blockedMessage ??
                'La partie ne peut pas avancer davantage pour l’instant.'}
            </p>
          )}
          {week.debateDue && (
            <p className="rounded-2xl bg-or px-3 py-2 text-sm font-semibold text-sur-or shadow-pion">
              {week.debateDue.libelle} vous attend sur le plateau télévisé.{' '}
              <Link to={`../debat/${week.debateDue.id}`} className="font-extrabold underline">
                {week.debateDue.statut === 'en_cours'
                  ? 'Reprendre le débat'
                  : 'Aller sur le plateau'}
              </Link>
            </p>
          )}

          <div className={`${carton} relative space-y-2 p-3 sm:p-4`}>
            <div
              role="radiogroup"
              aria-label="Lecture du plateau"
              className="flex gap-1 rounded-full bg-carton-2 p-1"
            >
              {READINGS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={reading === r.id}
                  onClick={() => setReading(r.id)}
                  className={`min-h-9 flex-1 rounded-full px-2 font-display text-xs font-bold sm:text-sm ${
                    reading === r.id
                      ? 'bg-encre-carton text-carton shadow-pion'
                      : 'text-encre-carton'
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
                onHover={armedCard?.cible === 'departement' ? setHovered : undefined}
                bubble={bubble}
              />
            ) : topology.isError || manifest.isError ? (
              <ErrorMessage error={topology.error ?? manifest.error} />
            ) : (
              <p className="py-16 text-center text-sm text-encre-carton-2">
                Chargement du plateau…
              </p>
            )}
            {burst && (
              <div
                key={burst.id}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-3 top-1/3 z-20 animate-banniere space-y-1.5 rounded-2xl border-[3px] border-sur-or bg-or px-4 py-3 text-center text-sur-or shadow-[0_6px_0_0_var(--color-or-ombre)]"
              >
                {burst.items.map((item) => (
                  <p key={item.title}>
                    <span className="block font-display text-2xl leading-none font-extrabold uppercase">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm font-bold">{item.detail}</span>
                  </p>
                ))}
              </div>
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
        </div>

        <div className="space-y-4">
          {plan.actions.length > 0 && data && placed}

          {week.observer && (
            <p className="rounded-2xl bg-feutrine-2 px-3 py-2 text-sm text-craie-2">
              Mode observateur : aucune campagne n’est contrôlée ; les candidats mènent leur
              campagne de façon autonome.
            </p>
          )}
          {quinquennat && !presiding && actor && (
            <p className="rounded-2xl bg-feutrine-2 px-3 py-2 text-sm text-craie-2">
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
              className="space-y-2 rounded-2xl bg-carton px-3 py-2 text-sm text-encre-carton shadow-carte"
            >
              <p>
                <strong>Programme trop court :</strong> {plannedProgramme.length} proposition(s),
                pour un minimum recommandé de {programmeMinimum}. Les facteurs « Programme » et «
                Crédibilité » ne vous rapportent{' '}
                {programmeWeight === null || programmeWeight === 0
                  ? 'rien pour l’instant'
                  : `qu’environ ${(programmeWeight / 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} point d’intentions (estimation)`}
                .
              </p>
              <span className="flex flex-wrap gap-2">
                {programmeSuggestion.length > 0 && (
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-encre-carton px-3 font-display text-sm font-bold text-carton"
                    onClick={changePlan(() => plan.announceMany(programmeSuggestion))}
                  >
                    Programme de départ suggéré ({programmeSuggestion.length} proposition
                    {programmeSuggestion.length > 1 ? 's' : ''})
                  </button>
                )}
                <button
                  type="button"
                  className="min-h-11 px-1 text-sm font-bold underline"
                  onClick={() => openPanel('programme')}
                >
                  Ouvrir le programme
                </button>
              </span>
            </div>
          )}
          {withRealPeople && (
            <p className="text-xs text-craie-2">
              Partie avec des personnalités réelles : tout ce qu’elles font ici est simulé.{' '}
              <button
                type="button"
                className="font-semibold text-craie underline"
                onClick={() => openPanel('candidats')}
              >
                Fiches et sources
              </button>
            </p>
          )}
        </div>
      </div>

      {/* La main en éventail et le gros bouton doré, à portée du pouce (maquette validée). */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-feutrine-3 via-feutrine-3/95 to-transparent pt-2 pr-(--sar) pb-[calc(0.75rem+var(--sab))] pl-(--sal)">
        <div className="mx-auto max-w-3xl space-y-1.5 px-3">
          {armedCard && data && actor && (
            <div
              role="group"
              aria-label={`Pose de la carte « ${armedCard.libelle} »`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-or px-3 py-1.5 text-sur-or shadow-pion"
            >
              {armedCard.cible === 'departement' ? (
                <>
                  <p className="min-w-0 flex-1 basis-48 text-xs leading-snug font-bold">
                    Touchez un département du plateau pour y poser « {armedCard.libelle} »
                  </p>
                  <select
                    aria-label={`Département de la carte « ${armedCard.libelle} »`}
                    className="min-h-9 max-w-44 rounded-lg border-2 border-sur-or/30 bg-carton px-2 text-sm font-semibold text-encre-carton"
                    value=""
                    onChange={(event) =>
                      event.target.value && place(armedCard.id, event.target.value)
                    }
                  >
                    <option value="">ou choisir dans la liste…</option>
                    {Object.entries(data.parrainages.reservoir.departements)
                      .sort(([a], [b]) => (a < b ? -1 : 1))
                      .map(([code, dep]) => (
                        <option key={code} value={code}>
                          {dep.nom} ({code})
                        </option>
                      ))}
                  </select>
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
                className="min-h-9 text-xs font-bold underline"
                onClick={() => setArmed(null)}
              >
                Annuler la pose
              </button>
            </div>
          )}

          {playing && data && (
            <Hand cards={cards} ruleset={data} presidency={presiding} armed={armed} onPlay={pick} />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`${boutonOr} min-h-14 flex-1 text-lg`}
              disabled={!week.canResolve}
              onClick={() => week.submit()}
            >
              {week.advance.isPending ? (
                'Résolution de la semaine…'
              ) : (
                <>
                  Jouer la semaine {game.week}
                  <Play aria-hidden="true" className="size-5 fill-current" />
                </>
              )}
            </button>
            {quinquennat && (
              <span className="flex items-center gap-1.5 text-sm">
                <label htmlFor="avance-rapide-plateau" className="sr-only">
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
                  className="min-h-11 rounded-xl border-2 border-craie px-3 font-bold text-craie"
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
              {pendingCount} décision(s) à trancher avant de jouer la semaine
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
