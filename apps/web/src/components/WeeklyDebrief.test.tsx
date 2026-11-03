import { advanceWeek } from '@r2027/engine';
import type { Ruleset } from '@r2027/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { initialState, jingles, recordSound, RULESET } from '../test/utils';
import { WeeklyDebrief } from './WeeklyDebrief';

// Débriefing de la semaine (phase 11) : un vrai bilan du moteur, rien de recalculé à l'écran.

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
  render(
    <MemoryRouter>
      <button type="button">Résoudre la semaine 0</button>
      <WeeklyDebrief
        report={report}
        state={state}
        gameId="partie"
        eventFamily={(id) => RULES.evenements.find((e) => e.id === id)?.famille ?? null}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return { state, report, onClose };
}

describe('débriefing de la semaine', () => {
  it('annonce un événement majeur par le jingle d’une nouvelle importante, et lui seul (phase 19)', () => {
    const calls = recordSound();
    show();
    expect(jingles(calls)).toEqual([]);
    cleanup();
    // Même semaine, mais « Salle comble » déclaré majeur dans le jeu de règles du test.
    const major = JSON.parse(JSON.stringify(RULES)) as Ruleset;
    major.evenements.find((e) => e.id === 'salle-comble')!.majeur = true;
    const { report } = show(vi.fn(), major);
    expect(report.events.some((e) => e.majeur)).toBe(true);
    expect(jingles(calls)).toEqual(['jingle:flash']);
  });

  it('résume l’impact des actions, les passages, les imprévus, les adversaires et les sondages', () => {
    const { report, state } = show();
    const dialog = screen.getByRole('dialog', { name: 'Débriefing de la semaine 0' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const player = state.player.actorId!;

    // En bref : la variation totale de chaque ressource, telle que le moteur l'a comptée.
    const brief = within(dialog).getByRole('list', { name: 'Votre semaine en bref' });
    const popularity = report.changes.find(
      (c) => c.actorId === player && c.ressource === 'popularite',
    )!;
    expect(brief).toHaveTextContent(/Popularité [+−]\d/);
    expect(popularity.after).not.toBe(popularity.before);

    const actions = within(dialog).getByRole('region', { name: 'Vos actions et leur impact' });
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

  it('prend le focus, le garde, se ferme avec Échap ou « Continuer »', async () => {
    const { onClose } = show();
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    // Tab depuis le dernier contrôle : retour au premier, sans quitter la fenêtre.
    const proceed = within(dialog).getByRole('button', { name: 'Continuer' });
    proceed.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(proceed);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
