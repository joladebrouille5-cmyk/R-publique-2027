import { advanceWeek, openQuinquennat } from '@r2027/engine';
import { memberExpertise, type GameState } from '@r2027/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WeeklyReportView } from '../components/WeeklyReportView';
import {
  GAME_ID,
  gameFixture,
  healthHandler,
  mockApi,
  playedState,
  renderRoute,
  reportFixture,
  RULESET,
  RULESET_URL,
  rulesetHandler,
} from '../test/utils';

// Phase 6 : présidence et gouvernement à l'écran (états produits par le vrai moteur).

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (state: GameState) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({ body: { entries: [], nextBefore: null } }),
});

const elected = playedState((s) => s.quinquennat !== null);

/** Réponses par défaut aux décisions en attente (Matignon, ministères régaliens, textes…). */
const defaults = (state: GameState) =>
  state.pendingDecisions.map((d) => ({ decisionId: d.id, optionId: d.defaultOptionId }));

const step = (state: GameState) =>
  advanceWeek(state, { actions: [], decisions: defaults(state) }, { ruleset: RULESET }).state;

/** Le joueur déclaré élu, puis la semaine de l'investiture : la nomination l'attend. */
function playerAtInvestiture(): GameState {
  const state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors.joueur!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULESET, 'joueur');
  return step(state);
}

