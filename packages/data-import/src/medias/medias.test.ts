import { deflateRawSync } from 'node:zlib';
import type { RealPersonality } from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { ImportError } from '../geometry/coverage';
import { commonsFileTitle, parseAuthor } from '../personnalites/commons';
import { aggregateArcom, parseArcomMonth, seconds, speakingTimeEstimates } from './arcom';
import { buildMedias, type MediaInputs, type SourcedMeasures } from './build';
import { buildShow, showId } from './emissions';
import { imageFile, infobox, links, plain, redirectTarget } from './infobox';
import { logoFile, unsafeSvg } from './logos';
import { excelDate, normalizeLabel, parseEar, parseMediamat, parseOneNext } from './mesures';
import type { OutletSelection } from './selection';
import { readXlsx, unzip } from './xlsx';

// Données synthétiques (chaînes, partis et émissions fictifs) au format des sources réelles.

/** Archive ZIP minimale : entrées compressées (« deflate ») ou stockées. */
function zip(files: Record<string, string>, deflate = true): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const body = deflate ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

type Cell = string | number;
/** Classeur minimal : chaînes en chaînes partagées, nombres en valeurs. */
function workbook(sheets: Record<string, Record<string, Cell>>): Buffer {
  const shared: string[] = [];
  const files: Record<string, string> = {};
  const names = Object.keys(sheets);
  names.forEach((name, i) => {
    const rows = new Map<number, string[]>();
    for (const [ref, value] of Object.entries(sheets[name]!)) {
      const row = Number(/\d+$/.exec(ref)![0]);
      const cell =
        typeof value === 'number'
          ? `<c r="${ref}"><v>${value}</v></c>`
          : `<c r="${ref}" t="s"><v>${shared.push(value) - 1}</v></c>`;
      rows.set(row, [...(rows.get(row) ?? []), cell]);
    }
    files[`xl/worksheets/sheet${i + 1}.xml`] =
      `<worksheet><sheetData>${[...rows].map(([r, cells]) => `<row r="${r}">${cells.join('')}</row>`).join('')}</sheetData></worksheet>`;
  });
  files['xl/sharedStrings.xml'] =
    `<sst>${shared.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`;
  files['xl/workbook.xml'] =
    `<workbook><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] =
    `<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;
  return zip(files);
}

const MEDIAMAT = {
  'PDA et Couverture chaines': {
    C1: 'Part d’audience (%)',
    D1: 'Couverture mensuelle',
    C3: 46266,
    B4: 'Total TV',
    C4: 100,
    D4: 60000000,
    A8: 'Chaînes',
    B8: 'CANAL ALPHA',
    C8: 12.5,
    D8: 50000000,
    B9: 'INFO BÊTA',
    C9: 2.5,
    D9: 30000000,
  },
  'Couverture cibles': { A2: 'Individus de 4 ans et + ', B2: 60000000, C2: 97.8 },
};

const EAR = {
  '1B': { B2: ' Population des 13 ans et plus (5h-24h)' },
  '2': {
    B2: 'L’Audience de la Radio en Lundi-Vendredi',
    D4: 'Avril - Juin 2026',
    G4: 'Janvier - Mars 2026',
    D5: 'AC',
    E5: 'DEA',
    F5: 'PDA',
    G5: 'AC',
    H5: 'DEA',
    I5: 'PDA',
    D6: '%',
    E6: 'h/mn',
    F6: '%',
    B8: 'TOTAL RADIO',
    F8: 100,
    B12: 'RADIO GAMMA',
    D12: 9.5,
    E12: '2h10',
    F12: 10,
    I12: 11,
    B13: 'RADIO DELTA',
    D13: 1,
    F13: 'ND',
  },
};

