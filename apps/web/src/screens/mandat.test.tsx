import { advanceWeek, openQuinquennat } from '@r2027/engine';
import type { GameState } from '@r2027/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  playedState,
  renderRoute,
  RULESET,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';
import { blocPeople } from '../components/BlocFigures';

// Phase 13 : mandat vivant à l'écran — vue du mandat, tuiles du QG, campagne et accords des
// législatives, carte des législatives par bloc, fiches des actions du chef de l'État. États
// produits par le vrai moteur.

const FILES = import.meta.glob('../../../../packages/data-import/demo/cog-2026/**/*.json', {
  eager: true,
  import: 'default',
});
const demo = (name: string) => FILES[`../../../../packages/data-import/demo/cog-2026/${name}`];
const manifest = demo('manifest.json') as { departements: { fichier: string | null }[] };

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (state: GameState) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
  'GET /api/geo/manifeste': () => ({ body: manifest }),
  'GET /api/geo/historique': () => ({
    body: { disponible: false, raison: 'Résultats 2022 non chargés (test).' },
  }),
  'GET /api/geo/fichiers/france.topo.json': () => ({ body: demo('france.topo.json') }),
  ...Object.fromEntries(
    manifest.departements
      .filter((d) => d.fichier)
      .map((d) => [`GET /api/geo/fichiers/${d.fichier}`, () => ({ body: demo(d.fichier!) })]),
  ),
});

const elected = playedState((s) => s.quinquennat !== null);

const step = (state: GameState, actions: { actionId: string; cible?: string }[] = []) =>
  advanceWeek(
    state,
    {
      actions,
      decisions: state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
    },
    { ruleset: RULESET },
  ).state;

/** Le joueur déclaré élu, gouvernement nommé et ministres confirmés. */
const governed = (() => {
  let state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors.joueur!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULESET, 'joueur');
  while (
    !state.quinquennat!.gouvernement ||
    state.pendingDecisions.some((d) => d.kind === 'gouvernement')
  )
    state = step(state);
  return state;
})();

describe('vue du mandat (phase 13)', () => {
  it('rassemble en tête de l’espace Pouvoir l’hémicycle, les jauges, les ministres et leurs effets', async () => {
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/pouvoir`);
    const overview = await screen.findByRole('region', { name: 'Vue du mandat' });
    const hemicycle = within(overview).getByRole('img', { name: /^Hémicycle de l’Assemblée/ });
    expect(hemicycle.querySelectorAll('[data-siege]')).toHaveLength(RULESET.assemblee.siegesTotal);
    // Liseré lumineux : sièges du groupe du joueur (convention du jeu pour un candidat fictif).
    expect(hemicycle.querySelectorAll('[data-joueur]').length).toBeGreaterThan(0);
    expect(within(overview).getByText(/votre groupe \(convention du jeu\)/)).toBeInTheDocument();
    const majority = within(overview).getByRole('meter', {
      name: 'Soutiens du président face à la majorité des membres',
    });
    expect(majority).toHaveAttribute('aria-valuetext', expect.stringMatching(/requis/));
    expect(within(overview).getByRole('meter', { name: 'Tension parlementaire' })).toHaveAttribute(
      'aria-valuenow',
      String(governed.parlement!.tension.valeur),
    );
    // Ministres : un par poste, avec leur compétence et l'effet de leur domaine.
    const ministers = within(overview).getByRole('list', {
      name: 'Ministres et effets de leur domaine',
    });
    expect(within(ministers).getAllByRole('listitem')).toHaveLength(
      RULESET.quinquennat.postes.length,
    );
    expect(within(ministers).getAllByText(/compétence \d+ %/).length).toBe(
      RULESET.quinquennat.postes.length,
    );
    // Indicateurs simulés et législatives, avec un accès direct au détail.
    expect(within(overview).getByText('Taux de chômage')).toBeInTheDocument();
    expect(within(overview).getByText(/Prochaines législatives/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(overview).getByRole('button', { name: /Économie/ }));
    expect(screen.getByRole('button', { name: /^Économie/, expanded: true })).toBeInTheDocument();
  });

  it('les sections de l’espace Pouvoir n’ont aucun volet imbriqué ni second hémicycle', async () => {
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/pouvoir`);
    await screen.findByRole('region', { name: 'Vue du mandat' });
    const user = userEvent.setup();
    // Phase 20 : gouvernement et Conseil, économie et crises forment chacun une section.
    const ids = ['executif', 'parlement', 'economie-crises', 'legislatives', 'bilan'];
    for (const id of ids) {
      const toggle = document.querySelector<HTMLButtonElement>(`section#${id} > h2 > button`)!;
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    }
    // Contenu de chaque section chargé.
    await screen.findByRole('region', { name: 'Personnalités nominables' });
    await screen.findByRole('list', { name: 'Membres du gouvernement' });
    await screen.findByRole('region', { name: /Assemblée nationale \(17e législature\)/ });
    await screen.findByRole('listitem', { name: 'Taux de chômage' });
    await screen.findByRole('region', { name: 'Crises possibles (fictives)' });
    await screen.findByRole('region', { name: 'Dernières élections' });
    await screen.findByText(/Aucun quinquennat achevé/);
    for (const id of ids)
      expect(document.querySelectorAll(`section#${id} details`), id).toHaveLength(0);
    // Un seul hémicycle sur la page : celui de la vue du mandat.
    expect(screen.getAllByRole('img', { name: /^Hémicycle/ })).toHaveLength(1);
  });

  it('ajoute au QG les tuiles Majorité et Tension parlementaire', async () => {
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const majority = await screen.findByRole('button', { name: /^Majorité/ });
    expect(majority).toHaveTextContent(/\d+\/\d+/);
    expect(screen.getByRole('button', { name: /^Tension parlementaire/ })).toHaveTextContent(
      `${governed.parlement!.tension.valeur}/100`,
    );
  });

  it('détaille les actions du chef de l’État : fréquence, effets, ministre et source', async () => {
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    const congress = RULESET.quinquennat.actions.find((a) => a.id === 'discours-congres')!;
    await user.click(await screen.findByRole('button', { name: `Détails : ${congress.libelle}` }));
    const sheet = await screen.findByRole('dialog', { name: congress.libelle });
    expect(within(sheet).getByText('une fois toutes les 52 semaines au plus')).toBeInTheDocument();
    expect(within(sheet).getByText(/fronde de la majorité réduite de 30 %/)).toBeInTheDocument();
    expect(
      within(sheet).getByRole('link', { name: /Constitution du 4 octobre 1958, article 18/ }),
    ).toHaveAttribute('href', expect.stringContaining('oldid=239705826'));
  });
});

