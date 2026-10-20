/** Version du moteur, enregistrée dans chaque partie et chaque sauvegarde (§11). */
export const ENGINE_VERSION = '0.3.0';

/**
 * Version du format de `GameState` ; toute évolution s'accompagne d'une migration
 * (packages/save-engine). 1 : phase 1 ; 2 : phase 2 (ressources, effets, décisions) ;
 * 3 : phase 3 (candidats, opinion, sondages, élections).
 */
export const SAVE_SCHEMA_VERSION = 3;