describe('classeurs Excel', () => {
  it('lit une archive ZIP compressée ou stockée', () => {
    for (const deflate of [true, false]) {
      const files = unzip(zip({ 'a.txt': 'é'.repeat(200), 'b/c.xml': '<x/>' }, deflate));
      expect(files.get('a.txt')!.toString('utf8')).toBe('é'.repeat(200));
      expect(files.get('b/c.xml')!.toString('utf8')).toBe('<x/>');
    }
    expect(() => unzip(Buffer.from('pas une archive'))).toThrow(ImportError);
  });

  it('lit les feuilles, les chaînes partagées et les nombres', () => {
    const sheets = readXlsx(workbook({ Feuille: { A1: 'Titre & co', B2: 3.5 } }));
    expect(sheets.get('Feuille')!.get('A1')).toBe('Titre & co');
    expect(sheets.get('Feuille')!.get('B2')).toBe('3.5');
  });

  it('Médiamat : mois, population vérifiée et parts d’audience', () => {
    expect(excelDate(46266)).toBe('2026-09-01');
    const m = parseMediamat(readXlsx(workbook(MEDIAMAT)));
    expect(m.mois).toBe('2026-09-01');
    expect(m.periode).toBe('septembre 2026');
    expect(m.valeurs.get(normalizeLabel('Canal Alpha'))).toEqual({
      libelle: 'CANAL ALPHA',
      valeur: 12.5,
    });
    expect(m.valeurs.get('info beta')!.valeur).toBe(2.5);
    // Population différente : refus.
    const other = {
      ...MEDIAMAT,
      'Couverture cibles': { A2: 'Individus de 4 ans et + ', B2: 1 },
    };
    expect(() => parseMediamat(readXlsx(workbook(other)))).toThrow(/4 ans et plus/);
  });

  it('EAR National : vague la plus récente, part d’audience du lundi au vendredi', () => {
    const ear = parseEar(readXlsx(workbook(EAR)));
    expect(ear.periode).toBe('avril - juin 2026');
    expect(ear.valeurs.get('radio gamma')!.valeur).toBe(10);
    expect(ear.valeurs.has('radio delta')).toBe(false);
    expect(() =>
      parseEar(readXlsx(workbook({ ...EAR, '1B': { B2: 'Autre population' } }))),
    ).toThrow(/13 ans et plus/);
  });
});

describe('ACPM OneNext', () => {
  const page = (rows: string[][]) =>
    `<html><table><tr><th>Rang</th><th></th><th>Titre</th><th>Périodicité</th><th>Période</th><th>Lecteurs au Numéro Moyen (LNM)</th></tr>${rows
      .map((r) => `<tr>${r.map((c) => `<td> ${c} </td>`).join('')}</tr>`)
      .join('')}</table></html>`;

  it('lit les lecteurs au numéro moyen', () => {
    const m = parseOneNext(
      page([
        ['1', '-', 'Le Quotidien d&#039;Epsilon', 'Quotidien', '2026 S1', '2 920 000'],
        ['2', '', 'Total PQN', 'Quotidien', '2026 S1', '8 000 000'],
      ]),
    );
    expect(m.periode).toBe('2026 S1');
    expect(m.valeurs.get(normalizeLabel("Le Quotidien d'Epsilon"))!.valeur).toBe(2_920_000);
  });

  it('refuse un classement mêlant plusieurs périodes ou un lectorat illisible', () => {
    expect(() =>
      parseOneNext(
        page([
          ['1', '', 'A', 'Quotidien', '2026 S1', '1 000'],
          ['2', '', 'B', 'Quotidien', '2025 S2', '1 000'],
        ]),
      ),
    ).toThrow(/2 périodes/);
    expect(() => parseOneNext(page([['1', '', 'A', 'Quotidien', '2026 S1', 'n.c.']]))).toThrow(
      ImportError,
    );
  });
});

// Relevé Arcom synthétique : deux services, trois types d'émission chacun.
const HEADER =
  ';"Canal Alpha";"Canal Alpha";"Canal Alpha";"Radio Gamma";"Radio Gamma";"Radio Gamma"';
function arcomCsv(over: Partial<Record<string, string>> = {}): string {
  const rows: Record<string, string> = {
    'Type de service':
      '"Chaîne généraliste";"Chaîne généraliste";"Chaîne généraliste";"Radio généraliste";"Radio généraliste";"Radio généraliste"',
    "Type d'émission": 'JTF;MAG;PROG;JRF;MAG;PROG',
    'Président de la République': '00:10:00;;-;-;-;-',
    'dont Président de la République - propos qui relèvent du débat politique national':
      '00:05:00;-;-;-;-;-',
    Gouvernement: '00:15:00;-;-;01:00:00;-;-',
    'Total Pouvoir exécutif': '00:20:00;-;-;01:00:00;-;-',
    'Part Pouvoir exécutif': '25,00%;-;-;33,33%;-;-',
    'Parti Alpha': '00:30:00;00:20:00;-;01:00:00;-;-',
    'Parti Bêta': '00:30:00;-;-;01:00:00;-;-',
    'Parti Mini': '-;00:10:00;-;-;-;-',
    'Total Partis politiques': '01:00:00;00:30:00;-;02:00:00;-;-',
    'Part Partis politiques': '75,00%;100,00%;-;66,67%;-;-',
    ...over,
  };
  return `${HEADER}\n${Object.entries(rows)
    .map(([label, values]) => `"${label}";${values}`)
    .join('\n')}\n`;
}

