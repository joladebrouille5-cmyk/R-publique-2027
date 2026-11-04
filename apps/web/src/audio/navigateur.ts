import { MUSIC, publicUrl } from './manifest';
import { SILENT_SOUND, SoundSystem, type SoundApi } from './systeme';

// Système sonore du navigateur et de l'application Android (phase 19). Les platines de musique
// sont des éléments <audio> cachés, ajoutés au document (repérables par `data-son`). Sans Web
// Audio (navigateur ancien, tests de composants), l'interface reste muette.

export function browserSound(): SoundApi {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function')
    return SILENT_SOUND;
  return new SoundSystem({
    tracks: MUSIC.morceaux,
    url: publicUrl,
    createElement: () => {
      const element = document.createElement('audio');
      // Rien n'est téléchargé avant la première lecture.
      element.preload = 'none';
      element.hidden = true;
      element.dataset.son = 'musique';
      document.body.append(element);
      return element;
    },
    createContext: () => {
      try {
        return new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return null;
      }
    },
  });
}
