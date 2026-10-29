import { addDays, type GameState, type Ruleset } from '@r2027/shared';
import { Clapperboard, Tv } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDebate } from '../../api/hooks';
import { ErrorMessage } from '../../components/ErrorMessage';
import { OutletLogo } from '../../components/RealMedia';
import { buttonPrimary, buttonSecondary, card } from '../../components/ui';
import { formatGameDate } from '../../labels';
import { cancelledDebate, cancelledLabel, playerOnStage } from '../debat/parts';

// Débats télévisés au tableau de bord (phase 10) : débat de la semaine (entrer sur le plateau
// ou laisser une chaise vide), débats à venir (préparation), débats terminés (relecture).

const WEEKS_AHEAD = 3;

export function DebatesPanel({
  gameId,
  state,
  ruleset,
}: {
  gameId: string;
  state: GameState;
  ruleset: Ruleset;
}) {
  const date = state.meta.date;
  const echeances = new Map(ruleset.calendrier.echeances.map((e) => [e.id, e]));
  const rows = ruleset.debats.seances
    .map((rule) => ({
      rule,
      echeance: echeances.get(rule.echeanceId),
      session: state.debats.seances.find((s) => s.id === rule.id),
    }))
    .filter(
      ({ echeance, session }) =>
        session ||
        (echeance && echeance.date >= date && echeance.date < addDays(date, 7 * WEEKS_AHEAD)),
    );
  if (rows.length === 0) return null;
  const player = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const max = ruleset.debats.preparationMaxHeures;

  return (
    <section aria-labelledby="titre-debats" className={`${card} space-y-3`}>
      <div className="flex items-center gap-2">
        <Tv aria-hidden="true" className="size-5 text-republique-600 dark:text-republique-300" />
        <h2 id="titre-debats" className="text-2xl">
          Débats télévisés
        </h2>
      </div>
      <ul className="space-y-2">
        {rows.map(({ rule, echeance, session }) => {
          const outlet = ruleset.mediasReels.organes.find((o) => o.id === rule.mediaId);
          const thisWeek = !!echeance && echeance.date >= date && echeance.date < addDays(date, 7);
          return (
            <li
              key={rule.id}
              className="space-y-2 rounded-2xl border border-slate-200/80 p-3 dark:border-white/10"
            >
              <p className="flex flex-wrap items-center gap-2">
                {outlet && <OutletLogo outlet={outlet} />}
                <span className="font-semibold">{rule.libelle}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {outlet?.libelle ?? rule.mediaId}
                  {echeance &&
                    `, ${formatGameDate(echeance.date)}${echeance.heure ? ` à ${echeance.heure.replace(':', ' h ')}` : ''}`}{' '}
                  (date hypothèse du jeu)
                </span>
              </p>
              {session ? (
                <DebateRow gameId={gameId} state={state} sessionId={session.id} />
              ) : thisWeek ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  Cette semaine.
                  <Link to={`../debat/${rule.id}`} className={buttonSecondary}>
                    <Clapperboard aria-hidden="true" className="size-4" />
                    Ouvrir le plateau
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  À venir.{' '}
                  {player
                    ? `Votre préparation : ${player.preparationDebat} h sur ${max} h utiles (action « Préparation des débats » ; les heures s’usent de ${Math.round(ruleset.debats.usurePreparation * 100)} % par semaine).`
                    : 'Les invitations suivront le dernier sondage publié.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DebateRow({
  gameId,
  state,
  sessionId,
}: {
  gameId: string;
  state: GameState;
  sessionId: string;
}) {
  const session = state.debats.seances.find((s) => s.id === sessionId)!;
  const debate = useDebate(gameId, sessionId);
  const [confirm, setConfirm] = useState(false);
  const onStage = playerOnStage(state, session);
  const refused = !!state.player.actorId && session.refus.includes(state.player.actorId);
  if (cancelledDebate(session)) return <p className="text-sm">{cancelledLabel(state, session)}</p>;
  if (session.statut === 'termine')
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        Débat terminé.
        <Link to={`../debat/${session.id}`} className={buttonSecondary}>
          Revoir le débat
        </Link>
      </p>
    );
  if (!onStage)
    return (
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {refused
          ? 'Vous avez refusé : chaise vide (malus de popularité).'
          : 'Vous n’êtes pas sur ce plateau.'}{' '}
        Le débat sera simulé à la résolution de la semaine.{' '}
        <Link to={`../debat/${session.id}`} className="font-semibold underline">
          Le plateau
        </Link>
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Vous êtes invité(e) avec {session.invites.length - 1} autre(s) candidat(s).{' '}
        {session.statut === 'en_cours'
          ? `Séquence ${session.sequences.length + 1} sur ${session.themes.length} à jouer.`
          : 'Débat obligatoire : la semaine ne se résout qu’une fois ce débat joué (ou sa fin simulée depuis le plateau), ou refusé.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to={`../debat/${session.id}`} className={buttonPrimary}>
          <Clapperboard aria-hidden="true" className="size-4" />
          {session.statut === 'en_cours' ? 'Reprendre le débat' : 'Entrer sur le plateau'}
        </Link>
        {session.statut === 'prevu' &&
          (confirm ? (
            <button
              type="button"
              className={buttonSecondary}
              disabled={debate.isPending}
              onClick={() => debate.mutate({ action: 'refuser' })}
            >
              Confirmer la chaise vide
            </button>
          ) : (
            <button type="button" className={buttonSecondary} onClick={() => setConfirm(true)}>
              Refuser ce débat
            </button>
          ))}
      </div>
      {debate.isError && <ErrorMessage error={debate.error} />}
    </div>
  );
}
