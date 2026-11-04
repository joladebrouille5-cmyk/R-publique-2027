// Assemblage des fiches des figures du gouvernement à partir des sources téléchargées. Fonction
// pure. Une personnalité de la sélection qui ne passe pas les contrôles (article introuvable ou
// page d'homonymie, article sans infobox de fonctions, personne décédée, parti en cours non suivi
// par le jeu, parti absent de l'enquête CHES, groupe inconnu) est écartée avec son motif (phase
// 14) ; l'import échoue seulement si aucune fiche n'est retenue.
import {
  GovernmentFiguresSchema,
  type DiscardedFigure,
  type EstimatedPosition,
  type FigureFunction,
  type GovernmentFigure,
  type GovernmentFigures,
  type GroupAttachment,
} from '@r2027/shared';
import { ImportError } from '../geometry/coverage';
import { partyAt, toAxis, type ChesParty } from '../personnalites/ches';
import type { CommonsLicense } from '../personnalites/commons';
import { infoboxFunctions, template, templateParams } from './infobox';
import { currentTrackedParty, lastFormerTrackedParty, partyLines, type PartyLine } from './party';
import {
  DECISION,
  GRAND_GROUPE,
  GROUPE_PAR_PARTI,
  METHODE,
  PARTIS,
  SANS_ETIQUETTE,
  SELECTION,
  VAGUE,
  type FigureSelection,
  type PartyConfig,
  type ResolvedFigure,
} from './selection';
import type { FigureWikidata } from './wikidata';

export type Sources = GovernmentFigures['sources'];

/**
 * Photo retenue pour une figure (fichier Commons, licence lue, motif du choix quand ce n'est pas
 * la première photo de Wikidata), ou motif de son absence.
 */
export type PhotoChoice =
  { fichier: string; licence: CommonsLicense; choix?: string } | { refus: string };

export type BuildInput = {
  verifieLe: string;
  sources: Sources;
  /** Article de chaque figure (titre de la sélection) : révision importée et wikicode. */
  articles: Map<string, { revid: number; wikitext: string; titre?: string }>;
  /** Données Wikidata de chaque figure (titre de la sélection) : identifiant, photos, décès. */
  wikidata: Map<string, FigureWikidata>;
  ches2024: ChesParty[];
  /** Photo retenue pour chaque figure (identifiant), ou motif de son absence. */
  photos: Map<string, PhotoChoice>;
  /** Groupes de l'Assemblée nationale (assemblee-2026.json). */
  groupes: { id: string; sieges: number }[];
  /** Personnalités candidates (personnalites-2027.json), pour leur rattachement à un groupe. */
  personnalites: { id: string; parti: string }[];
  selection?: FigureSelection[];
  partis?: readonly PartyConfig[];
};

