import { addDays, type DebateAngle, type DebateCard, type DebateSession } from '@r2027/shared';
import { FastForward, Play, Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useDebate, useRuleset } from '../api/hooks';
import { OutletLogo } from '../components/RealMedia';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, buttonSecondary, card, screenTitle } from '../components/ui';
import { formatGameDate } from '../labels';
import { useMediaQuery } from '../map/useMode';
import {
  ApprovalChart,
  cancelledDebate,
  cancelledLabel,
  CardPicker,
  FlashPoll,
  Lecterns,
  MoveItem,
  nameOf,
  outcomeLabel,
  playerOnStage,
} from './debat/parts';
import { useCurrentGame } from './GameLayout';

// Écran « Débat en direct » (phase 10) : le joueur joue une carte par séquence ; le moteur
// (serveur ou application) joue les coups des adversaires et renvoie l'état. Hors du plateau
// (non invité, chaise vide, observateur) ou débat terminé : relecture, accélérée si souhaité.

/** Délai de décision du chronomètre optionnel, en secondes. */
const CHRONO_SECONDES = 30;
/** Rythme de la relecture accélérée. */
const REPLAY_MS = 700;

export function Debat() {
  const game = useCurrentGame();
  const { debatId = '' } = useParams();
  const { state } = game;
  const ruleset = useRuleset(game.rulesetVersion, state.cycle);
  const debate = useDebate(game.id, debatId);
  const session = state.debats.seances.find((s) => s.id === debatId);
  const rule = ruleset.data?.debats.seances.find((r) => r.id === debatId);
  const echeance = ruleset.data?.calendrier.echeances.find((e) => e.id === rule?.echeanceId);
  const thisWeek =
    !!echeance && echeance.date >= state.meta.date && echeance.date < addDays(state.meta.date, 7);

  // Débat de la semaine pas encore programmé (partie migrée) : le moteur le programme.
  const opened = useRef(false);
  useEffect(() => {
    if (session || !thisWeek || opened.current) return;
    opened.current = true;
    debate.mutate({ action: 'ouvrir' });
  }, [session, thisWeek, debate]);

  if (!session) {
    return (
      <section aria-labelledby="titre-debat" className="space-y-4">
        <h1 id="titre-debat" className={screenTitle}>
          {rule?.libelle ?? 'Débat télévisé'}
        </h1>
        {debate.isError ? (
          <ErrorMessage error={debate.error} />
        ) : (
          <p className={card}>
            {thisWeek
              ? 'Ouverture du plateau…'
              : echeance
                ? `Ce débat est prévu le ${formatGameDate(echeance.date)} (date hypothèse du jeu).`
                : 'Aucun débat de ce nom dans cette campagne.'}{' '}
            <Link to="../tableau-de-bord" className="font-semibold underline">
              Retour au tableau de bord
            </Link>
          </p>
        )}
      </section>
    );
  }
  return <Plateau key={session.id} session={session} />;
}

