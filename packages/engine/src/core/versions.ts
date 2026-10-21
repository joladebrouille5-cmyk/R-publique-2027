/** Version du moteur, enregistrée dans chaque partie et chaque sauvegarde (§11). */
export const ENGINE_VERSION = '0.5.0';

/**
 * Version du format de `GameState` ; toute évolution s'accompagne d'une migration
 * (packages/save-engine). 1 : phase 1 ; 2 : phase 2 (ressources, effets, décisions) ;
 * 3 : phase 3 (candidats, opinion, sondages, élections) ; 4 : phase 4 (résultats territoriaux) ;
 * 5 : phase 5 (programme, parrainages, compte de campagne, médias, relations et alliances).
 */
export const SAVE_SCHEMA_VERSION = 5;
