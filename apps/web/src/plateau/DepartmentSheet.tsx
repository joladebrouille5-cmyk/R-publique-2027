import {
  departmentInscrits,
  implantationTier,
  militantsByDepartment,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { Avatar } from '../components/Avatar';
import { ShareBar } from '../components/ShareBar';
import { carte, bandeauFamille } from '../components/ui';
import { portraitOf } from '../portraits';
import { formatLocal, leaderColors, localPoll, OTHER_LEADERS_COLOR, topOfPoll } from './localPoll';
import { departmentName, PROJECTION_PENDING } from './readings';

// Fiche d'un département (phase 25) : implantation et palier, militants estimés (répartition
// du total national, affichage seul), cartes Terrain jouables ici. Phase 25 bis : le
// mini-sondage local, les cinq premiers de la projection simulée et le joueur, sur le modèle du
// tableau des intentions de vote de l'onglet Sondages.

/** Nombre de candidats du mini-sondage (le joueur s'ajoute s'il est plus loin). */
const TOP = 5;

/** Mini-sondage local : rang, candidat, part projetée et barre (la valeur écrite fait foi). */
function LocalPollTable({
  code,
  state,
  ruleset,
}: {
  code: string;
  state: GameState;
  ruleset: Ruleset;
}) {
  const poll = localPoll(state, code);
  if (!poll) return <p className="text-sm text-encre-carton-2">{PROJECTION_PENDING}</p>;
  const { top, extra } = topOfPoll(poll, TOP);
  const { colors } = leaderColors(state);
  const max = poll.leader.share;
  const rows = [...top, ...(extra ? [extra] : [])];
  return (
    <table
      aria-label={`Intentions de vote dans ${departmentName(ruleset, code)}, projection simulée`}
      className="w-full text-left text-sm"
    >
      <caption className="pb-1 text-left font-display text-base font-extrabold">
        Intentions de vote, projection simulée
      </caption>
      <thead>
        <tr className="text-xs text-encre-carton-2">
          <th scope="col" className="w-6 py-1 font-semibold">
            <span className="sr-only">Rang</span>
          </th>
          <th scope="col" className="py-1 font-semibold">
            Candidat
          </th>
          <th scope="col" className="py-1 pr-2 text-right font-semibold">
            Intentions
          </th>
          <th scope="col" className="w-1/4 py-1">
            <span className="sr-only">Barre</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry) => {
          const actor = state.actors[entry.actorId];
          return (
            <tr
              key={entry.actorId}
              data-joueur={entry.isPlayer ? 'oui' : undefined}
              className={`border-t border-trait/15 ${entry.isPlayer ? 'bg-or/30 font-bold' : ''} ${entry === extra ? 'border-dashed border-trait/40' : ''}`}
            >
              <td className="py-1 pl-1 tabular-nums">{entry.rank}</td>
              <td className="py-1 pr-2">
                <span className="flex items-center gap-2">
                  {actor && <Avatar portrait={portraitOf(actor, ruleset)} size="xs" />}
                  <span className="min-w-0">
                    {entry.nomComplet}
                    {entry.isPlayer && ' (vous)'}
                  </span>
                </span>
              </td>
              <td className="py-1 pr-2 text-right whitespace-nowrap tabular-nums">
                {formatLocal(entry.share)}
              </td>
              <td className="py-1 pr-1">
                <ShareBar
                  value={entry.share}
                  max={max}
                  emphasis={entry.isPlayer}
                  color={
                    entry.isPlayer
                      ? 'var(--color-or)'
                      : (colors.get(entry.actorId) ?? OTHER_LEADERS_COLOR)
                  }
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DepartmentSheet({
  code,
  state,
  ruleset,
  onPlay,
}: {
  code: string;
  state: GameState;
  ruleset: Ruleset;
  onPlay: (actionId: string) => void;
}) {
  const playerId = state.player.actorId;
  const player = playerId ? state.actors[playerId] : undefined;
  const map = playerId ? (state.implantation[playerId] ?? {}) : {};
  const value = map[code] ?? 0;
  const tier = implantationTier(value);
  const militants = player
    ? (militantsByDepartment(player.resources.militants, map, departmentInscrits(ruleset))[code] ??
      0)
    : 0;
  const presidency = state.meta.phase === 'presidence';
  const cards = (presidency ? ruleset.quinquennat.actions : ruleset.actions).filter(
    (a) => a.cible === 'departement',
  );
  const gain = (actionId: string) =>
    presidency ? ruleset.implantation.deplacementPresident : ruleset.implantation.gains[actionId];
  return (
    <section aria-labelledby={`fiche-${code}`} className="flex flex-col gap-3 text-encre-carton">
      <h3 id={`fiche-${code}`} className="text-2xl">
        {departmentName(ruleset, code)}
      </h3>
      {player && (
        <dl className="grid gap-1 text-sm">
          <dt className="sr-only">Implantation</dt>
          <dd className="font-display text-lg font-bold">
            Implantation {value} sur 100 — {tier.libelle}
          </dd>
          <dt className="sr-only">Militants</dt>
          <dd>Militants estimés : {militants.toLocaleString('fr-FR')}</dd>
        </dl>
      )}
      <LocalPollTable code={code} state={state} ruleset={ruleset} />
      {player && cards.length > 0 && (
        <ul aria-label="Cartes jouables ici" className="grid grid-cols-2 gap-2">
          {cards.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                className={`${carte} w-full text-left`}
                onClick={() => onPlay(card.id)}
                aria-label={`Jouer « ${card.libelle} » ici${gain(card.id) ? `, +${gain(card.id)} d’implantation` : ''}`}
              >
                <span
                  className={`px-2.5 py-1 font-display text-[0.7rem] font-extrabold ${bandeauFamille[card.famille ?? 'terrain']}`}
                >
                  {presidency ? 'Déplacement' : 'Terrain'}
                </span>
                <span className="px-2.5 pt-1.5 font-display text-sm font-bold leading-tight">
                  {card.libelle}
                </span>
                <span className="px-2.5 pb-2 text-xs text-encre-carton-2">
                  {gain(card.id) ? `+${gain(card.id)} d’implantation` : 'Parrainages'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
