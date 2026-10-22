import {
  candidateName,
  type DebateAngle,
  type DebateCard,
  type DebateMove,
  type DebateOffer,
  type DebateSession,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { Mountain, ShieldCheck, Swords, Undo2, Zap, type LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Badge, type BadgeTone } from '../../components/Badge';
import { buttonPrimary, buttonSecondary, card, pressable } from '../../components/ui';
import { formatShare } from '../../labels';
import { portraitOf } from '../../portraits';

// Pièces de l'écran « Débat en direct » (phase 10). Tout ce qui est affiché vient de l'état
// calculé par le moteur (coups, effets, approbation, sondage flash) : l'interface ne fait que
// l'additionner pour la courbe et le chronomètre.

const one = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'always',
});
const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export const nameOf = (state: GameState, id: string) =>
  state.actors[id] ? candidateName(state.actors[id].candidate) : id;

/** Le joueur est-il sur le plateau (invité, présent, toujours en lice) ? */
export function playerOnStage(state: GameState, session: DebateSession): boolean {
  const id = state.player.actorId;
  if (!id || !session.invites.includes(id) || session.refus.includes(id)) return false;
  const status = state.actors[id]?.status;
  return status === 'candidat' || status === 'qualifie';
}

/**
 * Débat annulé : moins de deux candidats présents (chaise vide face à un seul invité). Le moteur
 * le clôt sans séquence ni sondage flash significatif ; seule la chaise vide est sanctionnée.
 */
export const cancelledDebate = (session: DebateSession) =>
  session.invites.filter((id) => !session.refus.includes(id)).length < 2;

/** « Débat annulé : chaise vide de X, Y. » */
export const cancelledLabel = (state: GameState, session: DebateSession) =>
  `Débat annulé : chaise vide de ${session.refus.map((id) => nameOf(state, id)).join(', ')}.`;

/** Coups joués, dans l'ordre, ouverture de la séquence en cours comprise. */
export const allMoves = (session: DebateSession): DebateMove[] => [
  ...session.sequences.flatMap((s) => s.coups),
  ...(session.enCours?.ouverture ?? []),
];

/** Approbation de chaque candidat présent après chaque coup (somme des effets du moteur). */
export function approvalSeries(session: DebateSession, depart: number) {
  const present = session.invites.filter((id) => !session.refus.includes(id));
  const current = Object.fromEntries(present.map((id) => [id, depart]));
  const series: Record<string, number[]> = Object.fromEntries(present.map((id) => [id, [depart]]));
  for (const move of allMoves(session)) {
    for (const [id, delta] of Object.entries(move.effets))
      if (id in current) current[id] = Math.min(100, Math.max(0, current[id]! + delta));
    for (const id of present) series[id]!.push(current[id]!);
  }
  return series;
}

/** Temps de parole simulé de chaque candidat, en secondes. */
export function speakingTime(session: DebateSession): Record<string, number> {
  const time: Record<string, number> = {};
  for (const move of allMoves(session))
    time[move.acteurId] = (time[move.acteurId] ?? 0) + move.duree;
  return time;
}

export const durationLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;

export const CARD_INFO: Record<DebateCard, { titre: string; aide: string; Icon: LucideIcon }> = {
  defendre: {
    titre: 'Défendre',
    aide: 'Sûr : gain modéré, selon votre préparation et la cohérence de votre programme.',
    Icon: ShieldCheck,
  },
  repondre: {
    titre: 'Répondre',
    aide: 'Reprendre la main après une attaque ; très fort si l’attaque reposait sur un fait faux.',
    Icon: Undo2,
  },
  attaquer: {
    titre: 'Attaquer',
    aide: 'Fort si le fait reproché est vrai ; retour de bâton s’il est faux. Trop d’attaques lassent.',
    Icon: Swords,
  },
  hauteur: {
    titre: 'Rester au-dessus de la mêlée',
    aide: 'Prudent : efficace quand on mène, amortit une partie des coups reçus.',
    Icon: Mountain,
  },
  'petite-phrase': {
    titre: 'Tenter une petite phrase',
    aide: 'Quitte ou double : reprise sur les réseaux, ou flop.',
    Icon: Zap,
  },
};

const OUTCOMES: Record<DebateMove['issue'], { label: string; tone: BadgeTone }> = {
  reussi: { label: 'Réussi', tone: 'succes' },
  neutre: { label: 'Sans effet notable', tone: 'neutre' },
  rate: { label: 'Raté', tone: 'alerte' },
  retourne: { label: 'Retour de bâton', tone: 'danger' },
};