describe('temps de parole de l’Arcom', () => {
  it('lit les durées et cumule les colonnes de chaque service', () => {
    expect(seconds('01:02:03', 'test')).toBe(3723);
    expect(seconds('-', 'test')).toBe(0);
    expect(() => seconds('1h02', 'test')).toThrow(ImportError);
    const month = parseArcomMonth(arcomCsv(), '2026-07');
    const alpha = month.services.find((s) => s.libelle === 'Canal Alpha')!;
    expect(alpha.typeService).toBe('Chaîne généraliste');
    expect(alpha.totalPartis).toBe(5400);
    expect(alpha.executif).toBe(1200);
    expect(alpha.partis.get('Parti Alpha')).toBe(3000);
    expect(alpha.partis.has('Parti Mini')).toBe(true);
  });

  it('échoue si les partis ne totalisent pas le total publié ou si les parts ne font pas 100 %', () => {
    expect(() =>
      parseArcomMonth(
        arcomCsv({ 'Total Partis politiques': '01:00:01;00:30:00;-;02:00:00;-;-' }),
        '2026-07',
      ),
    ).toThrow(/totalisent/);
    expect(() =>
      parseArcomMonth(
        arcomCsv({ 'Part Partis politiques': '74,00%;100,00%;-;66,67%;-;-' }),
        '2026-07',
      ),
    ).toThrow(/100 %/);
  });

  it('parts totalisant 100 % et propension relative à l’ensemble des services', () => {
    const totals = aggregateArcom([
      parseArcomMonth(arcomCsv(), '2026-06'),
      parseArcomMonth(arcomCsv(), '2026-07'),
    ]);
    expect(totals.get('Canal Alpha')!.mois).toBe(2);
    // Seuil : Parti Mini (20 min au total) n'est pas suivi.
    const { suivis, estimates } = speakingTimeEstimates([...totals.values()], 3600);
    expect(suivis).toEqual(['Parti Alpha', 'Parti Bêta']);
    const alpha = estimates.get('Canal Alpha')!;
    expect(alpha.parts['Parti Alpha']! + alpha.parts['Parti Bêta']! + alpha.autres).toBeCloseTo(
      1,
      6,
    );
    // Parti Alpha : 50/90 sur Canal Alpha contre 110/210 en tout.
    expect(alpha.propension['Parti Alpha']).toBe(Math.round((50 / 90 / (110 / 210)) * 100) / 100);
    expect(estimates.get('Radio Gamma')!.propension['Parti Bêta']).toBe(
      Math.round((0.5 / (90 / 210)) * 100) / 100,
    );
  });
});

const SHOW = (champs: string) => `{{Infobox Émission de télévision
 | titre = Le Grand Oral
 | image = Grand Oral.svg
 | présentation = [[Jeanne Exemple (journaliste)|Jeanne Exemple]] <small>(depuis 2020)</small><br>[[Paul Test]]
 | périodicité = [[Semaine|Hebdomadaire]]<br /><small>le dimanche, {{Heures|12}}</small>
${champs}
}}
'''Le Grand Oral''' est une émission.`;

const OUTLET_BY_ARTICLE = new Map([
  [normalizeLabel('Canal Alpha'), 'canal-alpha'],
  [normalizeLabel('Radio Gamma'), 'radio-gamma'],
]);
const article = (wikitext: string) => ({
  titre: 'Le Grand Oral (émission)',
  url: 'https://fr.wikipedia.org/w/index.php?title=Le_Grand_Oral&oldid=1',
  wikitext,
});

