import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { platform } from '../platform';
import { soundSettings, useSoundStore } from '../stores/son';
import { resolveAmbiance, type AmbianceEntry, type AmbianceRequest } from './ambiance';
import type { Cue } from './jingles';
import { sound } from './systeme';

// Branchements React du son (phase 19) : réglages, premier geste, premier ou arrière-plan
// (coque de l'application) ; ambiance demandée par chaque écran ; jingles des moments forts.

/** Gestes qui autorisent le son (le premier suffit ; les suivants relancent un contexte suspendu). */
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/** À monter une fois, dans la coque : relie le système sonore aux réglages et à la page. */
export function useSoundEngine(): void {
  const settings = useSoundStore(useShallow(soundSettings));
  useEffect(() => sound().setSettings(settings), [settings]);
  useEffect(() => {
    const unlock = () => sound().unlock();
    for (const type of GESTURES)
      window.addEventListener(type, unlock, { capture: true, passive: true });
    const visibility = () => sound().setActive(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', visibility);
    const stopPlatform = platform().onActiveChange?.((active) => sound().setActive(active));
    return () => {
      for (const type of GESTURES) window.removeEventListener(type, unlock, { capture: true });
      document.removeEventListener('visibilitychange', visibility);
      stopPlatform?.();
    };
  }, []);
}

const requests = new Map<number, AmbianceEntry>();
let counter = 0;

function publish() {
  sound().setAmbiance(resolveAmbiance(requests.values()));
}

/**
 * Ambiance demandée par un écran tant qu'il est affiché : la priorité la plus haute l'emporte
 * (accueil 0, partie 1, soirée électorale ou débat 2).
 */
export function useAmbiance(ambiance: AmbianceRequest, priorite: number): void {
  useEffect(() => {
    const id = ++counter;
    requests.set(id, { ambiance, priorite, ordre: id });
    publish();
    return () => {
      requests.delete(id);
      publish();
    };
  }, [ambiance, priorite]);
}

/** Joue un jingle quand `cue` prend une valeur (et à chaque nouvelle valeur), jamais sinon. */
export function useCue(cue: Cue | null): void {
  useEffect(() => {
    if (cue) sound().play(cue);
  }, [cue]);
}
