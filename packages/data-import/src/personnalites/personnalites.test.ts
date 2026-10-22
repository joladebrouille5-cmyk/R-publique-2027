import { describe, expect, it } from 'vitest';
import type { Cog } from '../cog/cog';
import { ImportError } from '../geometry/coverage';
import { buildPersonalities, mentionsCommune, photoFiles, type BuildInput } from './build';
import { familyAt, parseChes, partyAt, toAxis } from './ches';
import { freeLicense, originalUrl, parseAuthor, parseLicenses } from './commons';
import type { Selected } from './selection';
import { parseSparql, sparqlQuery } from './wikidata';
import {
  citationAfter,
  currentFunctions,
  findDate,
  parseFrenchDate,
  photoFile,
  readable,
  section,
  tableRows,
} from './wikitext';

// Données synthétiques (personnes et partis fictifs) au format des sources réelles.

const ref = (titre: string, url: string, site = 'Le Quotidien', date = '2026-05-03') =>
  `<ref>{{Lien web |langue=fr |titre=${titre} |url=${url} |site=[[${site}]] |date=${date} |consulté le=2026-10-21}}.</ref>`;

const ARTICLE_TEXT = `{{Sommaire}}
== Candidats déclarés ==
{| class="wikitable"
! Candidat
|-
! {{TriNom|Camille|Exemple}}<br>({{Âge|1|1|1970|18|04|2027}})<br>[[Parti Alpha (France)|Parti Alpha]]
| width="9%" | [[Fichier:Camille Exemple 2025.jpg|80px|Camille Exemple]]
| width="1%" {{Infobox Parti politique français/couleurs|PA}} |
|
* Présidente du [[Parti Alpha (France)|Parti Alpha]] <small>(depuis 2020)</small>
* Députée de la {{Circonscription fr|2|Somme}} <small>(depuis 2017)</small>
| ''Slogan''
|
* [[Premier ministre (France)|Première ministre]] <small>(2021-2022)</small>
----
Elle annonce sa candidature le {{date|3 mai 2026}}${ref('Camille Exemple annonce sa candidature', 'https://exemple.fr/candidature')}{{,}}<ref name="bilan" />.
----
Candidate à l'élection présidentielle de 2022 <small>({{4e}} - 7,07 %)</small>
|-
! Dominique Test<br>({{Âge|2|2|1980|18|04|2027}})<br>[[Mouvement Gamma]]{{note|groupe=alpha|texte=Candidature soutenue par :
* [[Parti Beta]]}}
|
| {{Infobox Parti politique français/couleurs|MG}} |
| ''Aucune''
|
|Il annonce sa candidature à la primaire le 23 août 2026<ref name="bilan">{{Article |titre=Le bilan de la primaire |périodique=La Revue |date=12 octobre 2026 |lire en ligne=https://revue.fr/bilan}}</ref>, et l'emporte le 11 octobre${ref('Résultats de la primaire', 'https://exemple.fr/primaire', 'Le Soir', '2026-10-11')}.
|-
! {{TriNom|Alex|Hors|nolink=oui}}<br>[[Mouvement Delta]]
|
| x |
|
* Président du conseil régional des Hauts-de-France
|
|Il annonce sa candidature le {{date|01/06/2026}}${ref('Annonce', 'https://exemple.fr/hors')}.
|}

=== Candidats déclarés dans le cadre d'une primaire ===
{| class="wikitable"
|-
! {{TriNom|Sacha|Primaire}}<br>[[Parti Alpha (France)|Parti Alpha]]
|
| x |
| ''Aucune''
|
|Il se déclare le {{Date|01|04|2025}}${ref('Sacha Primaire se lance', 'https://exemple.fr/sacha')}.
|}

== Candidats pressentis ==
`;

const CHES_2024 = `country,party_id,party,family,lrecon,galtan
6,1,ALPHA,1,6,8.5
6,2,BETA,5,3.36,2.72
6,3,ZETA,1,8,9
1,9,AUTRE,5,5,5
`;
const CHES_TREND = `year,country,party_id,party,family,lrecon,galtan
1999,6,4,OLD,1,7,6
2019,6,5,DELTA,2,7,8.28
2024,6,1,ALPHA,1,6.1,8.4
`;

