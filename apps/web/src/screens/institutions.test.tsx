import { advanceWeek, openQuinquennat } from '@r2027/engine';
import {
  isOptionalDecision,
  mandateGrade,
  type GameState,
  type MemberRef,
  type PendingDecision,
  type Ruleset,
  type WeeklyReport,
} from '@r2027/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyDebrief } from '../components/WeeklyDebrief';
import { usePlanStore } from '../stores/plan';
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
import { memberInfo } from './Government';
import { TripPlanner } from './map/TripPlanner';

// Phase 15 : le mandat vivant à l'écran — urgences ministérielles et questions au gouvernement
// « en direct » en pop-up, remaniement ciblé, Conseil des ministres, objectifs et note du mandat,
// succès, déplacements programmés depuis la carte. États produits par le vrai moteur.

const JOURNAL_URL = `/api/games/${GAME_ID}/journal?limit=10`;
const base = (state: GameState, reports: WeeklyReport[] = []) => ({
  'GET /api/health': healthHandler,
  [`GET /api/games/${GAME_ID}`]: () => ({ body: gameFixture({}, state) }),
  [`GET ${RULESET_URL}`]: rulesetHandler,
  [`GET ${JOURNAL_URL}`]: () => ({
    body: {
      entries: reports.map((report) => ({
        id: `semaine-${report.week}`,
        week: report.week,
        type: 'semaine_resolue',
        nature: 'simule',
        createdAt: '2027-06-01T00:00:00.000Z',
        report,
        details: {},
      })),
      nextBefore: null,
    },
  }),
});

/** Jeu de règles du test : seules les urgences demandées peuvent survenir. */
function withUrgencies(probabilities: Record<string, number> = {}): Ruleset {
  const rules = JSON.parse(JSON.stringify(RULESET)) as Ruleset;
  for (const u of rules.urgences.liste) u.probabiliteHebdomadaire = probabilities[u.id] ?? 0;
  return rules;
}
const QUIET = withUrgencies();

const step = (state: GameState, ruleset = QUIET) =>
  advanceWeek(
    state,
    {
      actions: [],
      decisions: state.pendingDecisions.map((d) => ({
        decisionId: d.id,
        optionId: d.defaultOptionId,
      })),
    },
    { ruleset },
  );

const elected = playedState((s) => s.quinquennat !== null);

/** Le joueur déclaré élu ; la semaine de l'investiture est résolue (premiers succès). */
const inaugural = (() => {
  const state = JSON.parse(JSON.stringify(elected)) as GameState;
  for (const actor of Object.values(state.actors))
    if (actor.status === 'elu') actor.status = 'battu';
  state.actors.joueur!.status = 'elu';
  state.quinquennat = null;
  openQuinquennat(state, RULESET, 'joueur');
  return step(state);
})();

/** Gouvernement nommé et ministres confirmés. */
const governed = (() => {
  let state = inaugural.state;
  while (
    !state.quinquennat!.gouvernement ||
    state.pendingDecisions.some((d) => d.kind === 'gouvernement')
  )
    state = step(state).state;
  return state;
})();

