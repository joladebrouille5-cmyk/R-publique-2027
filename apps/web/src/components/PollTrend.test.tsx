import { candidateName, type GameState, type Poll } from '@r2027/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { formatShare } from '../labels';
import { playedState, RULESET } from '../test/utils';
import { PollTrend } from './PollTrend';

// Phase 22 : l'évolution des intentions de vote en courbes, sur un état réel du moteur.

const STATE: GameState = playedState(
  (state) => state.polls.filter((p) => p.kind === 'intentions_t1').length >= 4,
);
const POLLS: Poll[] = STATE.polls.filter((p) => p.kind === 'intentions_t1');
const LAST = POLLS.at(-1)!;
const nameOf = (actorId: string) => candidateName(STATE.actors[actorId]!.candidate);
const leader = [...LAST.results].sort((a, b) => b.value - a.value)[0]!;
const player = STATE.player.actorId!;

describe('évolution des sondages en courbes (phase 22)', () => {
  it('trace une ligne par candidat du dernier sondage', () => {
    const { container } = render(<PollTrend polls={POLLS} state={STATE} ruleset={RULESET} />);
    expect(container.querySelectorAll('path[data-serie]')).toHaveLength(LAST.results.length);
  });

  it('résume le graphique pour les lecteurs d’écran : la tête de course et le joueur', () => {
    render(<PollTrend polls={POLLS} state={STATE} ruleset={RULESET} />);
    const figure = screen.getByRole('img', { name: /Intentions de vote au premier tour/ });
    const label = figure.getAttribute('aria-label')!;
    expect(label).toContain(`${POLLS.length} sondages`);
    expect(label).toContain(`en tête ${nameOf(leader.actorId)}, ${formatShare(leader.value)}`);
    const mine = LAST.results.find((r) => r.actorId === player)!;
    expect(label).toContain(`vous : ${formatShare(mine.value)}`);
  });

  it('étiquette directement quatre candidats au plus, dont le joueur', () => {
    const { container } = render(<PollTrend polls={POLLS} state={STATE} ruleset={RULESET} />);
    const labels = [...container.querySelectorAll('[data-etiquette]')].map((el) => el.textContent);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(4);
    expect(labels.some((text) => text?.includes('vous'))).toBe(true);
  });

  it('se parcourt au clavier, vague par vague, valeurs annoncées', async () => {
    render(<PollTrend polls={POLLS} state={STATE} ruleset={RULESET} />);
    const explorer = screen.getByRole('group', { name: /Parcourir les sondages/ });
    explorer.focus();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`Semaine ${LAST.week}`);
    expect(status).toHaveTextContent(`${nameOf(leader.actorId)} ${formatShare(leader.value)}`);
    await userEvent.keyboard('{ArrowLeft}');
    expect(status).toHaveTextContent(`Semaine ${POLLS.at(-2)!.week}`);
    await userEvent.keyboard('{Home}');
    expect(status).toHaveTextContent(`Semaine ${POLLS[0]!.week}`);
    await userEvent.keyboard('{End}');
    expect(status).toHaveTextContent(`Semaine ${LAST.week}`);
  });

  it('au doigt, garde la vague touchée une fois le doigt levé', () => {
    render(<PollTrend polls={POLLS} state={STATE} ruleset={RULESET} />);
    const explorer = screen.getByRole('group', { name: /Parcourir les sondages/ });
    // jsdom : boîte de 0 px, la position la plus à gauche désigne la première vague.
    fireEvent.pointerMove(explorer, { clientX: 0, pointerType: 'touch' });
    expect(screen.getByRole('status')).toHaveTextContent(`Semaine ${POLLS[0]!.week}`);
    fireEvent.pointerLeave(explorer, { pointerType: 'touch' });
    expect(screen.getByRole('status')).toHaveTextContent(`Semaine ${POLLS[0]!.week}`);
    // À la souris, quitter le graphique revient à la dernière vague.
    fireEvent.pointerLeave(explorer, { pointerType: 'mouse' });
    expect(screen.getByRole('status')).toHaveTextContent(`Semaine ${LAST.week}`);
  });

  it('a une légende : chaque série colorée, puis les autres candidats', () => {
    render(<PollTrend polls={POLLS} state={STATE} ruleset={RULESET} />);
    const legend = screen.getByRole('list', { name: 'Légende' });
    expect(within(legend).getByText(/vous/)).toBeInTheDocument();
    if (LAST.results.length > 4)
      expect(within(legend).getByText('Autres candidats')).toBeInTheDocument();
  });

  it('ne dessine rien avec un seul sondage', () => {
    const { container } = render(
      <PollTrend polls={POLLS.slice(0, 1)} state={STATE} ruleset={RULESET} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
