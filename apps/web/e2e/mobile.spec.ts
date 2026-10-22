import { expect, test } from '@playwright/test';
import { createGame } from './helpers';

// Marges de sécurité sur téléphone (phase 11) : comme Capacitor 8 sur Android, le test injecte
// les hauteurs de la barre d'état et de la barre de gestes dans --safe-area-inset-* ; l'en-tête,
// le bandeau de la partie et la navigation basse doivent s'en écarter, et chaque carte d'action
// rester atteignable au-dessus de la barre « Résoudre la semaine ».

const STATUS_BAR = 40;
const GESTURE_BAR = 24;

test('l’interface évite la barre d’état et la barre de gestes du téléphone', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Disposition propre au téléphone');
  await page.addInitScript(
    ([top, bottom]) => {
      const set = () => {
        document.documentElement.style.setProperty('--safe-area-inset-top', `${top}px`);
        document.documentElement.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
      };
      if (document.documentElement) set();
      document.addEventListener('DOMContentLoaded', set);
    },
    [STATUS_BAR, GESTURE_BAR],
  );
  await createGame(page, 'Marges de sécurité', 'e2e-marges');

  // En-tête : la marque commence sous la barre d'état.
  await page.evaluate(() => window.scrollTo(0, 0));
  const brand = page.getByRole('banner').getByRole('link', { name: 'RÉPUBLIQUE 2027' });
  expect((await brand.boundingBox())!.y).toBeGreaterThanOrEqual(STATUS_BAR);

  // Bandeau de la partie, collé en haut pendant le défilement : sous la barre d'état aussi.
  await page.evaluate(() => window.scrollBy(0, 1500));
  const hud = page.getByRole('region', { name: 'Situation de la partie' });
  await expect
    .poll(async () => (await hud.boundingBox())!.y, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(STATUS_BAR - 1);

  // Navigation basse : ses liens finissent au-dessus de la barre de gestes.
  const viewport = page.viewportSize()!;
  const shortcuts = page.getByRole('navigation', { name: 'Raccourcis' });
  const firstLink = shortcuts.getByRole('link').first();
  const linkBox = (await firstLink.boundingBox())!;
  expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(viewport.height - GESTURE_BAR + 1);

  // Chaque carte d'action, amenée à l'écran, est visible (ni sous la barre de résolution, ni
  // sous la navigation) : le point central de son bouton désigne bien ce bouton.
  const add = page.getByRole('button', { name: /^Ajouter / });
  const count = await add.count();
  expect(count).toBeGreaterThan(3);
  for (const index of [0, Math.floor(count / 2), count - 1]) {
    const button = add.nth(index);
    await button.focus();
    const box = (await button.boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y)?.closest('button');
        return target?.getAttribute('aria-label') ?? target?.textContent ?? '';
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(hit, `carte ${index + 1} sur ${count}`).toBe(
      (await button.getAttribute('aria-label')) ?? (await button.textContent()) ?? '',
    );
  }
});
