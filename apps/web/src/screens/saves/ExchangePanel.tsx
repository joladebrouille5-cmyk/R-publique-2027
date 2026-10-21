import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { useImportGame } from '../../api/hooks';
import { platform } from '../../platform';
import { ErrorMessage } from '../../components/ErrorMessage';
import { buttonSecondary, card, label } from '../../components/ui';

const MAX_FILE_BYTES = 1024 * 1024;

/** Export JSON versionné et import dans une nouvelle partie (jamais d'écrasement). */
export function ExchangePanel({ gameId }: { gameId: string }) {
  const navigate = useNavigate();
  const importGame = useImportGame();
  const [fileError, setFileError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);

  // Application mobile : l'export est produit sur l'appareil puis enregistré ou partagé.
  const onExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { body, fileName } = await api.file(`/api/games/${gameId}/export`);
      await platform().saveFile(fileName ?? 'republique-2027-partie.json', JSON.stringify(body));
    } catch (error) {
      setExportError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    importGame.reset();
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError('Fichier trop volumineux (1 Mo au maximum).');
      return;
    }
    let document: unknown;
    try {
      document = JSON.parse(await file.text());
    } catch {
      setFileError('Ce fichier n’est pas un JSON lisible.');
      return;
    }
    importGame.mutate(document, {
      onSuccess: (game) => void navigate(`/parties/${game.id}/tableau-de-bord`),
    });
  };

  return (
    <section aria-labelledby="titre-echange" className={`${card} space-y-4`}>
      <h2 id="titre-echange" className="text-lg font-semibold">
        Exporter ou importer
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        L’export produit un fichier JSON versionné contenant l’état complet et son empreinte.
        L’import crée toujours une <strong>nouvelle</strong> partie : aucune partie existante n’est
        écrasée, et un fichier modifié ou corrompu est refusé.
      </p>
      {platform().kind === 'web' ? (
        <a href={`/api/games/${gameId}/export`} download className={buttonSecondary}>
          Exporter la partie (JSON)
        </a>
      ) : (
        <button
          type="button"
          className={buttonSecondary}
          disabled={exporting}
          onClick={() => void onExport()}
        >
          {exporting ? 'Export…' : 'Exporter la partie (JSON)'}
        </button>
      )}
      {exportError && <ErrorMessage error={exportError} />}
      <div className="space-y-1">
        <label htmlFor="import" className={label}>
          Importer un fichier de partie
        </label>
        <input
          id="import"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void onFile(event)}
          disabled={importGame.isPending}
          className="block w-full text-sm"
        />
      </div>
      {importGame.isPending && <p className="text-sm">Vérification et import…</p>}
      {fileError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {fileError}
        </p>
      )}
      {importGame.isError && <ErrorMessage error={importGame.error} />}
    </section>
  );
}
