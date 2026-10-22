import { advanceWeek, createGame } from '@r2027/engine';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  renderRoute,
  RULESET,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Personnalités réelles (phase 5 bis) : fiche sourcée, photo créditée, comportement simulé.

const state = advanceWeek(
  createGame(
    {
      seed: 'web-reel',
      mode: 'candidat_reel',
      difficulty: 'standard',
      personnaliteId: 'reel-attal',
      adversaires: 'reels',
    },
    RULESET,
  ),
  { actions: [], decisions: [] },
  { ruleset: RULESET },
).state;

const handlers = {
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
    body: { entries: [], nextBefore: null },
  }),
};

const fiche = (id: string) => RULESET.personnalites.personnalites.find((p) => p.id === id)!;

/** Paragraphe dont le texte complet (liens compris) correspond. */
const paragraph = (pattern: RegExp) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && pattern.test(element.textContent ?? '');

describe('personnalités réelles', () => {
  it('rappelle que tout est simulé et présente chaque personnalité avec sa fiche sourcée', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/candidats`);
    const user = userEvent.setup();
    expect(await screen.findByText(/Partie avec des personnalités réelles/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/sont simulés par le jeu/);

    const lePen = screen.getByRole('listitem', { name: 'Marine Le Pen' });
    expect(within(lePen).getByText('Personnalité réelle — simulée')).toBeInTheDocument();
    expect(
      await within(lePen).findByRole('img', { name: 'Portrait de Marine Le Pen' }),
    ).toBeInTheDocument();
    expect(within(lePen).getByText(/aucune proposition prêtée par le jeu/)).toBeInTheDocument();
    await user.click(within(lePen).getByText('Fiche sourcée et crédit photo'));
    const source = within(lePen).getByRole('link', {
      name: fiche('reel-le-pen').candidature.source.site!,
    });
    expect(source).toHaveAttribute('href', fiche('reel-le-pen').candidature.source.url);
    expect(within(lePen).getByText('Estimation')).toBeInTheDocument();
    expect(
      within(lePen).getByText(paragraph(/^Photo : Vox España, CC0, via Wikimedia Commons/)),
    ).toBeInTheDocument();

    // Photo de la source non libre : portrait libre choisi sur Commons, choix motivé.
    const glucksmann = screen.getByRole('listitem', { name: 'Raphaël Glucksmann' });
    expect(
      await within(glucksmann).findByRole('img', { name: 'Portrait de Raphaël Glucksmann' }),
    ).toBeInTheDocument();
    await user.click(within(glucksmann).getByText('Fiche sourcée et crédit photo'));
    expect(
      within(glucksmann).getByText(
        paragraph(
          /^Photo : Librairie Mollat, CC BY-SA 4\.0, via Wikimedia Commons.+Parlement européen/,
        ),
      ),
    ).toBeInTheDocument();

    // Position « hypothèse » signalée comme telle.
    const ruffin = screen.getByRole('listitem', { name: 'François Ruffin' });
    await user.click(within(ruffin).getByText('Fiche sourcée et crédit photo'));
    expect(within(ruffin).getByText('Hypothèse')).toBeInTheDocument();

    // Le joueur incarne Gabriel Attal : c'est sa campagne (programme à composer).
    const attal = screen.getByRole('listitem', { name: 'Gabriel Attal' });
    expect(within(attal).getByText('Votre candidat')).toBeInTheDocument();
    expect(within(attal).getByText(/Programme : 0 proposition/)).toBeInTheDocument();

    const sources = screen.getByRole('region', {
      name: 'Personnalités réelles : sources et méthode',
    });
    expect(
      within(sources).getByRole('link', { name: /Chapel Hill Expert Survey 2024/ }),
    ).toBeInTheDocument();
    expect(within(sources).getByText(/Candidatures déclarées non intégrées/)).toBeInTheDocument();
    expect(within(sources).getByText(/Delphine Batho/)).toBeInTheDocument();
  });

  it('ne prête aucun programme aux personnalités réelles adverses', async () => {
    mockApi(handlers);
    renderRoute(`/parties/${GAME_ID}/programme`);
    const section = await screen.findByRole('region', { name: 'Programmes des autres candidats' });
    expect(
      within(section).getAllByText('Personnalité réelle : le jeu ne lui prête aucune proposition.'),
    ).toHaveLength(RULESET.personnalites.personnalites.length - 1);
  });
});
