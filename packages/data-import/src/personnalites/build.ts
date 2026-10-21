// Assemblage des fiches de personnalités réelles à partir des sources téléchargées. Fonction
// pure : toute incohérence (personne absente du tableau, fait introuvable, parti absent de
// l'enquête CHES ou de Wikidata, commune hors de son département) fait échouer l'import.
import {
  RealPersonalitiesSchema,
  type EstimatedPosition,
  type RealPersonalities,
  type RealPersonality,
} from '@r2027/shared';
import type { Cog } from '../cog/cog';
import { ImportError } from '../geometry/coverage';
import { FAMILY_LABELS, familyAt, partyAt, toAxis, type ChesParty } from './ches';
import type { CommonsLicense } from './commons';
import {
  ARTICLE,
  DECISION,
  METHODE,
  PARTIS_CHES,
  SECTION_PRIMAIRE,
  SECTION_PRINCIPALE,
  SELECTION,
  type Implantation,
  type PositionChoice,
  type Selected,
} from './selection';
import type { WikidataPerson } from './wikidata';
import { articleUrl } from './wikidata';
import {
  assertFact,
  citationAfter,
  currentFunctions,
  findDate,
  photoFile,
  readable,
  section,
  tableRows,
  type TableRow,
} from './wikitext';

export type Sources = RealPersonalities['sources'];

export type BuildInput = {
  article: string;
  /** Adresse de la révision importée de l'article (source de repli d'une candidature). */
  articleRevisionUrl: string;
  verifieLe: string;
  sources: Sources;
  ches2024: ChesParty[];
  chesTrend: ChesParty[];
  wikidata: Map<string, WikidataPerson>;
  /** Licence lue sur Commons pour chaque fichier photo (ou motif du refus). */
  photos: Map<string, CommonsLicense | { refus: string }>;
  cog: Cog;
  selection?: Selected[];
};

/** Fichier photo de chaque personnalité retenue (à télécharger avant l'assemblage). */
export function photoFiles(article: string, selection = SELECTION): Map<string, string | null> {
  const rows = selectedRows(article, selection);
  return new Map(selection.map((s) => [s.id, photoFile(rows.get(s.id)!)]));
}

function allRows(article: string): { principale: TableRow[]; primaire: TableRow[] } {
  return {
    principale: tableRows(section(article, SECTION_PRINCIPALE)),
    primaire: tableRows(section(article, SECTION_PRIMAIRE)),
  };
}

function selectedRows(article: string, selection: Selected[]): Map<string, TableRow> {
  const rows = allRows(article);
  const found = new Map<string, TableRow>();
  for (const s of selection) {
    const matches = rows[s.section].filter((r) => r.nom === s.nom);
    if (matches.length !== 1) {
      throw new ImportError(
        `${s.nom} : ${matches.length ? 'plusieurs lignes' : 'absent(e)'} de la section « ${
          s.section === 'principale' ? SECTION_PRINCIPALE : SECTION_PRIMAIRE
        } » : la sélection est à revoir.`,
      );
    }
    found.set(s.id, matches[0]!);
  }
  return found;
}

