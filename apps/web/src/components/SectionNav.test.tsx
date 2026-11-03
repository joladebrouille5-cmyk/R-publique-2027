import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SectionNav } from './SectionNav';

// Phase 22 : sommaire collant d'un espace (ou de Paramètres) : un lien par section, qui la
// déplie et l'amène à la vue ; l'entrée courante ; « Tout replier ».

const ITEMS = [
  { id: 'programme', label: 'Programme', open: true },
  { id: 'candidats', label: 'Candidats', open: false },
  { id: 'finances', label: 'Finances', open: true },
];

describe('sommaire des sections (phase 22)', () => {
  it('donne un lien par section, vers son ancre', () => {
    render(<SectionNav label="Sommaire de l’espace" items={ITEMS} />);
    const nav = screen.getByRole('navigation', { name: 'Sommaire de l’espace' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '#programme',
      '#candidats',
      '#finances',
    ]);
    expect(within(nav).getByRole('link', { name: /Candidats/ })).toBeInTheDocument();
  });

  it('confie le clic à l’espace, qui déplie la section et l’amène à la vue', async () => {
    const onShow = vi.fn();
    render(<SectionNav label="Sommaire de l’espace" items={ITEMS} onShow={onShow} />);
    await userEvent.click(screen.getByRole('link', { name: /Candidats/ }));
    expect(onShow).toHaveBeenCalledWith('candidats');
    // L'entrée touchée devient l'entrée courante.
    expect(screen.getByRole('link', { name: /Candidats/ })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('marque la première entrée comme courante faute d’observateur de défilement', () => {
    render(<SectionNav label="Sommaire de l’espace" items={ITEMS} />);
    expect(screen.getByRole('link', { name: /Programme/ })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('link', { name: /Finances/ })).not.toHaveAttribute('aria-current');
  });

  it('dit quelles sections sont dépliées', () => {
    render(<SectionNav label="Sommaire de l’espace" items={ITEMS} />);
    expect(screen.getByRole('link', { name: 'Programme (dépliée)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidats' })).toBeInTheDocument();
  });

  it('propose « Tout replier » dès que deux sections sont dépliées', async () => {
    const onCollapseAll = vi.fn();
    const { rerender } = render(
      <SectionNav label="Sommaire de l’espace" items={ITEMS} onCollapseAll={onCollapseAll} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tout replier' }));
    expect(onCollapseAll).toHaveBeenCalledOnce();
    rerender(
      <SectionNav
        label="Sommaire de l’espace"
        items={ITEMS.map((item) => ({ ...item, open: item.id === 'programme' }))}
        onCollapseAll={onCollapseAll}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Tout replier' })).not.toBeInTheDocument();
  });

  it('ne s’affiche pas pour une seule section : rien à parcourir', () => {
    const { container } = render(
      <SectionNav label="Sommaire de l’espace" items={ITEMS.slice(0, 1)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
