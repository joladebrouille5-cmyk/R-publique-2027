import type { FigureFunction } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { ImportError } from '../geometry/coverage';
import { parseChes } from '../personnalites/ches';
import {
  attachments,
  buildFigures,
  estimateCompetence,
  notoriety,
  parliamentaryYears,
  type BuildInput,
} from './build';
import { classify, cleanValue, dateValue, infoboxFunctions, templateParams } from './infobox';
import type { FigureSelection } from './selection';

// Données synthétiques (personnes et partis fictifs) au format des sources réelles.

const ARTICLE = `{{Infobox Personnalité politique
 | nom                     = Camille Exemple
 | fonction1               = Présidente du [[Parti Alpha (France)|Parti Alpha]]{{Note|groupe=alpha|texte=Par intérim du {{date|1 mars 2019}}<ref>x</ref>}}
 | depuis le fonction 1    = {{date|8|juillet|2021}}
 | fonction2               = [[Député français|Députée française]]
 | à partir du fonction2   = 20 juin 2012<ref name="jo">{{Lien web|titre=JO 2017|url=https://exemple.fr}}</ref>
 | jusqu'au fonction2      = {{date|20|juin|2022}}
 | fonction 3              = [[Ministre de l'Intérieur (France)|Ministre de l'Intérieur]]
 | à partir du fonction 3  = 2017
 | jusqu'au fonction 3     = 25 juin 2019<br /><small>({{durée|1|1|2017|25|06|2019}})</small>
 | fonction4               = Présidente du [[Conseil départemental de l'Exemple|conseil départemental des {{nobr|Hautes-Exemples}}]]
 | à partir du fonction4   = 2008
 | jusqu'au fonction4      = 2010
 | fonction5               =
 | fonction6               = [[Porte-parole]] du [[Parti Alpha (France)|Parti Alpha]]
}}
'''Camille Exemple''' est une femme politique fictive.`;

const fn = (
  nature: FigureFunction['nature'],
  debut: string | null,
  fin: string | null,
  libelle: string = nature,
) => ({
  libelle,
  debut,
  fin,
  enCours: fin === null && debut !== null,
  nature,
});

