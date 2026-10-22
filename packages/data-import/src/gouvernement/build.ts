// Assemblage des fiches des figures du gouvernement à partir des sources téléchargées. Fonction
// pure : toute incohérence (article sans infobox, appartenance au parti absente de Wikidata,
// parti absent de l'enquête CHES, groupe inconnu) fait échouer l'import.
import {
  GovernmentFiguresSchema,
  type EstimatedPosition,
  type FigureFunction,
  type GovernmentFigure,
  type GovernmentFigures,
  type GroupAttachment,
} from '@r2027/shared';
import { ImportError } from '../geometry/coverage';
import { partyAt, toAxis, type ChesParty } from '../personnalites/ches';
import type { CommonsLicense } from '../personnalites/commons';
import type { WikidataPerson } from '../personnalites/wikidata';
import { infoboxFunctions } from './infobox';
import {
  DECISION,
  GRAND_GROUPE,
  GROUPE_PAR_PARTI,
  METHODE,
  SELECTION,
  VAGUE,
  type FigureSelection,
} from './selection';

export type Sources = GovernmentFigures['sources'];

export type FigureWikidata = WikidataPerson & { image: string | null };

export type BuildInput = {
  verifieLe: string;
  sources: Sources;
  /** Article de chaque figure (titre de la sélection) : révision importée et wikicode. */
  articles: Map<string, { revid: number; wikitext: string }>;
  wikidata: Map<string, FigureWikidata>;
  ches2024: ChesParty[];
  /** Licence lue sur Commons pour chaque fichier photo (ou motif du refus). */
  photos: Map<string, CommonsLicense | { refus: string }>;
  /** Groupes de l'Assemblée nationale (assemblee-2026.json). */
  groupes: { id: string; sieges: number }[];
  /** Personnalités candidates (personnalites-2027.json), pour leur rattachement à un groupe. */
  personnalites: { id: string; parti: string }[];
  selection?: FigureSelection[];
};

const round2 = (x: number) => Math.round(x * 100) / 100;
const decimal = (x: number) => x.toFixed(2).replace('.', ',');
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export const COMPETENCE = {
  base: 0.3,
  premierMinistre: 0.3,
  ministre: 0.15,
  ministreSupplementaire: 0.05,
  ministresPlafond: 0.25,
  secretaireEtat: 0.05,
  secretairesPlafond: 0.1,
  parlement5ans: 0.05,
  parlement10ans: 0.1,
  executifLocal: 0.05,
  direction: 0.05,
  plafond: 0.9,
};

/** Années (décimales) écoulées entre deux dates partielles (AAAA ou AAAA-MM-JJ). */
export function yearsBetween(from: string, to: string): number {
  const value = (d: string) => {
    const [y, m = '01', day = '01'] = d.split('-');
    return Number(y) + (Number(m) - 1) / 12 + (Number(day) - 1) / 365;
  };
  return Math.max(0, value(to) - value(from));
}

/** Années cumulées de mandats parlementaires (fonctions datées seulement) jusqu'à `today`. */
export function parliamentaryYears(functions: FigureFunction[], today: string): number {
  return functions
    .filter((f) => f.nature === 'parlementaire' && f.debut !== null)
    .reduce((sum, f) => sum + yearsBetween(f.debut!, f.fin ?? today), 0);
}