describe('infobox et émissions', () => {
  it('lit les champs, les liens et le texte des valeurs', () => {
    const box = infobox(SHOW(' | chaîne = [[Canal Alpha]]'))!;
    expect(box.modele).toBe('Émission de télévision');
    expect(links(box.champs.get('présentation')!).map((l) => l.libelle)).toEqual([
      'Jeanne Exemple',
      'Paul Test',
    ]);
    expect(plain(box.champs.get('périodicité')!)).toBe('Hebdomadaire ; le dimanche, 12 h');
    expect(imageFile('[[Fichier:Logo X.svg|120px]]')).toBe('Logo X.svg');
    expect(imageFile('Logo_Y.png')).toBe('Logo Y.png');
    expect(redirectTarget('#REDIRECTION [[France Info]]')).toBe('France Info');
  });

  it('ne garde de la diffusion que les mentions encore valables', () => {
    const wikitext = SHOW(' | chaîne = [[Canal Alpha]]').replace(
      / \| périodicité = .*\n/,
      ' | périodicité = Mensuelle <small>(1982-1991)</small> <br/> Hebdomadaire\n',
    );
    const result = buildShow(article(wikitext), OUTLET_BY_ARTICLE);
    expect('emission' in result && result.emission.diffusion).toBe('Hebdomadaire');
  });

  it('retient une émission en cours sur un organe retenu, avec ses présentateurs', () => {
    const result = buildShow(
      article(SHOW(' | chaîne = [[Canal Alpha]] puis [[Radio Gamma]]\n | statut = En cours')),
      OUTLET_BY_ARTICLE,
    );
    expect(result).toEqual({
      emission: {
        id: 'emi-le-grand-oral',
        titre: 'Le Grand Oral',
        organeId: 'canal-alpha',
        autresOrganes: ['radio-gamma'],
        presentateurs: ['Jeanne Exemple', 'Paul Test'],
        diffusion: 'Hebdomadaire ; le dimanche, 12 h',
        article: 'https://fr.wikipedia.org/w/index.php?title=Le_Grand_Oral&oldid=1',
      },
    });
    expect(showId('L’Heure des pros')).toBe('emi-l-heure-des-pros');
  });

  it('écarte une émission arrêtée ou hors des organes retenus, avec le motif', () => {
    expect(
      buildShow(
        article(SHOW(' | chaîne = [[Canal Alpha]]\n | dernière diffusion = 2025')),
        OUTLET_BY_ARTICLE,
      ),
    ).toEqual({ motif: 'diffusion arrêtée selon la source (2025)' });
    expect(
      buildShow(article(SHOW(' | chaîne = [[Canal Alpha]]\n | statut = Fini')), OUTLET_BY_ARTICLE),
    ).toEqual({ motif: 'statut « Fini » selon la source' });
    expect(buildShow(article(SHOW(' | chaîne = [[Chaîne Zêta]]')), OUTLET_BY_ARTICLE)).toEqual({
      motif: 'diffusée sur un organe non retenu (Chaîne Zêta)',
    });
    expect(
      buildShow(
        article(
          SHOW(
            ' | chaîne = [[Canal Alpha]]\n | statut = En cours\n | suivi par = [[Le Nouvel Oral]]',
          ),
        ),
        OUTLET_BY_ARTICLE,
      ),
    ).toEqual({ motif: 'remplacée par « Le Nouvel Oral » selon la source' });
  });

  it('échoue si l’article n’indique ni chaîne ni présentateur, ou n’est pas une émission', () => {
    expect(() => buildShow(article(SHOW(' | chaîne = ')), OUTLET_BY_ARTICLE)).toThrow(
      /chaîne ou station non indiquée/,
    );
    const noPresenter = SHOW(' | chaîne = [[Canal Alpha]]').replace(/ \| présentation = .*\n/, '');
    expect(() => buildShow(article(noPresenter), OUTLET_BY_ARTICLE)).toThrow(
      /présentateur non indiqué/,
    );
    expect(() => buildShow(article('{{Homonymie}}\n* [[A]]'), OUTLET_BY_ARTICLE)).toThrow(
      /homonymie/,
    );
  });
});