const round2 = (x: number) => Math.round(x * 100) / 100;
const decimal = (x: number) => x.toFixed(2).replace('.', ',');
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export const COMPETENCE = {
  base: 0.3,
  presidenceOuMatignon: 0.3,
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
  if (functions.some((f) => f.nature === 'president-republique'))
    facteurs.push({
      libelle: 'Président de la République (en fonction ou ancien)',
      valeur: c.presidenceOuMatignon,
    });
  else if (functions.some((f) => f.nature === 'premier-ministre'))
    facteurs.push({
      libelle: 'Premier ministre (en fonction ou ancien)',
      valeur: c.presidenceOuMatignon,
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
  const head =
    functions.find((f) => f.nature === 'president-republique') ??
    functions.find((f) => f.nature === 'premier-ministre');
  if (head) return { niveau: 3, motif: `${head.libelle}${head.enCours ? '' : ' (ancien)'}` };
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

const period = (periode: string | null) => (periode ? ` (${periode})` : '');

function position(f: ResolvedFigure, lignes: PartyLine[], input: BuildInput): EstimatedPosition {
  const p = partyAt(input.ches2024, f.position.ches, VAGUE);
  const axes = {
    economie: toAxis(p.lrecon),
    societe: toAxis(p.galtan),
    partisReference: [p.party],
    vague: VAGUE,
    ches: { lrecon: round2(p.lrecon), galtan: round2(p.galtan) },
  };
  if (f.ancienParti) {
    return {
      ...axes,
      statut: 'hypothese',
      methode: 'ancien_parti',
      detail: `Aucun parti en cours d’après l’infobox de l’article : position du dernier parti suivi par le jeu dont la personne a été membre, « ${f.ancienParti.parti} »${period(f.ancienParti.periode)}, dans l’enquête CHES ${VAGUE} (${p.party}).`,
    };
  }
  if (f.position.methode === 'parti') {
    return {
      ...axes,
      statut: 'estimation',
      methode: 'parti',
      detail: `Position du parti ${p.party} dans l’enquête CHES ${VAGUE}.`,
    };
  }
  const former = f.position.ancien;
  const ligne = lignes.find((l) => l.partis.includes(former));
  if (!ligne) throw new ImportError(`L’infobox n’indique pas d’appartenance à « ${former} ».`);
  return {
    ...axes,
    statut: 'hypothese',
    methode: 'ancien_parti',
    detail: `Parti actuel absent de l’enquête CHES : position de « ${former} »${period(ligne.periode)}, ancien parti attesté par l’infobox de l’article, dans l’enquête CHES ${VAGUE}.`,
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

const HOMONYMIE = /\{\{\s*(?:homonymie|personnes homonymes)\b/i;
const list = (lignes: PartyLine[]) => [...new Set(lignes.flatMap((l) => l.partis))].join(', ');

/** Personnalité de la sélection résolue (parti, fonctions), ou motif de son exclusion. */
export function resolveFigure(
  s: FigureSelection,
  input: BuildInput,
):
  { figure: ResolvedFigure; fonctions: FigureFunction[]; lignes: PartyLine[] } | { motif: string } {
  const article = input.articles.get(s.article);
  if (!article) return { motif: 'Article introuvable sur Wikipédia.' };
  if (HOMONYMIE.test(article.wikitext))
    return {
      motif: 'Page d’homonymie sur Wikipédia : l’article de la personne est à préciser.',
    };
  const person = input.wikidata.get(s.article);
  if (!person) return { motif: 'Personne absente de Wikidata.' };
  if (person.deces) return { motif: `Personne décédée (Wikidata : ${person.deces}).` };
  let fonctions: FigureFunction[];
  let lignes: PartyLine[];
  try {
    fonctions = infoboxFunctions(article.wikitext);
    const params = templateParams(template(article.wikitext, 'Infobox Personnalité politique'));
    lignes = partyLines(params.get('parti') ?? '');
  } catch (error) {
    return { motif: (error as Error).message };
  }
  const partis: readonly PartyConfig[] = input.partis ?? PARTIS;
  const current = currentTrackedParty(lignes, partis);
  if (current) {
    const { parti, groupe, position } = current.parti;
    if (groupe !== null && !input.groupes.some((g) => g.id === groupe))
      return { motif: `Groupe inconnu ${groupe}.` };
    return { figure: { ...s, parti, groupe, position, ancienParti: null }, fonctions, lignes };
  }
  const open = lignes.filter((l) => l.enCours);
  if (open.length > 0)
    return { motif: `Parti en cours non suivi par le jeu (infobox : ${list(open)}).` };
  const former = lastFormerTrackedParty(lignes, partis);
  if (!former)
    return {
      motif: lignes.length
        ? `Aucun parti suivi par le jeu dans l’infobox (${list(lignes)}).`
        : 'Aucun parti indiqué dans l’infobox de l’article.',
    };
  return {
    figure: {
      ...s,
      parti: SANS_ETIQUETTE,
      groupe: null,
      position: former.parti.position,
      ancienParti: { parti: former.parti.parti, periode: former.ligne.periode },
    },
    fonctions,
    lignes,
  };
}

export function buildFigures(input: BuildInput): GovernmentFigures {
  const selection = input.selection ?? SELECTION;
  const seats = new Map(input.groupes.map((g) => [g.id, g.sieges]));
  const figures: GovernmentFigure[] = [];
  const ecartees: DiscardedFigure[] = [];
  for (const s of selection) {
    const resolved = resolveFigure(s, input);
    const discard = (motif: string) =>
      ecartees.push({ id: s.id, prenom: s.prenom, nom: s.nom, motif });
    if ('motif' in resolved) {
      discard(resolved.motif);
      continue;
    }
    const { figure: f, fonctions, lignes } = resolved;
    const article = input.articles.get(s.article)!;
    const person = input.wikidata.get(s.article)!;
    let estimated: EstimatedPosition;
    try {
      estimated = position(f, lignes, input);
    } catch (error) {
      discard((error as Error).message);
      continue;
    }
    const choice = input.photos.get(s.id);
    const photo =
      choice && !('refus' in choice)
        ? {
            fichier: `gouvernement/${s.id}.webp`,
            auteur: choice.licence.auteur,
            licence: choice.licence.licence,
            licenceUrl: choice.licence.licenceUrl,
            source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(choice.fichier.replace(/ /g, '_'))}`,
            modification:
              'Réduite (240 pixels de large au plus) et convertie en WebP ; métadonnées retirées.',
            ...(choice.choix ? { choix: choice.choix } : {}),
          }
        : null;
    const photoAbsente = photo
      ? null
      : choice && 'refus' in choice
        ? `Photo non reprise : ${choice.refus}.`
        : 'Aucune photo sous licence libre trouvée (Wikidata, Wikimedia Commons).';
    const titre = article.titre ?? s.article;
    figures.push({
      id: s.id,
      prenom: s.prenom,
      nom: s.nom,
      parti: f.parti,
      groupe: f.groupe,
      wikidata: person.qid,
      article: `https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(titre.replace(/ /g, '_'))}&oldid=${article.revid}`,
      fonctions,
      position: estimated,
      competence: estimateCompetence(fonctions, input.verifieLe),
      notoriete: notoriety(fonctions, f.parti, f.groupe === null ? null : seats.get(f.groupe)!),
      photo,
      photoAbsente,
    });
  }
  if (figures.length === 0)
    throw new ImportError(
      `Aucune fiche retenue : ${ecartees.map((e) => `${e.prenom} ${e.nom} (${e.motif})`).join(' ; ')}`,
    );
  return GovernmentFiguresSchema.parse({
    verifieLe: input.verifieLe,
    decision: DECISION,
    sources: input.sources,
    methode: METHODE,
    figures,
    ecartees,
    rattachements: attachments(input.personnalites, new Set(seats.keys())),
  });
}