const cog: Cog = {
  communes: [{ code: '80021', nom: 'Amiens', departement: '80', region: '32' }],
  departements: [
    { code: '80', nom: 'Somme', region: '32', zone: 'metropole' },
    { code: '62', nom: 'Pas-de-Calais', region: '32', zone: 'metropole' },
  ],
  regions: [{ code: '32', nom: 'Hauts-de-France' }],
  comer: [],
};

const COMMONS_PAGE = `<td id="fileinfotpl&#95;aut" class="fileinfo-paramfield">Author</td>
<td><a href="/wiki/User:Ph">Photographe Libre</a></td>
<div class="responsive-license-cc layouttemplate licensetpl"><span class="licensetpl&#95;link">https://creativecommons.org/licenses/by-sa/4.0</span><span class="licensetpl&#95;short" style="display:none;">CC BY-SA 4.0 </span></div>`;

const selectionFor = (overrides: Partial<Selected> = {}): Selected[] => [
  {
    id: 'reel-exemple',
    nom: 'Camille Exemple',
    section: 'principale',
    article: 'Camille Exemple',
    candidature: {
      date: '2026-05-03',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 3 mai 2026.',
    },
    position: { methode: 'parti', ches: 'ALPHA', vague: 2024, fait: 'Parti Alpha' },
    notoriete: {
      niveau: 3,
      motif: 'ancienne Première ministre',
      fait: 'Première ministre (2021-2022)',
    },
    organisation: {
      niveau: 'grande',
      motif: 'présidente du parti',
      fait: 'Présidente du Parti Alpha',
    },
    implantation: [{ departement: '80', fait: 'Députée de la 2e circonscription (Somme)' }],
    ...overrides,
  },
  {
    id: 'reel-test',
    nom: 'Dominique Test',
    section: 'principale',
    article: 'Dominique Test',
    candidature: {
      date: '2026-10-11',
      statut: 'designee',
      libelle: 'Vainqueur de la primaire le 11 octobre 2026.',
      ancre: "l'emporte le 11 octobre",
    },
    position: {
      methode: 'parti_soutien',
      ches: 'BETA',
      vague: 2024,
      fait: 'Candidature soutenue par : * Parti Beta',
    },
    notoriete: { niveau: 1, motif: 'aucun critère', fait: null },
    organisation: { niveau: 'aucune', motif: 'aucun groupe', fait: null },
    implantation: [],
  },
  {
    id: 'reel-hors',
    nom: 'Alex Hors',
    section: 'principale',
    article: 'Alex Hors',
    candidature: {
      date: '2026-06-01',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 1er juin 2026.',
    },
    position: {
      methode: 'famille',
      reference: { ches: 'OLD', vague: 1999 },
      partiWikidata: 'Ancien Parti',
    },
    notoriete: { niveau: 1, motif: 'aucun critère', fait: null },
    organisation: { niveau: 'aucune', motif: 'aucun groupe', fait: null },
    implantation: [{ region: '32', fait: 'Président du conseil régional des Hauts-de-France' }],
  },
  {
    id: 'reel-primaire',
    nom: 'Sacha Primaire',
    section: 'primaire',
    article: 'Sacha Primaire',
    candidature: {
      date: '2025-04-01',
      statut: 'declaree',
      libelle: 'Candidature annoncée le 1er avril 2025.',
    },
    position: { methode: 'ancien_parti', ches: 'DELTA', vague: 2019, partiWikidata: 'Parti Delta' },
    notoriete: { niveau: 1, motif: 'aucun critère', fait: null },
    organisation: { niveau: 'aucune', motif: 'aucun groupe', fait: null },
    implantation: [],
  },
];

