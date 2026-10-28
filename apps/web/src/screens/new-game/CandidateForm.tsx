import type { ResourceKey, Ruleset } from '@r2027/shared';
import { useCurrentRuleset } from '../../api/hooks';
import { ErrorMessage } from '../../components/ErrorMessage';
import { input, label } from '../../components/ui';
import { describePosition, formatDelta, RESOURCE_LABELS } from '../../labels';
import { familyOf } from '../../portraits';
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

/** Création du candidat du joueur (§1.2) : identité, parti, positionnement et profil de départ. */
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
        className="w-full accent-republique-600"
        aria-valuetext={`${value[key]} (${value[key] < 0 ? left : value[key] > 0 ? right : 'centre'})`}
      />
      <span className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>−100 : {left}</span>
        <span>+100 : {right}</span>
      </span>
    </div>
  );

  return (
    <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <legend className="px-1 text-base font-semibold">Votre candidat</legend>
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

      <div className="grid gap-4 sm:grid-cols-2">
        {slider('economie', 'Positionnement économique', 'gauche', 'droite')}
        {slider('societe', 'Positionnement sociétal', 'progressiste', 'conservateur')}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {describePosition({ economie: value.economie, societe: value.societe })}
        {ruleset.data && (
          <>
            <br />
            Électorats les plus proches : {nearestGroups(ruleset.data, value).join(', ')} (groupes
            d’électeurs simulés, hypothèse de jeu).
          </>
        )}
      </p>

      <div className="space-y-1">
        <label htmlFor="candidat-parcours" className={label}>
          Parcours (facultatif)
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

      <fieldset className="space-y-2">
        <legend className={label}>Profil de départ</legend>
        {ruleset.isError && (
          <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
        )}
        {ruleset.isPending && <p className="text-sm">Chargement des profils…</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {[null, ...(ruleset.data?.profilsDeDepart ?? [])].map((profile) => (
            <label
              key={profile?.id ?? 'aucun'}
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <input
                type="radio"
                name="profil"
                value={profile?.id ?? ''}
                checked={value.profilId === (profile?.id ?? null)}
                onChange={() => set('profilId', profile?.id ?? null)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{profile?.libelle ?? 'Sans profil particulier'}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">
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
    </fieldset>
  );
}
