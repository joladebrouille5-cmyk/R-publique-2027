import { ImagePlus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { buttonGhost, label } from '../../components/ui';
import type { Family } from '../../portraits';
import { PhotoError, preparePhoto } from './photo';

// Photo du candidat personnalisé (phase 13) : facultative. Sans photo, le candidat reçoit un
// portrait illustré généré à partir de son nom.

export function PhotoPicker({
  prenom,
  nom,
  famille,
  value,
  onChange,
}: {
  prenom: string;
  nom: string;
  famille: Family | null;
  value: string | null;
  onChange: (photo: string | null) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const portrait = {
    prenom,
    nom,
    photo: value,
    famille,
    illustration: `personnalise:${prenom} ${nom}`,
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await preparePhoto(file));
    } catch (failure) {
      setError(
        failure instanceof PhotoError
          ? failure.message
          : 'La photo n’a pas pu être préparée : choisissez une autre image.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className={label} id={`${id}-titre`}>
        Photo du candidat (facultative)
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar
          portrait={portrait}
          size="xl"
          shape="affiche"
          ring
          alt={value ? 'Photo choisie pour le candidat' : ''}
        />
        <div className="flex flex-wrap gap-2">
          <input
            id={`${id}-fichier`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="peer sr-only"
            aria-describedby={`${id}-aide`}
            disabled={busy}
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <label
            htmlFor={`${id}-fichier`}
            className={`${buttonGhost} cursor-pointer border border-slate-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-republique-500 dark:border-white/15 dark:peer-focus-visible:outline-dorure`}
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            {busy ? 'Préparation…' : value ? 'Changer de photo' : 'Importer une photo'}
          </label>
          {value && (
            <button
              type="button"
              className={buttonGhost}
              onClick={() => {
                onChange(null);
                setError(null);
              }}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Retirer la photo
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <p id={`${id}-aide`} className="text-xs text-slate-600 dark:text-slate-400">
        JPEG, PNG ou WebP. L’image est recadrée et réduite sur votre appareil (256 × 256 px, 100 Ko
        au plus), puis conservée avec la partie (sauvegardes et export compris). Sans photo, votre
        candidat reçoit un portrait illustré.
      </p>
    </div>
  );
}
