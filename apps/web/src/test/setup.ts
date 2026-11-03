import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { setSound } from '../audio/systeme';
import { usePlanStore } from '../stores/plan';
import { DEFAULT_SOUND, useSoundStore } from '../stores/son';

// L'écran Carte décode les TopoJSON de démonstration et temporise la recherche (200 ms) : le
// délai par défaut des requêtes asynchrones (1 s) est trop juste quand tous les tests tournent
// en parallèle à froid.
configure({ asyncUtilTimeout: 3_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  // Plan de la semaine (magasin global) : chaque test part d'un plan vide.
  usePlanStore.setState({ actions: [], ajouter: [], retirer: [], proposer: [], key: null });
  // Son (phase 19) : réglages par défaut, système muet.
  useSoundStore.setState(DEFAULT_SOUND);
  setSound(null);
});

// jsdom ne fait pas défiler la page : les sections dépliées par une ancre (phase 12) demandent
// pourtant à venir à l'écran.
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  writable: true,
  value: () => {},
});
