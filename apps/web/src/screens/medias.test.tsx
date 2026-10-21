import { advanceWeek, createGame } from '@r2027/engine';
import { screen, waitFor, within } from '@testing-library/react';
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

// Médias réels (phase 5 ter) : organes, mesures sourcées, temps de parole, émissions, logos
// crédités ; couverture et interviews simulées, sans propos attribué.

const SHOW = RULESET.mediasReels.emissions.find((e) => e.id === 'emi-le-grand-jury')!;

const fresh = createGame(
  {
    seed: 'web-medias',
    mode: 'candidat_reel',
    difficulty: 'standard',
    personnaliteId: 'reel-attal',
    adversaires: 'reels',
  },
  RULESET,
);
const state = advanceWeek(
  fresh,
  { actions: [{ actionId: 'emission-politique', cible: SHOW.id }], decisions: [] },
  { ruleset: RULESET },
).state;

const handlers = (game = state) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, game) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
    body: { entries: [], nextBefore: null },
  }),
});

/** Paragraphe dont le texte complet (liens compris) correspond. */
const paragraph = (pattern: RegExp) => (_: string, element: Element | null) =>
  element?.tagName === 'LI' && pattern.test(element.textContent ?? '');

describe('écran des médias réels', () => {
  it('présente les émissions réelles, leurs présentateurs et l’interview simulée de la semaine', async () => {
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/medias`);
    expect(await screen.findByRole('heading', { name: 'Médias', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/aucun propos n’est attribué/);
    const shows = await screen.findByRole('region', { name: 'Émissions politiques' });
    const grandJury = within(shows).getByRole('listitem', { name: SHOW.titre });
    expect(
      within(grandJury).getByText(`Présentation : ${SHOW.presentateurs.join(', ')}`),
    ).toBeInTheDocument();
    expect(within(grandJury).getByText('Interview simulée')).toBeInTheDocument();
    expect(within(grandJury).getByText(/Gabriel Attal \(vous\)/)).toBeInTheDocument();
    expect(within(grandJury).getByRole('link', { name: /Article Wikipédia/ })).toHaveAttribute(
      'href',
      SHOW.article,
    );
  });

  it('montre chaque organe par type, avec sa mesure d’audience, ses temps de parole et son logo crédité', async () => {
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/medias`);
    const tv = await screen.findByRole('region', { name: 'Télévision' });
    const tf1 = within(tv).getByRole('listitem', { name: 'TF1' });
    expect(await within(tf1).findByRole('img', { name: 'Logo de TF1' })).toBeInTheDocument();
    expect(
      within(tf1).getByText(
        /part d’audience 19,1 % \(individus de 4 ans et plus, septembre 2026\)/,
      ),
    ).toBeInTheDocument();
    expect(
      within(tf1).getByText(/Temps de parole des partis relevé par l’Arcom/),
    ).toBeInTheDocument();
    // Exposition mesurée des partis des candidats (personnalités réelles rattachées).
    await userEvent
      .setup()
      .click(within(tf1).getByText('Exposition mesurée des partis des candidats'));
    expect(
      within(tf1).getByRole('rowheader', { name: 'Marine Le Pen (Rassemblement national)' }),
    ).toBeInTheDocument();
    // Couverture simulée de la semaine.
    expect(
      within(tf1).getByRole('table', { name: 'Couverture simulée des candidats par TF1' }),
    ).toBeInTheDocument();

    const press = screen.getByRole('region', { name: 'Presse écrite' });
    const monde = within(press).getByRole('listitem', { name: 'Le Monde' });
    expect(within(monde).getByText(/lecteurs par numéro/)).toBeInTheDocument();
    expect(within(monde).getByText(/même traitement pour tous les candidats/)).toBeInTheDocument();
    // Sans logo libre : nom en texte seulement.
    const figaro = within(press).getByRole('listitem', { name: 'Le Figaro' });
    expect(within(figaro).queryByRole('img')).not.toBeInTheDocument();
  });

  it('cite les sources, la méthode, les exclusions et les crédits des logos', async () => {
    mockApi(handlers());
    renderRoute(`/parties/${GAME_ID}/medias`);
    const sources = await screen.findByRole('region', {
      name: 'Médias réels : sources et méthode',
    });
    const arcom = RULESET.mediasReels.sources.find((s) => s.id.startsWith('arcom-'))!;
    expect(within(sources).getByRole('link', { name: arcom.titre })).toHaveAttribute(
      'href',
      arcom.url,
    );
    expect(within(sources).getByText('Hypothèses de jeu')).toBeInTheDocument();
    expect(within(sources).getByText(/^Sud Radio — /)).toBeInTheDocument();
    expect(
      within(sources).getByText(/^Questions politiques — diffusion arrêtée/),
    ).toBeInTheDocument();
    expect(
      within(sources).getByText(
        paragraph(/^TF1 — Logo : .+, Public domain, via Wikimedia Commons/),
      ),
    ).toBeInTheDocument();
    expect(within(sources).getByText(paragraph(/^Le Figaro — Sans logo : /))).toBeInTheDocument();
  });

  it('indique que la couverture n’est pas encore calculée avant la première semaine', async () => {
    mockApi(handlers(fresh));
    renderRoute(`/parties/${GAME_ID}/medias`);
    expect(
      await screen.findByText(/sera calculée à la résolution de la semaine/),
    ).toBeInTheDocument();
  });
});

describe('plan d’actions : interview dans une émission politique', () => {
  it('propose les émissions réelles et envoie l’émission choisie avec l’action', async () => {
    const calls = mockApi(handlers(fresh));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter Invité d’une émission politique' }),
    );
    const select = screen.getByLabelText(
      /Cible de l’action n° 1 \(Invité d’une émission politique\)/,
    );
    expect(
      within(select).getByRole('option', {
        name: `${SHOW.titre} (RTL) — ${SHOW.presentateurs.join(', ')}`,
      }),
    ).toBeInTheDocument();
    await user.selectOptions(select, SHOW.id);
    await user.click(screen.getByRole('button', { name: 'Résoudre la semaine 0' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      actions: [{ actionId: 'emission-politique', cible: SHOW.id }],
    });
  });

  it('regroupe les médias réels par type pour une interview', async () => {
    mockApi(handlers(fresh));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Ajouter Interview dans un média' }),
    );
    const select = screen.getByLabelText(/Cible de l’action n° \d+ \(Interview dans un média\)/);
    for (const label of ['Télévision', 'Radio', 'Presse écrite'])
      expect(within(select).getByRole('group', { name: label })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'France Inter' })).toBeInTheDocument();
  });
});
