import type { PlannedAction, Posture } from '@r2027/shared';
import { create } from 'zustand';

// Plan de la semaine en cours (état d'interface, jamais l'état de partie) : actions et leurs
// cibles, annonces et retraits de propositions, propositions de ralliement. Il est partagé par
// le tableau de bord, l'écran Programme et l'écran Candidats, puis envoyé en une seule fois
// avec la demande de progression. Il s'efface dès que la partie change de semaine.

type Plan = {
  actions: PlannedAction[];
  ajouter: string[];
  retirer: string[];
  proposer: string[];
};

const EMPTY: Plan = { actions: [], ajouter: [], retirer: [], proposer: [] };

type PlanStore = Plan & {
  /** « identifiant de partie:semaine » auquel le plan se rapporte. */
  key: string | null;
  update: (key: string, change: (plan: Plan) => Partial<Plan>) => void;
  clear: (key: string) => void;
};

export const usePlanStore = create<PlanStore>()((set) => ({
  ...EMPTY,
  key: null,
  update: (key, change) =>
    set((state) => {
      const current = state.key === key ? state : EMPTY;
      return { ...current, ...change(current), key };
    }),
  clear: (key) => set({ ...EMPTY, key }),
}));

const toggle = (list: readonly string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/** Plan de la semaine d'une partie et ses opérations. */
export function useWeeklyPlan(gameId: string, week: number) {
  const key = `${gameId}:${week}`;
  const store = usePlanStore();
  const plan: Plan = store.key === key ? store : EMPTY;
  const update = (change: (plan: Plan) => Partial<Plan>) => store.update(key, change);
  return {
    ...plan,
    addAction: (actionId: string) => update((p) => ({ actions: [...p.actions, { actionId }] })),
    /** Action ajoutée avec sa cible (déplacement programmé depuis la carte, phase 15). */
    addTargeted: (actionId: string, cible: string) =>
      update((p) => ({ actions: [...p.actions, { actionId, cible }] })),
    removeAction: (index: number) =>
      update((p) => ({ actions: p.actions.filter((_, i) => i !== index) })),
    setTarget: (index: number, cible: string) =>
      update((p) => ({
        actions: p.actions.map((a, i) => {
          if (i !== index) return a;
          const { cible: _old, ...rest } = a;
          return cible ? { ...rest, cible } : rest;
        }),
      })),
    /** Posture d'un passage dans les médias (phase 11). */
    setPosture: (index: number, posture: Posture) =>
      update((p) => ({
        actions: p.actions.map((a, i) => (i !== index ? a : { ...a, posture })),
      })),
    toggleAnnounce: (id: string) =>
      update((p) => ({
        ajouter: toggle(p.ajouter, id),
        retirer: p.retirer.filter((x) => x !== id),
      })),
    toggleWithdraw: (id: string) =>
      update((p) => ({
        retirer: toggle(p.retirer, id),
        ajouter: p.ajouter.filter((x) => x !== id),
      })),
    togglePropose: (actorId: string) => update((p) => ({ proposer: toggle(p.proposer, actorId) })),
    clear: () => store.clear(key),
  };
}
