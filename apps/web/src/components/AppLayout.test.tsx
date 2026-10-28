import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { browserDownload, setPlatform } from '../platform';
import { healthHandler, mockApi, renderRoute } from '../test/utils';

// Pied de page : état du serveur (web) ou du moteur local (application Android, phase 14).

const NOTICE = 'Stockage non garanti : les parties restent sur cet appareil.';
const local = () =>
  setPlatform({ kind: 'local', saveFile: browserDownload, storageNotice: NOTICE });

describe('pied de page', () => {
  afterEach(() => setPlatform({ kind: 'web', saveFile: browserDownload, storageNotice: null }));

  it('sur le web, annonce le serveur connecté et la version du moteur', async () => {
    mockApi({ 'GET /api/health': healthHandler, 'GET /api/games': () => ({ body: [] }) });
    renderRoute('/');
    expect(await screen.findByText('Serveur connecté · moteur 0.1.0')).toBeInTheDocument();
  });

  it('sur l’appareil, n’affiche aucune ligne quand le moteur local fonctionne', async () => {
    local();
    mockApi({ 'GET /api/health': healthHandler, 'GET /api/games': () => ({ body: [] }) });
    renderRoute('/');
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Démarrage du moteur local…')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/Hors ligne/)).not.toBeInTheDocument();
    expect(screen.queryByText(/moteur 0\.1\.0/)).not.toBeInTheDocument();
    // Rappel de simulation et avertissement de stockage conservés.
    expect(screen.getByText(/^Simulation : les événements/)).toBeInTheDocument();
  });

  it('sur l’appareil, signale un moteur local en panne', async () => {
    local();
    mockApi({
      'GET /api/health': () => ({
        status: 503,
        body: { error: { code: 'indisponible', message: 'Moteur arrêté' } },
      }),
      'GET /api/games': () => ({ body: [] }),
    });
    renderRoute('/');
    expect(await screen.findByText('Moteur local indisponible')).toBeInTheDocument();
  });
});