function Plateau({ session }: { session: DebateSession }) {
  const game = useCurrentGame();
  const { state } = game;
  const ruleset = useRuleset(game.rulesetVersion, state.cycle);
  const debate = useDebate(game.id, session.id);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const onStage = playerOnStage(state, session);
  const live = onStage && session.statut !== 'termine' && session.enCours !== null;
  const outlet = ruleset.data?.mediasReels.organes.find((o) => o.id === session.mediaId);
  const themeLabel = (id: string) =>
    [
      ...(ruleset.data?.debats.themes ?? []),
      ...(ruleset.data ? [ruleset.data.debats.conclusion] : []),
    ].find((t) => t.id === id)?.libelle ?? id;
  const index = session.enCours?.index ?? session.sequences.length;
  const depart = ruleset.data?.debats.approbation.depart ?? 50;
  const cancelled = cancelledDebate(session);

  const play = (choice: { carte: DebateCard; cible?: string; angle?: DebateAngle }) => {
    if (!session.enCours) return;
    debate.mutate({ action: 'jouer', sequence: session.enCours.index, ...choice });
  };

  // Chronomètre optionnel : à zéro, la première carte (défendre ou répondre) est jouée.
  const [chrono, setChrono] = useState(false);
  const [left, setLeft] = useState(CHRONO_SECONDES);
  const sequenceKey = `${session.enCours?.index ?? -1}`;
  const [lastKey, setLastKey] = useState(sequenceKey);
  if (lastKey !== sequenceKey) {
    setLastKey(sequenceKey);
    setLeft(CHRONO_SECONDES);
  }
  useEffect(() => {
    if (!chrono || !live || debate.isPending) return;
    if (left <= 0) {
      const first = session.enCours?.cartes[0];
      if (first) play({ carte: first.carte });
      return;
    }
    const timer = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrono, live, left, debate.isPending]);

  // Relecture accélérée (spectateur ou débat terminé) : les coups apparaissent un à un.
  const [replay, setReplay] = useState<number | null>(null);
  const total = session.sequences.reduce((s, q) => s + q.coups.length, 0);
  useEffect(() => {
    if (replay === null || replay >= total) return;
    const timer = window.setTimeout(() => setReplay((r) => (r ?? 0) + 1), REPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [replay, total]);

  const announcement = useMemo(() => {
    const last = session.sequences.at(-1);
    if (!last || !ruleset.data) return '';
    const lines = last.coups.map((m) => `${nameOf(state, m.acteurId)} : ${outcomeLabel(m.issue)}`);
    return `Séquence ${session.sequences.length} terminée. ${lines.join('. ')}.`;
  }, [session.sequences, ruleset.data, state]);

  return (
    <section aria-labelledby="titre-debat" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-2">
          {cancelled ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1 text-sm font-bold text-white">
              Débat annulé
            </p>
          ) : session.statut === 'termine' ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-republique-600 px-3 py-1 text-sm font-bold text-white shadow-neon">
              Débat terminé
            </p>
          ) : (
            <p className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white shadow-neon-rouge">
              <span aria-hidden="true" className="size-2 animate-direct rounded-full bg-white" />
              En direct
            </p>
          )}
          <h1 id="titre-debat" className={screenTitle}>
            {session.libelle}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            {outlet && <OutletLogo outlet={outlet} />}
            <span>
              {outlet?.libelle ?? session.mediaId}, {formatGameDate(session.date)} — débat simulé,
              aucun journaliste nommé, aucune question attribuée
            </span>
          </p>
        </div>
        <ol aria-label="Séquences" className="flex flex-wrap gap-1.5">
          {session.themes.map((t, i) => (
            <li
              key={t}
              aria-current={i === index && session.statut !== 'termine' ? 'step' : undefined}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                i < session.sequences.length
                  ? 'bg-republique-600 text-white'
                  : i === index && session.statut !== 'termine'
                    ? 'bg-red-600 text-white shadow-neon-rouge'
                    : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300'
              }`}
            >
              {i + 1}. {themeLabel(t)}
            </li>
          ))}
        </ol>
      </header>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Lecterns state={state} ruleset={ruleset.data} session={session} />
      <div className={card}>
        <ApprovalChart state={state} session={session} depart={depart} />
      </div>

      {debate.isError && <ErrorMessage error={debate.error} />}

      {live && session.enCours && (
        <section aria-labelledby="titre-sequence" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titre-sequence" className="text-2xl">
              Séquence {session.enCours.index + 1} :{' '}
              {themeLabel(session.themes[session.enCours.index]!)}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-11 items-center gap-2 rounded-full border border-slate-200/80 px-3 text-sm dark:border-white/10">
                <input
                  type="checkbox"
                  className="size-4 accent-republique-600"
                  checked={chrono}
                  onChange={(e) => setChrono(e.target.checked)}
                />
                <Timer aria-hidden="true" className="size-4" />
                Chronomètre ({CHRONO_SECONDES} s)
              </label>
              {chrono && (
                <span
                  role="timer"
                  aria-label="Temps restant pour choisir"
                  className={`font-display text-2xl font-extrabold tabular-nums ${left <= 10 ? 'text-red-600 dark:text-red-400' : ''}`}
                >
                  {left} s
                </span>
              )}
            </div>
          </div>
          {session.enCours.ouverture.length > 0 ? (
            <ol aria-label="Avant votre prise de parole" className="space-y-2">
              {session.enCours.ouverture.map((move, k) => (
                <MoveItem
                  key={k}
                  state={state}
                  ruleset={ruleset.data}
                  move={move}
                  theme={themeLabel(session.themes[session.enCours!.index]!)}
                  delay={reducedMotion ? 0 : k * 150}
                />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Vous avez la parole en premier.
            </p>
          )}
          <CardPicker
            key={session.enCours.index}
            state={state}
            ruleset={ruleset.data}
            session={session}
            offers={session.enCours.cartes}
            busy={debate.isPending}
            onPlay={play}
          />
          <button
            type="button"
            className={buttonSecondary}
            disabled={debate.isPending}
            onClick={() => debate.mutate({ action: 'finir', sequence: session.enCours!.index })}
          >
            <FastForward aria-hidden="true" className="size-4" />
            Simuler la fin du débat
          </button>
        </section>
      )}

      {cancelled && (
        <p className={`${card} text-sm`}>
          {cancelledLabel(state, session)} Faute de contradicteur, aucune séquence n’a été jouée ni
          aucun sondage flash publié ; la chaise vide pèse sur la popularité de qui l’a laissée, à
          la résolution de la semaine.
        </p>
      )}

      {!onStage && session.statut !== 'termine' && (
        <p className={`${card} text-sm`}>
          {session.refus.includes(state.player.actorId ?? '')
            ? 'Vous avez refusé ce débat : chaise vide (malus de popularité). '
            : 'Vous n’êtes pas sur ce plateau. '}
          Le débat sera simulé à la résolution de la semaine ; vous pourrez le revoir ensuite.
        </p>
      )}

      {session.statut === 'termine' && (
        <FlashPoll state={state} ruleset={ruleset.data} session={session} />
      )}

      {session.sequences.length > 0 && (
        <section aria-labelledby="titre-transcription" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titre-transcription" className="text-2xl">
              Déroulé du débat
            </h2>
            {session.statut === 'termine' && (
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => setReplay(reducedMotion ? total : 0)}
              >
                <Play aria-hidden="true" className="size-4" />
                Revoir en accéléré
              </button>
            )}
          </div>
          {session.sequences
            .map((sequence, i) => ({ sequence, i }))
            .reverse()
            .map(({ sequence, i }) => (
              <div key={i} className="space-y-2">
                <h3 className="font-sans text-sm font-bold tracking-normal">
                  Séquence {i + 1} : {themeLabel(sequence.theme)}
                </h3>
                <ol className="space-y-2">
                  {sequence.coups.map((move, k) => {
                    const position =
                      session.sequences.slice(0, i).reduce((s, q) => s + q.coups.length, 0) + k;
                    if (replay !== null && position >= replay) return null;
                    return (
                      <MoveItem
                        key={k}
                        state={state}
                        ruleset={ruleset.data}
                        move={move}
                        theme={themeLabel(sequence.theme)}
                      />
                    );
                  })}
                </ol>
              </div>
            ))}
        </section>
      )}

      <p className="flex flex-wrap gap-2">
        <Link to="../tableau-de-bord" className={buttonPrimary}>
          Retour au tableau de bord
        </Link>
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-400">{ruleset.data?.debats.note}</p>
    </section>
  );
}
