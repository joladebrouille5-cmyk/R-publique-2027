import { advanceWeek } from '@r2027/engine';
import type { Ruleset } from '@r2027/shared';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { initialState, jingles, recordSound, reduceMotion, RULESET } from '../test/utils';
import { formatEuros } from '../labels';
import { teamBriefing } from '../components/CampaignTeam';
import { DEMO_DEPARTEMENTS } from '../test/geo';
import { boardShapes } from './geometry';
import { Verdict, VERDICT_STEP_MS } from './Verdict';

// Verdict de la semaine (phase 25, ancien débriefing de la phase 11) : un vrai bilan du moteur,
// rien de recalculé à l'écran. Ces tests lisent le verdict entier (mouvement réduit).

/**
 * Seul l'événement « Salle comble » peut survenir, et il survient après un meeting (aucun
 * rendez-vous d'élus, phase 15).
 */
const RULES = (() => {
  const rules = JSON.parse(JSON.stringify(RULESET)) as Ruleset;
  for (const event of rules.evenements)
    event.probabiliteHebdomadaire = event.id === 'salle-comble' ? 1 : 0;
  rules.parrainages.rendezVous.probabiliteHebdo = 0;
  return rules;
})();

function resolved(rules: Ruleset = RULES) {
  const start = initialState();
  start.actors[start.player.actorId!]!.resources.popularite = 3_000;
  return advanceWeek(
    start,
    {
      actions: [
        { actionId: 'meeting' },
        { actionId: 'interview', cible: 'france-inter', posture: 'pedagogique' },
        { actionId: 'collecte', posture: 'offensive' },
      ],
      decisions: [],
    },
    { ruleset: rules },
  );
}

function show(onClose = vi.fn(), rules: Ruleset = RULES) {
  const { state, report } = resolved(rules);
  reduceMotion();
  render(
    <MemoryRouter>
      <button type="button">Résoudre la semaine 0</button>
      <Verdict
        report={report}
        state={state}
        gameId="partie"
        eventFamily={(id) => RULES.evenements.find((e) => e.id === id)?.famille ?? null}
        onDone={onClose}
      />
    </MemoryRouter>,
  );
  return { state, report, onClose };
}

