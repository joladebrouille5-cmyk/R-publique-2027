import { ACTIFS } from '../scenes3d/actifs';

// Crédits des scènes 3D (phase 26) : la photographie de l'Élysée (Wikimedia Commons, licence
// libre : auteur, licence et modifications affichés) et les textures et éclairages de Poly Haven
// (domaine public ; le crédit est tout de même donné). Lus dans le manifeste de l'import.

const external = { target: '_blank', rel: 'noreferrer' } as const;

export function SceneCredits() {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-encre-2">{ACTIFS.note}</p>
      {ACTIFS.plans.length > 0 && (
        <ul className="space-y-1" aria-label="Photographies de lieux">
          {ACTIFS.plans.map((plan) => (
            <li key={plan.id}>
              <a href={plan.source} {...external}>
                {plan.titre}
              </a>{' '}
              — photographie de {plan.auteur},{' '}
              {plan.licenceUrl ? (
                <a href={plan.licenceUrl} {...external}>
                  {plan.licence}
                </a>
              ) : (
                plan.licence
              )}{' '}
              (Wikimedia Commons). {plan.modifications} L’image ainsi modifiée reste sous la même
              licence.
            </li>
          ))}
        </ul>
      )}
      <ul className="space-y-1" aria-label="Textures et éclairages">
        {[...ACTIFS.matieres, ...ACTIFS.eclairages].map((actif) => (
          <li key={actif.id}>
            <a href={actif.source} {...external}>
              {actif.titre}
            </a>{' '}
            — {actif.auteurs} ;{' '}
            <a href={actif.licenceUrl} {...external}>
              {actif.licence}
            </a>{' '}
            (Poly Haven). {actif.modifications}
          </li>
        ))}
      </ul>
    </div>
  );
}
