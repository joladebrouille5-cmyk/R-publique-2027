import {
  supportsOf,
  type AchievementDefinition,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { meetsThreshold } from '../campaign/parrainages';
import { weekReaches } from '../presidency/dates';
import { postExpertise } from '../presidency/members';
import { membersMajority } from '../presidency/parliament';

// Succès (phase 15, idée I9) : jalons de la partie du joueur, débloqués une fois, évalués à la
// fin de chaque semaine sur l'état (conditions nommées du jeu de règles, seuils compris).
// Convention du jeu, sans valeur d'évaluation réelle ; aucun succès en mode observateur.

function satisfied(
  state: GameState,
  ruleset: Ruleset,
  achievement: AchievementDefinition,
  playerId: string,
): boolean {
  const player = state.actors[playerId]!;
  const seuil = achievement.seuil ?? 1;
  const quinquennat = state.quinquennat;
  const presides = quinquennat?.mandat.presidentId === playerId;
  const since = quinquennat?.depart.semaine ?? 0;
  const parliament = state.parlement;
  // Mandats achevés du joueur (bilans archivés).
  const archived = state.historique.quinquennats.filter((q) => q.mandat.presidentId === playerId);
  switch (achievement.condition) {
    case 'parrainages-seuil':
      return meetsThreshold(player.parrainages, ruleset);
    case 'parrainages-departements':
      return Object.values(player.parrainages.validees).filter((n) => n > 0).length >= seuil;
    case 'soutiens':
      return supportsOf(state, playerId).length >= seuil;
    case 'ralliement':
      return state.alliances.some((a) => a.vers === playerId);
    case 'qualifie':
      return player.status === 'qualifie' || player.status === 'elu' || presides;
    case 'elu':
      return presides;
    case 'reelu':
      return presides && quinquennat!.mandat.numero >= 2;
    case 'gouvernement-experts': {
      const government = presides ? quinquennat!.gouvernement : null;
      return (
        government !== null &&
        government.ministres.filter((m) => postExpertise(ruleset, m, m.posteId)).length >= seuil
      );
    }
    case 'majorite-absolue': {
      if (!presides || !parliament) return false;
      const supporters = Object.values(parliament.groupes)
        .filter((g) => g.alignement === 'soutien')
        .reduce((sum, g) => sum + g.sieges, 0);
      return supporters >= membersMajority(parliament);
    }
    case 'coalition':
      return presides && parliament?.coalition != null;
    case 'texte-sans-49-3':
      return (
        presides &&
        (parliament?.textes ?? []).some(
          (t) => t.etape === 'adopte' && t.procedure === 'ordinaire' && t.deposeSemaine >= since,
        )
      );
    case 'sans-censure':
      return archived.some((q) => q.gouvernements.every((g) => g.motif !== 'motion de censure'));
    case 'qag-sang-froid':
      return presides && (parliament?.qag ?? []).filter((s) => s.tension < 0).length >= seuil;
    case 'gestion-crises': {
      if (!presides) return false;
      const ids = [...ruleset.crises.map((c) => c.id), ...ruleset.urgences.liste.map((u) => u.id)];
      return ids.filter((id) => (state.eventHistory[id]?.lastWeek ?? -1) >= since).length >= seuil;
    }
    case 'objectifs':
      return archived.some(
        (q) =>
          q.bilan.note !== null &&
          q.bilan.note.objectifs.length > 0 &&
          q.bilan.note.objectifs.every((o) => o.atteint),
      );
    case 'note':
      return archived.some((q) => q.bilan.note !== null && q.bilan.note.valeur >= seuil);
    case 'popularite':
      return (
        presides &&
        weekReaches(state.meta.date, quinquennat!.mandat.debut) &&
        player.resources.popularite >= seuil
      );
    case 'deplacements':
      return presides && Object.keys(quinquennat!.deplacements).length >= seuil;
  }
}

/**
 * Succès débloqués à la fin de la semaine `week` (une seule fois chacun, dans l'ordre du jeu de
 * règles) : enregistrés dans l'état ; renvoie leurs identifiants pour le bilan.
 */
export function unlockAchievements(state: GameState, ruleset: Ruleset, week: number): string[] {
  const playerId = state.player.actorId;
  if (!playerId || !state.actors[playerId]) return [];
  const done = new Set(state.succes.map((s) => s.id));
  const unlocked: string[] = [];
  for (const achievement of ruleset.succes.liste) {
    if (done.has(achievement.id) || !satisfied(state, ruleset, achievement, playerId)) continue;
    state.succes.push({ id: achievement.id, semaine: week });
    unlocked.push(achievement.id);
  }
  return unlocked;
}
