import { candidateName, type GameDetail, type Ruleset } from '@r2027/shared';
import type { ComponentType } from 'react';
import { spendingCapOf } from '../campaign';
import { formatEuros, formatGameDate, formatIndicator } from '../labels';
import { Bilan } from './Bilan';
import { Candidates } from './Candidates';
import { Crises } from './Crises';
import { Economy } from './Economy';
import { Finances } from './Finances';
import { Government, memberInfo } from './Government';
import { Journal } from './Journal';
import { Legislatives } from './Legislatives';
import { Medias } from './Medias';
import { Parliament } from './Parliament';
import { Polls } from './Polls';
import { Programme } from './Programme';
import { Results } from './Results';
import { Saves } from './Saves';

// Écrans présentés en sections dépliables (espaces) ou en tiroirs (QG), et leur ligne d'état :
// un résumé lu dans l'état servi par l'API, sans rien recalculer de la simulation.

export const SECTION_SCREENS: Record<string, ComponentType> = {
  programme: Programme,
  candidats: Candidates,
  medias: Medias,
  finances: Finances,
  sondages: Polls,
  resultats: Results,
  gouvernement: Government,
  parlement: Parliament,
  economie: Economy,
  crises: Crises,
  legislatives: Legislatives,
  bilan: Bilan,
  journal: Journal,
  sauvegardes: Saves,
};

const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  `${n} ${n > 1 ? pluralForm : singular}`;

/** Ligne d'état d'une section, ou null (la description de l'écran s'affiche alors). */
export function sectionStatus(
  path: string,
  game: GameDetail,
  ruleset: Ruleset | undefined,
): string | null {
  const { state } = game;
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const q = state.quinquennat;
  switch (path) {
    case 'programme':
      return actor
        ? `${plural(actor.programme.propositions.length, 'proposition annoncée', 'propositions annoncées')}`
        : null;
    case 'candidats': {
      const running = Object.values(state.actors).filter(
        (a) => a.status === 'candidat' || a.status === 'qualifie',
      ).length;
      return running > 0 ? `${plural(running, 'candidat en lice', 'candidats en lice')}` : null;
    }
    case 'medias':
      return state.medias
        ? `Couverture simulée de la semaine ${state.medias.semaine}`
        : 'Couverture calculée à la résolution de la semaine';
    case 'finances':
      return actor && ruleset
        ? `Dépenses : ${formatEuros(actor.finances.depenses)} sur ${formatEuros(spendingCapOf(state, actor, ruleset))}`
        : null;
    case 'sondages': {
      const last = state.polls.at(-1);
      return last
        ? `Dernier sondage : ${last.institute}, semaine ${last.week}`
        : 'Aucun sondage publié pour l’instant';
    }
    case 'resultats': {
      const t2 = state.elections.t2;
      if (t2?.winner && state.actors[t2.winner])
        return `${candidateName(state.actors[t2.winner]!.candidate)} élu(e) au second tour`;
      return state.elections.t1
        ? 'Premier tour dépouillé'
        : 'Aucun scrutin dépouillé pour l’instant';
    }
    case 'gouvernement':
      if (!q) return 'Après la présidentielle : nomination du gouvernement';
      return q.gouvernement && ruleset
        ? `Premier ministre : ${memberInfo(state, ruleset, q.gouvernement.premierMinistre).name}`
        : 'Matignon vacant';
    case 'parlement':
      return state.parlement
        ? `${plural(state.parlement.textes.filter((b) => !b.issue).length, 'texte en cours', 'textes en cours')}, ${plural(state.parlement.reformes.filter((r) => r.appliquee).length, 'réforme en vigueur', 'réformes en vigueur')}`
        : 'Assemblée nationale réelle ; textes après la présidentielle';
    case 'economie':
      return state.economie
        ? `Croissance ${formatIndicator('croissance', state.economie.indicateurs.croissance ?? 0)}, chômage ${formatIndicator('chomage', state.economie.indicateurs.chomage ?? 0)}`
        : 'Simulée pendant le quinquennat';
    case 'crises': {
      const count = Object.keys(state.eventHistory).filter((id) => id.startsWith('crise-')).length;
      return count > 0
        ? `${plural(count, 'crise survenue', 'crises survenues')}`
        : 'Aucune crise survenue';
    }
    case 'legislatives': {
      const next = state.legislatives?.prochaine;
      return next
        ? `Premier tour le ${formatGameDate(next.t1)}`
        : 'Assemblée élue en 2024 ; législatives simulées après une dissolution';
    }
    case 'bilan': {
      const done = state.historique.quinquennats.length;
      return done > 0
        ? `${plural(done, 'quinquennat achevé', 'quinquennats achevés')}`
        : 'Aucun quinquennat achevé';
    }
    case 'journal':
      return 'Actions, événements et facteurs, semaine après semaine';
    case 'sauvegardes':
      return 'Sauvegarde automatique chaque semaine ; export et import';
    default:
      return null;
  }
}
