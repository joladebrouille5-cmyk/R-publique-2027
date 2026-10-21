import type { PhotoCredit, RealPersonality } from '@r2027/shared';
import { formatGameDate, POSITION_METHOD_LABELS } from '../labels';
import { Badge } from './Badge';

// Personnalités politiques réelles (phase 5 bis) : photo créditée, fiche sourcée et rappel que
// leur comportement dans la partie est simulé. Aucun propos ne leur est attribué.

export const SIMULATION_NOTICE =
  'Personnalités réelles : leurs actions, stratégies, ralliements, intentions de vote et résultats dans cette partie sont simulés par le jeu ; ils ne décrivent ni ne prédisent rien de réel, et aucun propos ne leur est attribué.';

const photoUrl = (photo: PhotoCredit) => `${import.meta.env.BASE_URL}${photo.fichier}`;

const initials = (p: Pick<RealPersonality, 'prenom' | 'nom'>) =>
  `${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase();

/** Photo sous licence libre, ou initiales si aucune photo libre n'a pu être reprise. */
export function PersonalityPhoto({
  personality,
  size = 'md',
}: {
  personality: RealPersonality;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'h-14 w-11' : 'h-24 w-[4.5rem]';
  return personality.photo ? (
    <img
      src={photoUrl(personality.photo)}
      alt={`Portrait de ${personality.prenom} ${personality.nom}`}
      className={`${box} shrink-0 rounded-md bg-slate-100 object-cover object-top dark:bg-slate-800`}
      loading="lazy"
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${box} flex shrink-0 items-center justify-center rounded-md bg-slate-200 text-lg font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100`}
    >
      {initials(personality)}
    </span>
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
      {photo.modification.slice(1, -1)}).
    </p>
  );
}

/** Candidature datée et sa source (média et lien), sans reprendre le titre de l'article. */
export function CandidacyLine({ personality }: { personality: RealPersonality }) {
  const { candidature } = personality;
  return (
    <p className="text-sm">
      {candidature.libelle}{' '}
      <span className="text-slate-600 dark:text-slate-400">
        Source :{' '}
        <a href={candidature.source.url} className="underline" target="_blank" rel="noreferrer">
          {candidature.source.site ?? 'référence de presse'}
        </a>
        .
      </span>
    </p>
  );
}

/** Fiche sourcée : fonctions, candidature, position estimée et sa méthode, liens. */
export function PersonalityFacts({
  personality,
  verifieLe,
}: {
  personality: RealPersonality;
  /** Date de l'importation des fiches (jeu de règles). */
  verifieLe: string;
}) {
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
        Position dans le jeu : {POSITION_METHOD_LABELS[position.methode]}. {position.detail}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Faits relevés le {formatGameDate(verifieLe)} dans l’
        <a href={personality.article} className="underline" target="_blank" rel="noreferrer">
          article Wikipédia
        </a>
        {personality.wikidata && (
          <>
            {' '}
            et sur{' '}
            <a
              href={`https://www.wikidata.org/wiki/${personality.wikidata}`}
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              Wikidata
            </a>
          </>
        )}
        .
      </p>
      <PhotoCreditLine personality={personality} />
    </div>
  );
}