describe('infobox des fonctions', () => {
  it('lit les fonctions, leurs dates et leur nature, notes et références retirées', () => {
    const functions = infoboxFunctions(ARTICLE);
    expect(functions).toEqual([
      {
        libelle: 'Présidente du Parti Alpha',
        debut: '2021-07-08',
        fin: null,
        enCours: true,
        nature: 'direction',
      },
      {
        libelle: 'Députée française',
        debut: '2012-06-20',
        fin: '2022-06-20',
        enCours: false,
        nature: 'parlementaire',
      },
      {
        libelle: "Ministre de l'Intérieur",
        debut: '2017',
        fin: '2019-06-25',
        enCours: false,
        nature: 'ministre',
      },
      {
        libelle: 'Présidente du conseil départemental des Hautes-Exemples',
        debut: '2008',
        fin: '2010',
        enCours: false,
        nature: 'executif-local',
      },
      {
        libelle: 'Porte-parole du Parti Alpha',
        debut: null,
        fin: null,
        enCours: false,
        nature: 'autre',
      },
    ]);
  });

  it('normalise les clés et ne coupe pas une valeur sur les « | » d’un lien ou d’une référence', () => {
    const params = templateParams(
      '{{Infobox X | fonction 2 = [[A|B]]<ref>{{Lien|a|b}} c|d</ref> | Depuis le fonction 2 = 2020 }}',
    );
    expect(params.get('fonction2')).toBe('[[A|B]]<ref>{{Lien|a|b}} c|d</ref>');
    expect(params.get('depuis le fonction2')).toBe('2020');
    expect(cleanValue(params.get('fonction2')!)).toBe('B');
  });

  it('lit une date complète, une date dans un texte, ou à défaut l’année', () => {
    expect(dateValue('{{date|3|mai|2026}}')).toBe('2026-05-03');
    expect(dateValue('{{date|23 décembre 2024}}')).toBe('2024-12-23');
    expect(dateValue('25 juin 2022<br />(trois ans)')).toBe('2022-06-25');
    expect(dateValue('{{date|23|août|2016-}}')).toBe('2016');
    expect(dateValue('20 mai')).toBeNull();
    expect(dateValue('')).toBeNull();
    expect(dateValue(undefined)).toBeNull();
  });

  it('déduit la nature d’une fonction de son libellé', () => {
    expect(classify('Première ministre française')).toBe('premier-ministre');
    expect(classify('Garde des Sceaux, ministre de la Justice')).toBe('ministre');
    expect(classify('Ministre délégué chargé des Relations avec le Parlement')).toBe(
      'secretaire-etat',
    );
    expect(classify("Secrétaire d'État chargé de l'Emploi")).toBe('secretaire-etat');
    expect(classify('Sénateur français')).toBe('parlementaire');
    expect(classify('Député européen')).toBe('parlementaire');
    expect(classify('Maire de Pau')).toBe('executif-local');
    expect(classify('Présidente du conseil régional d’Occitanie')).toBe('executif-local');
    expect(classify('Président de la Métropole Nice Côte d’Azur')).toBe('executif-local');
    expect(classify('Président du groupe Droite républicaine à l’Assemblée nationale')).toBe(
      'direction',
    );
    expect(classify('Premier secrétaire du Parti socialiste')).toBe('direction');
    expect(classify('Coordinateur de La France insoumise')).toBe('direction');
    expect(classify('Présidente-directrice générale de la RATP')).toBe('autre');
    expect(classify('Premier adjoint au maire de Vernon')).toBe('autre');
    expect(classify('Vice-président du Parti Alpha')).toBe('autre');
  });

  it('échoue sur un article sans infobox ou sans fonction', () => {
    expect(() => infoboxFunctions('Texte sans modèle.')).toThrow(ImportError);
    expect(() =>
      infoboxFunctions('{{Infobox Personnalité politique | nom = X | fonction1 = }}'),
    ).toThrow(/Aucune fonction/);
  });
});

describe('estimation de la compétence et notoriété', () => {
  it('cumule les années de mandats parlementaires datés', () => {
    expect(
      parliamentaryYears(
        [
          fn('parlementaire', '2012-06-20', '2017-06-20'),
          fn('parlementaire', '2020', null),
          fn('parlementaire', null, '2010'),
          fn('ministre', '2000', '2020'),
        ],
        '2026-06-20',
      ),
    ).toBeCloseTo(11.5, 1);
  });

  it('additionne des facteurs documentés dont la somme est la compétence, plafonnée', () => {
    const modest = estimateCompetence([fn('parlementaire', '2022', null)], '2026-10-22');
    expect(modest).toEqual({
      valeur: 0.3,
      statut: 'estimation',
      facteurs: [{ libelle: 'Base de l’estimation', valeur: 0.3 }],
    });
    const seasoned = estimateCompetence(
      [
        fn('premier-ministre', '2022', '2024'),
        fn('ministre', '2017', '2019', 'Ministre A'),
        fn('ministre', '2019', '2020', 'Ministre B'),
        fn('ministre', '2020', '2021', 'Ministre C'),
        fn('ministre', '2021', '2022', 'Ministre D'),
        fn('secretaire-etat', '2015', '2016'),
        fn('parlementaire', '2002', '2014'),
        fn('executif-local', '2008', '2010'),
        fn('direction', '2024', null),
      ],
      '2026-10-22',
    );
    expect(seasoned.valeur).toBe(0.9);
    const sum = seasoned.facteurs.reduce((s, f) => s + f.valeur, 0);
    expect(Math.round(sum * 100) / 100).toBe(0.9);
    expect(seasoned.facteurs.map((f) => f.libelle)).toEqual([
      'Base de l’estimation',
      'Premier ministre (en fonction ou ancien)',
      '4 fonctions de ministre',
      '1 fonction de secrétaire d’État ou de ministre délégué',
      '12 ans de mandats parlementaires cumulés',
      'Exécutif local',
      'Direction d’un parti, d’un groupe, d’une assemblée ou d’une commission',
      'Plafond de l’estimation (0,90)',
    ]);
    // Plus de fonctions exercées : jamais une estimation plus basse.
    const more = estimateCompetence(
      [fn('ministre', '2017', '2019', 'Ministre A'), fn('parlementaire', '2012', '2022')],
      '2026-10-22',
    );
    const fewer = estimateCompetence([fn('ministre', '2017', '2019', 'Ministre A')], '2026-10-22');
    expect(more.valeur).toBeGreaterThanOrEqual(fewer.valeur);
  });

  it('attribue la notoriété selon les fonctions et la taille du groupe du parti', () => {
    expect(
      notoriety([fn('premier-ministre', '2022', '2024', 'Premier ministre')], 'Alpha', 10).niveau,
    ).toBe(3);
    const leader = [fn('direction', '2021', null, 'Présidente du Parti Alpha')];
    expect(notoriety(leader, 'Parti Alpha', 80)).toEqual({
      niveau: 3,
      motif: 'Présidente du Parti Alpha (groupe de 80 députés à l’Assemblée nationale)',
    });
    expect(notoriety(leader, 'Parti Alpha', 20).niveau).toBe(2);
    expect(notoriety([fn('ministre', '2010', '2012', 'Ministre X')], 'Alpha', 80).niveau).toBe(2);
    expect(
      notoriety([fn('executif-local', '2016', null, 'Présidente du conseil régional de X')], 'A', 5)
        .niveau,
    ).toBe(2);
    expect(notoriety([fn('parlementaire', '2017', null)], 'Parti Alpha', 80).niveau).toBe(1);
    // Présider un groupe n'est pas diriger le parti.
    expect(
      notoriety(
        [fn('direction', '2020', null, 'Président du groupe Parti Alpha')],
        'Parti Alpha',
        80,
      ).niveau,
    ).toBe(2);
  });
});

