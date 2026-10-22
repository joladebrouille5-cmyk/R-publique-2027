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
  | 'carte_invalide';

export class EngineInputError extends Error {
  constructor(
    readonly code: EngineInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineInputError';
  }
}
