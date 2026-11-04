import { describe, expect, it } from 'vitest';
import { CandidateIdentitySchema } from './politics';

// Phase 23 : une personnalité réelle renvoie à exactement une fiche — sa fiche de candidate
// (`personnaliteId`) ou, pour une figure du vivier entrée dans la course, sa fiche de figure
// (`figureId`). Un candidat inventé ne renvoie à aucune.

const base = {
  prenom: 'Camille',
  nom: 'Exemple',
  parti: 'Parti exemple',
  positionnement: { economie: 0, societe: 0 },
  parcours: '',
  profilId: null,
  photo: null,
};

describe('identité d’un candidat (phase 23)', () => {
  it('accepte une personnalité réelle par sa fiche de candidate, sans fiche de figure', () => {
    const real = { ...base, nature: 'reel', personnaliteId: 'reel-exemple' };
    expect(CandidateIdentitySchema.safeParse(real).success).toBe(true);
  });

  it('accepte une figure du vivier par sa seule fiche de figure', () => {
    const figure = { ...base, nature: 'reel', personnaliteId: null, figureId: 'figure-exemple' };
    expect(CandidateIdentitySchema.safeParse(figure).success).toBe(true);
  });

  it('refuse une personnalité réelle qui renvoie à deux fiches, ou à aucune', () => {
    const both = {
      ...base,
      nature: 'reel',
      personnaliteId: 'reel-exemple',
      figureId: 'figure-exemple',
    };
    expect(CandidateIdentitySchema.safeParse(both).success).toBe(false);
    const none = { ...base, nature: 'reel', personnaliteId: null };
    expect(CandidateIdentitySchema.safeParse(none).success).toBe(false);
  });

  it('refuse une fiche de figure sur un candidat fictif ou personnalisé', () => {
    for (const nature of ['fictif', 'personnalise'])
      expect(
        CandidateIdentitySchema.safeParse({
          ...base,
          nature,
          personnaliteId: null,
          figureId: 'figure-exemple',
        }).success,
      ).toBe(false);
  });

  it('refuse un identifiant de figure mal formé', () => {
    const bad = { ...base, nature: 'reel', personnaliteId: null, figureId: 'reel-exemple' };
    expect(CandidateIdentitySchema.safeParse(bad).success).toBe(false);
  });
});
