import type { ResourceKey, Ruleset } from '@r2027/shared';
import { useCurrentRuleset } from '../../api/hooks';
import { ErrorMessage } from '../../components/ErrorMessage';
import { input, label, optionTile, radio } from '../../components/ui';
import { describePosition, formatDelta, RESOURCE_LABELS } from '../../labels';
import { familyOf } from '../../portraits';
import { Compass } from './Compass';
import { PhotoPicker } from './PhotoPicker';

export type CandidateDraft = {
  prenom: string;
  nom: string;
  parti: string;
  economie: number;
  societe: number;
  parcours: string;
  profilId: string | null;
  /** Photo importée, réduite sur l'appareil (URL de données), ou null (portrait illustré). */
  photo: string | null;
};

export const EMPTY_CANDIDATE: CandidateDraft = {
  prenom: '',
  nom: '',
  parti: '',
  economie: 0,
  societe: 0,
  parcours: '',
  profilId: null,
  photo: null,
};

type Props = { value: CandidateDraft; onChange: (next: CandidateDraft) => void };

/** Les trois groupes d'électeurs les plus proches du positionnement choisi (hypothèse de jeu). */
function nearestGroups(ruleset: Ruleset, draft: CandidateDraft) {
  return [...ruleset.electorat.groupes]
    .map((group) => ({
      group,
      distance: Math.hypot(
        group.position.economie - draft.economie,
        group.position.societe - draft.societe,
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ group }) => group.libelle);
}

/** Création du candidat du joueur (§1.2) : identité, parti, photo et positionnement. */
export function CandidateForm({ value, onChange }: Props) {
  const ruleset = useCurrentRuleset();
  const set = <K extends keyof CandidateDraft>(key: K, next: CandidateDraft[K]) =>
    onChange({ ...value, [key]: next });

  const text = (
    key: 'prenom' | 'nom' | 'parti',
    caption: string,
    max: number,
    required = false,
  ) => (
    <div className="space-y-1">
      <label htmlFor={`candidat-${key}`} className={label}>
        {caption}
        {required && <span className="text-red-700 dark:text-red-400"> *</span>}
      </label>
      <input
        id={`candidat-${key}`}
        className={input}
        value={value[key]}
        maxLength={max}
        required={required}
        onChange={(event) => set(key, event.target.value)}
      />
    </div>
  );

  const slider = (key: 'economie' | 'societe', caption: string, left: string, right: string) => (
    <div className="space-y-1">
      <label htmlFor={`candidat-${key}`} className={label}>
        {caption} : <span className="font-semibold">{value[key]}</span>
      </label>
      <input
        id={`candidat-${key}`}
        type="range"
        min={-100}
        max={100}
        step={5}
        value={value[key]}
        onChange={(event) => set(key, Number(event.target.value))}
        className="w-full accent-republique-600 dark:accent-dorure"
        aria-valuetext={`${value[key]} (${value[key] < 0 ? left : value[key] > 0 ? right : 'centre'})`}
      />
      <span className="flex justify-between text-xs text-encre-2">
        <span>−100 : {left}</span>
        <span>+100 : {right}</span>
      </span>
    </div>
  );

  return (
    <fieldset className="space-y-6">
      {/* Le titre du chapitre est visible au-dessus ; la légende nomme le groupe. */}
      <legend className="sr-only">Votre candidat</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('prenom', 'Prénom', 40)}
        {text('nom', 'Nom', 60, true)}
      </div>
      {text('parti', 'Parti ou mouvement', 80, true)}
      <PhotoPicker
        prenom={value.prenom}
        nom={value.nom}
        famille={familyOf({ economie: value.economie, societe: value.societe }, ruleset.data)}
        value={value.photo}
        onChange={(photo) => set('photo', photo)}
      />

      <div className="grid items-center gap-5 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[15rem] sm:max-w-none">
          <Compass
            economie={value.economie}
            societe={value.societe}
            ruleset={ruleset.data}
            onChange={(economie, societe) => onChange({ ...value, economie, societe })}
          />
        </div>
        <div className="space-y-5">
          {slider('economie', 'Positionnement économique', 'gauche', 'droite')}
          {slider('societe', 'Positionnement sociétal', 'progressiste', 'conservateur')}
        </div>
      </div>
      <p className="text-sm text-encre-2">
        {describePosition({ economie: value.economie, societe: value.societe })}
        {ruleset.data && (
          <>
            <br />
            Électorats les plus proches : {nearestGroups(ruleset.data, value).join(', ')} (groupes
            d’électeurs simulés, hypothèse de jeu ; sur la boussole, chaque disque est un groupe, à
            la taille de son poids).
          </>
        )}
      </p>

      <div className="space-y-1">
        <label htmlFor="candidat-parcours" className={label}>
          Biographie (facultative)
        </label>
        <textarea
          id="candidat-parcours"
          className={input}
          rows={2}
          maxLength={500}
          value={value.parcours}
          onChange={(event) => set('parcours', event.target.value)}
        />
      </div>
    </fieldset>
  );
}

/**
 * Parcours du candidat (phase 20, ancien « profil de départ ») : d'où il vient en politique, avec
 * ses écarts de moyens de départ (hypothèses du jeu de règles).
 */
export function ProfilePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (profilId: string | null) => void;
}) {
  const ruleset = useCurrentRuleset();
  return (
    <fieldset className="space-y-2">
      <legend className={label}>Votre parcours</legend>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p className="text-sm">Chargement des profils…</p>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {[null, ...(ruleset.data?.profilsDeDepart ?? [])].map((profile) => (
          <label key={profile?.id ?? 'aucun'} className={optionTile}>
            <input
              type="radio"
              name="profil"
              value={profile?.id ?? ''}
              checked={value === (profile?.id ?? null)}
              onChange={() => onChange(profile?.id ?? null)}
              className={radio}
            />
            <span>
              <span className="font-semibold">
                {profile?.libelle ?? 'Sans parcours particulier'}
              </span>
              <span className="block text-xs text-encre-2">
                {profile
                  ? `${profile.description} ${Object.entries(profile.modificateurs)
                      .map(
                        ([key, delta]) =>
                          `${RESOURCE_LABELS[key as ResourceKey]} ${formatDelta(key as ResourceKey, delta ?? 0)}`,
                      )
                      .join(', ')}.`
                  : 'Ressources de départ de la difficulté choisie, sans modification.'}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