/** Membre en charge d'une décision (poste, sinon le Premier ministre), comme le moteur. */
function inCharge(state: GameState, decision: PendingDecision): MemberRef {
  const government = state.quinquennat!.gouvernement!;
  return (
    government.ministres.find((m) => m.posteId === decision.posteId) ?? government.premierMinistre
  );
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Referme les pop-ups d'intervention ouverts d'eux-mêmes (urgence, séance de questions). */
async function closeSpotlights(user: ReturnType<typeof userEvent.setup>) {
  for (
    let dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    dialog;
    dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')
  )
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
}

beforeEach(() =>
  usePlanStore.setState({ actions: [], ajouter: [], retirer: [], proposer: [], key: null }),
);

describe('questions au gouvernement (phase 15)', () => {
  // Semaine de session avec une séance en attente, et aucune autre décision à prendre.
  let state = governed;
  for (
    let i = 0;
    i < 40 &&
    !(
      state.pendingDecisions.some((d) => d.kind === 'qag') &&
      state.pendingDecisions.every(isOptionalDecision)
    );
    i++
  )
    state = step(state).state;
  const sitting = state;

  it('s’ouvre en direct : hémicycle, groupe qui interpelle, tension et ministre qui répond', async () => {
    const qag = sitting.pendingDecisions.find((d) => d.kind === 'qag');
    expect(qag).toBeDefined();
    mockApi(base(sitting));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const dialog = await screen.findByRole('dialog', { name: qag!.label });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Direct')).toBeInTheDocument();
    expect(within(dialog).getByText('Questions au gouvernement')).toBeInTheDocument();
    const group = RULESET.assemblee.groupes.find((g) => g.id === qag!.groupeId)!;
    // Hémicycle et ministre, une fois le jeu de règles chargé.
    const hemicycle = await within(dialog).findByRole('img', {
      name: /^Hémicycle pendant les questions au gouvernement/,
    });
    expect(hemicycle).toHaveAccessibleName(
      expect.stringContaining(`Le groupe ${group.sigle} interpelle le gouvernement.`),
    );
    expect(hemicycle.querySelectorAll('[data-siege]')).toHaveLength(RULESET.assemblee.siegesTotal);
    expect(hemicycle.querySelectorAll('[data-interpelle]').length).toBe(
      sitting.parlement!.groupes[group.id]!.sieges,
    );
    expect(within(dialog).getByRole('meter', { name: 'Tension parlementaire' })).toHaveAttribute(
      'aria-valuenow',
      String(sitting.parlement!.tension.valeur),
    );
    // Ministre du thème (ou Premier ministre), avec sa photo ; aucun propos ne lui est attribué.
    const minister = memberInfo(sitting, RULESET, inCharge(sitting, qag!));
    expect(within(dialog).getByText(minister.name)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Répond pour le gouvernement · /)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/aucun député n’est nommé, aucun propos n’est rapporté/),
    ).toBeVisible();
    const choices = within(dialog).getByRole('list', { name: 'Choix possibles' });
    expect(within(choices).getAllByRole('button')).toHaveLength(
      RULESET.parlement.qag.reponses.length,
    );
    expect(within(choices).getByText('Réponse par défaut')).toBeInTheDocument();
  });

  it('reste facultative : la semaine se résout sans réponse, ou avec la réplique choisie', async () => {
    const qag = sitting.pendingDecisions.find((d) => d.kind === 'qag')!;
    mockApi(base(sitting));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: qag.label });
    await user.click(
      within(dialog).getByRole('button', { name: 'Laisser le gouvernement répondre sur le fond' }),
    );
    expect(screen.queryByRole('dialog', { name: qag.label })).not.toBeInTheDocument();
    const decision = screen.getByRole('group', { name: qag.label });
    expect(
      within(decision).getByText('Facultatif : réponse sur le fond par défaut'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Résoudre la semaine ${sitting.meta.week}` }),
    ).toBeEnabled();
    // La séance se rouvre à la demande ; une réplique choisie la referme et coche la réponse.
    await user.click(within(decision).getByRole('button', { name: 'Suivre la séance en direct' }));
    const again = screen.getByRole('dialog', { name: qag.label });
    await user.click(within(again).getByRole('button', { name: /^Contre-attaquer/ }));
    expect(screen.queryByRole('dialog', { name: qag.label })).not.toBeInTheDocument();
    expect(within(decision).getByRole('radio', { name: /^Contre-attaquer/ })).toBeChecked();
  });
});

describe('urgences ministérielles (phase 15)', () => {
  it('fait intervenir le ministre en charge, avec un choix à impact direct', async () => {
    const urgent = withUrgencies({ 'urgence-cyberattaque': 1 });
    let state = governed;
    for (let i = 0; i < 20 && !state.pendingDecisions.some((d) => d.kind === 'urgence'); i++)
      state = step(state, urgent).state;
    const urgence = state.pendingDecisions.find((d) => d.kind === 'urgence');
    expect(urgence).toBeDefined();
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const dialog = await screen.findByRole('dialog', { name: urgence!.label });
    expect(within(dialog).getByText('Urgence ministérielle (fictive)')).toBeInTheDocument();
    const minister = memberInfo(state, RULESET, inCharge(state, urgence!));
    const poste = RULESET.quinquennat.postes.find((p) => p.id === urgence!.posteId)!;
    expect(await within(dialog).findByText(minister.name)).toBeInTheDocument();
    expect(within(dialog).getByText(`En charge · ${poste.libelle}`)).toBeInTheDocument();
    expect(
      within(dialog).getByText('Situation fictive ; effets : hypothèses du jeu.'),
    ).toBeVisible();
    // Choix binaire : chaque option porte sa conséquence, décrite par le moteur.
    const choices = within(dialog).getByRole('list', { name: 'Choix possibles' });
    expect(within(choices).getAllByRole('button')).toHaveLength(2);
    const other = urgence!.options.find((o) => o.id !== urgence!.defaultOptionId)!;
    expect(within(choices).getByText(other.description)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      within(choices).getByRole('button', { name: new RegExp(`^${escape(other.libelle)}`) }),
    );
    expect(screen.queryByRole('dialog', { name: urgence!.label })).not.toBeInTheDocument();
    const decision = screen.getByRole('group', { name: urgence!.label });
    expect(
      within(decision).getByRole('radio', { name: new RegExp(`^${escape(other.libelle)}`) }),
    ).toBeChecked();
  });
});

describe('gouvernement vivant (phase 15)', () => {
  it('remplace un ministre choisi : chaque ministère pourvu et son titulaire', async () => {
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const user = userEvent.setup();
    const add = await screen.findByRole('button', { name: 'Ajouter Remplacer un ministre' });
    await closeSpotlights(user);
    expect(add).toBeEnabled();
    await user.click(add);
    const planned = screen.getByRole('list', { name: 'Actions programmées' });
    const select = within(planned).getByRole('combobox', {
      name: 'Cible de l’action n° 1 (Remplacer un ministre)',
    });
    const government = governed.quinquennat!.gouvernement!;
    expect(within(select).getAllByRole('option')).toHaveLength(government.ministres.length + 1);
    for (const m of government.ministres) {
      const poste = RULESET.quinquennat.postes.find((p) => p.id === m.posteId)!;
      expect(
        within(select).getByRole('option', {
          name: `${poste.libelle} — ${memberInfo(governed, RULESET, m).name}`,
        }),
      ).toHaveValue(m.posteId);
    }
    // Sans ministère choisi, la semaine ne se résout pas.
    expect(
      screen.getByRole('button', { name: `Résoudre la semaine ${governed.meta.week}` }),
    ).toBeDisabled();
  });

  it('le Conseil des ministres suit la popularité prêtée et la loyauté de chaque membre', async () => {
    const { state, report } = step(governed);
    expect(report.conseil).not.toBeNull();
    mockApi(base(state, [report]));
    renderRoute(`/parties/${GAME_ID}/conseil`);
    const members = await screen.findByRole('list', { name: 'Membres du gouvernement' });
    const government = state.quinquennat!.gouvernement!;
    expect(members.querySelectorAll(':scope > li')).toHaveLength(government.ministres.length + 1);
    // Compte rendu lu dans le dernier bilan du journal.
    expect(
      await screen.findByText(/^Compte rendu du dernier Conseil des ministres\./),
    ).toBeVisible();
    // Premier ministre : popularité prêtée (en %) et loyauté (sur 100), lues dans l'état.
    const pm = government.premierMinistre;
    const track = state.quinquennat!.suivi[pm.ref]!;
    const card = within(members)
      .getByText(memberInfo(state, RULESET, pm).name)
      .closest('li')!;
    expect(
      within(card).getByText(`Premier ministre · en poste depuis la semaine ${track.depuis}`),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent(`${Math.round(track.popularite / 100)} %`);
    expect(card).toHaveTextContent(`${track.loyaute}/100`);
    // Facteurs de la variation de la semaine, dans une infobulle.
    const explained = report.conseil!.ministres.filter(
      (m) => m.popularite.facteurs.length + m.loyaute.facteurs.length > 0,
    );
    expect(explained.length).toBeGreaterThan(0);
    expect(
      within(members).getAllByRole('button', {
        name: /^Facteurs de la (popularité prêtée|loyauté) : /,
      }).length,
    ).toBeGreaterThanOrEqual(explained.length);
    expect(screen.getByText(/aucun propos n’est attribué aux personnalités réelles/)).toBeVisible();
  });

  it('sans compte rendu au journal (partie importée), présente l’état du gouvernement', async () => {
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/conseil`);
    const members = await screen.findByRole('list', { name: 'Membres du gouvernement' });
    expect(
      screen.getByText(
        /n’est pas dans le journal récent de la partie \(partie importée ou reprise\)/,
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Le premier Conseil des ministres se tiendra/)).toBeNull();
    // Valeurs suivies, sans variation de la semaine ni facteurs (aucun bilan lu).
    expect(within(members).getAllByText(/^\d+\/100$/).length).toBe(
      governed.quinquennat!.gouvernement!.ministres.length + 1,
    );
    expect(within(members).queryAllByRole('button', { name: /^Facteurs/ })).toEqual([]);
  });

  it('fixe les objectifs du mandat et en donne la note provisoire', async () => {
    const grade = mandateGrade(governed, RULESET);
    expect(grade).not.toBeNull();
    mockApi(base(governed));
    renderRoute(`/parties/${GAME_ID}/pouvoir`);
    const overview = await screen.findByRole('region', { name: 'Vue du mandat' });
    const list = within(overview).getByRole('list', { name: 'Objectifs du mandat' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(RULESET.objectifs.nombre);
    for (const o of grade!.objectifs) {
      const definition = RULESET.objectifs.catalogue.find((c) => c.id === o.id)!;
      expect(within(list).getByText(definition.libelle)).toBeInTheDocument();
    }
    expect(within(overview).getByText(`${grade!.valeur}/20`)).toBeInTheDocument();
    // Note provisoire sans mention : la mention n'est donnée qu'au bilan du mandat.
    expect(
      within(overview).getByText(/^note provisoire, si le mandat s’arrêtait aujourd’hui/),
    ).toBeVisible();
    expect(within(overview).queryByText(grade!.mention)).toBeNull();
    expect(within(overview).getByText(/jamais\s+des prévisions/)).toBeInTheDocument();
  });
});