const CHES = parseChes(
  `country,party_id,party,family,lrecon,galtan
6,1,ALPHA,5,3,3
6,2,BETA,2,7,7.5
`,
  2024,
);

const SELECTION: FigureSelection[] = [
  {
    id: 'figure-exemple',
    article: 'Camille Exemple',
    prenom: 'Camille',
    nom: 'Exemple',
    parti: 'Parti Alpha',
    partiWikidata: 'Parti Alpha (France)',
    position: { methode: 'parti', ches: 'ALPHA' },
    groupe: 'alpha',
  },
  {
    id: 'figure-test',
    article: 'Dominique Test',
    prenom: 'Dominique',
    nom: 'Test',
    parti: 'Mouvement Gamma',
    partiWikidata: 'Mouvement Gamma',
    position: { methode: 'ancien_parti', ches: 'BETA', partiWikidata: 'Parti Beta' },
    groupe: null,
  },
];

const input = (overrides: Partial<BuildInput> = {}): BuildInput => ({
  verifieLe: '2026-10-22',
  sources: [
    {
      id: 'wikipedia-figures',
      titre: 'Wikipédia — articles',
      url: 'https://fr.wikipedia.org/w/api.php',
      licence: 'CC BY-SA 4.0',
      version: 'révisions du 2026-10-22',
      consulteLe: '2026-10-22',
      sha256: 'a'.repeat(64),
    },
  ],
  articles: new Map([
    ['Camille Exemple', { revid: 101, wikitext: ARTICLE }],
    [
      'Dominique Test',
      {
        revid: 202,
        wikitext:
          '{{Infobox Personnalité politique\n | fonction1 = [[Député français]]\n | depuis le fonction1 = 2017\n}}',
      },
    ],
  ]),
  wikidata: new Map([
    [
      'Camille Exemple',
      {
        qid: 'Q1',
        image: 'Camille Exemple 2025.jpg',
        partis: [{ parti: 'Parti Alpha (France)', debut: '2010-01-01', fin: null }],
      },
    ],
    [
      'Dominique Test',
      {
        qid: 'Q2',
        image: 'Dominique Test.jpg',
        partis: [
          { parti: 'Parti Beta', debut: '2005-01-01', fin: '2020-01-01' },
          { parti: 'Mouvement Gamma', debut: '2020-01-01', fin: null },
        ],
      },
    ],
  ]),
  ches2024: CHES,
  photos: new Map([
    [
      'Camille Exemple 2025.jpg',
      {
        licence: 'CC BY-SA 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
        auteur: 'Photographe',
      },
    ],
    ['Dominique Test.jpg', { refus: 'licence non reconnue comme libre (GFDL 1.2)' }],
  ]),
  groupes: [
    { id: 'alpha', sieges: 80 },
    { id: 'epr', sieges: 90 },
  ],
  personnalites: [
    { id: 'reel-alpha', parti: 'Nous / Renaissance' },
    { id: 'reel-sans', parti: 'Mouvement sans groupe' },
  ],
  selection: SELECTION,
  ...overrides,
});

