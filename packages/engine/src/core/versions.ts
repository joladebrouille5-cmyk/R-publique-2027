/** Version du moteur, enregistrée dans chaque partie et chaque sauvegarde (§11). */
export const ENGINE_VERSION = '0.17.0';

/**
 * Version du format de `GameState` ; toute évolution s'accompagne d'une migration
 * (packages/save-engine). 1 : phase 1 ; 2 : phase 2 (ressources, effets, décisions) ;
 * 3 : phase 3 (candidats, opinion, sondages, élections) ; 4 : phase 4 (résultats territoriaux) ;
 * 5 : phase 5 (programme, parrainages, compte de campagne, médias, relations et alliances) ;
 * 6 : phase 5 bis (personnalités réelles, jeu d'adversaires) ; 7 : phase 5 ter (médias réels,
 * interviews dans les émissions politiques) ; 8 : phase 6 (cycle électoral, présidence et
 * gouvernement, archives des cycles précédents) ; 9 : phase 6 (Assemblée nationale, textes,
 * votes par groupe, réformes) ; 10 : phase 6 (économie, crises) ; 11 : phase 6 (législatives) ;
 * 12 : phase 6 (bilan du quinquennat, présidentielle suivante, statut « inéligible ») ;
 * 13 : phase 7 (scénario de départ, conséquences durables) ; 14 : phase 9 (jauges Jeunesse et
 * Dynamique, publications simulées sur les réseaux et nouveaux médias) ; 15 : phase 10 (débats
 * télévisés) ; 16 : phase 11 (jeu de règles 13 : réactions, événements, plateaux, gouvernement) ;
 * 17 : phase 13 (jeu de règles 14 : tension parlementaire, frondeurs, motions spontanées,
 * coalition, alliances législatives, actions du chef de l'État, photo du candidat) ; 18 : phase
 * 14 (jeu de règles 15 : vivier de personnalités réelles, expertise ministérielle).
 */
export const SAVE_SCHEMA_VERSION = 18;
