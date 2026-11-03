import { createGame } from '@r2027/engine';
import { DIFFICULTIES } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { formatCount, formatEuros, formatShare } from '../labels';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  renderRoute,
  RULESET,
  RULESET_URL,
  rulesetHandler,
  TEST_CANDIDATE,
  wizardTo,
} from '../test/utils';

// Phase 18 : cinq niveaux de difficulté, chacun avec sa fiche lue dans le jeu de règles.

const handlers = {
  'GET /api/health': healthHandler,
  'GET /api/rulesets/courant': rulesetHandler,
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET /api/games/${GAME_ID}/journal?limit=10`]: () => ({
    body: { entries: [], nextBefore: null },
  }),
};

/** Valeur affichée en face d'un intitulé de la fiche. */
const row = (sheet: HTMLElement, term: string) =>
  within(sheet).getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;

describe('niveaux de difficulté', () => {
  it('propose cinq niveaux en escalier et montre la fiche du niveau choisi', async () => {
    const calls = mockApi({
      ...handlers,
      'POST /api/games': () => ({ status: 201, body: gameFixture() }),
    });
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'La partie' });
    await wizardTo(user, 'Votre candidat');
    await user.type(screen.getByLabelText(/^Nom \*/), 'Martin');
    await user.type(screen.getByLabelText(/^Parti ou mouvement/), 'Parti du renouveau');
    await wizardTo(user, 'Le terrain');
    const group = await screen.findByRole('group', { name: 'Difficulté' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([...DIFFICULTIES]);
    expect(within(group).getByRole('radio', { name: /Standard/ })).toBeChecked();

    // Fiche du niveau Standard : moyens du joueur et paramètres de l'IA du jeu de règles.
    let sheet = await within(group).findByRole('region', { name: /Niveau Standard/ });
    const standard = RULESET.jeu.ressourcesInitiales.standard;
    expect(row(sheet, 'Budget')).toBe(formatEuros(standard.budgetCentimes));
    expect(row(sheet, 'Notoriété')).toBe(formatShare(standard.notoriete));
    expect(row(sheet, 'Actions par semaine')).toBe(
      formatCount(RULESET.ia.standard.actionsParSemaine),
    );
    expect(row(sheet, 'Maîtrise au débat')).toBe('inchangée');

    // Légende : moyens maigres, adversaires plus riches, plus connus et meilleurs au débat.
    await user.click(within(group).getByRole('radio', { name: /Légende/ }));
    sheet = within(group).getByRole('region', { name: /Niveau Légende/ });
    const legende = RULESET.jeu.ressourcesInitiales.legende;
    expect(row(sheet, 'Budget')).toBe(formatEuros(legende.budgetCentimes));
    expect(row(sheet, 'Militants')).toBe(formatCount(legende.militants));
    expect(row(sheet, 'Popularité')).toBe(formatShare(legende.popularite));
    expect(row(sheet, 'Promesses de parrainage')).toBe(
      formatCount(RULESET.jeu.promessesInitialesJoueur.legende),
    );
    expect(row(sheet, 'Budget de campagne')).toBe('× 1,7');
    expect(row(sheet, 'Notoriété de départ')).toBe('× 1,15');
    expect(row(sheet, 'Maîtrise au débat')).toBe('+20 points sur 100');
    expect(sheet).toHaveTextContent('Le niveau est fixé à la création de la partie.');
    expect(sheet).toHaveTextContent(`hypothèses de jeu (jeu de règles ${RULESET.version})`);
    expect(screen.getByRole('complementary', { name: 'Récapitulatif' })).toHaveTextContent(
      'DifficultéLégende',
    );

    await wizardTo(user, 'Le format');
    await user.click(screen.getByRole('button', { name: 'Créer la partie' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Campagne de Martin',
      difficulty: 'legende',
    });
  });

  it('en observateur, la fiche ne règle que les candidats conduits par l’IA', async () => {
    mockApi(handlers);
    renderRoute('/nouvelle-partie');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Observateur/ }));
    await wizardTo(user, 'Le terrain');
    await user.click(screen.getByRole('radio', { name: /Découverte/ }));
    const sheet = screen.getByRole('region', { name: /Niveau Découverte/ });
    expect(within(sheet).queryByText('Vos moyens de départ')).not.toBeInTheDocument();
    expect(within(sheet).getByText('Les candidats, conduits par l’IA')).toBeInTheDocument();
    expect(row(sheet, 'Notoriété de départ')).toBe('× 0,5');
    expect(row(sheet, 'Maîtrise au débat')).toBe('−20 points sur 100');
  });

  it('rappelle la fiche du niveau de la partie dans la section « La partie » du QG', async () => {
    const state = createGame(
      {
        seed: 'graine-test',
        mode: 'candidat_personnalise',
        difficulty: 'legende',
        candidate: TEST_CANDIDATE,
      },
      RULESET,
    );
    mockApi({
      ...handlers,
      [`GET /api/games/${GAME_ID}`]: () => ({
        body: gameFixture({ difficulty: 'legende' }, state),
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /La partie/ }));
    const sheet = await screen.findByRole('region', { name: /Niveau Légende/ });
    expect(row(sheet, 'Budget')).toBe(
      formatEuros(RULESET.jeu.ressourcesInitiales.legende.budgetCentimes),
    );
    expect(row(sheet, 'Hasard dans leurs choix')).toBe('0,2');
    // Aucun sélecteur : le niveau est figé à la création.
    expect(within(sheet).queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Difficulté' })).not.toBeInTheDocument();
  });
});
