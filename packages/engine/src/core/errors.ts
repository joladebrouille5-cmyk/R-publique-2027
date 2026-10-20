/** Entrée refusée par le moteur (requête du joueur incohérente avec l'état de la partie). */
export type EngineInputErrorCode =
  | 'progression_bloquee'
  | 'decision_requise'
  | 'decision_inconnue'
  | 'option_inconnue'
  | 'decision_en_double'
  | 'actions_interdites'
  | 'trop_d_actions';

export class EngineInputError extends Error {
  constructor(
    readonly code: EngineInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineInputError';
  }
}
