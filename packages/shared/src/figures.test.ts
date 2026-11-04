import { describe, expect, it } from 'vitest';
import { figureMainFunction, type FigureFunction } from './figures';

// Fonctions synthétiques (libellés fictifs) au format des fiches importées.
const fonction = (libelle: string, enCours: boolean, nature: FigureFunction['nature']) => ({
  libelle,
  debut: '2020',
  fin: enCours ? null : '2024',
  enCours,
  nature,
});

describe('fonction principale d’une figure', () => {
  it('retient la première fonction en cours hors « autre », sinon la première de la fiche', () => {
    expect(
      figureMainFunction({
        fonctions: [
          fonction('Présidente d’une association', true, 'autre'),
          fonction('Ministre de l’Exemple', false, 'ministre'),
          fonction('Députée', true, 'parlementaire'),
        ],
      }).libelle,
    ).toBe('Députée');
    // Aucune fonction en cours hors « autre » : la première de la fiche, en cours ou non.
    expect(
      figureMainFunction({
        fonctions: [
          fonction('Ministre de l’Exemple', false, 'ministre'),
          fonction('Conseiller municipal', false, 'autre'),
        ],
      }),
    ).toMatchObject({ libelle: 'Ministre de l’Exemple', enCours: false });
    expect(
      figureMainFunction({
        fonctions: [fonction('Président délégué d’un conseil', true, 'autre')],
      }),
    ).toMatchObject({ enCours: true });
  });
});
