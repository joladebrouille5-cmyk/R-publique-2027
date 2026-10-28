import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  renderRoute,
  rulesetHandler,
} from '../../test/utils';
import { PhotoError, preparePhoto } from './photo';

// Phase 13 : photo du candidat personnalisé, préparée sur l'appareil puis envoyée avec la
// création de la partie. Le décodage d'image (canvas) n'existe pas dans jsdom : la préparation
// est remplacée ici, ses règles pures sont testées à part.

vi.mock('./photo', async (original) => ({
  ...(await original<typeof import('./photo')>()),
  preparePhoto: vi.fn(),
}));

const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const handlers = {
  'GET /api/health': healthHandler,
  'GET /api/rulesets/courant': rulesetHandler,
  'POST /api/games': () => ({ status: 201, body: gameFixture() }),
};

async function fillCandidate() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Nom de la partie'), 'Avec photo');
  await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
  await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti du renouveau');
  return user;
}

describe('photo du candidat (phase 13)', () => {
  // Corps en bloc : une fonction renvoyée par `beforeEach` serait appelée au nettoyage.
  beforeEach(() => {
    vi.mocked(preparePhoto).mockReset();
  });

  it('importe une photo, l’affiche et l’envoie avec le candidat ; elle peut être retirée', async () => {
    vi.mocked(preparePhoto).mockResolvedValue(PHOTO);
    const calls = mockApi(handlers);
    const { router } = renderRoute('/nouvelle-partie');
    const user = await fillCandidate();
    // Sans photo : portrait illustré du candidat.
    expect(document.querySelector('[data-avatar="illustration"]')).not.toBeNull();
    const file = new File(['x'], 'portrait.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Importer une photo'), file);
    expect(preparePhoto).toHaveBeenCalledWith(file);
    expect(
      await screen.findByRole('img', { name: 'Photo choisie pour le candidat' }),
    ).toHaveAttribute('src', PHOTO);
    await user.click(screen.getByRole('button', { name: 'Retirer la photo' }));
    expect(screen.queryByRole('img', { name: 'Photo choisie pour le candidat' })).toBeNull();
    await user.upload(screen.getByLabelText('Importer une photo'), file);
    await screen.findByRole('img', { name: 'Photo choisie pour le candidat' });
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/parties/${GAME_ID}/tableau-de-bord`),
    );
    const body = calls.find((call) => call.method === 'POST')?.body as {
      candidate: { photo: string | null };
    };
    expect(body.candidate.photo).toBe(PHOTO);
  });

  it('explique pourquoi une image est refusée', async () => {
    vi.mocked(preparePhoto).mockRejectedValue(
      new PhotoError('Choisissez une image JPEG, PNG ou WebP.'),
    );
    mockApi(handlers);
    renderRoute('/nouvelle-partie');
    const user = await fillCandidate();
    await user.upload(
      screen.getByLabelText('Importer une photo'),
      new File(['x'], 'portrait.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choisissez une image JPEG, PNG ou WebP.',
    );
  });
});

describe('préparation de la photo', () => {
  it('découpe le plus grand carré, centré et placé vers le haut', async () => {
    const { squareCrop } = await vi.importActual<typeof import('./photo')>('./photo');
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(squareCrop(300, 500)).toEqual({ sx: 0, sy: 50, side: 300 });
    expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });

  it('refuse un autre type de fichier ou une image trop volumineuse avant de la lire', async () => {
    const actual = await vi.importActual<typeof import('./photo')>('./photo');
    await expect(
      actual.preparePhoto(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('Choisissez une image JPEG, PNG ou WebP.');
    const big = new File(['x'], 'grand.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: actual.PHOTO_FILE_MAX_BYTES + 1 });
    await expect(actual.preparePhoto(big)).rejects.toThrow(
      'Image trop volumineuse : 15 Mo au plus avant réduction.',
    );
  });
});
