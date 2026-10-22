import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { usePlanStore } from '../stores/plan';

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
});
