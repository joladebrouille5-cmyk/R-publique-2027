/** Libellés des 12 étapes du cycle hebdomadaire (§2), dans l'ordre stable et documenté. */
export const WEEKLY_STEPS = [
  { step: 1, module: 'campagne', label: 'Valider les actions' },
  { step: 2, module: 'campagne', label: 'Consommer les ressources' },
  { step: 3, module: 'ia', label: 'Calculer les décisions adverses' },
  { step: 4, module: 'ia', label: 'Mettre à jour alliances et relations' },
  { step: 5, module: 'evenements', label: 'Résoudre les événements et les effets des actions' },
  { step: 6, module: 'opinion', label: 'Mettre à jour médias et opinion' },
  { step: 7, module: 'economie', label: 'Calculer indicateurs économiques et sociaux' },
  { step: 8, module: 'election', label: 'Mettre à jour intentions de vote' },
  { step: 9, module: 'calendrier', label: 'Vérifier échéances' },
  { step: 10, module: 'journal', label: 'Générer le journal' },
  { step: 11, module: 'sauvegarde', label: 'Sauvegarder' },
  { step: 12, module: 'bilan', label: 'Afficher le bilan hebdomadaire' },
] as const;
