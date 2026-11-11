import { useDecision3D, lireAppareil } from '../scenes3d/appareil';
import { detecterPalier, REGLAGES, type ChoixQualite } from '../scenes3d/qualite';
import { useQualiteStore } from '../stores/qualite';
import { optionTile, radio } from './ui';

// Qualité des scènes 3D dans Paramètres (phase 26) : automatique (palier détecté, abaissé si
// l'affichage rame), l'un des trois paliers forcé, ou jamais de 3D (versions 2D).

const RAISONS = {
  choix: 'les scènes 3D sont désactivées : le jeu affiche leurs versions 2D.',
  'mouvement-reduit':
    'votre appareil demande de réduire les animations : le jeu affiche les versions 2D et des écrans statiques.',
  webgl:
    'cet appareil n’offre pas l’accélération graphique nécessaire (WebGL) : le jeu affiche les versions 2D.',
  performances:
    'l’affichage restait sous 30 images par seconde : le jeu est repassé aux versions 2D pour cette session.',
} as const;

export function QualiteSettings() {
  const choix = useQualiteStore((s) => s.choix);
  const setChoix = useQualiteStore((s) => s.setChoix);
  const decision = useDecision3D();
  const detecte = detecterPalier(lireAppareil().appareil);
  const options: { value: ChoixQualite; label: string; detail: string }[] = [
    {
      value: 'auto',
      label: 'Automatique',
      detail: `Choisi d’après votre appareil (ici : ${REGLAGES[detecte].libelle.toLowerCase()}), abaissé si l’affichage rame.`,
    },
    ...(['eleve', 'standard', 'eco'] as const).map((palier) => ({
      value: palier,
      label: REGLAGES[palier].libelle,
      detail: REGLAGES[palier].aide,
    })),
    {
      value: '2d',
      label: 'Sans 3D',
      detail: 'Hémicycle, carte et transitions en 2D ; aucun rendu 3D.',
    },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-encre-2">
        La 3D marque les moments forts : questions au gouvernement, soirées électorales, débat,
        meetings, ralliement, investiture, écran-titre.
      </p>
      <div
        role="radiogroup"
        aria-label="Qualité des scènes 3D"
        className="grid gap-2.5 sm:grid-cols-2"
      >
        {options.map((option) => (
          <label key={option.value} className={optionTile}>
            <input
              type="radio"
              name="qualite-3d"
              value={option.value}
              checked={choix === option.value}
              onChange={() => setChoix(option.value)}
              className={radio}
            />
            <span className="min-w-0">
              <span className="block font-display font-bold [font-stretch:92%]">
                {option.label}
              </span>
              <span className="block text-xs text-encre-2">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <p role="status" className="text-sm">
        <strong>En ce moment : </strong>
        {decision.mode === '3d'
          ? `scènes 3D au palier ${REGLAGES[decision.palier].libelle.toLowerCase()}${decision.force ? ' (forcé)' : ''}.`
          : RAISONS[decision.raison]}
      </p>
    </div>
  );
}
