/** Entrée refusée par le moteur (requête du joueur incohérente avec l'état de la partie). */
export type EngineInputErrorCode =
  | 'progression_bloquee'
  | 'decision_requise'
  | 'decision_inconnue'
  | 'option_inconnue'
  | 'decision_en_double'
  | 'actions_interdites'
  | 'trop_d_actions'
  | 'debat_introuvable'
  | 'debat_termine'
  | 'debat_non_invite'
  | 'sequence_perimee'
  | 'carte_invalide'
  | 'soutiens_indisponibles';

export class EngineInputError extends Error {
  constructor(
    readonly code: EngineInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineInputError';
  }
}

/** Statut HTTP d'une entrée refusée (API et moteur local de l'application, même contrat). */
export function inputErrorStatus(code: EngineInputErrorCode): number {
  if (code === 'debat_introuvable') return 404;
  if (
    code === 'progression_bloquee' ||
    code === 'debat_termine' ||
    code === 'sequence_perimee' ||
    code === 'soutiens_indisponibles'
  )
    return 409;
  return 422;
}
