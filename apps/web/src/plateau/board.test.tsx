import { departmentInscrits, militantsByDepartment, type GameState } from '@r2027/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_DEPARTEMENTS } from '../test/geo';
import { initialState, RULESET } from '../test/utils';
import { Board } from './Board';
import { DepartmentSheet } from './DepartmentSheet';
import { boardShapes } from './geometry';

// Plateau (phase 25) : la France des départements colorée par lecture, légende chiffrée,
// pions des cartes posées, sélection au clavier ; fiche d'un département.

const shapes = boardShapes(DEMO_DEPARTEMENTS);
const PLAYER = 'joueur';

function anchored(): GameState {
  const state = initialState();
  state.implantation[PLAYER]!['29'] = 60;
  state.implantation[PLAYER]!['2A'] = 8;
  return state;
}

/** Projection simulée posée à la main sur deux départements (lecture « Qui mène »). */
function projected(): GameState {
  const state = anchored();
  state.opinion = {
    week: 1,
    round: 1,
    participation: 7_000,
    intentions: { [PLAYER]: 1_500, 'adv-aurore': 2_000 },
    breakdown: {},
    departements: {
      '29': { [PLAYER]: 3_100, 'adv-aurore': 2_400 },
      '13': { [PLAYER]: 900, 'adv-aurore': 2_600 },
    },
  };
  return state;
}

const renderBoard = (props: Partial<Parameters<typeof Board>[0]> = {}) => {
  const onSelect = vi.fn();
  render(
    <Board
      shapes={shapes}
      state={anchored()}
      ruleset={RULESET}
      reading="implantation"
      selected={null}
      placed={{}}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect };
};

describe('plateau', () => {
  it('nomme chaque département avec son palier écrit, Corse et outre-mer compris', () => {
    renderBoard();
    const board = screen.getByRole('group', { name: /Plateau/ });
    expect(within(board).getAllByRole('button')).toHaveLength(101);
    const finistere = screen.getByRole('button', {
      name: 'Finistère (29) : Bastion, implantation 60 sur 100',
    });
    expect(finistere).toHaveAttribute('data-fill', 'var(--color-implantation-3)');
    expect(
      screen.getByRole('button', { name: /^Corse-du-Sud \(2A\) : Présence, implantation 8/ }),
    ).toHaveAttribute('data-fill', 'var(--color-implantation-1)');
    for (const code of ['2B', '971', '972', '973', '974', '976'])
      expect(screen.getByRole('button', { name: new RegExp(`\\(${code}\\) :`) })).toBeVisible();
  });

  it('chiffre sa légende : cinq paliers et leurs bornes', () => {
    renderBoard();
    const legend = screen.getByRole('list', { name: 'Légende' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Terre inconnue (0 à 4)',
      'Présence (5 à 24)',
      'Ancrage (25 à 49)',
      'Bastion (50 à 74)',
      'Fief (75 à 100)',
    ]);
  });

  it('lecture « Qui mène » : projection simulée, étiquetée, en attente sans projection', () => {
    renderBoard({ state: projected(), reading: 'qui-mene' });
    expect(screen.getByText(/projection simulée/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Finistère \(29\) : vous menez, 31,0 %/ }),
    ).toHaveAttribute('data-fill', 'var(--color-or)');
    expect(
      screen.getByRole('button', {
        name: /^Bouches-du-Rhône \(13\) : Élise Marchetti mène, 26,0 %/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Nord \(59\) : projection indisponible/ }),
    ).toBeVisible();
  });

  it('lecture « Sondage local » : votre score projeté par département', () => {
    renderBoard({ state: projected(), reading: 'sondage-local' });
    expect(
      screen.getByRole('button', {
        name: /^Finistère \(29\) : vous 31,0 % \(projection simulée\)/,
      }),
    ).toHaveAttribute('data-fill', 'var(--color-implantation-4)');
    expect(screen.getByRole('list', { name: 'Légende' })).toHaveTextContent('30 % et plus');
  });

  it('sans projection, annonce qu’elle viendra après la première semaine', () => {
    renderBoard({ reading: 'qui-mene' });
    expect(screen.getByText(/Projection disponible après une semaine de campagne/)).toBeVisible();
  });

  it('se joue au clavier et montre les pions des cartes posées', async () => {
    const { onSelect } = renderBoard({ placed: { '29': 2 }, selected: '2A' });
    const finistere = screen.getByRole('button', { name: /^Finistère \(29\)/ });
    finistere.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('29');
    expect(screen.getByRole('button', { name: /^Corse-du-Sud \(2A\)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /^Finistère \(29\).*2 cartes posées/ }),
    ).toBeVisible();
  });
});

describe('fiche d’un département', () => {
  it('donne implantation, palier, militants estimés, projection et cartes jouables', async () => {
    const state = projected();
    const onPlay = vi.fn();
    render(<DepartmentSheet code="29" state={state} ruleset={RULESET} onPlay={onPlay} />);
    expect(screen.getByRole('heading', { name: 'Finistère (29)' })).toBeVisible();
    expect(screen.getByText('Implantation 60 sur 100 — Bastion')).toBeVisible();
    const militants = militantsByDepartment(
      state.actors[PLAYER]!.resources.militants,
      state.implantation[PLAYER]!,
      departmentInscrits(RULESET),
    )['29'];
    expect(
      screen.getByText(
        `Militants estimés : ${militants!.toLocaleString('fr-FR').replace(/\s/g, ' ')}`,
      ),
    ).toBeVisible();
    expect(screen.getByText(/Sondage local \(projection simulée\) : vous 31,0 %/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /^Jouer « Meeting public » ici/ }));
    expect(onPlay).toHaveBeenCalledWith('meeting');
    expect(
      screen.getByRole('button', { name: /^Jouer « Rencontre avec des élus locaux » ici/ }),
    ).toBeVisible();
  });

  it('sans projection, le dit', () => {
    render(<DepartmentSheet code="2A" state={anchored()} ruleset={RULESET} onPlay={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Corse-du-Sud (2A)' })).toBeVisible();
    expect(screen.getByText(/Projection disponible après une semaine de campagne/)).toBeVisible();
  });
});