/** Étiquette du parti telle qu'écrite dans l'en-tête (après le nom et l'âge). */
function partyLabel(row: TableRow): string {
  const header = row.cells[0]!.split('\n')[0]!;
  const parts = header.split(/<br\s*\/?>/);
  const raw = parts[parts.length - 1]!.replace(/\{\{[Nn]ote\|[\s\S]*$/, '');
  return readable(raw);
}

function position(s: Selected, row: TableRow, input: BuildInput): EstimatedPosition {
  const choice: PositionChoice = s.position;
  if (choice.fait) assertFact(row, choice.fait);
  const wikidataParty = (title: string) => {
    const person = input.wikidata.get(s.article);
    if (!person?.partis.some((p) => p.parti === title)) {
      throw new ImportError(`${s.nom} : Wikidata n'indique pas d'appartenance à « ${title} ».`);
    }
    return person.partis.find((p) => p.parti === title)!;
  };
  const source = (year: number) => (year === 2024 ? input.ches2024 : input.chesTrend);
  switch (choice.methode) {
    case 'parti':
    case 'parti_soutien': {
      const p = partyAt(source(choice.vague), choice.ches, choice.vague);
      return {
        economie: toAxis(p.lrecon),
        societe: toAxis(p.galtan),
        statut: 'estimation',
        methode: choice.methode,
        partisReference: [p.party],
        vague: choice.vague,
        ches: { lrecon: round2(p.lrecon), galtan: round2(p.galtan) },
        detail:
          choice.methode === 'parti'
            ? `Position du parti ${p.party} dans l’enquête CHES ${choice.vague}.`
            : `Position du ${p.party}, qui soutient officiellement la candidature, dans l’enquête CHES ${choice.vague}.`,
      };
    }
    case 'ancien_parti': {
      const membership = wikidataParty(choice.partiWikidata);
      const p = partyAt(source(choice.vague), choice.ches, choice.vague);
      const period =
        membership.debut || membership.fin
          ? ` (${membership.debut ?? '?'} → ${membership.fin ?? '?'})`
          : ' (dates non renseignées)';
      return {
        economie: toAxis(p.lrecon),
        societe: toAxis(p.galtan),
        statut: 'hypothese',
        methode: 'ancien_parti',
        partisReference: [p.party],
        vague: choice.vague,
        ches: { lrecon: round2(p.lrecon), galtan: round2(p.galtan) },
        detail: `Parti actuel absent de l’enquête CHES : position de « ${choice.partiWikidata} »${period}, parti dont Wikidata indique l’appartenance, dans l’enquête CHES ${choice.vague}.`,
      };
    }
    case 'famille': {
      if (choice.partiWikidata) wikidataParty(choice.partiWikidata);
      const ref = partyAt(input.chesTrend, choice.reference.ches, choice.reference.vague);
      const members = familyAt(input.ches2024, ref.family, 2024);
      const lrecon = members.reduce((sum, p) => sum + p.lrecon, 0) / members.length;
      const galtan = members.reduce((sum, p) => sum + p.galtan, 0) / members.length;
      const origin = choice.partiWikidata
        ? `ancien parti « ${choice.partiWikidata} » (Wikidata), noté ${ref.party} en ${ref.year}`
        : `parti noté ${ref.party} dans la vague CHES ${choice.reference.vague}`;
      return {
        economie: toAxis(lrecon),
        societe: toAxis(galtan),
        statut: 'hypothese',
        methode: 'famille',
        partisReference: members.map((p) => p.party),
        vague: 2024,
        ches: { lrecon: round2(lrecon), galtan: round2(galtan) },
        detail: `Parti actuel absent de l’enquête CHES 2024 ; ${origin}, famille « ${FAMILY_LABELS[ref.family] ?? ref.family} » : moyenne des partis français de cette famille en 2024 (${members.map((p) => p.party).join(', ')}).`,
      };
    }
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;

const JUDICIAIRE =
  /jug[ée]|condamn|proc[èe]s|mis(e)? en examen|correctionnelle|agression|harc[èe]lement|plainte|garde à vue|justice\//i;

/** Le fait cite-t-il la commune, y compris avec l'article contracté (« Maire du Havre ») ? */
export function mentionsCommune(fait: string, nom: string): boolean {
  const contracted = nom.replace(/^Le /, 'du ').replace(/^Les /, 'des ');
  return fait.includes(nom) || (contracted !== nom && fait.includes(contracted));
}

function implantation(s: Selected, row: TableRow, cog: Cog): RealPersonality['implantation'] {
  const departements = new Set<string>();
  const faits: string[] = [];
  for (const item of s.implantation as Implantation[]) {
    assertFact(row, item.fait);
    faits.push(item.fait);
    if ('region' in item) {
      const region = cog.regions.find((r) => r.code === item.region);
      if (!region || !item.fait.includes(region.nom)) {
        throw new ImportError(`${s.nom} : région ${item.region} absente du fait « ${item.fait} ».`);
      }
      for (const d of cog.departements.filter((d) => d.region === item.region))
        departements.add(d.code);
    } else {
      const dep = cog.departements.find((d) => d.code === item.departement);
      if (!dep) throw new ImportError(`${s.nom} : département ${item.departement} inconnu.`);
      if (item.commune) {
        const commune = cog.communes.find(
          (c) => c.nom === item.commune && c.departement === item.departement,
        );
        if (!commune || !mentionsCommune(item.fait, item.commune)) {
          throw new ImportError(
            `${s.nom} : commune « ${item.commune} » introuvable dans le département ${item.departement}.`,
          );
        }
      } else if (!item.fait.includes(dep.nom)) {
        throw new ImportError(`${s.nom} : « ${dep.nom} » absent du fait « ${item.fait} ».`);
      }
      departements.add(item.departement);
    }
  }
  const sorted = [...departements].sort();
  const regions = [
    ...new Set(sorted.map((code) => cog.departements.find((d) => d.code === code)!.region)),
  ].sort();
  return { departements: sorted, regions, faits };
}

export function buildPersonalities(input: BuildInput): RealPersonalities {
  const selection = input.selection ?? SELECTION;
  const rows = selectedRows(input.article, selection);
  const personnalites: RealPersonality[] = selection.map((s) => {
    const row = rows.get(s.id)!;
    const [given, ...rest] = s.nom.split(' ');
    // Candidature : date retenue (ou ancre) puis première référence qui la suit.
    let at: number;
    if (s.candidature.ancre) {
      at = row.raw.indexOf(s.candidature.ancre);
      const [, month, day] = s.candidature.date.split('-').map(Number);
      const months = [
        'janvier',
        'février',
        'mars',
        'avril',
        'mai',
        'juin',
        'juillet',
        'août',
        'septembre',
        'octobre',
        'novembre',
        'décembre',
      ];
      if (at < 0 || !s.candidature.ancre.includes(`${day} ${months[month! - 1]}`)) {
        throw new ImportError(
          `${s.nom} : ancre « ${s.candidature.ancre} » introuvable ou sans la date.`,
        );
      }
    } else {
      at = findDate(row.raw, s.candidature.date);
      if (at < 0) {
        throw new ImportError(
          `${s.nom} : date de candidature ${s.candidature.date} absente de la source.`,
        );
      }
    }
    const citation = s.candidature.source
      ? {
          titre: `${ARTICLE} (liste des candidatures déclarées)`,
          url: input.articleRevisionUrl,
          site: 'Wikipédia',
          date: null,
        }
      : citationAfter(row.raw, at, input.article);
    // Garde-fou : une référence de candidature ne doit pas porter sur une affaire judiciaire
    // (rien de tel n'est affiché sur une personne réelle) ; l'import échoue pour relecture.
    if (JUDICIAIRE.test(`${citation.titre} ${citation.url}`)) {
      throw new ImportError(
        `${s.nom} : la référence de la candidature porte sur une procédure judiciaire (« ${citation.titre} ») : choisir une autre source dans la sélection.`,
      );
    }
    if (s.notoriete.fait) assertFact(row, s.notoriete.fait);
    if (s.organisation.fait) assertFact(row, s.organisation.fait);
    const file = photoFile(row);
    const license = file ? input.photos.get(file) : undefined;
    const photo =
      file && license && !('refus' in license)
        ? {
            fichier: `personnalites/${s.id}.webp`,
            auteur: license.auteur,
            licence: license.licence,
            licenceUrl: license.licenceUrl,
            source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
            modification:
              'Redimensionnée (240 pixels de large) et convertie en WebP ; métadonnées retirées.',
          }
        : null;
    const photoAbsente = photo
      ? null
      : !file
        ? 'Aucune photo dans la source.'
        : license && 'refus' in license
          ? `Photo non reprise : ${license.refus}.`
          : 'Photo non reprise : page du fichier illisible.';
    return {
      id: s.id,
      prenom: given!,
      nom: rest.join(' '),
      parti: partyLabel(row),
      fonctions: currentFunctions(row).slice(0, 4),
      wikidata: input.wikidata.get(s.article)?.qid ?? null,
      article: articleUrl(s.article),
      candidature: {
        statut: s.candidature.statut,
        date: s.candidature.date,
        libelle: s.candidature.libelle,
        source: citation,
      },
      position: position(s, row, input),
      photo,
      photoAbsente,
      implantation: implantation(s, row, input.cog),
      moyens: {
        notoriete: s.notoriete.niveau,
        motifNotoriete: s.notoriete.motif,
        organisation: s.organisation.niveau,
        motifOrganisation: s.organisation.motif,
      },
    };
  });

  // Les autres candidatures déclarées : listées, avec le motif de leur absence. Une candidature
  // nouvelle sous l'étiquette d'un parti noté par CHES impose de revoir la sélection.
  const all = allRows(input.article);
  const selected = new Set(selection.map((s) => s.nom));
  const nonIntegrees = [...all.principale, ...all.primaire]
    .filter((r) => !selected.has(r.nom))
    .map((r) => {
      const parti = partyLabel(r);
      const covered = parti.split(' / ').find((p) => PARTIS_CHES[p.trim()]);
      if (covered) {
        throw new ImportError(
          `${r.nom} (${parti}) : candidature déclarée sous l'étiquette d'un parti noté par CHES, non prévue par la sélection.`,
        );
      }
      const [given, ...rest] = r.nom.split(' ');
      return {
        prenom: given!,
        nom: rest.join(' '),
        parti,
        motif: 'Aucun parti noté par l’enquête d’experts CHES (décision du 21/10/2026).',
      };
    });

  return RealPersonalitiesSchema.parse({
    verifieLe: input.verifieLe,
    decision: DECISION,
    sources: input.sources,
    methode: METHODE,
    personnalites,
    nonIntegrees,
  });
}
