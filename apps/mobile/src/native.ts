import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
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

/**
 * Passage de l'application au premier plan ou en arrière-plan (phase 19), signalé par Android ;
 * dans un navigateur (aperçu), la visibilité de la page suffit et rien n'est abonné ici.
 */
export function onAppActiveChange(listener: (active: boolean) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const subscription = App.addListener('appStateChange', ({ isActive }) => listener(isActive));
  return () => void subscription.then((handle) => handle.remove());
}

/** Identifiant fixe du rappel quotidien : reprogrammer remplace le précédent. */
export const REMINDER_ID = 2027;

/**
 * Rappel quotidien du défi du jour (phase 20) : notification locale répétée chaque jour à
 * l'heure choisie, programmée sur l'appareil (aucun réseau). Seule la permission
 * POST_NOTIFICATIONS est demandée ; l'alarme n'est pas exacte (pas de SCHEDULE_EXACT_ALARM) et
 * le rappel est reprogrammé à chaque ouverture de l'application (pas de RECEIVE_BOOT_COMPLETED).
 */
export const reminders = {
  async schedule(hour: number): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    let { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') ({ display } = await LocalNotifications.requestPermissions());
    if (display !== 'granted') return false;
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: 'Défi du jour',
          body: 'La campagne du jour vous attend : même départ pour tous, votre score au premier tour.',
          schedule: { on: { hour, minute: 0 }, allowWhileIdle: false },
        },
      ],
    });
    return true;
  },
  async cancel(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  },
};