describe('assemblage des fiches', () => {
  it('produit des fiches sourcées : fonctions, position, compétence, notoriété, photo', () => {
    const result = buildFigures(input());
    const [camille, dominique] = result.figures;
    expect(camille).toMatchObject({
      id: 'figure-exemple',
      parti: 'Parti Alpha',
      groupe: 'alpha',
      wikidata: 'Q1',
      article: 'https://fr.wikipedia.org/w/index.php?title=Camille_Exemple&oldid=101',
      position: { economie: -40, societe: -40, statut: 'estimation', methode: 'parti' },
      notoriete: { niveau: 3 },
      photo: {
        fichier: 'gouvernement/figure-exemple.webp',
        auteur: 'Photographe',
        licence: 'CC BY-SA 4.0',
        source: 'https://commons.wikimedia.org/wiki/File:Camille_Exemple_2025.jpg',
      },
      photoAbsente: null,
    });
    expect(camille!.fonctions).toHaveLength(5);
    // 0,30 + ministre 0,15 + 10 ans de mandat 0,10 + exécutif local 0,05 + direction 0,05.
    expect(camille!.competence.valeur).toBe(0.65);
    expect(dominique).toMatchObject({
      groupe: null,
      position: { economie: 40, societe: 50, statut: 'hypothese', methode: 'ancien_parti' },
      notoriete: { niveau: 1 },
      photo: null,
      photoAbsente: 'Photo non reprise : licence non reconnue comme libre (GFDL 1.2).',
    });
    expect(dominique!.position.detail).toMatch(/« Parti Beta » \(2005 → 2020\)/);
    expect(result.rattachements).toEqual([
      {
        personnaliteId: 'reel-alpha',
        groupe: 'epr',
        motif: 'Parti « Renaissance » (étiquette de la fiche : Nous / Renaissance).',
      },
    ]);
  });

  it('échoue si Wikidata n’atteste pas l’appartenance en cours au parti', () => {
    const ended = input();
    ended.wikidata.get('Camille Exemple')!.partis[0]!.fin = '2024-01-01';
    expect(() => buildFigures(ended)).toThrow(/appartenance en cours/);
    const former = input();
    former.wikidata.get('Dominique Test')!.partis.shift();
    expect(() => buildFigures(former)).toThrow(/« Parti Beta »/);
  });

  it('échoue sur un groupe, un article ou un parti CHES inconnu', () => {
    expect(() => buildFigures(input({ groupes: [] }))).toThrow(/groupe inconnu alpha/);
    expect(() => buildFigures(input({ articles: new Map() }))).toThrow(/article absent/);
    expect(() =>
      buildFigures(input({ ches2024: CHES.filter((p) => p.party !== 'ALPHA') })),
    ).toThrow(/ALPHA/);
  });

  it('rattache une personnalité candidate par une des parties de son étiquette', () => {
    expect(attachments([{ id: 'reel-x', parti: 'Horizons' }], new Set(['hor']))).toEqual([
      {
        personnaliteId: 'reel-x',
        groupe: 'hor',
        motif: 'Parti « Horizons » (étiquette de la fiche : Horizons).',
      },
    ]);
    expect(() => attachments([{ id: 'reel-x', parti: 'Horizons' }], new Set())).toThrow(
      /Groupe inconnu/,
    );
  });
});