describe('verdict de la semaine : le bilan', () => {
  it('boucle la semaine d’un coup de tampon, ou annonce un événement majeur par une nouvelle (phases 19 et 21)', () => {
    const calls = recordSound();
    show();
    expect(jingles(calls)).toEqual(['jingle:tampon']);
    cleanup();
    // Même semaine, mais « Salle comble » déclaré majeur dans le jeu de règles du test.
    const major = JSON.parse(JSON.stringify(RULES)) as Ruleset;
    major.evenements.find((e) => e.id === 'salle-comble')!.majeur = true;
    const { report } = show(vi.fn(), major);
    expect(report.events.some((e) => e.majeur)).toBe(true);
    expect(jingles(calls)).toEqual(['jingle:tampon', 'jingle:flash']);
  });

  it('résume l’impact des actions, les passages, les imprévus, les adversaires et les sondages', () => {
    const { report, state } = show();
    const dialog = screen.getByRole('dialog', { name: 'Verdict de la semaine 0' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const player = state.player.actorId!;

    // En bref : la variation totale de chaque ressource, telle que le moteur l'a comptée.
    const brief = within(dialog).getByRole('list', { name: 'Votre semaine en bref' });
    const popularity = report.changes.find(
      (c) => c.actorId === player && c.ressource === 'popularite',
    )!;
    expect(brief).toHaveTextContent(/Popularité [+−]\d/);
    expect(popularity.after).not.toBe(popularity.before);

    const actions = within(dialog).getByRole('region', { name: 'Vos cartes de la semaine' });
    expect(within(actions).getByText('Meeting public')).toBeInTheDocument();
    // Impact du meeting : les facteurs de l'action au registre, rien d'autre.
    const meeting = report.changes
      .filter((c) => c.actorId === player && c.ressource === 'notoriete')
      .flatMap((c) => c.factors)
      .filter((f) => f.source === 'action' && f.label.startsWith('Meeting public : '))
      .reduce((sum, f) => sum + f.value, 0);
    expect(meeting).toBeGreaterThan(0);
    expect(within(actions).getAllByText(/Notoriété \+/).length).toBeGreaterThan(0);
    // Passage dans les médias : niveau, posture, raisons.
    expect(within(actions).getByRole('list', { name: 'Raisons du score' })).toBeInTheDocument();
    // Action rejetée (posture sur une action hors plateau) : son motif.
    expect(within(actions).getByText(/aucune posture à choisir/)).toBeInTheDocument();

    const unexpected = within(dialog).getByRole('region', { name: 'Imprévus et décisions' });
    expect(within(unexpected).getByText('Salle comble')).toBeInTheDocument();
    expect(within(unexpected).getByText('Opportunité')).toBeInTheDocument();
    expect(within(unexpected).getByText('Événement fictif')).toBeInTheDocument();

    const opponents = within(dialog).getByRole('region', { name: 'Initiatives adverses' });
    expect(within(opponents).getAllByRole('listitem').length).toBeGreaterThan(0);

    const polls = within(dialog).getByRole('region', { name: 'Sondages de la semaine' });
    expect(within(polls).getByText(/^Vous \(\d+(er|e) sur \d+\) : /)).toBeInTheDocument();
    expect(within(polls).getByText(/première vague/)).toBeInTheDocument();
  });

  it('prend le focus, le garde, se ferme avec Échap ou « Semaine suivante »', async () => {
    const { onClose } = show();
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    // Tab depuis le dernier contrôle : retour au premier, sans quitter la fenêtre.
    const proceed = within(dialog).getByRole('button', { name: 'Semaine suivante' });
    proceed.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(proceed);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('équipe de campagne (phase 20)', () => {
  it('raconte la semaine en quatre phrases tirées du bilan du moteur', () => {
    const { report, state } = show();
    const team = screen.getByRole('region', { name: 'Votre équipe raconte la semaine' });
    const lines = within(team).getAllByRole('listitem');
    expect(lines).toHaveLength(4);
    const player = state.actors[state.player.actorId!]!;
    const lines_ = teamBriefing(report, state);
    expect(lines_.map((l) => l.role)).toEqual([
      'Directrice de campagne',
      'Trésorier',
      'Conseillère opinion',
      'Responsable du terrain',
    ]);
    // Le trésorier lit la caisse dans l'état servi, la direction le nombre d'actions menées.
    expect(lines[1]).toHaveTextContent(
      formatEuros(player.resources.budgetCentimes).replace(/\s/g, ' '),
    );
    const done = report.actions.filter(
      (a) => a.actorId === state.player.actorId && a.status === 'validee',
    ).length;
    expect(lines[0]).toHaveTextContent(new RegExp(`^Inès, directrice de campagne${done} action`));
    expect(within(team).getByText(/Équipe fictive/)).toBeInTheDocument();
  });
});

describe('événements en chaîne et coups adverses (phase 20)', () => {
  it('rappelle l’événement d’origine d’une suite, et l’équipe signale le coup du rival', () => {
    const rules = JSON.parse(JSON.stringify(RULES)) as Ruleset;
    rules.evenements.find((e) => e.id === 'diner-levee-fonds')!.probabiliteHebdomadaire = 1;
    const start = initialState();
    start.suites = [
      {
        id: 's-test',
        evenement: 'comptes-salues',
        dueWeek: start.meta.week,
        origine: 'Rumeur sur le financement de votre campagne',
      },
    ];
    const { state, report } = advanceWeek(
      start,
      { actions: [{ actionId: 'meeting' }], decisions: [] },
      { ruleset: rules },
    );
    const coup = report.events.find((e) => e.refId === 'diner-levee-fonds')!;
    expect(coup.adversaire).toBeDefined();
    reduceMotion();
    render(
      <MemoryRouter>
        <Verdict
          report={report}
          state={state}
          gameId="partie"
          eventFamily={(id) => rules.evenements.find((e) => e.id === id)?.famille ?? null}
          onDone={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('Suite de « Rumeur sur le financement de votre campagne »'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Coup adverse').length).toBeGreaterThan(0);
    const team = screen.getByRole('region', { name: 'Votre équipe raconte la semaine' });
    expect(within(team).getAllByRole('listitem')[0]).toHaveTextContent(
      `Le camp d’en face a frappé : « ${coup.label} »`,
    );
  });
});

describe('verdict de la semaine : la séquence (phase 25)', () => {
  /** Deux portes-à-porte au Finistère : série Terrain, bastion, et un palier gagné. */
  function terrainWeek() {
    const start = initialState();
    return advanceWeek(
      start,
      {
        actions: [
          { actionId: 'porte-a-porte', cible: '29' },
          { actionId: 'porte-a-porte', cible: '29' },
        ],
        decisions: [],
      },
      { ruleset: RULES },
    );
  }

  const open = (motion: 'normal' | 'reduit' = 'normal') => {
    const { state, report } = terrainWeek();
    if (motion === 'reduit') reduceMotion();
    render(
      <MemoryRouter>
        <Verdict report={report} state={state} gameId="partie" ruleset={RULES} onDone={vi.fn()} />
      </MemoryRouter>,
    );
    return { state, report };
  };

  it('retourne les cartes une à une, puis combos, paliers et le reste du bilan', () => {
    vi.useFakeTimers();
    try {
      const calls = recordSound();
      open();
      const dialog = screen.getByRole('dialog', { name: 'Verdict de la semaine 0' });
      const cards = within(dialog).getByRole('region', { name: 'Vos cartes de la semaine' });
      expect(within(cards).queryAllByText(/^Porte-à-porte/)).toHaveLength(0);
      expect(within(dialog).queryByRole('region', { name: 'Imprévus et décisions' })).toBeNull();
      // Une carte à chaque pas de la séquence.
      const next = (n: number) => {
        for (let i = 0; i < n; i++) act(() => vi.advanceTimersByTime(VERDICT_STEP_MS));
      };
      next(1);
      expect(within(cards).getAllByText(/^Porte-à-porte/)).toHaveLength(1);
      expect(jingles(calls)).toContain('jingle:retourner');
      next(2);
      const combos = within(dialog).getByRole('region', { name: 'Combos' });
      expect(within(combos).getByText('Bastion ×1,5 : Finistère (29)')).toBeInTheDocument();
      expect(jingles(calls)).toContain('jingle:combo');
      next(3);
      expect(
        within(dialog).getByRole('region', { name: 'Départements qui changent de palier' }),
      ).toHaveTextContent('Finistère (29) : Terre inconnue → Présence (+24)');
      expect(within(dialog).getByRole('region', { name: 'Imprévus et décisions' })).toBeVisible();
      expect(within(dialog).queryByRole('button', { name: 'Tout afficher' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('la carte du verdict montre le gain d’implantation sur le département joué', () => {
    const { state, report } = terrainWeek();
    reduceMotion();
    render(
      <MemoryRouter>
        <Verdict
          report={report}
          state={state}
          gameId="partie"
          ruleset={RULES}
          shapes={boardShapes(DEMO_DEPARTEMENTS)}
          onDone={vi.fn()}
        />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('img', {
        name: 'Votre implantation par département après la semaine',
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('+24 implantation')).toBeInTheDocument();
  });

  it('un toucher affiche tout d’un coup', async () => {
    open();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tout afficher' }));
    expect(within(dialog).getAllByText(/^Porte-à-porte/)).toHaveLength(2);
    expect(within(dialog).getByRole('region', { name: 'Imprévus et décisions' })).toBeVisible();
  });

  it('mouvement réduit : même contenu d’un coup, « Semaine suivante » au clavier', async () => {
    const calls = recordSound();
    open('reduit');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText(/^Porte-à-porte/)).toHaveLength(2);
    expect(within(dialog).getByRole('region', { name: 'Combos' })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Tout afficher' })).toBeNull();
    expect(jingles(calls)).toEqual(['jingle:tampon', 'jingle:combo']);
    const next = within(dialog).getByRole('button', { name: 'Semaine suivante' });
    for (let i = 0; i < 12 && document.activeElement !== next; i++) await userEvent.tab();
    expect(next).toHaveFocus();
  });
});
