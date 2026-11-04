import { beforeEach, describe, expect, it, vi } from 'vitest';

// Rappel quotidien du défi du jour (phase 20) : notification locale programmée par l'extension
// Capacitor, autorisation demandée seulement si elle manque, un seul rappel à la fois.

const calls: { method: string; arg?: unknown }[] = [];
let permission = 'prompt';
let answer = 'granted';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: async () => ({ display: permission }),
    requestPermissions: async () => {
      calls.push({ method: 'requestPermissions' });
      return { display: answer };
    },
    cancel: async (arg: unknown) => void calls.push({ method: 'cancel', arg }),
    schedule: async (arg: unknown) => void calls.push({ method: 'schedule', arg }),
  },
}));

const { reminders, REMINDER_ID } = await import('./native');

beforeEach(() => {
  calls.length = 0;
  permission = 'prompt';
  answer = 'granted';
});

describe('rappel quotidien du défi du jour', () => {
  it('demande l’autorisation, remplace le rappel précédent et le répète chaque jour à l’heure dite', async () => {
    expect(await reminders.schedule(18)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['requestPermissions', 'cancel', 'schedule']);
    expect(calls[2]!.arg).toEqual({
      notifications: [
        expect.objectContaining({
          id: REMINDER_ID,
          title: 'Défi du jour',
          schedule: { on: { hour: 18, minute: 0 }, allowWhileIdle: false },
        }),
      ],
    });
    // Autorisation déjà accordée : rien n'est redemandé.
    calls.length = 0;
    permission = 'granted';
    await reminders.schedule(8);
    expect(calls.map((c) => c.method)).toEqual(['cancel', 'schedule']);
  });

  it('ne programme rien si l’autorisation est refusée, et sait annuler', async () => {
    answer = 'denied';
    expect(await reminders.schedule(18)).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(['requestPermissions']);
    await reminders.cancel();
    expect(calls.at(-1)).toEqual({
      method: 'cancel',
      arg: { notifications: [{ id: REMINDER_ID }] },
    });
  });
});
