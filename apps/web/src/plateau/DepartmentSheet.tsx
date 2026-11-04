import {
  candidateName,
  departmentInscrits,
  implantationTier,
  militantsByDepartment,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { carte, bandeauFamille } from '../components/ui';
import { departmentName, percent, PROJECTION_PENDING } from './readings';

// Fiche d'un département (phase 25) : implantation et palier, militants estimés (répartition
// du total national, affichage seul), projection simulée, cartes Terrain jouables ici.

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
  const local = state.opinion?.departements[code];
  const leader = local
    ? Object.entries(local).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
    : undefined;
  const nameOf = (id: string) => {
    const actor = state.actors[id];
    return actor ? candidateName(actor.candidate) : id;
  };
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
          <dt className="sr-only">Projection</dt>
          <dd>
            {local && leader && playerId ? (
              <>
                Sondage local (projection simulée) : vous {percent(local[playerId] ?? 0)} ; en tête
                : {leader[0] === playerId ? 'vous' : nameOf(leader[0])} {percent(leader[1])}
              </>
            ) : (
              PROJECTION_PENDING
            )}
          </dd>
        </dl>
      )}
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