export const outcomeLabel = (issue: DebateMove['issue']) => OUTCOMES[issue].label.toLowerCase();

/** Description du coup, sans aucun propos : « Attaque X : Revirements ». */
export function moveLabel(state: GameState, ruleset: Ruleset, move: DebateMove, theme: string) {
  const angle = (id: DebateAngle | null) => ruleset.debats.angles.find((a) => a.id === id)?.libelle;
  const proposal = (id: string | null) =>
    ruleset.programme.propositions.find((p) => p.id === id)?.libelle;
  switch (move.carte) {
    case 'defendre':
      return move.propositionId
        ? `Défend sa proposition « ${proposal(move.propositionId) ?? move.propositionId} »`
        : `Expose sa vision : ${theme.charAt(0).toLowerCase()}${theme.slice(1)}`;
    case 'repondre':
      return `Répond à ${move.cible ? nameOf(state, move.cible) : 'une attaque'}`;
    case 'attaquer':
      return `Attaque ${move.cible ? nameOf(state, move.cible) : ''} : ${angle(move.angle) ?? ''}`;
    case 'hauteur':
      return 'Reste au-dessus de la mêlée';
    case 'petite-phrase':
      return 'Tente une petite phrase';
  }
}

/** Un coup de la transcription : candidat, action, réplique (jamais pour une personne réelle). */
export function MoveItem({
  state,
  ruleset,
  move,
  theme,
  delay = 0,
}: {
  state: GameState;
  ruleset: Ruleset | undefined;
  move: DebateMove;
  theme: string;
  delay?: number;
}) {
  const actor = state.actors[move.acteurId];
  const outcome = OUTCOMES[move.issue];
  const real = actor?.candidate.nature === 'reel';
  return (
    <li
      className="flex animate-monte gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card dark:border-white/10 dark:bg-white/[0.04]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {actor && <Avatar portrait={portraitOf(actor, ruleset)} size="sm" />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{nameOf(state, move.acteurId)}</span>
          <Badge tone={outcome.tone}>{outcome.label}</Badge>
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {ruleset ? moveLabel(state, ruleset, move, theme) : move.carte}
        </p>
        {move.replique ? (
          <blockquote className="border-l-2 border-republique-400 pl-3 font-display text-lg leading-snug">
            {move.replique}
          </blockquote>
        ) : (
          real && (
            <p className="text-xs text-slate-600 italic dark:text-slate-400">
              Coup simulé : aucune réplique n’est prêtée à une personnalité réelle.
            </p>
          )
        )}
        <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Effet sur l’approbation">
          {Object.entries(move.effets)
            .filter(([, delta]) => Math.abs(delta) >= 0.05)
            .map(([id, delta]) => (
              <li
                key={id}
                className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                  delta >= 0
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
                    : 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100'
                }`}
              >
                {nameOf(state, id)} {one.format(delta)}
              </li>
            ))}
        </ul>
        {move.reaction && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold">{move.reaction.compte}</span> (compte fictif) :{' '}
            {move.reaction.texte}
          </p>
        )}
      </div>
    </li>
  );
}

/** Pupitres : approbation et temps de parole de chaque invité ; chaises vides. */
export function Lecterns({
  state,
  ruleset,
  session,
}: {
  state: GameState;
  ruleset: Ruleset | undefined;
  session: DebateSession;
}) {
  const time = speakingTime(session);
  const player = state.player.actorId;
  return (
    <ul aria-label="Pupitres" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {session.invites.map((id) => {
        const actor = state.actors[id];
        const empty = session.refus.includes(id);
        const approval = session.approbation[id];
        return (
          <li
            key={id}
            aria-label={`${nameOf(state, id)}${id === player ? ' (vous)' : ''} : ${
              empty ? 'chaise vide' : `approbation ${whole.format(approval ?? 0)} sur 100`
            }`}
            className={`flex items-center gap-2.5 rounded-2xl border p-2.5 ${
              id === player
                ? 'border-republique-300 bg-republique-50 dark:border-republique-400/50 dark:bg-republique-500/10 dark:shadow-neon'
                : 'border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04]'
            } ${empty ? 'opacity-60' : ''}`}
          >
            {actor && <Avatar portrait={portraitOf(actor, ruleset)} size="sm" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-tight font-semibold break-words">
                {nameOf(state, id)}
                {id === player && ' (vous)'}
              </p>
              {empty ? (
                <p className="text-xs text-slate-600 dark:text-slate-400">Chaise vide</p>
              ) : (
                <>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-2xl leading-none font-extrabold tabular-nums">
                      {whole.format(approval ?? 0)}
                    </span>
                    <span className="text-xs text-slate-600 tabular-nums dark:text-slate-400">
                      {durationLabel(time[id] ?? 0)}
                    </span>
                  </p>
                  <span
                    aria-hidden="true"
                    className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                  >
                    <span
                      className={`block h-full rounded-full transition-[width] duration-700 ease-sortie ${
                        id === player ? 'bg-republique-500 dark:bg-republique-400' : 'bg-slate-400'
                      }`}
                      style={{ width: `${approval ?? 0}%` }}
                    />
                  </span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Courbe d'approbation du public, coup après coup : votre candidat dans la couleur d'accent,
 * les autres en gris (les valeurs exactes sont écrites sur les pupitres).
 */
export function ApprovalChart({
  state,
  session,
  depart,
}: {
  state: GameState;
  session: DebateSession;
  depart: number;
}) {
  const series = approvalSeries(session, depart);
  const length = Math.max(...Object.values(series).map((s) => s.length), 2);
  const values = Object.values(series).flat();
  const min = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
  const max = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
  const width = 600;
  const height = 160;
  const x = (i: number) => (i / (length - 1)) * width;
  const y = (v: number) => height - ((v - min) / Math.max(1, max - min)) * height;
  const player = state.player.actorId;
  const ids = Object.keys(series).sort((a, b) => (a === player ? 1 : b === player ? -1 : 0));
  return (
    <figure className="space-y-1">
      <svg
        role="img"
        aria-label={`Courbe d’approbation du public, de ${min} à ${max} sur 100, au fil des ${length - 1} coups joués`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-40 w-full overflow-visible"
      >
        {[min, (min + max) / 2, max].map((v) => (
          <line
            key={v}
            x1={0}
            x2={width}
            y1={y(v)}
            y2={y(v)}
            className="stroke-slate-200 dark:stroke-white/10"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {ids.map((id) => (
          <polyline
            key={id}
            fill="none"
            points={series[id]!.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            className={
              id === player
                ? 'stroke-republique-500 dark:stroke-republique-300'
                : 'stroke-slate-400/70 dark:stroke-slate-500/70'
            }
            strokeWidth={id === player ? 3 : 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 text-xs text-slate-600 dark:text-slate-400">
        {player && series[player] && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1 w-4 rounded-full bg-republique-500" />
            Vous
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-slate-400" />
          Autres candidats
        </span>
        <span>Approbation simulée du public (0 à 100)</span>
      </figcaption>
    </figure>
  );
}

/** Les trois cartes de la séquence ; l'attaque demande une cible et un angle. */
export function CardPicker({
  state,
  ruleset,
  session,
  offers,
  busy,
  onPlay,
}: {
  state: GameState;
  ruleset: Ruleset | undefined;
  session: DebateSession;
  offers: DebateOffer[];
  busy: boolean;
  onPlay: (choice: { carte: DebateCard; cible?: string; angle?: DebateAngle }) => void;
}) {
  const id = useId();
  const [attacking, setAttacking] = useState(false);
  const player = state.player.actorId;
  const targets = session.invites.filter((x) => x !== player && !session.refus.includes(x));
  const [target, setTarget] = useState<string>(targets[0] ?? '');
  const [angle, setAngle] = useState<DebateAngle>('programme');
  const proposal = (pid: string | null) =>
    ruleset?.programme.propositions.find((p) => p.id === pid)?.libelle;
  return (
    <div className="space-y-3">
      <ul aria-label="Cartes de la séquence" className="grid gap-2 sm:grid-cols-3">
        {offers.map((offer) => {
          const info = CARD_INFO[offer.carte];
          const detail =
            offer.carte === 'defendre'
              ? offer.propositionId
                ? `« ${proposal(offer.propositionId) ?? offer.propositionId} »`
                : 'Votre vision sur le thème'
              : offer.carte === 'repondre' && offer.attaquant
                ? `à ${nameOf(state, offer.attaquant)}`
                : null;
          return (
            <li key={offer.carte}>
              <button
                type="button"
                disabled={busy}
                aria-expanded={offer.carte === 'attaquer' ? attacking : undefined}
                onClick={() =>
                  offer.carte === 'attaquer'
                    ? setAttacking((a) => !a)
                    : onPlay({ carte: offer.carte })
                }
                className={`flex h-full w-full flex-col gap-2 rounded-card border p-4 text-left shadow-card hover:border-republique-300 dark:hover:border-republique-400/60 dark:hover:shadow-neon ${pressable} ${
                  offer.carte === 'attaquer' && attacking
                    ? 'border-red-400 bg-red-50 dark:border-red-400/60 dark:bg-red-500/10'
                    : 'border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900'
                }`}
              >
                <info.Icon
                  aria-hidden="true"
                  className="size-6 text-republique-600 dark:text-republique-300"
                />
                <span className="font-display text-xl leading-tight font-extrabold">
                  {info.titre}
                  {detail && <span className="block text-sm font-semibold">{detail}</span>}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">{info.aide}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {attacking && (
        <form
          aria-label="Préparer l’attaque"
          className={`${card} animate-monte space-y-3`}
          onSubmit={(event) => {
            event.preventDefault();
            onPlay({ carte: 'attaquer', cible: target, angle });
          }}
        >
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-bold">Cible</legend>
            <div className="flex flex-wrap gap-2">
              {targets.map((t) => (
                <label
                  key={t}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-[:checked]:border-red-400 has-[:checked]:bg-red-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-republique-500 dark:border-white/15 dark:has-[:checked]:bg-red-500/15`}
                >
                  <input
                    type="radio"
                    name={`${id}-cible`}
                    className="sr-only"
                    checked={target === t}
                    onChange={() => setTarget(t)}
                  />
                  {nameOf(state, t)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-bold">Angle</legend>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Le fait reproché doit être vrai pour la cible (écran Candidats) : sinon, l’attaque se
              retourne contre vous.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ruleset?.debats.angles.map((a) => (
                <label
                  key={a.id}
                  className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm has-[:checked]:border-red-400 has-[:checked]:bg-red-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-republique-500 dark:border-white/15 dark:has-[:checked]:bg-red-500/15"
                >
                  <input
                    type="radio"
                    name={`${id}-angle`}
                    className="mt-1 accent-red-600"
                    checked={angle === a.id}
                    onChange={() => setAngle(a.id)}
                  />
                  <span>
                    <span className="block font-semibold">{a.libelle}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">
                      {a.fait}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonPrimary} disabled={busy || !target}>
              <Swords aria-hidden="true" className="size-4" />
              Lancer l’attaque
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setAttacking(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Sondage flash simulé : parts des présents jugés les plus convaincants. */
export function FlashPoll({
  state,
  ruleset,
  session,
}: {
  state: GameState;
  ruleset: Ruleset | undefined;
  session: DebateSession;
}) {
  const result = session.resultat;
  if (!result || cancelledDebate(session)) return null;
  const ranking = Object.entries(result.convaincant).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...ranking.map(([, v]) => v), 1);
  const player = state.player.actorId;
  return (
    <section aria-labelledby={`sondage-${session.id}`} className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`sondage-${session.id}`} className="text-2xl">
          Le plus convaincant
        </h2>
        <Badge tone="simule">Sondage flash simulé</Badge>
      </div>
      <ol className="space-y-2">
        {ranking.map(([id, value]) => (
          <li key={id} className="flex items-center gap-3">
            {state.actors[id] && (
              <Avatar portrait={portraitOf(state.actors[id], ruleset)} size="sm" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">
                  {nameOf(state, id)}
                  {id === player && ' (vous)'}
                </span>
                <span className="font-display text-xl font-extrabold tabular-nums">
                  {formatShare(value)}
                </span>
              </p>
              <span
                aria-hidden="true"
                className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
              >
                <span
                  className={`block h-full rounded-full ${id === player ? 'bg-republique-500' : 'bg-slate-400'}`}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </span>
            </div>
          </li>
        ))}
      </ol>
      {session.refus.length > 0 && (
        <p className="text-sm">
          Chaise vide : {session.refus.map((id) => nameOf(state, id)).join(', ')}.
        </p>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {result.applique
          ? 'Effets appliqués à la résolution de la semaine : popularité, notoriété, dynamique et intentions de vote (voir le bilan).'
          : 'Les effets (popularité, notoriété, dynamique, intentions de vote) seront appliqués à la résolution de la semaine.'}
      </p>
    </section>
  );
}
