import { implantationTier, type GameState, type Ruleset } from '@r2027/shared';
import { formatLocal, localPoll } from './localPoll';
import { departmentName, PROJECTION_PENDING, type Reading } from './readings';

// Infobulle de lecture (phase 25 bis) : commune aux trois lectures du plateau, au survol (bureau)
// ou au toucher (téléphone) d'un département. Elle reprend la bulle de pose des cartes ; son
// contenu est déjà écrit dans le nom du département (lecteurs d'écran), elle n'est donc pas
// annoncée.

const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);

/** Un score ne se coupe jamais entre le nombre et « % ». */
const Share = ({ value }: { value: number }) => (
  <span className="whitespace-nowrap">{formatLocal(value)}</span>
);

export function ReadingBubble({
  code,
  reading,
  state,
  ruleset,
}: {
  code: string;
  reading: Reading;
  state: GameState;
  ruleset: Ruleset;
}) {
  const playerId = state.player.actorId;
  const poll = localPoll(state, code);
  const value = playerId ? (state.implantation[playerId]?.[code] ?? 0) : 0;
  const { leader, player } = poll ?? { leader: null, player: null };
  const leaderLine = leader ? (
    <span className={`block ${reading === 'qui-mene' ? 'font-extrabold text-or' : ''}`}>
      {leader.isPlayer
        ? `Vous menez${poll?.tie ? ' (ex aequo)' : ''} : `
        : `En tête${poll?.tie ? ' (ex aequo)' : ''} : ${leader.nomComplet} `}
      <Share value={leader.share} />
    </span>
  ) : null;
  const playerLine =
    player && leader && !leader.isPlayer ? (
      <span className={`block ${reading === 'sondage-local' ? 'font-extrabold text-or' : ''}`}>
        Vous : <Share value={player.share} /> ({ordinal(player.rank)})
      </span>
    ) : null;
  // Vous menez : votre poursuivant, pour comparer sans changer de lecture.
  const second = leader?.isPlayer ? poll?.entries[1] : undefined;
  const secondLine = second ? (
    <span className="block">
      Puis : {second.nomComplet} <Share value={second.share} />
    </span>
  ) : null;
  return (
    <>
      <strong className="block font-display text-sm">{departmentName(ruleset, code)}</strong>
      {reading === 'implantation' && playerId && (
        <span className="block">
          Implantation {value} sur 100 ({implantationTier(value).libelle})
        </span>
      )}
      {poll ? (
        reading === 'sondage-local' ? (
          <>
            {playerLine}
            {leaderLine}
            {secondLine}
          </>
        ) : (
          <>
            {leaderLine}
            {playerLine}
            {secondLine}
          </>
        )
      ) : (
        <span className="block text-craie-2">{PROJECTION_PENDING}</span>
      )}
      {poll && <span className="block text-craie-2">Projection simulée</span>}
    </>
  );
}
