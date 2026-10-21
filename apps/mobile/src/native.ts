import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { browserDownload } from '../../web/src/platform';

// Export d'une partie depuis l'application : fichier écrit dans le cache de l'application,
// puis feuille de partage Android (Fichiers, Drive, messagerie…). Dans un navigateur (aperçu
// de développement), simple téléchargement.

/** Nom de fichier sans séparateur de chemin ni caractère spécial. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'republique-2027-partie.json';
}

export async function saveOrShareFile(fileName: string, content: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return browserDownload(fileName, content);
  const { uri } = await Filesystem.writeFile({
    path: `exports/${safeFileName(fileName)}`,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({ title: 'Partie RÉPUBLIQUE 2027', files: [uri] });
  } catch (error) {
    // Fermer la feuille de partage n'est pas une erreur.
    if (error instanceof Error && /cancel/i.test(error.message)) return;
    throw error;
  }
}
