import { describe, expect, it } from 'vitest';
import {
  categoryCandidates,
  choosePhoto,
  imageLicense,
  parseImageInfo,
  photoCandidates,
  uploadUrl,
  type ImageInfo,
} from './photos';

// Réponses synthétiques (personnes et fichiers fictifs) au format des sources réelles.

describe('Commons : candidates et licences', () => {
  it('retient les images de la catégorie qui portent le nom, la plus récente d’abord', () => {
    expect(
      categoryCandidates(
        [
          'File:Camille Exemple 2019.jpg',
          'File:Camille Exemple et Dominique Test 2025.jpg',
          'File:Camille EXEMPLE 2023 (cropped).jpg',
          'File:Exemple-Camille.png',
          'File:Camille Exemple signature.svg',
          'File:Réunion publique 2024.jpg',
          'File:Camille Exemple with Dominique Test.jpg',
          'File:Camille Exemple.webm',
        ],
        'Exemple',
      ),
    ).toEqual([
      'Camille EXEMPLE 2023 (cropped).jpg',
      'Camille Exemple 2019.jpg',
      'Exemple-Camille.png',
    ]);
    expect(categoryCandidates(['File:Élise Évrard 2022.jpg'], 'Evrard')).toEqual([
      'Élise Évrard 2022.jpg',
    ]);
    expect(
      categoryCandidates(
        Array.from({ length: 9 }, (_, i) => `File:Exemple ${2010 + i}.jpg`),
        'Exemple',
        3,
      ),
    ).toEqual(['Exemple 2018.jpg', 'Exemple 2017.jpg', 'Exemple 2016.jpg']);
  });

  it('sert vignettes et originaux depuis upload.wikimedia.org, sans paramètres de suivi', () => {
    expect(
      uploadUrl(
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/A_%28B%29.jpg/500px-A_%28B%29.jpg?utm_source=commons.wikimedia.org',
      ),
    ).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/A_%28B%29.jpg/500px-A_%28B%29.jpg',
    );
  });

  it('lit licence, auteur et vignette de l’API imageinfo, redirections suivies', () => {
    const json = JSON.stringify({
      batchcomplete: true,
      query: {
        normalized: [{ from: 'File:Camille_Exemple.jpg', to: 'File:Camille Exemple.jpg' }],
        redirects: [{ from: 'File:Camille Exemple.jpg', to: 'File:Camille Exemple 2024.jpg' }],
        pages: [
          {
            title: 'File:Camille Exemple 2024.jpg',
            imageinfo: [
              {
                mime: 'image/jpeg',
                width: 1600,
                url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Camille_Exemple_2024.jpg?utm_source=x',
                thumburl:
                  'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Camille_Exemple_2024.jpg/500px-Camille_Exemple_2024.jpg',
                thumbwidth: 500,
                extmetadata: {
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
                  Artist: {
                    value: '<a href="//commons.wikimedia.org/wiki/User:Photo">Photo&amp;Graphe</a>',
                  },
                },
              },
            ],
          },
          {
            title: 'File:Petite.png',
            imageinfo: [
              {
                mime: 'image/png',
                width: 300,
                url: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Petite.png',
                thumburl: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Petite.png',
                thumbwidth: 300,
              },
            ],
          },
          { title: 'File:Absente.jpg', missing: true },
        ],
      },
    });
    const infos = parseImageInfo(json, ['Camille_Exemple.jpg', 'Petite.png', 'Absente.jpg']);
    expect(infos.get('Camille_Exemple.jpg')).toEqual({
      fichier: 'Camille Exemple 2024.jpg',
      mime: 'image/jpeg',
      largeur: 1600,
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Camille_Exemple_2024.jpg',
      vignette:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Camille_Exemple_2024.jpg/500px-Camille_Exemple_2024.jpg',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      auteur: 'Photo&Graphe',
    });
    expect(infos.get('Petite.png')).toMatchObject({ vignette: null, licence: null, auteur: null });
    expect(infos.has('Absente.jpg')).toBe(false);
  });

  const info = (overrides: Partial<ImageInfo> = {}): ImageInfo => ({
    fichier: 'Camille Exemple 2024.jpg',
    mime: 'image/jpeg',
    largeur: 1600,
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Camille_Exemple_2024.jpg',
    vignette: null,
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0',
    auteur: 'Photographe',
    ...overrides,
  });

  it('accepte seulement une licence libre reconnue, avec auteur, format et taille suffisants', () => {
    expect(imageLicense(info())).toEqual({
      licence: 'CC BY 2.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/2.0',
      auteur: 'Photographe',
    });
    expect(imageLicense(info({ licence: 'GFDL 1.2' }))).toEqual({
      refus: 'licence non reconnue comme libre (GFDL 1.2)',
    });
    expect(imageLicense(info({ licence: null }))).toEqual({
      refus: 'aucune licence lisible dans les métadonnées du fichier',
    });
    expect(imageLicense(info({ auteur: null }))).toEqual({
      refus: 'auteur non indiqué dans les métadonnées du fichier',
    });
    expect(imageLicense(info({ mime: 'image/tiff' }))).toEqual({
      refus: 'format non retenu (image/tiff)',
    });
    expect(imageLicense(info({ largeur: 120 }))).toEqual({
      refus: 'image trop petite (120 pixels de large)',
    });
    expect(imageLicense(info({ largeur: 187 }))).not.toHaveProperty('refus');
  });

  it('essaie les candidates dans l’ordre et consigne le motif du choix', () => {
    const manual = { fichier: 'Main.jpg', motif: 'portrait de face, plus récent' };
    const candidates = photoCandidates(manual, ['P18 a.jpg', 'Main.jpg', 'P18 b.jpg'], ['Cat.jpg']);
    expect(candidates.map((c) => `${c.origine}:${c.fichier}`)).toEqual([
      'main:Main.jpg',
      'wikidata:P18 a.jpg',
      'wikidata:P18 b.jpg',
      'categorie:Cat.jpg',
    ]);
    const all = new Map([
      ['Main.jpg', info({ fichier: 'Main.jpg' })],
      ['P18 a.jpg', info({ fichier: 'P18 a.jpg', licence: 'GFDL 1.2' })],
      ['P18 b.jpg', info({ fichier: 'P18 b.jpg' })],
      ['Cat.jpg', info({ fichier: 'Cat.jpg' })],
    ]);
    const byHand = choosePhoto(candidates, all, 'Camille Exemple');
    expect(byHand).toMatchObject({
      candidate: { fichier: 'Main.jpg' },
      choix: 'Choisie à la main après revue visuelle : portrait de face, plus récent.',
    });
    const wikidataOnly = candidates.filter((c) => c.origine !== 'main');
    expect(choosePhoto(wikidataOnly, all, 'Camille Exemple')).toMatchObject({
      candidate: { fichier: 'P18 b.jpg' },
      choix:
        'Autre photo de Wikidata (P18) ; écartées avant elle : P18 a.jpg : licence non reconnue comme libre (GFDL 1.2).',
    });
    expect(choosePhoto([candidates[2]!], all, null)).toMatchObject({ choix: null });
    expect(
      choosePhoto(photoCandidates(undefined, [], ['Cat.jpg']), all, 'Camille Exemple'),
    ).toMatchObject({
      choix: 'Fichier de la catégorie Commons « Camille Exemple » (aucune photo dans Wikidata).',
    });
    expect(
      choosePhoto(photoCandidates(undefined, ['P18 a.jpg', 'Inconnue.jpg'], []), all, null),
    ).toEqual({
      refus:
        'P18 a.jpg : licence non reconnue comme libre (GFDL 1.2) ; Inconnue.jpg : fichier introuvable sur Wikimedia Commons',
    });
    expect(choosePhoto([], all, null)).toEqual({
      refus: 'aucune photo dans Wikidata ni dans la catégorie Commons de la personne',
    });
  });
});
