// Émissions politiques : faits lus dans l'infobox de l'article (révision consultée) — titre,
// chaîne ou station, présentateurs, jour ou périodicité, statut de diffusion.
import type { PoliticalShow } from '@r2027/shared';
import { ImportError } from '../geometry/coverage';
import { infobox, isDisambiguation, links, plain } from './infobox';
import { normalizeLabel } from './mesures';

export type ShowArticle = {
  /** Titre de l'article examiné. */
  titre: string;
  /** URL de la révision consultée. */
  url: string;
  wikitext: string;
};

const first = (champs: Map<string, string>, names: readonly string[]) => {
  for (const name of names) {
    const value = champs.get(name);
    if (value !== undefined && plain(value) !== '') return value;
  }
  return undefined;
};

const ENDED = /\b(fini|finie|termin|arr[êe]t|annul|suspend|supprim)/i;

/** Mentions encore valables : les segments datés d'une période close (« (1982-1991) ») sont écartés. */
function currentPart(text: string): string | null {
  const parts = text.split(' ; ').filter((p) => !/\(\d{4}\s*[-–]\s*\d{4}\)/.test(p));
  return parts.length > 0 ? parts.join(' ; ') : null;
}

/** Identifiant stable tiré du titre (« emi-c-politique »). */
export const showId = (title: string) =>
  `emi-${normalizeLabel(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/**
 * Émission retenue, ou motif de non-retenue quand la source la dit arrêtée ou diffusée hors des
 * organes retenus. L'import échoue si l'article n'est pas une émission ou n'indique ni chaîne ni
 * présentateur : la sélection doit alors être revue.
 */
export function buildShow(
  article: ShowArticle,
  outletByArticle: ReadonlyMap<string, string>,
): { emission: PoliticalShow } | { motif: string } {
  if (isDisambiguation(article.wikitext))
    throw new ImportError(`${article.titre} : page d’homonymie, sélection à revoir.`);
  const box = infobox(article.wikitext);
  if (!box || !/^Émission/i.test(box.modele))
    throw new ImportError(`${article.titre} : pas d’infobox d’émission, sélection à revoir.`);
  const { champs } = box;
  const channel = first(champs, ['chaîne', 'radio', 'station', 'diffuseur']);
  const presentation = first(champs, ['présentation', 'présentateur', 'animateur', 'animation']);
  if (!channel)
    throw new ImportError(`${article.titre} : chaîne ou station non indiquée par la source.`);
  if (!presentation)
    throw new ImportError(`${article.titre} : présentateur non indiqué par la source.`);

  const ended = first(champs, ['dernière diffusion', 'disparition']);
  if (ended) return { motif: `diffusion arrêtée selon la source (${plain(ended)})` };
  const statut = champs.get('statut');
  if (statut && ENDED.test(plain(statut)))
    return { motif: `statut « ${plain(statut)} » selon la source` };
  const successor = first(champs, ['suivi par', 'suivie par']);
  if (successor) return { motif: `remplacée par « ${plain(successor)} » selon la source` };

  const organes = [
    ...new Set(
      links(channel)
        .map((l) => outletByArticle.get(normalizeLabel(l.cible)))
        .filter((id): id is string => id !== undefined),
    ),
  ];
  if (organes.length === 0)
    return { motif: `diffusée sur un organe non retenu (${plain(channel)})` };

  const linked = links(presentation).map((l) => l.libelle.replace(/\s*\(.*\)$/, ''));
  const presentateurs = [
    ...new Set(
      linked.length > 0
        ? linked
        : plain(presentation)
            .split(/\s*[;,]\s*|\s+et\s+/)
            .map((n) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim())
            .filter((n) => n !== ''),
    ),
  ];
  if (presentateurs.length === 0)
    throw new ImportError(`${article.titre} : présentateur illisible dans la source.`);

  const titre =
    plain(first(champs, ['titre', 'nom']) ?? '') || article.titre.replace(/\s*\(.*\)$/, '');
  const diffusion = first(champs, ['plage de diffusion', 'périodicité', 'jour de diffusion']);
  return {
    emission: {
      id: showId(titre),
      titre,
      organeId: organes[0]!,
      autresOrganes: organes.slice(1),
      presentateurs: presentateurs.slice(0, 6),
      diffusion: diffusion ? currentPart(plain(diffusion)) : null,
      article: article.url,
    },
  };
}
