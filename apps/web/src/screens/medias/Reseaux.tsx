import {
  candidateName,
  isPlateau,
  type DigitalPost,
  type DigitalReception,
  type DigitalTone,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { Eye, Flame, Heart, Plus, Sprout, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { Badge, type BadgeTone } from '../../components/Badge';
import { InfoPopover } from '../../components/InfoPopover';
import { formatDelta, formatResource } from '../../labels';
import { portraitOf } from '../../portraits';
import { useWeeklyPlan } from '../../stores/plan';
import { actionIcon } from '../dashboard/actionIcons';

// Réseaux sociaux et nouveaux médias (phase 9) : jauges Jeunesse et Dynamique du candidat,
// formats réels à programmer en un geste, fil des publications simulées. Les réactions viennent
// de comptes inventés par le jeu ; aucun propos n'est prêté à une personne réelle.

export const DIGITAL_NOTICE =
  'Formats et exemples réels, sourcés ; passages, vues et réactions sont simulés par le jeu. Les comptes qui réagissent sont inventés : aucun propos n’est prêté à un animateur, à une chaîne ni à une personne réelle.';

/** Publications affichées avant « Afficher les publications précédentes ». */
const FEED_PREVIEW = 6;
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('fr-FR');

const RECEPTION: Record<DigitalReception, { label: string; tone: BadgeTone }> = {
  enthousiaste: { label: 'Accueil enthousiaste', tone: 'succes' },
  favorable: { label: 'Accueil favorable', tone: 'simule' },
  partage: { label: 'Avis partagés', tone: 'neutre' },
  hostile: { label: 'Accueil hostile', tone: 'danger' },
};

const TONE: Record<DigitalTone, { label: string; dot: string }> = {
  positif: { label: 'réaction positive', dot: 'bg-emerald-500' },
  neutre: { label: 'réaction neutre', dot: 'bg-slate-400' },
  negatif: { label: 'réaction négative', dot: 'bg-red-500' },
};

/** Jauge du studio : grande valeur, barre fine, ce qui la fait bouger. */
function Gauge({
  icon: Icon,
  label,
  value,
  hint,
  bar,
  testId,
}: {
  icon: typeof Sprout;
  label: string;
  value: number;
  hint: string;
  bar: string;
  testId: string;
}) {
  return (
    <div className="rounded-card bg-white/[0.06] p-4 ring-1 ring-white/10">
      <dt className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </dt>
      <dd className="mt-1 font-display text-4xl font-bold tracking-tight" data-testid={testId}>
        {formatResource('jeunesse', value)}
      </dd>
      <dd aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <span
          className={`block h-full rounded-full ${bar} shadow-lueur transition-[width] duration-700 ease-sortie`}
          style={{ width: `${Math.min(100, value / 100)}%` }}
        />
      </dd>
      <dd className="mt-2 text-xs text-slate-300">{hint}</dd>
    </div>
  );
}

function FormatTiles({
  state,
  ruleset,
  gameId,
  week,
}: {
  state: GameState;
  ruleset: Ruleset;
  gameId: string;
  week: number;
}) {
  const plan = useWeeklyPlan(gameId, week);
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const campaigning =
    state.meta.phase !== 'presidence' &&
    actor !== undefined &&
    (actor.status === 'candidat' || actor.status === 'qualifie');
  const full = plan.actions.length >= ruleset.jeu.actionsMaxParSemaine;
  return (
    <ul aria-label="Formats à programmer" className="grid gap-3 sm:grid-cols-2">
      {ruleset.numerique.formats.map((format) => {
        const action = ruleset.actions.find((a) => a.format === format.id);
        if (!action) return null;
        const Icon = actionIcon(action.id);
        const planned = plan.actions.filter((a) => a.actionId === action.id).length;
        return (
          <li
            key={format.id}
            aria-label={format.libelle}
            className="flex flex-col gap-3 rounded-card border border-transparent bg-white p-4 text-slate-900 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-republique-300 hover:shadow-raised dark:bg-slate-900 dark:text-slate-100 dark:hover:border-republique-400/60 dark:hover:shadow-neon"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-republique-600 text-white"
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight">{format.libelle}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {format.plateforme} · ex.{' '}
                  {format.exemples.map((exemple) => exemple.nom).join(', ')}
                </p>
              </div>
              <InfoPopover label={`Détails : ${action.libelle}`} title={action.libelle}>
                <p className="text-sm text-slate-700 dark:text-slate-300">{action.description}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="font-semibold">Coût</dt>
                    <dd>
                      {action.cout.tempsHeures} h
                      {action.cout.budgetCentimes > 0 &&
                        ` · ${formatResource('budgetCentimes', action.cout.budgetCentimes)}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Effet attendu (hypothèse du jeu)</dt>
                    <dd>
                      <ul className="space-y-0.5">
                        {action.effets.map((e) => (
                          <li key={e.ressource}>
                            {formatDelta(e.ressource, e.base)} {RESOURCE_SHORT[e.ressource]}
                            {e.ecart > 0 && ` (± ${formatDelta(e.ressource, e.ecart).slice(1)})`}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  {action.risque && (
                    <div>
                      <dt className="font-semibold">Risque</dt>
                      <dd>
                        {isPlateau(ruleset, action)
                          ? `si le passage est raté (score de ${ruleset.prestations.seuils.incident} ou moins)`
                          : `${Math.round(action.risque.probabilite * 100)} %`}{' '}
                        : {action.risque.libelle}
                      </dd>
                    </div>
                  )}
                </dl>
                {format.exemples.map((exemple) => (
                  <p key={exemple.nom} className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                    {exemple.nom} : {exemple.fait}.
                  </p>
                ))}
              </InfoPopover>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{format.description}</p>
            <div className="mt-auto flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600 tabular-nums dark:text-slate-400">
                {action.cout.tempsHeures} h
                {action.cout.budgetCentimes > 0 &&
                  ` · ${formatResource('budgetCentimes', action.cout.budgetCentimes)}`}
                {planned > 0 && ` · au plan ×${planned}`}
              </span>
              <button
                type="button"
                aria-label={`Programmer : ${action.libelle}`}
                disabled={!campaigning || full}
                onClick={() => plan.addAction(action.id)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-republique-600 px-4 text-sm font-bold text-white shadow-card transition hover:bg-republique-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
              >
                <Plus aria-hidden="true" className="size-4" />
                Programmer
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const RESOURCE_SHORT: Record<string, string> = {
  budgetCentimes: 'budget',
  tempsHeures: 'temps',
  militants: 'militants',
  notoriete: 'notoriété',
  popularite: 'popularité',
  jeunesse: 'Jeunesse',
  dynamique: 'Dynamique',
};

function Post({ post, state, ruleset }: { post: DigitalPost; state: GameState; ruleset: Ruleset }) {
  const actor = state.actors[post.acteurId];
  const name = actor ? candidateName(actor.candidate) : post.acteurId;
  const mine = post.acteurId === state.player.actorId;
  const format = ruleset.numerique.formats.find((f) => f.id === post.formatId);
  const reception = RECEPTION[post.accueil];
  return (
    <li
      aria-label={`${name} — ${format?.libelle ?? post.formatId}, semaine ${post.semaine}`}
      className={`rounded-card border bg-white p-4 text-slate-900 shadow-card dark:bg-slate-900 dark:text-slate-100 ${
        mine
          ? 'border-republique-300 dark:border-republique-700'
          : 'border-slate-200/80 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start gap-3">
        {actor && <Avatar portrait={portraitOf(actor, ruleset)} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="leading-tight">
            <span className="font-bold">{name}</span>
            {mine && <span className="text-slate-600 dark:text-slate-400"> (vous)</span>}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {format?.libelle ?? post.formatId} · semaine {post.semaine}
          </p>
        </div>
        <Badge tone={reception.tone}>{reception.label}</Badge>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
          <Eye aria-hidden="true" className="size-4 text-slate-500" />
          {compact.format(post.vues)} vues simulées
        </span>
        {post.incident && (
          <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-300">
            <TriangleAlert aria-hidden="true" className="size-4" />
            Séquence qui dérape
          </span>
        )}
      </p>
      {post.reactions.length > 0 && (
        <ul
          aria-label="Réactions de comptes fictifs"
          className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800"
        >
          {post.reactions.map((reaction) => (
            <li key={reaction.compte} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[reaction.ton].dot}`}
              />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {reaction.compte}
                </span>{' '}
                {reaction.texte}
                <span className="sr-only"> ({TONE[reaction.ton].label})</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-600 tabular-nums dark:text-slate-400">
                <Heart aria-hidden="true" className="size-3.5" />
                {integer.format(reaction.jaime)}
                <span className="sr-only"> « j’aime »</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Section « Réseaux et nouveaux médias » de l'écran Médias. */
export function Reseaux({
  state,
  ruleset,
  gameId,
  week,
}: {
  state: GameState;
  ruleset: Ruleset;
  gameId: string;
  week: number;
}) {
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const rules = ruleset.numerique;
  const [all, setAll] = useState(false);
  // Semaine la plus récente d'abord ; vos publications en tête de chaque semaine.
  const rank = (id: string) => (id === state.player.actorId ? '' : id);
  const posts = [...state.numerique.publications].sort(
    (a, b) =>
      b.semaine - a.semaine ||
      (rank(a.acteurId) < rank(b.acteurId) ? -1 : rank(a.acteurId) > rank(b.acteurId) ? 1 : 0),
  );
  const shown = all ? posts : posts.slice(0, FEED_PREVIEW);
  return (
    <section
      id="reseaux"
      aria-labelledby="titre-reseaux"
      className="relative space-y-5 overflow-hidden rounded-dossier bg-slate-950 p-5 text-white shadow-raised sm:p-7"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-republique-600/40 blur-3xl"
      />
      <div className="relative flex flex-wrap items-center gap-2">
        <h2 id="titre-reseaux" className="text-2xl font-bold sm:text-3xl">
          Réseaux et nouveaux médias
        </h2>
        <Badge tone="simule">Simulation</Badge>
      </div>
      <p className="relative max-w-prose text-sm text-slate-300">{DIGITAL_NOTICE}</p>

      {actor && (
        <dl className="relative grid gap-3 sm:grid-cols-2">
          <Gauge
            icon={Sprout}
            label="Jeunesse (18-34 ans)"
            value={actor.resources.jeunesse}
            hint={`Écho de votre campagne chez les jeunes adultes ; s’use de ${Math.round(rules.erosionJeunesse * 100)} % par semaine.`}
            bar="bg-republique-400"
            testId="jauge-jeunesse"
          />
          <Gauge
            icon={Flame}
            label="Dynamique (buzz)"
            value={actor.resources.dynamique}
            hint={`Buzz du moment : il pèse sur les intentions de vote et retombe de ${Math.round(rules.retombeeDynamique * 100)} % par semaine.`}
            bar="bg-or-400"
            testId="jauge-dynamique"
          />
        </dl>
      )}

      <div className="relative space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">Formats</h3>
          <Link to="../tableau-de-bord" className="text-sm font-semibold underline">
            Voir le plan de la semaine
          </Link>
        </div>
        <FormatTiles state={state} ruleset={ruleset} gameId={gameId} week={week} />
      </div>

      <div className="relative space-y-3">
        <h3 className="text-lg font-bold">Le fil</h3>
        {posts.length === 0 ? (
          <p className="rounded-card bg-white/[0.06] p-4 text-sm text-slate-300 ring-1 ring-white/10">
            Aucune publication pour l’instant : programmez un format, puis résolvez la semaine
            depuis le QG.
          </p>
        ) : (
          <>
            <ul aria-label="Fil des publications simulées" className="space-y-3">
              {shown.map((post) => (
                <Post key={post.id} post={post} state={state} ruleset={ruleset} />
              ))}
            </ul>
            {posts.length > FEED_PREVIEW && (
              <button
                type="button"
                aria-expanded={all}
                onClick={() => setAll((value) => !value)}
                className="min-h-11 w-full rounded-full border border-white/20 px-4 text-sm font-bold text-white hover:bg-white/10"
              >
                {all
                  ? 'Afficher moins de publications'
                  : `Afficher les ${posts.length - FEED_PREVIEW} publications précédentes`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