const wikidataJson = JSON.stringify({
  results: {
    bindings: [
      {
        article: { value: 'https://fr.wikipedia.org/wiki/Alex_Hors' },
        person: { value: 'http://www.wikidata.org/entity/Q1' },
        partyArticle: { value: 'https://fr.wikipedia.org/wiki/Ancien_Parti' },
        start: { value: '1999-01-01T00:00:00Z' },
        end: { value: '2006-01-01T00:00:00Z' },
      },
      {
        article: { value: 'https://fr.wikipedia.org/wiki/Sacha_Primaire' },
        person: { value: 'http://www.wikidata.org/entity/Q2' },
        partyArticle: { value: 'https://fr.wikipedia.org/wiki/Parti_Delta' },
      },
      {
        article: { value: 'https://fr.wikipedia.org/wiki/Camille_Exemple' },
        person: { value: 'http://www.wikidata.org/entity/Q3' },
      },
    ],
  },
});

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    article: ARTICLE_TEXT,
    articleRevisionUrl: 'https://fr.wikipedia.org/w/index.php?title=X&oldid=1',
    verifieLe: '2026-10-21',
    sources: [
      {
        id: 'test',
        titre: 'Source de test',
        url: 'https://exemple.fr/source',
        licence: 'CC0 1.0',
        version: '1',
        consulteLe: '2026-10-21',
        sha256: 'a'.repeat(64),
      },
    ],
    ches2024: parseChes(CHES_2024, 2024),
    chesTrend: parseChes(CHES_TREND),
    wikidata: parseSparql(wikidataJson),
    photos: new Map([['Camille_Exemple_2025.jpg', freeLicense(COMMONS_PAGE)]]),
    cog,
    selection: selectionFor(),
    ...overrides,
  };
}

describe('wikicode des candidatures', () => {
  it('lit les dates françaises sous toutes leurs formes', () => {
    expect(parseFrenchDate('{{date|8 décembre 2025}}')).toBe('2025-12-08');
    expect(parseFrenchDate('{{Date|01|04|2025}}')).toBe('2025-04-01');
    expect(parseFrenchDate('{{date|2|10|2026}}')).toBe('2026-10-02');
    expect(parseFrenchDate('{{date|01/06/2026}}')).toBe('2026-06-01');
    expect(parseFrenchDate('{{date|1er mars 2026}}')).toBe('2026-03-01');
    expect(parseFrenchDate('3 mai 2026')).toBe('2026-05-03');
    expect(parseFrenchDate('{{date|31|août|2023}}')).toBe('2023-08-31');
    expect(parseFrenchDate('mai 2026')).toBeNull();
  });

  it('découpe les lignes et les cellules, lit la photo, les fonctions et le texte', () => {
    const rows = tableRows(section(ARTICLE_TEXT, 'Candidats déclarés'));
    expect(rows.map((r) => r.nom)).toEqual(['Camille Exemple', 'Dominique Test', 'Alex Hors']);
    expect(photoFile(rows[0]!)).toBe('Camille_Exemple_2025.jpg');
    expect(photoFile(rows[1]!)).toBeNull();
    expect(currentFunctions(rows[0]!)).toEqual([
      'Présidente du Parti Alpha (depuis 2020)',
      'Députée de la 2e circonscription (Somme) (depuis 2017)',
    ]);
    expect(currentFunctions(rows[1]!)).toEqual([]);
    expect(readable(rows[1]!.raw)).toContain('Candidature soutenue par : * Parti Beta');
    expect(readable(rows[0]!.raw)).toContain('(4e - 7,07 %)');
  });

  it('trouve la référence qui suit la date, nommée ou non, mais pas une date de publication', () => {
    const rows = tableRows(section(ARTICLE_TEXT, 'Candidats déclarés'));
    const at = findDate(rows[0]!.raw, '2026-05-03');
    expect(at).toBeGreaterThan(0);
    expect(citationAfter(rows[0]!.raw, at, ARTICLE_TEXT)).toEqual({
      titre: 'Camille Exemple annonce sa candidature',
      url: 'https://exemple.fr/candidature',
      site: 'Le Quotidien',
      date: '2026-05-03',
    });
    // La date du 11 octobre 2026 n'apparaît que dans une référence : elle ne compte pas.
    expect(findDate(rows[1]!.raw, '2026-10-12')).toBe(-1);
    const named = rows[0]!.raw.indexOf('<ref name="bilan" />');
    expect(citationAfter(rows[0]!.raw, named, ARTICLE_TEXT)).toMatchObject({
      titre: 'Le bilan de la primaire',
      url: 'https://revue.fr/bilan',
      site: 'La Revue',
      date: '2026-10-12',
    });
  });
});