describe('logos', () => {
  it('suit une redirection de fichier sur Commons', () => {
    expect(
      commonsFileTitle(
        '<script>RLCONF={"wgTitle":"Le Quotidien \\u00e9tendu.svg","wgRedirectedFrom":"File:A.svg"};</script>',
      ),
    ).toBe('Le Quotidien étendu.svg');
    expect(commonsFileTitle('<html></html>')).toBeNull();
  });

  it('lit l’auteur sans le répéter quand la page le double', () => {
    const page = (cell: string) =>
      `<table><tr><td id="fileinfotpl_aut">Auteur</td><td>${cell}</td></tr></table>`;
    expect(parseAuthor(page('<span>Unknown author</span> <span>Unknown author</span>'))).toBe(
      'Unknown author',
    );
    expect(parseAuthor(page('Radio France - Yuma Paris'))).toBe('Radio France - Yuma Paris');
  });

  it('prend le logo d’une station, l’image d’une chaîne', () => {
    expect(
      logoFile(infobox('{{Infobox Station de radio\n | image = A.png\n | logo = B.svg\n}}')),
    ).toBe('B.svg');
    expect(
      logoFile(infobox('{{Infobox Chaîne de télévision\n | image = A.svg\n | logo = B.svg\n}}')),
    ).toBe('A.svg');
    expect(logoFile(null)).toBeNull();
  });

  it('refuse un SVG actif ou qui charge une ressource externe', () => {
    const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
    expect(unsafeSvg(svg('<path d="M0 0h1v1z" fill="url(#g)"/><use href="#a"/>'))).toBeNull();
    expect(unsafeSvg(svg('<script>alert(1)</script>'))).toMatch(/script/);
    expect(unsafeSvg(svg('<rect onclick="x()"/>'))).toMatch(/gestionnaire/);
    expect(unsafeSvg(svg('<image href="https://exemple.org/a.png"/>'))).toMatch(/externe/);
    expect(unsafeSvg(svg('<style>@import url(https://exemple.org/a.css);</style>'))).toMatch(
      /externe/,
    );
    expect(unsafeSvg('<html></html>')).toMatch(/illisible/);
  });
});

