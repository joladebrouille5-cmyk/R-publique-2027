import { describe, expect, it } from 'vitest';
import { figureSparqlQuery, parseFigureWikidata } from './wikidata';

// Réponse synthétique (personnes et fichiers fictifs) au format du service SPARQL de Wikidata.

const binding = (values: Record<string, string>) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v }]));

describe('Wikidata : identifiant, photos, catégorie Commons et décès', () => {
  it('interroge les articles demandés', () => {
    const query = figureSparqlQuery(['Camille Exemple']);
    expect(query).toContain('<https://fr.wikipedia.org/wiki/Camille_Exemple>');
    expect(query).toContain('wdt:P373');
    expect(query).toContain('wdt:P570');
    expect(query).toContain('wikibase:DeprecatedRank');
  });

  it('range les photos (rang préféré d’abord, puis ordre alphabétique) sans doublon', () => {
    const article = 'https://fr.wikipedia.org/wiki/Camille_Exemple';
    const person = 'http://www.wikidata.org/entity/Q1';
    const file = (name: string) => `http://commons.wikimedia.org/wiki/Special:FilePath/${name}`;
    const json = JSON.stringify({
      results: {
        bindings: [
          binding({
            article,
            person,
            image: file('Zed%202020.jpg'),
            rank: 'http://wikiba.se/ontology#NormalRank',
            commonsCat: 'Camille Exemple',
          }),
          binding({
            article,
            person,
            image: file('Camille_Exemple_2024.jpg'),
            rank: 'http://wikiba.se/ontology#PreferredRank',
            commonsCat: 'Camille Exemple',
          }),
          binding({
            article,
            person,
            image: file('Alpha.jpg'),
            rank: 'http://wikiba.se/ontology#NormalRank',
            commonsCat: 'Camille Exemple',
          }),
          binding({
            article,
            person,
            image: file('Zed%202020.jpg'),
            rank: 'http://wikiba.se/ontology#NormalRank',
            commonsCat: 'Camille Exemple',
          }),
          binding({
            article: 'https://fr.wikipedia.org/wiki/Dominique_Test',
            person: 'http://www.wikidata.org/entity/Q2',
            death: '2025-03-01T00:00:00Z',
          }),
        ],
      },
    });
    expect(parseFigureWikidata(json)).toEqual(
      new Map([
        [
          'Camille Exemple',
          {
            qid: 'Q1',
            images: ['Camille Exemple 2024.jpg', 'Alpha.jpg', 'Zed 2020.jpg'],
            categorie: 'Camille Exemple',
            deces: null,
          },
        ],
        ['Dominique Test', { qid: 'Q2', images: [], categorie: null, deces: '2025-03-01' }],
      ]),
    );
  });
});
