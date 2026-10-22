import type { RealPersonality, Ruleset } from '@r2027/shared';
import { formatGameDate, POSITION_METHOD_LABELS } from '../labels';
import { portraitOfPersonality } from '../portraits';
import { Avatar } from './Avatar';
import { Badge } from './Badge';

// Personnalités politiques réelles (phase 5 bis) : photo créditée, fiche sourcée et rappel que
// leur comportement dans la partie est simulé. Aucun propos ne leur est attribué.

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
