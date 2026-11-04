import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Disclosure, Embedded, ScreenHeading } from './Disclosure';
import { Drawer } from './Drawer';

// Tiroir de détail et sections dépliables (phase 12).

function WithDrawer({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Détails
      </button>
      {open && (
        <Drawer
          title="Meeting public"
          subtitle="Grand rassemblement"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          footer={<button type="button">Ajouter au plan</button>}
        >
          <p>Coût : 120 000 €</p>
        </Drawer>
      )}
    </>
  );
}

describe('tiroir de détail', () => {
  it('ouvre un dialogue modal nommé, fige la page puis rend le focus à son déclencheur', async () => {
    const user = userEvent.setup();
    render(<WithDrawer />);
    const trigger = screen.getByRole('button', { name: 'Détails' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Meeting public' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(
      within(dialog).getByRole('region', { name: 'Contenu : Meeting public' }),
    ).toHaveTextContent('Coût : 120 000 €');
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });

  it('se ferme avec Échap ou un clic sur le fond, pas sur un clic dans le panneau', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WithDrawer onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Détails' }));
    await user.click(screen.getByText('Coût : 120 000 €'));
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Détails' }));
    // Le fond est le parent du dialogue.
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('garde la tabulation dans le tiroir', async () => {
    const user = userEvent.setup();
    render(<WithDrawer />);
    await user.click(screen.getByRole('button', { name: 'Détails' }));
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Fermer' });
    const add = within(dialog).getByRole('button', { name: 'Ajouter au plan' });
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('region')).toHaveFocus();
    await user.tab();
    expect(add).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(add).toHaveFocus();
  });
});

function Section() {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      id="finances"
      title="Finances"
      status="Dépenses : 0 €"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <section aria-labelledby="titre-finances">
        <ScreenHeading id="titre-finances">Finances</ScreenHeading>
        <p>Compte de campagne</p>
      </section>
    </Disclosure>
  );
}

describe('section dépliable', () => {
  it('ne rend son contenu qu’une fois dépliée, au clavier comme à la souris', async () => {
    const user = userEvent.setup();
    render(<Section />);
    const button = screen.getByRole('button', { name: /^Finances/ });
    expect(screen.getByRole('heading', { level: 2 })).toContainElement(button);
    expect(button).toHaveAccessibleName(/^Finances\s*Dépenses : 0 €$/);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Compte de campagne')).not.toBeInTheDocument();

    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeVisible();
    // L'écran intégré garde sa région nommée, sans second titre visible.
    expect(screen.getByRole('region', { name: 'Finances' })).toHaveTextContent(
      'Compte de campagne',
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Compte de campagne')).not.toBeInTheDocument();
  });

  it('affiche le titre d’un écran seul, et le masque dans une section ou un tiroir', () => {
    const { rerender } = render(<ScreenHeading id="t">Sondages</ScreenHeading>);
    expect(screen.getByRole('heading', { level: 1, name: 'Sondages' })).toBeInTheDocument();
    rerender(
      <Embedded>
        <ScreenHeading id="t">Sondages</ScreenHeading>
      </Embedded>,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(document.getElementById('t')).not.toBeVisible();
  });
});
