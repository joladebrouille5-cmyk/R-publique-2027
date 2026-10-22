import type { RealPersonality, Ruleset } from '@r2027/shared';
import { POSITION_METHOD_LABELS } from '../labels';
import { portraitOfPersonality } from '../portraits';
import { Avatar } from './Avatar';
import { Badge } from './Badge';

// Personnalités politiques réelles (phase 5 bis) : photo, fiche et rappel que leur comportement
// dans la partie est simulé. Aucun propos ne leur est attribué. Crédits des photos et sources
// des fiches : Paramètres → Crédits (phase 11).

export const SIMULATION_NOTICE =
  'Personnalités réelles : leurs actions, stratégies, ralliements, intentions de vote et résultats dans cette partie sont simulés par le jeu ; ils ne décrivent ni ne prédisent rien de réel, et aucun propos ne leur est attribué.';

/** Photo sous licence libre, ou initiales sur la couleur de la famille politique. */
export function PersonalityPhoto({
  personality,
  ruleset,
  size = 'md',
}: {
  personality: RealPersonality;
  ruleset: Pick<Ruleset, 'electorat'> | undefined;
  size?: 'sm' | 'md';
}) {
  return (
    <Avatar
      portrait={portraitOfPersonality(personality, ruleset)}
      size={size === 'sm' ? 'md' : 'xl'}
      ring
      alt={`Portrait de ${personality.prenom} ${personality.nom}`}
    />
  );
}

/** Crédit de la photo (auteur, licence, fichier d'origine), exigé par sa licence. */
export function PhotoCreditLine({ personality }: { personality: RealPersonality }) {
  const { photo } = personality;
  if (!photo) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Sans photo : {personality.photoAbsente}
      </p>
    );
  }
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      Photo : {photo.auteur},{' '}
      {photo.licenceUrl ? (
        <a href={photo.licenceUrl} className="underline" target="_blank" rel="noreferrer">
          {photo.licence}
        </a>
      ) : (
        photo.licence
      )}
      , via{' '}
      <a href={photo.source} className="underline" target="_blank" rel="noreferrer">
        Wikimedia Commons
      </a>{' '}
      ({photo.modification.charAt(0).toLowerCase()}
      {photo.modification.slice(1, -1)}).{photo.choix && ` ${photo.choix}`}
    </p>
  );
}

/** Candidature datée (sa source figure dans Paramètres → Crédits). */
export function CandidacyLine({ personality }: { personality: RealPersonality }) {
  return <p className="text-sm">{personality.candidature.libelle}</p>;
}

/**
 * Fiche : fonctions, candidature, position et son statut (estimation ou hypothèse). Sources,
 * méthode détaillée et crédit de la photo : Paramètres → Crédits (phase 11).
 */
export function PersonalityFacts({ personality }: { personality: RealPersonality }) {
  const { position } = personality;
  return (
    <div className="space-y-2 text-sm">
      {personality.fonctions.length > 0 && (
        <ul className="list-inside list-disc text-slate-700 dark:text-slate-300">
          {personality.fonctions.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <CandidacyLine personality={personality} />
      <p>
        <Badge tone={position.statut === 'estimation' ? 'alerte' : 'danger'}>
          {position.statut === 'estimation' ? 'Estimation' : 'Hypothèse'}
        </Badge>{' '}
        Position dans le jeu : {POSITION_METHOD_LABELS[position.methode]}.
      </p>
    </div>
  );
}
