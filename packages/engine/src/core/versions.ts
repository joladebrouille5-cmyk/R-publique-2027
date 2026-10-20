/** Version du moteur, enregistrée dans chaque partie et chaque sauvegarde (§11). */
export const ENGINE_VERSION = '0.1.0';

/** Version du format de `GameState` ; toute évolution s'accompagne d'une migration. */
export const SAVE_SCHEMA_VERSION = 1;

/**
 * Jeu de règles chargé. Phase 1 : socle sans règles électorales ; le jeu de règles
 * `presidentielle-2027` (dates, parrainages, plafonds) arrive en phase 2.
 */
export const RULESET_VERSION = 'socle@0.1.0';