/** Estimation de la compétence : facteurs documentés (méthode), somme bornée par le plafond. */
export function estimateCompetence(
  functions: FigureFunction[],
  today: string,
): GovernmentFigure['competence'] {
  const c = COMPETENCE;
  const facteurs: { libelle: string; valeur: number }[] = [
    { libelle: 'Base de l’estimation', valeur: c.base },
  ];
  if (functions.some((f) => f.nature === 'premier-ministre'))
    facteurs.push({
      libelle: 'Premier ministre (en fonction ou ancien)',
      valeur: c.premierMinistre,
    });
  const ministers = new Set(functions.filter((f) => f.nature === 'ministre').map((f) => f.libelle));
  if (ministers.size > 0) {
    facteurs.push({
      libelle: `${plural(ministers.size, 'fonction')} de ministre`,
      valeur: round2(
        Math.min(c.ministresPlafond, c.ministre + c.ministreSupplementaire * (ministers.size - 1)),
      ),
    });
  }
  const juniors = functions.filter((f) => f.nature === 'secretaire-etat').length;
  if (juniors > 0) {
    facteurs.push({
      libelle: `${plural(juniors, 'fonction')} de secrétaire d’État ou de ministre délégué`,
      valeur: round2(Math.min(c.secretairesPlafond, c.secretaireEtat * juniors)),
    });
  }
  const years = parliamentaryYears(functions, today);
  if (years >= 5) {
    facteurs.push({
      libelle: `${Math.floor(years)} ans de mandats parlementaires cumulés`,
      valeur: years >= 10 ? c.parlement10ans : c.parlement5ans,
    });
  }
  if (functions.some((f) => f.nature === 'executif-local'))
    facteurs.push({ libelle: 'Exécutif local', valeur: c.executifLocal });
  if (functions.some((f) => f.nature === 'direction'))
    facteurs.push({
      libelle: 'Direction d’un parti, d’un groupe, d’une assemblée ou d’une commission',
      valeur: c.direction,
    });
  const total = round2(facteurs.reduce((sum, f) => sum + f.valeur, 0));
  if (total > c.plafond)
    facteurs.push({
      libelle: `Plafond de l’estimation (${decimal(c.plafond)})`,
      valeur: round2(c.plafond - total),
    });
  return {
    valeur: Math.min(total, c.plafond),
    statut: 'estimation',
    facteurs,
  };
}

/** Direction nationale en cours du parti de la figure (libellé citant le parti). */
function leadsParty(functions: FigureFunction[], parti: string): FigureFunction | undefined {
  return functions.find(
    (f) =>
      f.enCours &&
      f.nature === 'direction' &&
      !/groupe|commission|assemblée/i.test(f.libelle) &&
      f.libelle.includes(parti),
  );
}

/** Niveau de notoriété déduit des fonctions (méthode `notoriete`). */
export function notoriety(
  functions: FigureFunction[],
  parti: string,
  groupSeats: number | null,
): GovernmentFigure['notoriete'] {
  const pm = functions.find((f) => f.nature === 'premier-ministre');
  if (pm) return { niveau: 3, motif: `${pm.libelle}${pm.enCours ? '' : ' (ancien)'}` };
  const party = leadsParty(functions, parti);
  if (party && groupSeats !== null && groupSeats >= GRAND_GROUPE)
    return {
      niveau: 3,
      motif: `${party.libelle} (groupe de ${groupSeats} députés à l’Assemblée nationale)`,
    };
  const minister = functions.find((f) => f.nature === 'ministre' || f.nature === 'secretaire-etat');
  if (minister) return { niveau: 2, motif: minister.libelle };
  const leading = functions.find(
    (f) =>
      f.enCours &&
      (f.nature === 'direction' ||
        (f.nature === 'executif-local' && /conseil régional/i.test(f.libelle))),
  );
  if (leading) return { niveau: 2, motif: leading.libelle };
  return { niveau: 1, motif: 'Aucune fonction retenue pour les niveaux 2 et 3.' };
}

function position(s: FigureSelection, input: BuildInput): EstimatedPosition {
  const person = input.wikidata.get(s.article)!;
  const p = partyAt(input.ches2024, s.position.ches, VAGUE);
  const axes = {
    economie: toAxis(p.lrecon),
    societe: toAxis(p.galtan),
    partisReference: [p.party],
    vague: VAGUE,
    ches: { lrecon: round2(p.lrecon), galtan: round2(p.galtan) },
  };
  if (s.position.methode === 'parti') {
    return {
      ...axes,
      statut: 'estimation',
      methode: 'parti',
      detail: `Position du parti ${p.party} dans l’enquête CHES ${VAGUE}.`,
    };
  }
  const former = s.position.partiWikidata;
  const membership = person.partis.find((m) => m.parti === former);
  if (!membership)
    throw new ImportError(`${s.article} : Wikidata n'indique pas d'appartenance à « ${former} ».`);
  const period = ` (${membership.debut?.slice(0, 4) ?? '?'} → ${membership.fin?.slice(0, 4) ?? '?'})`;
  return {
    ...axes,
    statut: 'hypothese',
    methode: 'ancien_parti',
    detail: `Parti actuel absent de l’enquête CHES : position de « ${former} »${period}, ancien parti dont Wikidata atteste l’appartenance, dans l’enquête CHES ${VAGUE}.`,
  };
}

