import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { JINGLES } from '../audio/jingles';
import { MUSIC } from '../audio/manifest';
import { useSoundStore } from '../stores/son';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  lastAmbiance,
  mockApi,
  recordSound,
  renderRoute,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Phase 19 : le son dans l'interface. Le système sonore est remplacé par un double qui note les
// ambiances et les jingles demandés (le rendu réel est vérifié dans Chromium par l'e2e).

const handlers = {
  'GET /api/health': healthHandler,
  'GET /api/games': () => ({ body: [] }),
  'GET /api/rulesets/courant': rulesetHandler,
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture() }),
  [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
    body: { entries: [], nextBefore: null },
  }),
};

describe('son de l’interface', () => {
  it('propose « Couper le son » dans l’en-tête, retenu sur l’appareil', async () => {
    mockApi(handlers);
    renderRoute('/');
    const user = userEvent.setup();
    const mute = await screen.findByRole('button', { name: 'Couper le son' });
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    await user.click(mute);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    expect(useSoundStore.getState().coupe).toBe(true);
    expect(JSON.parse(localStorage.getItem('r2027-son')!).state.coupe).toBe(true);
    await user.click(mute);
    expect(useSoundStore.getState().coupe).toBe(false);
  });

  it('joue la musique de l’accueil, puis celle de la campagne dans une partie', async () => {
    const calls = recordSound();
    mockApi(handlers);
    const { router } = renderRoute('/');
    await waitFor(() => expect(lastAmbiance(calls)).toBe('ambiance:accueil'));
    await router.navigate(`/parties/${GAME_ID}/tableau-de-bord`);
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(lastAmbiance(calls)).toBe('ambiance:campagne');
    await router.navigate('/parametres');
    await waitFor(() => expect(lastAmbiance(calls)).toBe('ambiance:accueil'));
  });

  it('règle musique et jingles dans Paramètres, fait écouter chaque jingle et crédite la musique', async () => {
    const calls = recordSound();
    mockApi(handlers);
    renderRoute('/parametres');
    const user = userEvent.setup();
    const section = await screen.findByRole('region', { name: 'Son' });
    await user.click(within(section).getByRole('checkbox', { name: 'Musique' }));
    expect(useSoundStore.getState().musique).toBe(false);
    expect(within(section).getByRole('slider', { name: 'Volume de la musique' })).toBeDisabled();
    const jingleVolume = within(section).getByRole('slider', { name: 'Volume des jingles' });
    expect(jingleVolume).toHaveAttribute('aria-valuetext', '80 %');
    await user.click(within(section).getByRole('checkbox', { name: 'Jingles' }));
    expect(useSoundStore.getState().jingles).toBe(false);

    // Chaque moment fort s'écoute, même jingles désactivés (essai volontaire).
    for (const jingle of Object.values(JINGLES)) {
      await user.click(
        within(section).getByRole('button', { name: `Écouter « ${jingle.libelle} »` }),
      );
      expect(within(section).getByText(jingle.quand)).toBeInTheDocument();
    }
    expect(calls.filter((c) => c.startsWith('essai:'))).toEqual(
      Object.keys(JINGLES).map((cue) => `essai:${cue}`),
    );

    // Tout couper désactive les réglages et les essais.
    await user.click(within(section).getByRole('checkbox', { name: 'Couper tout le son' }));
    expect(useSoundStore.getState().coupe).toBe(true);
    expect(
      within(section).getByRole('button', { name: 'Écouter « Résultat à 20 h »' }),
    ).toBeDisabled();
    expect(within(section).getByText(/Le son est coupé/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Couper le son' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Crédits (titre, auteur, licence, source, modifications ; exigés par CC BY).
    const credits = await screen.findByRole('region', { name: 'Crédits et mentions légales' });
    for (const track of MUSIC.morceaux) {
      const line = within(credits).getByText(
        (_, node) =>
          node?.tagName === 'LI' &&
          (node.textContent ?? '').startsWith(`« ${track.titre} » — ${track.auteur}, licence`),
      );
      expect(line).toHaveTextContent(track.modifications);
      expect(within(line).getByRole('link', { name: track.licence })).toHaveAttribute(
        'href',
        track.licenceUrl!,
      );
      expect(
        within(line).getByRole('link', { name: 'fichier sur Wikimedia Commons' }),
      ).toHaveAttribute('href', track.source);
    }
  });
});