describe('législatives vivantes à l’écran (phase 13)', () => {
  const dissolved = step(governed, [{ actionId: 'dissolution' }]);

  it('la campagne s’ouvre après la dissolution : stratégie à arrêter, accords des autres blocs', async () => {
    mockApi(base(dissolved));
    renderRoute(`/parties/${GAME_ID}/legislatives`);
    const campaign = await screen.findByRole('region', { name: 'Campagne en cours' });
    expect(within(campaign).getByText(/Stratégie à arrêter/)).toBeInTheDocument();
    const pacts = within(campaign).getByRole('list', { name: 'Accords électoraux' });
    expect(within(pacts).getAllByRole('listitem')).toHaveLength(
      dissolved.legislatives!.campagne!.alliances.length,
    );
    expect(within(pacts).getAllByText('Règle de l’IA').length).toBeGreaterThan(0);
    expect(within(campaign).getByText(/ne décrivent aucun accord réel/)).toBeInTheDocument();
  });

  it('la décision d’alliance s’affiche au QG avec ses options', async () => {
    mockApi(base(dissolved));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const decision = dissolved.pendingDecisions.find((d) => d.kind === 'alliance')!;
    const group = await screen.findByRole('group', { name: decision.label });
    expect(within(group).getAllByRole('radio')).toHaveLength(decision.options.length);
    for (const option of decision.options)
      expect(within(group).getByText(option.libelle)).toBeInTheDocument();
    // Phase 14 : un accord avec un bloc montre les visages des personnalités de ses partis
    // (aucun pour un bloc sans personnalité du jeu).
    const withBloc = decision.options.filter((o) => o.id.includes(':'));
    expect(withBloc.length).toBeGreaterThan(0);
    for (const option of withBloc) {
      const label = within(group).getByText(option.libelle).closest('label')!;
      const people = blocPeople(RULESET, option.id.split(':')[1]!);
      // Visages affichés une fois le jeu de règles chargé.
      await waitFor(() =>
        expect(label.querySelector('[data-bloc-faces]') !== null).toBe(people.length > 0),
      );
    }
    expect(withBloc.some((o) => blocPeople(RULESET, o.id.split(':')[1]!).length > 0)).toBe(true);
  });
});

describe('carte des législatives (phase 13)', () => {
  it('colore les départements par bloc en tête et liste les circonscriptions dans la fiche', async () => {
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/carte`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Filtres' }));
    const select = screen.getByLabelText('Résultats affichés');
    await user.selectOptions(select, 'Législatives 2024 — premier tour par bloc (officiel)');
    const legend = await screen.findByRole('region', { name: 'Légende' });
    expect(within(legend).getByText('Bloc en tête')).toBeInTheDocument();
    expect(screen.getByText('Résultat officiel')).toBeInTheDocument();
    // Tableau des territoires : le bloc en tête de chaque département.
    await user.click(screen.getByRole('button', { name: 'Voir Corse-du-Sud' }));
    const sheet = await screen.findByRole('region', { name: 'Fiche : Corse-du-Sud' });
    expect(within(sheet).getByText('Circonscriptions (2)')).toBeInTheDocument();
    expect(within(sheet).getByText('Sièges')).toBeInTheDocument();
    expect(within(sheet).getByText('Blancs et nuls')).toBeInTheDocument();
    // Dépouillement rejouable, annoncé aux lecteurs d'écran.
    await user.click(screen.getByRole('button', { name: 'Rejouer le dépouillement' }));
    await waitFor(() =>
      expect(screen.getByText(/^Dépouillement : \d+ départements sur \d+$/)).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.queryByText(/^Dépouillement :/)).toBeNull(), {
      timeout: 12_000,
    });
  }, 30_000);
});
