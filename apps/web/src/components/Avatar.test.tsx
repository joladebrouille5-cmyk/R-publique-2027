import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RULESET } from '../test/utils';
import { familyOf, initialsOf, portraitOf } from '../portraits';
import { Avatar } from './Avatar';

// Phase 9 : un seul avatar pour tous les candidats, avec un repli lisible quand la photo
// manque ou ne se charge pas.

const person = (photo: string | null) => ({
  prenom: 'Élise',
  nom: 'Durand',
  photo,
  famille: familyOf({ economie: -80, societe: -50 }, RULESET),
});

describe('avatar', () => {
  it('affiche la photo, avec son texte quand elle porte une information', () => {
    render(<Avatar portrait={person('/personnalites/x.webp')} alt="Portrait d’Élise Durand" />);
    expect(screen.getByRole('img', { name: 'Portrait d’Élise Durand' })).toHaveAttribute(
      'src',
      '/personnalites/x.webp',
    );
  });

  it('remplace une photo qui ne se charge pas par les initiales', () => {
    const { container } = render(<Avatar portrait={person('/personnalites/absente.webp')} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    const fallback = container.querySelector('[data-avatar="initiales"]') as HTMLElement;
    expect(fallback).toHaveTextContent('ÉD');
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
  });

  it('colore les initiales selon la famille politique la plus proche', () => {
    const { container } = render(<Avatar portrait={person(null)} />);
    const fallback = container.querySelector('[data-avatar="initiales"]') as HTMLElement;
    expect(fallback.style.backgroundColor).toBe('rgb(184, 29, 58)');
    expect(familyOf({ economie: 20, societe: 80 }, RULESET)?.id).toBe('droite-nationale');
    expect(familyOf({ economie: 0, societe: 0 }, undefined)).toBeNull();
  });

  it('tire les initiales des prénoms et noms composés ou accentués', () => {
    expect(initialsOf({ prenom: 'Jean-Luc', nom: 'Mélenchon' })).toBe('JM');
    expect(initialsOf({ prenom: 'éric', nom: 'zemmour' })).toBe('ÉZ');
    expect(initialsOf({ prenom: '', nom: '' })).toBe('?');
  });

  it('donne à une personnalité réelle sans photo libre un portrait en initiales', () => {
    const fiche = RULESET.personnalites.personnalites.find((p) => p.photo === null);
    if (!fiche) return;
    const portrait = portraitOf(
      {
        candidate: {
          prenom: fiche.prenom,
          nom: fiche.nom,
          parti: fiche.parti,
          positionnement: { economie: fiche.position.economie, societe: fiche.position.societe },
          nature: 'reel',
          personnaliteId: fiche.id,
        } as never,
      },
      RULESET,
    );
    expect(portrait.photo).toBeNull();
    expect(portrait.famille).not.toBeNull();
  });
});