describe('Commons, CHES et Wikidata', () => {
  it('lit la licence libre et l’auteur ; refuse une licence non libre ou sans auteur', () => {
    expect(parseLicenses(COMMONS_PAGE)).toEqual([
      { licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0' },
    ]);
    expect(parseAuthor(COMMONS_PAGE)).toBe('Photographe Libre');
    expect(freeLicense(COMMONS_PAGE)).toEqual({
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      auteur: 'Photographe Libre',
    });
    expect(freeLicense(COMMONS_PAGE.replace('CC BY-SA 4.0', 'CC BY-NC 4.0'))).toEqual({
      refus: 'licence non reconnue comme libre (CC BY-NC 4.0)',
    });
    expect(freeLicense(COMMONS_PAGE.replace('Photographe Libre', ''))).toEqual({
      refus: 'auteur non indiqué sur la page du fichier',
    });
    expect(originalUrl('Example.jpg')).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg',
    );
  });

  it('convertit les positions CHES (0 à 10) vers les axes du jeu (−100 à +100)', () => {
    expect([toAxis(0), toAxis(5), toAxis(10), toAxis(6.18), toAxis(0.909)]).toEqual([
      -100, 0, 100, 24, -82,
    ]);
    const parties = parseChes(CHES_2024, 2024);
    expect(parties.map((p) => p.party)).toEqual(['ALPHA', 'BETA', 'ZETA']);
    expect(partyAt(parties, 'BETA', 2024)).toMatchObject({ lrecon: 3.36, galtan: 2.72 });
    expect(() => partyAt(parties, 'BETA', 2019)).toThrow(ImportError);
    expect(familyAt(parties, 1, 2024).map((p) => p.party)).toEqual(['ALPHA', 'ZETA']);
  });

  it('lit l’historique des partis de Wikidata', () => {
    expect(sparqlQuery(['Camille Exemple'])).toContain(
      '<https://fr.wikipedia.org/wiki/Camille_Exemple>',
    );
    const people = parseSparql(wikidataJson);
    expect(people.get('Alex Hors')).toEqual({
      qid: 'Q1',
      partis: [{ parti: 'Ancien Parti', debut: '1999-01-01', fin: '2006-01-01' }],
    });
    expect(people.get('Camille Exemple')).toEqual({ qid: 'Q3', partis: [] });
  });
});