describe('quinquennat', () => {
  it('le président joueur nomme son Premier ministre ; son agenda remplace la campagne', async () => {
    const state = playerAtInvestiture();
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);

    const panel = await screen.findByRole('region', { name: /Quinquennat 2027–2032/ });
    expect(
      within(panel).getByText(/Vous êtes président\(e\) de la République/),
    ).toBeInTheDocument();
    // Tuile du gouvernement (vue d'ensemble), lue une fois le jeu de règles chargé.
    expect(await within(panel).findByText(/Matignon est vacant/)).toBeInTheDocument();
    expect(screen.getByText('Nomination')).toBeInTheDocument();
    const decision = screen.getByRole('group', { name: 'Nommer le Premier ministre' });
    const profile = RULESET.quinquennat.profils[0]!;
    // Groupe replié : ses options ne sont rendues qu'une fois déplié (vivier de la phase 14).
    await userEvent.setup().click(within(decision).getByText(/^Profils fictifs \(\d+\)$/));
    expect(
      within(decision).getByRole('radio', {
        name: new RegExp(`${profile.prenom} ${profile.nom} — profil fictif`),
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Agenda du président cette semaine' }),
    ).toBeVisible();
    const catalog = screen.getByRole('list', { name: 'Catalogue des actions' });
    expect(within(catalog).getAllByRole('listitem')).toHaveLength(
      RULESET.quinquennat.actions.length,
    );
    // Remaniement général et remaniement ciblé (phase 15) : aucun gouvernement à remanier.
    for (const reason of within(catalog).getAllByText('Aucun gouvernement en place à remanier.'))
      expect(reason).toBeVisible();
    expect(within(catalog).getAllByText('Aucun gouvernement en place à remanier.')).toHaveLength(2);
    for (const action of RULESET.quinquennat.actions.filter((a) => !a.institution && !a.condition))
      expect(screen.getByRole('button', { name: `Ajouter ${action.libelle}` })).toBeEnabled();
    // Phase 13 : le sommet de crise attend une crise récente (règle du moteur, motif affiché).
    const summit = RULESET.quinquennat.actions.find((a) => a.condition === 'crise-recente')!;
    expect(screen.getByRole('button', { name: `Ajouter ${summit.libelle}` })).toBeDisabled();
    expect(
      within(catalog).getByText(/Aucune crise dans les 4 dernières semaines/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ajouter Remaniement du gouvernement' }),
    ).toBeDisabled();
    expect(screen.getByText(/Reste après le plan : 70 h · 0\/8 actions/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter Meeting public' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Résoudre la semaine 32' })).toBeDisabled();
  });

  it('le président joueur pourvoit les ministères régaliens : options groupées, personnalités réelles', async () => {
    const named = step(playerAtInvestiture());
    expect(named.quinquennat!.gouvernement).not.toBeNull();
    mockApi(base(named));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const decision = await screen.findByRole('group', { name: 'Ministère : Intérieur' });
    const groups = within(decision)
      .getAllByText(/\(\d+\)$/)
      .map((n) => n.textContent!.replace(/ \(\d+\)$/, ''));
    expect(groups).toEqual(
      expect.arrayContaining([
        'Proposition du Premier ministre',
        'Personnalités réelles',
        'Profils fictifs',
      ]),
    );
    const current = named.quinquennat!.gouvernement!.ministres.find(
      (m) => m.posteId === 'interieur',
    )!;
    const pending = named.pendingDecisions.find((d) => d.label === 'Ministère : Intérieur')!;
    expect(pending.defaultOptionId).toBe(current.ref);
    // Une personnalité réelle hors du gouvernement, proposée avec sa compétence estimée.
    const members = new Set(
      [
        named.quinquennat!.gouvernement!.premierMinistre,
        ...named.quinquennat!.gouvernement!.ministres,
      ].map((m) => m.ref),
    );
    const figure = RULESET.figures.figures.find((f) => !members.has(f.id))!;
    const user = userEvent.setup();
    await user.click(within(decision).getByText(/^Personnalités réelles \(\d+\)$/));
    // Recherche et filtres du vivier (phase 14), photo de chacun.
    const search = within(decision).getByRole('search', { name: 'Filtrer les personnalités' });
    await user.type(within(search).getByLabelText('Rechercher'), figure.nom);
    expect(within(search).getByText(/sur \d+ personnalités$/)).toBeInTheDocument();
    const radio = within(decision).getByRole('radio', {
      name: new RegExp(`${figure.prenom} ${figure.nom} — ${figure.parti}`),
    });
    expect(radio.closest('label')!.textContent).toMatch(/Compétence estimée : \d+ %/);
    expect(radio.closest('label')!.textContent).toMatch(/aucun propos ne lui est attribué/);
    expect(radio.closest('label')!.querySelector('[data-avatar]')).not.toBeNull();
    await user.click(radio);
    expect(radio).toBeChecked();
    // Filtre par ministère d'expertise : seuls les experts de l'Intérieur restent proposés.
    await user.clear(within(search).getByLabelText('Rechercher'));
    await user.selectOptions(within(search).getByLabelText('Expertise'), 'interieur');
    const experts = RULESET.figures.figures.filter((f) =>
      memberExpertise(RULESET, { nature: 'figure', ref: f.id }).some(
        (e) => e.posteId === 'interieur',
      ),
    );
    const offered = within(decision)
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).value)
      .filter((id) => id.startsWith('figure-') && id !== figure.id);
    expect(offered.length).toBeGreaterThan(0);
    for (const id of offered) expect(experts.some((f) => f.id === id)).toBe(true);
  });

  it('l’écran Gouvernement présente les personnalités réelles nommées et nominables', async () => {
    let state = step(playerAtInvestiture());
    state = step(state);
    const government = state.quinquennat!.gouvernement!;
    const figures = [government.premierMinistre, ...government.ministres].filter(
      (m) => m.nature === 'figure',
    );
    expect(figures.length).toBeGreaterThan(0);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/gouvernement`);
    await screen.findByRole('heading', { name: 'Gouvernement n° 1' });
    const section = screen.getByRole('region', { name: 'Gouvernement n° 1' });
    for (const m of figures) {
      const f = RULESET.figures.figures.find((x) => x.id === m.ref)!;
      expect(within(section).getAllByText(`${f.prenom} ${f.nom}`).length).toBeGreaterThan(0);
    }
    expect(within(section).getAllByText('Estimation').length).toBeGreaterThanOrEqual(
      figures.length,
    );
    // Phase 14 : un ministre expert de son poste affiche sa compétence sur ce poste et la
    // fonction qui fonde l'expertise.
    const experts = government.ministres.filter((m) =>
      memberExpertise(RULESET, m).some((e) => e.posteId === m.posteId),
    );
    expect(experts.length).toBeGreaterThan(0);
    expect(within(section).getAllByText(/^Expertise : /)).toHaveLength(experts.length);
    expect(within(section).getAllByText(/\d+ % sur ce poste/).length).toBe(experts.length);
    // Liste ouverte dans un tiroir (phase 13 : pas de volet dans la section dépliée).
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole('region', { name: 'Personnalités nominables' })).getByRole('button', {
        name: /^Voir les \d+ personnalités de \d+ partis$/,
      }),
    );
    const nominable = screen.getByRole('dialog', { name: 'Personnalités nominables' });
    // Noms lus une fois : le vivier de la phase 14 compte plus de cent personnalités.
    const listed = () =>
      [...nominable.querySelectorAll('li[aria-label]')].map((li) => li.getAttribute('aria-label'));
    expect(listed().sort()).toEqual(
      RULESET.figures.figures.map((f) => `${f.prenom} ${f.nom}`).sort(),
    );
    // Les photos sous licence libre des personnalités réelles (créditées dans Paramètres).
    const photos = nominable.querySelectorAll('img');
    expect(photos.length).toBe(RULESET.figures.figures.filter((f) => f.photo).length);
    // Filtres du vivier : parti, puis ministère d'expertise (règle partagée avec le moteur).
    const search = within(nominable).getByRole('search', { name: 'Filtrer les personnalités' });
    await user.selectOptions(within(search).getByLabelText('Parti'), 'Parti socialiste');
    const socialists = RULESET.figures.figures.filter((f) => f.parti === 'Parti socialiste');
    expect(listed()).toHaveLength(socialists.length);
    await user.selectOptions(within(search).getByLabelText('Parti'), '');
    await user.selectOptions(within(search).getByLabelText('Expertise'), 'justice');
    const justice = RULESET.figures.figures.filter((f) =>
      memberExpertise(RULESET, { nature: 'figure', ref: f.id }).some(
        (e) => e.posteId === 'justice',
      ),
    );
    expect(listed().sort()).toEqual(justice.map((f) => `${f.prenom} ${f.nom}`).sort());
    expect(within(nominable).getAllByText(/^Expertise : .*Justice/).length).toBe(justice.length);
    await user.type(within(search).getByLabelText('Rechercher'), 'zzz');
    expect(
      within(nominable).getByText(/Aucune personnalité ne répond à ces critères/),
    ).toBeVisible();
  });

  it('le joueur battu suit le quinquennat en avance rapide', async () => {
    const calls = mockApi({
      ...base(elected),
      [`POST /api/games/${GAME_ID}/advance`]: () => ({
        body: {
          game: gameFixture({ week: 83 }, elected),
          report: reportFixture({ week: 82, nextWeek: 83 }),
          avanceRapide: { demandees: 52, resolues: 52, arret: null },
        },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const panel = await screen.findByRole('region', { name: /Quinquennat 2027–2032/ });
    expect(within(panel).getByText(/Vous n’êtes pas président\(e\)/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Catalogue des actions' })).toBeNull();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Avance rapide'), '52');
    await user.click(screen.getByRole('button', { name: 'Avancer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      expectedWeek: elected.meta.week,
      actions: [],
      semaines: 52,
    });
    expect(
      await screen.findByText('Avance rapide : 52 semaine(s) résolue(s) sur 52.'),
    ).toBeInTheDocument();
  });

  it('présente le gouvernement, la nature de chaque membre et la feuille de route', async () => {
    let state = elected;
    while (!state.quinquennat!.gouvernement) state = step(state);
    mockApi(base(state));
    // Espace Pouvoir, section dépliée (l'ancienne adresse ouvre désormais le panneau du plateau).
    renderRoute(`/parties/${GAME_ID}/pouvoir#gouvernement`);
    expect(await screen.findByRole('heading', { name: 'Gouvernement n° 1' })).toBeInTheDocument();
    // Section dépliée « Gouvernement » (la vue du mandat, en tête de l'espace, nomme aussi les
    // postes).
    const section = within(document.getElementById('gouvernement')!);
    expect(section.getByText('Premier ministre')).toBeInTheDocument();
    for (const poste of RULESET.quinquennat.postes)
      expect(section.getByText(poste.libelle)).toBeInTheDocument();
    const government = state.quinquennat!.gouvernement!;
    const profiles = [government.premierMinistre, ...government.ministres].filter(
      (m) => m.nature === 'profil',
    );
    // Phase 14 : les personnalités qui acceptent pourvoient d'abord les ministères ; les profils
    // fictifs ne comblent que les postes restants (souvent aucun).
    expect(screen.queryAllByText('Profil fictif')).toHaveLength(profiles.length);
    expect(
      screen.getByText(/Mandat n° 1 du vendredi 14 mai 2027 au jeudi 13 mai 2032/),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Feuille de route' })).toBeInTheDocument();
    expect(
      screen.getByText(/seules celles que le Parlement adopte sont appliquées/),
    ).toBeInTheDocument();
  });

  it('le Parlement : groupes réels, textes et votes simulés par groupe', async () => {
    let state = elected;
    for (let i = 0; i < 40; i++) state = step(state);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/pouvoir#parlement`);
    const assembly = await screen.findByRole('region', {
      name: /Assemblée nationale \(17e législature\)/,
    });
    const table = within(assembly).getByRole('table', { name: 'Groupes politiques et sièges' });
    expect(within(table).getAllByRole('row')).toHaveLength(RULESET.assemblee.groupes.length + 1);
    expect(within(assembly).getByText(/sans aucun nom de député/)).toBeInTheDocument();
    // Hémicycle et jauges dans la vue du mandat, en tête de l'espace ; la section Parlement ne
    // les répète pas (une seule figure de 577 sièges par page) et garde le détail.
    const overview = screen.getByRole('region', { name: 'Vue du mandat' });
    expect(within(assembly).queryByRole('img', { name: /^Hémicycle/ })).toBeNull();
    expect(within(assembly).queryAllByRole('meter')).toEqual([]);
    expect(screen.getAllByRole('img', { name: /^Hémicycle/ })).toHaveLength(1);
    // Hémicycle : un point par siège (577), couleur et sigle de chaque groupe (convention du
    // jeu), légende chiffrée.
    const hemicycle = within(overview).getByRole('img', { name: /^Hémicycle de l’Assemblée/ });
    expect(hemicycle.querySelectorAll('[data-siege]')).toHaveLength(RULESET.assemblee.siegesTotal);
    const supporters = Object.values(state.parlement!.groupes)
      .filter((g) => g.alignement === 'soutien')
      .reduce((sum, g) => sum + g.sieges, 0);
    expect(hemicycle).toHaveAccessibleName(
      expect.stringContaining(`Soutiens du président ${supporters}`),
    );
    for (const g of RULESET.assemblee.groupes.filter((g) => state.parlement!.groupes[g.id]!.sieges))
      expect(hemicycle).toHaveAccessibleName(
        expect.stringContaining(`${g.sigle} ${state.parlement!.groupes[g.id]!.sieges}`),
      );
    expect(
      within(overview).getByText(/convention du jeu, pas des couleurs officielles/),
    ).toBeVisible();
    // Groupe du joueur (battu ici) : liseré lumineux sur ses sièges, signalé dans la légende.
    const mine = hemicycle.querySelectorAll('[data-joueur]');
    expect(mine.length).toBeGreaterThan(0);
    expect(within(assembly).getAllByText(/votre groupe/i).length).toBeGreaterThan(0);
    // Jauges : majorité des membres et tension parlementaire calculées par le moteur.
    const majority = within(overview).getByRole('meter', {
      name: 'Soutiens du président face à la majorité des membres',
    });
    expect(majority).toHaveAttribute('aria-valuenow', String(supporters));
    const tension = within(overview).getByRole('meter', { name: 'Tension parlementaire' });
    expect(tension).toHaveAttribute('aria-valuenow', String(state.parlement!.tension.valeur));
    expect(
      within(assembly).getByRole('list', { name: 'Facteurs de la tension parlementaire' }),
    ).toBeInTheDocument();
    // Le président (candidat fictif) dépose son programme : des textes ont déjà été votés.
    expect(state.parlement!.textes.some((b) => b.votes.length > 0)).toBe(true);
    expect(screen.getAllByText(/votes de groupe simulés/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('table').length).toBeGreaterThan(1);
  });

  it('le président joueur conduit un texte incertain depuis le tableau de bord', async () => {
    const start = JSON.parse(JSON.stringify(elected)) as GameState;
    for (const actor of Object.values(start.actors))
      if (actor.status === 'elu') actor.status = 'battu';
    start.actors.joueur!.status = 'elu';
    // Programme fabriqué pour le test : propositions de centre droit, dans l'ordre.
    start.actors.joueur!.programme.propositions = [
      'eco-simplification-pme',
      'pa-prime-partage-valeur',
      'immi-integration-langue',
    ];
    start.quinquennat = null;
    openQuinquennat(start, RULESET, 'joueur');
    let state = start;
    for (let i = 0; i < 40 && !state.pendingDecisions.some((d) => d.kind === 'texte'); i++)
      state = step(state);
    const decision = state.pendingDecisions.find((d) => d.kind === 'texte');
    expect(decision).toBeDefined();
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const decisions = await screen.findByRole('region', { name: 'Décisions à prendre' });
    expect(within(decisions).getByText('Parlement')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: decision!.label });
    expect(
      within(group).getByRole('radio', { name: /Négocier des amendements/ }),
    ).toBeInTheDocument();
    expect(within(group).getByText(/Projection du gouvernement/)).toBeInTheDocument();
  });

  it('l’économie : valeurs de départ réelles, valeurs simulées et facteurs', async () => {
    let state = elected;
    for (let i = 0; i < 5; i++) state = step(state);
    const { state: next, report } = advanceWeek(
      state,
      { actions: [], decisions: defaults(state) },
      { ruleset: RULESET },
    );
    state = next;
    const change = report.economie.find((c) => c.indicateur === 'chomage')!;
    expect(change.factors.length).toBeGreaterThan(0);
    mockApi({
      ...base(state),
      [`GET ${JOURNAL_URL}`]: () => ({
        body: {
          entries: [
            {
              id: 'bilan',
              week: report.week,
              type: 'semaine',
              nature: 'simule',
              createdAt: '2027-06-01T00:00:00.000Z',
              report,
              details: {},
            },
          ],
          nextBefore: null,
        },
      }),
    });
    renderRoute(`/parties/${GAME_ID}/economie`);
    const unemployment = await screen.findByRole('listitem', { name: 'Taux de chômage' });
    // Facteurs de la dernière semaine visibles à plat (phase 13 : aucun volet imbriqué).
    expect(
      await within(unemployment).findByText(new RegExp(`^Semaine ${report.week} : `)),
    ).toBeVisible();
    const factor = change.factors[0]!.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(within(unemployment).getByText(new RegExp(`^${factor} : `))).toBeVisible();
    for (const region of screen.getAllByRole('region', { name: 'Économie' }))
      expect(region.querySelector('details')).toBeNull();
    // Étiquette courte à l'écran ; la série et son lien sont dans Paramètres → Crédits.
    expect(within(unemployment).getByText('Donnée réelle')).toBeInTheDocument();
    expect(within(unemployment).queryAllByRole('link')).toEqual([]);
    const tensions = screen.getByRole('listitem', {
      name: 'Tensions sociales (indicateur de jeu, 0 à 100)',
    });
    expect(within(tensions).getByText('Convention du jeu')).toBeInTheDocument();
    expect(screen.getByText(/jamais une prévision/)).toBeInTheDocument();
  });

  it('les crises : catalogue fictif et décision en attente', async () => {
    mockApi(base(elected));
    renderRoute(`/parties/${GAME_ID}/crises`);
    const catalog = await screen.findByRole('region', { name: 'Crises possibles (fictives)' });
    for (const crisis of RULESET.crises)
      expect(within(catalog).getByRole('listitem', { name: crisis.libelle })).toBeInTheDocument();
    expect(within(catalog).getAllByText('Fictif').length).toBe(RULESET.crises.length);
    const heatwave = within(catalog).getByRole('listitem', { name: 'Canicule et sécheresse' });
    expect(heatwave).toHaveTextContent('Saison : juin, juillet, août.');
    expect(screen.getByText('Aucune crise n’attend de décision.')).toBeInTheDocument();
    expect(screen.getByText('Aucune conséquence durable en cours.')).toBeInTheDocument();
  });

  it('les conséquences durables d’un choix de crise, avec leurs fragilités', async () => {
    const certain = JSON.parse(JSON.stringify(RULESET)) as typeof RULESET;
    for (const crisis of certain.crises)
      crisis.probabiliteHebdomadaire = crisis.id === 'crise-cyberattaque' ? 1 : 0;
    const advance = (state: GameState, ruleset: typeof RULESET, option?: string) =>
      advanceWeek(
        state,
        {
          actions: [],
          decisions: state.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.kind === 'crise' && option ? option : d.defaultOptionId,
          })),
        },
        { ruleset },
      ).state;
    let state = playerAtInvestiture();
    while (!state.quinquennat!.gouvernement) state = advance(state, certain);
    while (!state.pendingDecisions.some((d) => d.kind === 'crise')) state = advance(state, certain);
    const calm = JSON.parse(JSON.stringify(certain)) as typeof RULESET;
    for (const crisis of calm.crises) crisis.probabiliteHebdomadaire = 0;
    state = advance(advance(state, calm, 'minimiser'), calm);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/crises`);
    const lasting = await screen.findByRole('region', { name: 'Conséquences durables' });
    expect(within(lasting).getByText('Failles informatiques non corrigées')).toBeVisible();
    expect(within(lasting).getByText('Suite d’une décision')).toBeVisible();
    expect(
      within(lasting).getByText(/Cyberattaque contre des hôpitaux plus probable \(× 3\)/),
    ).toBeVisible();
    cleanup();

    // Achevée, elle reste listée à plat (phase 13 : aucun volet dans la section dépliée).
    const ended = JSON.parse(JSON.stringify(state)) as GameState;
    for (const c of ended.consequences) {
      c.debut = Math.min(c.debut, ended.meta.week - 2);
      c.fin = ended.meta.week - 1;
    }
    mockApi(base(ended));
    renderRoute(`/parties/${GAME_ID}/crises`);
    const done = await screen.findByRole('list', { name: /^Conséquences achevées \(\d+\)$/ });
    expect(
      within(done).getByText(/^Failles informatiques non corrigées \(semaines \d+ à \d+\)$/),
    ).toBeVisible();
    expect(screen.getByText('Aucune conséquence durable en cours.')).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Conséquences durables' }).querySelector('details'),
    ).toBeNull();
  });

  it('les législatives : Assemblée de 2024 réelle, filtre par département, sans nom', async () => {
    mockApi(base(elected));
    renderRoute(`/parties/${GAME_ID}/legislatives`);
    const calendar = await screen.findByRole('region', { name: 'Calendrier' });
    expect(within(calendar).getByText(/premier tour le dimanche 10 juin 2029/)).toBeInTheDocument();
    expect(within(calendar).getByText(/Hypothèse : dates réelles fixées par décret/)).toBeVisible();
    expect(within(calendar).getByText(/possible depuis le lundi 7 juillet 2025/)).toBeVisible();
    const composition = screen.getByRole('region', { name: 'Dernières élections' });
    expect(within(composition).getByText('Résultats réels')).toBeInTheDocument();
    const blocs = within(composition).getByRole('table', {
      name: 'Sièges et voix du premier tour par bloc',
    });
    expect(within(blocs).getAllByRole('row')).toHaveLength(RULESET.legislatives.blocs.length + 1);
    const seats = within(blocs)
      .getAllByRole('row')
      .slice(1)
      .map((row) => Number(within(row).getAllByRole('cell')[0]!.textContent));
    expect(seats.reduce((a, b) => a + b, 0)).toBe(
      Object.values(elected.parlement!.groupes).reduce((sum, g) => sum + g.sieges, 0),
    );

    const districts = screen.getByRole('region', {
      name: 'Résultats par circonscription en 2024 (réels)',
    });
    const table = within(districts).getByRole('table');
    const ain = RULESET.legislatives2024.circonscriptions.filter((d) => d.departement === '01');
    expect(within(table).getAllByRole('row')).toHaveLength(ain.length + 1);
    expect(
      within(table).getByRole('rowheader', { name: 'Ain — 1ère circonscription' }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(within(districts).getByLabelText('Département'), '2A');
    const corse = RULESET.legislatives2024.circonscriptions.filter((d) => d.departement === '2A');
    expect(within(table).getAllByRole('row')).toHaveLength(corse.length + 1);
    expect(within(districts).getByText(/sans aucun nom de candidat/)).toBeInTheDocument();

    // Phase 14 : figures des blocs — personnalités réelles des partis de chaque bloc, avec photo
    // et fonction relevée dans les sources ; aucune candidature dans une circonscription prêtée.
    const figures = screen.getByRole('region', { name: 'Figures des blocs' });
    expect(
      within(figures).getByText(/Aucune candidature dans une circonscription ni aucun propos/),
    ).toBeInTheDocument();
    for (const bloc of RULESET.legislatives.blocs)
      expect(within(figures).getByText(bloc.libelle)).toBeInTheDocument();
    const left = RULESET.legislatives.blocs.find((b) => b.id === 'gauche')!;
    await user.click(
      within(figures).getByRole('button', {
        name: `Voir les personnalités du bloc ${left.libelle}`,
      }),
    );
    const drawer = screen.getByRole('dialog', { name: left.libelle });
    const people = within(drawer).getByRole('list', {
      name: `Personnalités du bloc ${left.libelle}`,
    });
    const expected = RULESET.figures.figures.filter(
      (f) => f.groupe !== null && left.groupes.includes(f.groupe),
    );
    for (const f of expected)
      expect(within(people).getByText(`${f.prenom} ${f.nom}`)).toBeInTheDocument();
    // Candidats réels de la partie rattachés à un groupe du bloc, signalés comme tels.
    const attached = RULESET.figures.rattachements.filter((r) => left.groupes.includes(r.groupe));
    expect(within(people).queryAllByText('Candidat(e) de la partie')).toHaveLength(attached.length);
    expect(people.querySelectorAll('img').length).toBeGreaterThan(expected.length / 2);
  });

  it('les législatives après une dissolution : premier tour, puis nouvelle Assemblée simulée', async () => {
    let state = playerAtInvestiture();
    while (!state.quinquennat!.gouvernement) state = step(state);
    const dissolved = advanceWeek(
      state,
      { actions: [{ actionId: 'dissolution' }], decisions: defaults(state) },
      { ruleset: RULESET },
    ).state;
    let current = dissolved;
    while (!current.legislatives!.premierTour) current = step(current);
    mockApi(base(current));
    renderRoute(`/parties/${GAME_ID}/legislatives`);
    const calendar = await screen.findByRole('region', { name: 'Calendrier' });
    expect(within(calendar).getByText(/Élections anticipées après la dissolution/)).toBeVisible();
    expect(within(calendar).getByText(/des élections législatives sont en cours/)).toBeVisible();
    const pending = screen.getByRole('region', {
      name: 'Premier tour en cours (résultats simulés)',
    });
    expect(within(pending).getAllByText('Second tour à venir').length).toBeGreaterThan(0);
    cleanup();

    while (current.legislatives!.premierTour) current = step(current);
    mockApi(base(current));
    renderRoute(`/parties/${GAME_ID}/legislatives`);
    const composition = await screen.findByRole('region', { name: 'Dernières élections' });
    expect(
      within(composition).getByText(/anticipées après dissolution \(résultats simulés\)/),
    ).toBeInTheDocument();
    expect(within(composition).getByText('Simulation')).toBeInTheDocument();
    expect(within(composition).getByText(/Majorité absolue : 289 sièges sur 577/)).toBeVisible();
    expect(
      within(composition).getByText(/Aucun résultat simulé n’est une prévision/),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Résultats par circonscription (simulés)' }),
    ).toBeInTheDocument();
  });

  it('le président joueur ne peut pas dissoudre deux fois dans l’année', async () => {
    let state = playerAtInvestiture();
    while (!state.quinquennat!.gouvernement) state = step(state);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const label = `Ajouter ${RULESET.quinquennat.actions.find((a) => a.id === 'dissolution')!.libelle}`;
    const dissolve = await screen.findByRole('button', { name: label });
    expect(dissolve).toBeEnabled();
    cleanup();

    let current = advanceWeek(
      state,
      { actions: [{ actionId: 'dissolution' }], decisions: defaults(state) },
      { ruleset: RULESET },
    ).state;
    while (current.legislatives!.derniere.motif === 'reelles-2024') current = step(current);
    mockApi(base(current));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const catalog = await screen.findByRole('list', { name: 'Catalogue des actions' });
    expect(
      within(catalog).getByText(/Pas de nouvelle dissolution dans l’année qui suit/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
  });

  it('la fin du quinquennat : bilan, archives et campagne de 2032 au calendrier transposé', async () => {
    let state = elected;
    while (state.meta.phase === 'presidence') state = step(state);
    expect(state.meta.date).toBe('2031-09-29');
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/bilan`);
    const review = await screen.findByRole('region', { name: /Quinquennat 2027–2032/ });
    expect(within(review).getByText('Simulation')).toBeInTheDocument();
    const table = within(review).getByRole('table', {
      name: 'Indicateurs au début et à la fin du quinquennat',
    });
    expect(within(table).getByRole('rowheader', { name: 'Popularité du président' })).toBeVisible();
    expect(within(table).getByRole('rowheader', { name: 'Taux de chômage' })).toBeVisible();
    const { bilan } = state.historique.quinquennats[0]!;
    expect(
      within(review).getByText(
        new RegExp(`^${bilan.reformes.adoptees.length} réforme\\(s\\) adoptée\\(s\\)`),
      ),
    ).toBeInTheDocument();
    expect(
      within(review).getByText(/Aucune n’est une prévision|aucune n’est une prévision/),
    ).toBeVisible();
    // Phase 15 : note du mandat sur 20, objectif par objectif (barème du jeu).
    expect(bilan.note).not.toBeNull();
    expect(within(review).getByRole('heading', { name: 'Note du mandat' })).toBeVisible();
    expect(within(review).getByText(`${bilan.note!.valeur}/20`)).toBeVisible();
    expect(within(review).getByText(bilan.note!.mention)).toBeVisible();
    expect(within(review).getAllByText(/^(Atteint|Manqué)$/)).toHaveLength(
      bilan.note!.objectifs.length,
    );
    const archives = screen.getByRole('region', { name: 'Présidentielles précédentes' });
    expect(within(archives).getByText('2027')).toBeInTheDocument();
    cleanup();

    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const panel = await screen.findByRole('region', { name: 'Présidentielle 2032' });
    expect(within(panel).getByText(/Le quinquennat 2027–2032 de/)).toBeVisible();
    expect(within(panel).getByRole('link', { name: 'Le bilan du quinquennat' })).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: /^Calendrier électoral/ }));
    const calendar = screen.getByRole('region', { name: 'Calendrier électoral' });
    expect(within(calendar).getByText(/dimanche 18 avril 2032/)).toBeVisible();
    expect(within(calendar).getAllByText('Date hypothèse de jeu').length).toBeGreaterThan(1);
    expect(screen.queryByRole('region', { name: /Quinquennat 2027–2032/ })).toBeNull();
  });

  it('le bilan hebdomadaire du quinquennat : économie et législatives, avec leurs facteurs', async () => {
    let state = playerAtInvestiture();
    while (!state.quinquennat!.gouvernement) state = step(state);
    let result = advanceWeek(
      state,
      { actions: [{ actionId: 'dissolution' }], decisions: defaults(state) },
      { ruleset: RULESET },
    );
    while (!result.report.legislatives || result.report.legislatives.tour !== 2)
      result = advanceWeek(
        result.state,
        {
          actions: [],
          decisions: result.state.pendingDecisions.map((d) => ({
            decisionId: d.id,
            optionId: d.defaultOptionId,
          })),
        },
        { ruleset: RULESET },
      );
    const { report } = result;
    expect(report.economie.length).toBeGreaterThan(0);
    render(
      <WeeklyReportView
        report={report}
        state={result.state}
        blocLabel={(id) => RULESET.legislatives.blocs.find((b) => b.id === id)!.libelle}
      />,
    );
    const legislatives = screen.getByRole('region', { name: 'Législatives de la semaine' });
    expect(
      within(legislatives).getByRole('heading', { name: /Élections législatives : second tour/ }),
    ).toBeVisible();
    expect(within(legislatives).getByText(/Nouvelle Assemblée : Gauche \d+/)).toBeVisible();
    const economy = screen.getByRole('region', { name: 'Économie de la semaine' });
    expect(within(economy).getByText('Simulation')).toBeVisible();
    expect(within(economy).getAllByText(/Conjoncture \(modèle de jeu\)/).length).toBeGreaterThan(0);
  });

  it('pendant la campagne suivante, le Parlement est figé et l’annonce', async () => {
    let state = elected;
    while (state.meta.phase === 'presidence') state = step(state);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/parlement`);
    expect(
      await screen.findByText(/Campagne présidentielle en cours : le Parlement n’est pas simulé/),
    ).toBeVisible();
    expect(screen.getByRole('img', { name: /^Hémicycle de l’Assemblée/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Textes du quinquennat précédent' })).toBeVisible();
  });
});
