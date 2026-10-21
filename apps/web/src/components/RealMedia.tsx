import type { RealOutlet } from '@r2027/shared';
import { formatCount } from '../labels';

// Médias réels (phase 5 ter) : logo crédité, mesure d'audience sourcée et rappel que la
// couverture des candidats et les interviews sont simulées. Aucune ligne éditoriale n'est
// prêtée à un média et aucun propos n'est attribué à un journaliste.

export const MEDIA_NOTICE =
  'Médias réels : audiences et temps de parole sont des mesures publiées (sources en bas de page). Dans la partie, la couverture des candidats et les interviews sont simulées : aucune ligne éditoriale n’est prêtée à un média, aucune question ni aucun propos n’est attribué à un journaliste.';

export const MEDIA_TYPE_LABELS = {
  television: 'Télévision',
  radio: 'Radio',
  presse: 'Presse écrite',
} as const;

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Mesure publiée : « part d'audience 13,9 % » ou « 2 794 000 lecteurs par numéro ». */
export function audienceLabel(outlet: RealOutlet): string {
  const { audience } = outlet;
  return audience.indicateur === 'part_audience'
    ? `part d’audience ${decimal.format(audience.valeur)} % (${audience.population}, ${audience.periode})`
    : `${formatCount(audience.valeur)} lecteurs par numéro (${audience.periode})`;
}

/** Durée cumulée en heures : « 628 h ». */
export const hoursLabel = (seconds: number) => `${formatCount(Math.round(seconds / 3600))} h`;

/** Logo sous licence libre, ou rien (le nom du média est affiché à côté). */
export function OutletLogo({ outlet }: { outlet: RealOutlet }) {
  if (!outlet.logo) return null;
  return (
    <img
      src={`${import.meta.env.BASE_URL}${outlet.logo.fichier}`}
      alt={`Logo de ${outlet.libelle}`}
      className="h-6 max-w-24 shrink-0 rounded-sm bg-white object-contain p-0.5"
      loading="lazy"
    />
  );
}

/** Crédit du logo (auteur, licence, fichier d'origine) ou motif de son absence. */
export function LogoCreditLine({ outlet }: { outlet: RealOutlet }) {
  const { logo } = outlet;
  if (!logo) return <>Sans logo : {outlet.logoAbsent}.</>;
  return (
    <>
      Logo : {logo.auteur},{' '}
      {logo.licenceUrl ? (
        <a href={logo.licenceUrl} className="underline" target="_blank" rel="noreferrer">
          {logo.licence}
        </a>
      ) : (
        logo.licence
      )}
      , via{' '}
      <a href={logo.source} className="underline" target="_blank" rel="noreferrer">
        Wikimedia Commons
      </a>{' '}
      ({logo.modification.charAt(0).toLowerCase()}
      {logo.modification.slice(1, -1)}) ; marque de son titulaire.
    </>
  );
}