describe('assemblage des fiches', () => {
  it('produit des fiches sourcées : candidature, position, photo créditée, implantation, moyens', () => {
    const result = buildPersonalities(input());
    const [exemple, test, hors, primaire] = result.personnalites;
    expect(exemple).toMatchObject({
      id: 'reel-exemple',
      prenom: 'Camille',
      nom: 'Exemple',
      parti: 'Parti Alpha',
      wikidata: 'Q3',
      candidature: {
        date: '2026-05-03',
        source: { url: 'https://exemple.fr/candidature', site: 'Le Quotidien' },
      },
      position: { economie: 20, societe: 70, statut: 'estimation', methode: 'parti', vague: 2024 },
      photo: {
        fichier: 'personnalites/reel-exemple.webp',
        auteur: 'Photographe Libre',
        licence: 'CC BY-SA 4.0',
      },
      photoAbsente: null,
      implantation: { departements: ['80'], regions: ['32'] },
      moyens: { notoriete: 3, organisation: 'grande' },
    });
    expect(test).toMatchObject({
      parti: 'Mouvement Gamma',
      candidature: { date: '2026-10-11', source: { url: 'https://exemple.fr/primaire' } },
      position: { methode: 'parti_soutien', partisReference: ['BETA'], economie: -33 },
      photo: null,
      photoAbsente: 'Aucune photo dans la source.',
    });
    // Famille de l'ancien parti (noté en 1999) : moyenne des partis de la famille en 2024.
    expect(hors).toMatchObject({
      position: {
        statut: 'hypothese',
        methode: 'famille',
        partisReference: ['ALPHA', 'ZETA'],
        economie: 40,
        societe: 75,
      },
      implantation: { departements: ['62', '80'], regions: ['32'] },
    });
    expect(primaire).toMatchObject({
      position: {
        statut: 'hypothese',
        methode: 'ancien_parti',
        vague: 2019,
        economie: 40,
        societe: 66,
      },
    });
    expect(result.nonIntegrees).toEqual([]);
  });

  it('échoue quand un fait cité, la date ou l’appartenance Wikidata manque', () => {
    const missingFact = selectionFor({
      notoriete: { niveau: 3, motif: 'x', fait: 'Président de la République' },
    });
    expect(() => buildPersonalities(input({ selection: missingFact }))).toThrow(/fait introuvable/);
    const wrongDate = selectionFor({
      candidature: { date: '2026-05-04', statut: 'declaree', libelle: 'x' },
    });
    expect(() => buildPersonalities(input({ selection: wrongDate }))).toThrow(
      /absente de la source/,
    );
    expect(() => buildPersonalities(input({ wikidata: new Map() }))).toThrow(
      /Wikidata n'indique pas/,
    );
    const absent = selectionFor({ nom: 'Personne Inconnue' });
    expect(() => buildPersonalities(input({ selection: absent }))).toThrow(/absent\(e\)/);
  });

  it('refuse une référence de candidature portant sur une procédure judiciaire', () => {
    const article = ARTICLE_TEXT.replace(
      'Camille Exemple annonce sa candidature',
      'Camille Exemple renvoyée en correctionnelle',
    );
    expect(() => buildPersonalities(input({ article }))).toThrow(/procédure judiciaire/);
    // Repli documenté : l'article lui-même sert de source.
    const selection = selectionFor({
      candidature: {
        date: '2026-05-03',
        statut: 'declaree',
        libelle: 'x',
        source: { article: 'référence sans rapport' },
      },
    });
    const result = buildPersonalities(input({ article, selection }));
    expect(result.personnalites[0]!.candidature.source).toMatchObject({
      site: 'Wikipédia',
      url: 'https://fr.wikipedia.org/w/index.php?title=X&oldid=1',
    });
  });

  it('liste les candidatures non retenues, mais échoue sur une nouvelle candidature d’un parti noté', () => {
    const selection = selectionFor().filter((s) => s.id !== 'reel-hors');
    const result = buildPersonalities(input({ selection }));
    expect(result.nonIntegrees).toEqual([
      expect.objectContaining({ prenom: 'Alex', nom: 'Hors', parti: 'Mouvement Delta' }),
    ]);
    const covered = ARTICLE_TEXT.replace('[[Mouvement Delta]]', '[[Les Républicains]]');
    expect(() => buildPersonalities(input({ article: covered, selection }))).toThrow(
      /parti noté par CHES, non prévue/,
    );
  });

  it('ne retient une photo qu’avec sa licence libre et son auteur', () => {
    const photos = new Map([
      ['Camille_Exemple_2025.jpg', { refus: 'licence non reconnue comme libre (EP)' }],
    ]);
    const result = buildPersonalities(input({ photos }));
    expect(result.personnalites[0]).toMatchObject({
      photo: null,
      photoAbsente: 'Photo non reprise : licence non reconnue comme libre (EP).',
    });
  });

  it('reprend la photo libre choisie sur Commons quand celle de la source ne l’est pas', () => {
    const selection = selectionFor().map((s) =>
      s.id === 'reel-exemple'
        ? { ...s, photo: { fichier: 'Camille_Libre.jpg', motif: 'Photo de la source non libre.' } }
        : s,
    );
    expect(photoFiles(ARTICLE_TEXT, selection).get('reel-exemple')).toBe('Camille_Libre.jpg');
    // Licence vérifiée comme les autres : refusée, pas de photo.
    const refused = buildPersonalities(
      input({ selection, photos: new Map([['Camille_Libre.jpg', { refus: 'non libre' }]]) }),
    );
    expect(refused.personnalites[0]).toMatchObject({ photo: null });
    const result = buildPersonalities(
      input({ selection, photos: new Map([['Camille_Libre.jpg', freeLicense(COMMONS_PAGE)]]) }),
    );
    expect(result.personnalites[0]).toMatchObject({
      photo: {
        source: 'https://commons.wikimedia.org/wiki/File:Camille_Libre.jpg',
        licence: 'CC BY-SA 4.0',
        choix: 'Photo de la source non libre.',
      },
      photoAbsente: null,
    });
    // Sans choix : pas de motif.
    expect(buildPersonalities(input()).personnalites[0]!.photo).not.toHaveProperty('choix');
  });

  it('reconnaît une commune avec l’article contracté', () => {
    expect(mentionsCommune('Maire du Havre', 'Le Havre')).toBe(true);
    expect(mentionsCommune('Maire des Mureaux', 'Les Mureaux')).toBe(true);
    expect(mentionsCommune('Maire de Cannes', 'Cannes')).toBe(true);
    expect(mentionsCommune('Maire de Nice', 'Cannes')).toBe(false);
  });
});