describe('assemblage des médias réels', () => {
  const OUTLETS: OutletSelection[] = [
    {
      id: 'canal-alpha',
      libelle: 'Canal Alpha',
      type: 'television',
      portee: 'nationale',
      article: 'Canal Alpha',
      arcom: 'Canal Alpha',
      audience: { source: 'mediamat', libelle: 'CANAL ALPHA' },
    },
    {
      id: 'radio-gamma',
      libelle: 'Radio Gamma',
      type: 'radio',
      portee: 'nationale',
      article: 'Radio Gamma',
      arcom: 'Radio Gamma',
      audience: { source: 'ear', libelle: 'RADIO GAMMA' },
    },
    {
      id: 'quotidien-epsilon',
      libelle: 'Le Quotidien d’Epsilon',
      type: 'presse',
      portee: 'nationale',
      article: 'Le Quotidien d’Epsilon',
      arcom: null,
      audience: { source: 'onenext-pqn', libelle: "Le Quotidien d'Epsilon" },
    },
  ];
  const measures = (
    sourceId: string,
    entries: [string, number][],
    periode = 'septembre 2026',
  ): SourcedMeasures => ({
    sourceId,
    population: 'population de test',
    periode,
    valeurs: new Map(
      entries.map(([libelle, valeur]) => [normalizeLabel(libelle), { libelle, valeur }]),
    ),
  });
  const SOURCE = {
    id: 'arcom-test',
    titre: 'Relevé de test',
    url: 'https://exemple.org/arcom',
    licence: 'test',
    version: '1',
    consulteLe: '2026-10-21',
    sha256: 'a'.repeat(64),
  };
  const person = (id: string, parti: string) => ({ id, parti }) as RealPersonality;
  const input = (over: Partial<MediaInputs> = {}): MediaInputs => ({
    verifieLe: '2026-10-21',
    sources: [SOURCE],
    periodeArcom: { debut: '2026-06-01', fin: '2026-07-31' },
    arcom: [parseArcomMonth(arcomCsv(), '2026-06'), parseArcomMonth(arcomCsv(), '2026-07')],
    mesures: {
      mediamat: measures('mediamat', [['CANAL ALPHA', 12.5]]),
      ear: measures('ear', [['RADIO GAMMA', 10]], 'avril - juin 2026'),
      'onenext-pqn': measures('pqn', [
        ["Le Quotidien d'Epsilon", 2_000_000],
        ['Total PQN', 8_000_000],
      ]),
      'onenext-pqr': measures('pqr', [['PQR66', 13_000_000]]),
    },
    articles: new Map(
      OUTLETS.map((o) => [
        o.id,
        { url: `https://fr.wikipedia.org/w/index.php?oldid=${o.id.length}` },
      ]),
    ),
    logos: new Map([
      [
        'canal-alpha',
        {
          fichier: 'medias/canal-alpha.svg',
          auteur: 'Canal Alpha',
          licence: 'Public domain',
          licenceUrl: null,
          source: 'https://commons.wikimedia.org/wiki/File:Canal_Alpha.svg',
          modification: 'Fichier SVG d’origine, non modifié.',
        },
      ],
      ['radio-gamma', { refus: 'fichier absent de Wikimedia Commons' }],
    ]),
    shows: [article(SHOW(' | chaîne = [[Canal Alpha]]\n | statut = En cours'))],
    personnalites: [
      person('reel-a', 'Mouvement Nouveau / Parti Alpha'),
      person('reel-b', 'Parti Mini'),
      person('reel-c', 'Parti Inconnu'),
    ],
    outlets: OUTLETS,
    seuilPartiSecondes: 3600,
    ...over,
  });

  it('assemble organes, temps de parole, émissions, logos et rattachements', () => {
    const media = buildMedias(input());
    expect(media.organes.map((o) => o.id)).toEqual([
      'canal-alpha',
      'radio-gamma',
      'quotidien-epsilon',
    ]);
    const alpha = media.organes[0]!;
    expect(alpha.audience).toMatchObject({
      indicateur: 'part_audience',
      valeur: 12.5,
      partDuType: 1,
    });
    expect(alpha.tempsDeParole!.libelleSource).toBe('Canal Alpha');
    expect(alpha.logo!.licence).toBe('Public domain');
    expect(media.organes[1]!.logoAbsent).toBe('fichier absent de Wikimedia Commons');
    const press = media.organes[2]!;
    expect(press.tempsDeParole).toBeNull();
    expect(press.audience.indicateur).toBe('lecteurs_numero_moyen');
    expect(press.logoAbsent).toBe('aucun logo dans l’infobox de l’article');
    expect(media.emissions.map((e) => [e.id, e.organeId])).toEqual([
      ['emi-le-grand-oral', 'canal-alpha'],
    ]);
    expect(media.exclus).toEqual([
      { libelle: 'Total PQN', motif: 'total de la catégorie, pas un titre' },
      {
        libelle: 'Presse quotidienne régionale : 1 autres lignes du classement',
        motif: expect.stringContaining('PQR66'),
      },
    ]);
    expect(media.rattachements).toEqual([
      {
        personnaliteId: 'reel-a',
        partiArcom: 'Parti Alpha',
        motif: 'parti de la fiche : « Parti Alpha »',
      },
      {
        personnaliteId: 'reel-b',
        partiArcom: null,
        motif: expect.stringContaining('sous le seuil'),
      },
      {
        personnaliteId: 'reel-c',
        partiArcom: null,
        motif: expect.stringContaining('n’apparaît dans les relevés'),
      },
    ]);
  });

  it('échoue si un organe n’a pas de source d’audience', () => {
    const base = input();
    expect(() =>
      buildMedias(
        input({ mesures: { ...base.mesures, ear: measures('ear', [['RADIO DELTA', 1]]) } }),
      ),
    ).toThrow(/aucune source d’audience/);
  });

  it('échoue si un titre de presse n’a pas de décision de sélection', () => {
    const base = input();
    expect(() =>
      buildMedias(
        input({
          mesures: {
            ...base.mesures,
            'onenext-pqn': measures('pqn', [
              ["Le Quotidien d'Epsilon", 2_000_000],
              ['Nouveau Titre', 1_000_000],
            ]),
          },
        }),
      ),
    ).toThrow(/sans décision de sélection/);
  });

  it('échoue si un service mesuré remplit les critères sans être sélectionné', () => {
    expect(() =>
      buildMedias(input({ outlets: OUTLETS.filter((o) => o.id !== 'radio-gamma') })),
    ).toThrow(/sélection à revoir/);
  });

  it('échoue si un mois manque pour un service', () => {
    const partial = parseArcomMonth(arcomCsv(), '2026-07');
    partial.services = partial.services.filter((s) => s.libelle !== 'Radio Gamma');
    expect(() =>
      buildMedias(input({ arcom: [parseArcomMonth(arcomCsv(), '2026-06'), partial] })),
    ).toThrow(/1 mois sur 2/);
  });
});