/** Rattachement des personnalités candidates à un groupe, d'après l'étiquette de leur fiche. */
export function attachments(
  personnalites: BuildInput['personnalites'],
  groupes: Set<string>,
): GroupAttachment[] {
  return personnalites.flatMap((p) => {
    const parti = p.parti.split(' / ').find((part) => GROUPE_PAR_PARTI[part.trim()]);
    if (!parti) return [];
    const groupe = GROUPE_PAR_PARTI[parti.trim()]!;
    if (!groupes.has(groupe)) throw new ImportError(`Groupe inconnu : ${groupe}.`);
    return [
      {
        personnaliteId: p.id,
        groupe,
        motif: `Parti « ${parti.trim()} » (étiquette de la fiche : ${p.parti}).`,
      },
    ];
  });
}

export function buildFigures(input: BuildInput): GovernmentFigures {
  const selection = input.selection ?? SELECTION;
  const seats = new Map(input.groupes.map((g) => [g.id, g.sieges]));
  const figures: GovernmentFigure[] = selection.map((s) => {
    const article = input.articles.get(s.article);
    if (!article) throw new ImportError(`${s.article} : article absent du téléchargement.`);
    const person = input.wikidata.get(s.article);
    if (!person) throw new ImportError(`${s.article} : personne absente de Wikidata.`);
    if (!person.partis.some((m) => m.parti === s.partiWikidata && m.fin === null)) {
      throw new ImportError(
        `${s.article} : Wikidata n'indique pas d'appartenance en cours à « ${s.partiWikidata} ».`,
      );
    }
    if (s.groupe !== null && !seats.has(s.groupe))
      throw new ImportError(`${s.article} : groupe inconnu ${s.groupe}.`);
    let fonctions: FigureFunction[];
    try {
      fonctions = infoboxFunctions(article.wikitext);
    } catch (error) {
      throw new ImportError(`${s.article} : ${(error as Error).message}`);
    }
    const file = person.image;
    const license = file ? input.photos.get(file) : undefined;
    const photo =
      file && license && !('refus' in license)
        ? {
            fichier: `gouvernement/${s.id}.webp`,
            auteur: license.auteur,
            licence: license.licence,
            licenceUrl: license.licenceUrl,
            source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`,
            modification:
              'Redimensionnée (240 pixels de large) et convertie en WebP ; métadonnées retirées.',
          }
        : null;
    const photoAbsente = photo
      ? null
      : !file
        ? 'Aucune photo dans Wikidata.'
        : license && 'refus' in license
          ? `Photo non reprise : ${license.refus}.`
          : 'Photo non reprise : page du fichier illisible.';
    return {
      id: s.id,
      prenom: s.prenom,
      nom: s.nom,
      parti: s.parti,
      groupe: s.groupe,
      wikidata: person.qid,
      article: `https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(s.article.replace(/ /g, '_'))}&oldid=${article.revid}`,
      fonctions,
      position: position(s, input),
      competence: estimateCompetence(fonctions, input.verifieLe),
      notoriete: notoriety(fonctions, s.parti, s.groupe === null ? null : seats.get(s.groupe)!),
      photo,
      photoAbsente,
    };
  });
  return GovernmentFiguresSchema.parse({
    verifieLe: input.verifieLe,
    decision: DECISION,
    sources: input.sources,
    methode: METHODE,
    figures,
    rattachements: attachments(input.personnalites, new Set(seats.keys())),
  });
}
