import { Play } from 'lucide-react';
import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CUES, JINGLES } from '../audio/jingles';
import { MUSIC } from '../audio/manifest';
import { sound } from '../audio/systeme';
import { soundSettings, useSoundStore } from '../stores/son';
import { buttonSecondary, label } from './ui';

// Réglages du son dans Paramètres (phase 19) : tout couper, musique et jingles (activés et
// volume), écoute de chaque jingle ; crédits de la musique (licence CC BY : titre, auteur,
// licence, source et modifications).

const percent = (value: number) => `${Math.round(value * 100)} %`;

function Volume({
  text,
  value,
  disabled,
  onChange,
}: {
  text: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <label htmlFor={id} className={`${label} w-44`}>
        {text}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        disabled={disabled}
        aria-valuetext={percent(value)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-11 w-full max-w-xs accent-or-600 disabled:opacity-50 dark:accent-dorure"
      />
      <output htmlFor={id} className="w-12 text-sm tabular-nums">
        {percent(value)}
      </output>
    </div>
  );
}

function Check({
  text,
  checked,
  onChange,
}: {
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-or-600 dark:accent-dorure"
      />
      {text}
    </label>
  );
}

export function SoundSettings() {
  const settings = useSoundStore(useShallow(soundSettings));
  const set = useSoundStore((state) => state.set);
  const { coupe } = settings;
  return (
    <div className="space-y-5">
      <Check
        text="Couper tout le son"
        checked={coupe}
        onChange={(value) => set({ coupe: value })}
      />
      <fieldset className="space-y-1" disabled={coupe}>
        <legend className="font-semibold">Musique d’ambiance</legend>
        <Check
          text="Musique"
          checked={settings.musique}
          onChange={(value) => set({ musique: value })}
        />
        <Volume
          text="Volume de la musique"
          value={settings.volumeMusique}
          disabled={coupe || !settings.musique}
          onChange={(value) => set({ volumeMusique: value })}
        />
      </fieldset>
      <fieldset className="space-y-1" disabled={coupe}>
        <legend className="font-semibold">Jingles des moments forts</legend>
        <Check
          text="Jingles"
          checked={settings.jingles}
          onChange={(value) => set({ jingles: value })}
        />
        <Volume
          text="Volume des jingles"
          value={settings.volumeJingles}
          disabled={coupe}
          onChange={(value) => set({ volumeJingles: value })}
        />
        <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/[0.07] dark:border-white/[0.07]">
          {CUES.map((cue) => (
            <li key={cue} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <button
                type="button"
                onClick={() => sound().preview(cue)}
                className={`${buttonSecondary} w-full justify-start sm:w-72`}
              >
                <Play aria-hidden="true" className="size-4" />
                Écouter « {JINGLES[cue].libelle} »
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {JINGLES[cue].quand}
              </span>
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {coupe ? 'Le son est coupé : rétablissez-le pour écouter les jingles. ' : ''}
        Le son démarre à votre premier geste et se coupe quand le jeu passe en arrière-plan. La
        musique vient de fichiers sous licence libre, embarqués dans le jeu (crédits ci-dessous) ;
        les jingles sont fabriqués par le jeu.
      </p>
    </div>
  );
}

const external = { target: '_blank', rel: 'noreferrer', className: 'underline' } as const;

/** Crédits de la musique : titre, auteur, licence, fichier source, modifications. */
export function MusicCredits() {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600 dark:text-slate-400">{MUSIC.note}</p>
      <ul className="space-y-2">
        {MUSIC.morceaux.map((track) => (
          <li key={track.id}>
            « {track.titre} » — {track.auteur} (incompetech.com), licence{' '}
            {track.licenceUrl ? (
              <a href={track.licenceUrl} {...external}>
                {track.licence}
              </a>
            ) : (
              track.licence
            )}{' '}
            ;{' '}
            <a href={track.source} {...external}>
              fichier sur Wikimedia Commons
            </a>{' '}
            ; modifications : {track.modifications}
          </li>
        ))}
      </ul>
    </div>
  );
}