describe('succès (phase 15)', () => {
  it('liste au QG les succès débloqués et ceux qui restent à conquérir', async () => {
    const state = inaugural.state;
    expect(state.succes.length).toBeGreaterThan(0);
    mockApi(base(state));
    renderRoute(`/parties/${GAME_ID}/tableau-de-bord`);
    const toggle = await screen.findByRole('button', { name: /^Succès/ });
    expect(toggle).toHaveTextContent(
      `${state.succes.length} débloqué(s) sur ${RULESET.succes.liste.length}`,
    );
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const s of state.succes)
      expect(
        screen.getByText(RULESET.succes.liste.find((a) => a.id === s.id)!.libelle),
      ).toBeVisible();
    expect(screen.getAllByText(/^Débloqué en semaine \d+$/)).toHaveLength(state.succes.length);
    expect(screen.getAllByText('À débloquer')).toHaveLength(
      RULESET.succes.liste.length - state.succes.length,
    );
  });

  it('le débriefing annonce les succès de la semaine, puis le Conseil des ministres', () => {
    const { report, state } = inaugural;
    expect(report.succes.length).toBeGreaterThan(0);
    const achievement = (id: string) => RULESET.succes.liste.find((a) => a.id === id) ?? null;
    render(
      <MemoryRouter>
        <WeeklyDebrief
          report={report}
          state={state}
          gameId={GAME_ID}
          achievement={achievement}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    const unlocked = screen.getByRole('region', {
      name: report.succes.length > 1 ? 'Succès débloqués' : 'Succès débloqué',
    });
    for (const id of report.succes)
      expect(within(unlocked).getByText(achievement(id)!.libelle)).toBeInTheDocument();
    cleanup();

    const council = step(governed);
    render(
      <MemoryRouter>
        <WeeklyDebrief
          report={council.report}
          state={council.state}
          gameId={GAME_ID}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    const section = screen.getByRole('region', { name: 'Conseil des ministres' });
    expect(section).toHaveTextContent(
      `${council.report.conseil!.ministres.length} membre(s) du gouvernement suivi(s)`,
    );
  });
});

describe('déplacements choisis sur la carte (phase 15)', () => {
  const render2A = (state: GameState) =>
    render(
      <MemoryRouter>
        <TripPlanner game={gameFixture({}, state)} ruleset={RULESET} code="2A" nom="Corse-du-Sud" />
      </MemoryRouter>,
    );
  const trip = RULESET.quinquennat.actions.find((a) => a.id === 'deplacement-presidentiel')!;
  const factory = RULESET.quinquennat.actions.find((a) => a.id === 'visite-usine')!;
  const button = (a: typeof trip) => ({ name: `${a.libelle} (${a.cout.tempsHeures} h)` });

  it('ajoute une visite du président dans ce département à l’agenda de la semaine', async () => {
    render2A(governed);
    const section = screen.getByRole('region', { name: 'Déplacement du président : Corse-du-Sud' });
    expect(
      within(section).getByText('Aucun déplacement du président ici pendant le mandat.'),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(section).getByRole('button', button(trip)));
    expect(usePlanStore.getState().actions).toEqual([
      { actionId: 'deplacement-presidentiel', cible: '2A' },
    ]);
    expect(within(section).getByRole('status')).toHaveTextContent(
      `« ${trip.libelle} » ajouté à l’agenda de la semaine.`,
    );
    expect(within(section).getByRole('link', { name: 'Voir l’agenda au QG' })).toBeVisible();
    // Une visite d'usine au plus par semaine : la seconde est refusée, motif affiché.
    await user.click(within(section).getByRole('button', button(factory)));
    expect(within(section).getByRole('button', button(factory))).toBeDisabled();
    expect(within(section).getByText('Une seule fois par semaine.')).toBeInTheDocument();
  });

  it('rappelle les déplacements du mandat dans le département, comptés par le moteur', () => {
    const { state } = advanceWeek(
      governed,
      {
        actions: [{ actionId: 'deplacement-presidentiel', cible: '2A' }],
        decisions: governed.pendingDecisions.map((d) => ({
          decisionId: d.id,
          optionId: d.defaultOptionId,
        })),
      },
      { ruleset: QUIET },
    );
    expect(state.quinquennat!.deplacements['2A']).toBe(1);
    render2A(state);
    expect(
      screen.getByText(
        '1 déplacement(s) du président ici pendant le mandat (trace en pointillés sur la carte).',
      ),
    ).toBeInTheDocument();
  });
});
