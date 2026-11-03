// Plateforme d'exécution de l'interface : navigateur relié au serveur, ou application mobile
// hors ligne (phase 8). Seules diffèrent la façon d'enregistrer un fichier et l'annonce de
// l'état du « serveur » ; les écrans et le contrat d'API sont identiques.

export type Platform = {
  kind: 'web' | 'local';
  /** Enregistre un fichier produit par l'application (export d'une partie). */
  saveFile: (fileName: string, content: string) => Promise<void>;
  /** Avertissement durable sur le stockage de l'appareil (affiché en pied de page), ou null. */
  storageNotice: string | null;
  /**
   * Passage de l'application au premier plan (true) ou en arrière-plan (false), quand la
   * plateforme le signale (application Android) ; renvoie de quoi se désabonner.
   */
  onActiveChange?: (listener: (active: boolean) => void) => () => void;
};

/** Téléchargement dans le navigateur (lien temporaire vers un Blob). */
export async function browserDownload(fileName: string, content: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

let current: Platform = { kind: 'web', saveFile: browserDownload, storageNotice: null };

export function platform(): Platform {
  return current;
}

export function setPlatform(next: Platform): void {
  current = next;
}
