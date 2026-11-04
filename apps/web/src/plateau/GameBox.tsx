import type { GameDetail, Ruleset } from '@r2027/shared';
import { Link } from 'react-router';
import { GAME_SCREENS } from '../screens/registry';
import { SECTION_SCREENS, sectionStatus } from '../screens/sections';

// Boîte de jeu (phase 25) : tous les autres écrans en tuiles, selon la phase. Chaque tuile ouvre
// l'écran existant dans un panneau en carton, par-dessus le plateau.

/** Écrans du quinquennat : montrés dès qu'un quinquennat a commencé. */
const PRESIDENCY = new Set([
  'gouvernement',
  'conseil',
  'parlement',
  'economie',
  'crises',
  'legislatives',
  'bilan',
]);

/** Écrans de la boîte, dans l'ordre du registre. */
export function boxScreens(game: GameDetail) {
  const presidency =
    game.state.quinquennat !== null || game.state.historique.quinquennats.length > 0;
  return GAME_SCREENS.filter(
    (s) => s.path in SECTION_SCREENS && (presidency || !PRESIDENCY.has(s.path)),
  );
}

export function GameBox({
  game,
  ruleset,
  onOpen,
}: {
  game: GameDetail;
  ruleset: Ruleset | undefined;
  onOpen: (screen: string) => void;
}) {
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {boxScreens(game).map((s) => (
          <li key={s.path}>
            <button
              type="button"
              onClick={() => onOpen(s.path)}
              className="flex min-h-20 w-full flex-col items-start gap-1 rounded-carte border-2 border-bord-carte bg-carton p-3 text-left text-encre-carton shadow-carte transition active:translate-y-0.5"
            >
              <span className="font-display text-base leading-tight font-bold">{s.label}</span>
              <span className="text-xs leading-snug text-encre-carton-2">
                {sectionStatus(s.path, game, ruleset) ?? s.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        <Link to="../carte" className="underline">
          Carte électorale détaillée
        </Link>
        <Link to="../tableau-de-bord" className="underline">
          QG détaillé
        </Link>
        <Link to="/parametres" className="underline">
          Paramètres
        </Link>
      </p>
    </div>
  );
}
