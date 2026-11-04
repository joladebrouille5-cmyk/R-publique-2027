// Wikidata (CC0) pour les figures du gouvernement (phase 14) : identifiant de la personne, photos
// (P18, rang non déprécié), catégorie Wikimedia Commons (P373) et date de décès (P570). Le parti
// n'en est plus tiré : il vient de l'infobox de l'article (voir `party.ts`).
import { articleUrl } from '../personnalites/wikidata';

/** Requête SPARQL : identifiant, photos, catégorie Commons et décès des articles demandés. */
export function figureSparqlQuery(titles: string[]): string {
  const values = titles.map((t) => `<${articleUrl(t)}>`).join(' ');
  return `SELECT ?article ?person ?image ?rank ?commonsCat ?death WHERE {
  VALUES ?article { ${values} }
  ?article schema:about ?person ; schema:isPartOf <https://fr.wikipedia.org/> .
  OPTIONAL {
    ?person p:P18 ?ist . ?ist ps:P18 ?image ; wikibase:rank ?rank .
    FILTER(?rank != wikibase:DeprecatedRank)
  }
  OPTIONAL { ?person wdt:P373 ?commonsCat }
  OPTIONAL { ?person wdt:P570 ?death }
}`;
}

export type FigureWikidata = {
  qid: string;
  /** Photos (P18) : rang préféré d'abord, puis ordre alphabétique (déterministe). */
  images: string[];
  /** Catégorie de la personne sur Wikimedia Commons (P373), ou null. */
  categorie: string | null;
  /** Date de décès (P570, AAAA-MM-JJ), ou null. */
  deces: string | null;
};

type Binding = Record<string, { value: string } | undefined>;

const titleOf = (url: string) => decodeURIComponent(url.split('/wiki/')[1]!).replace(/_/g, ' ');
const fileOf = (url: string) =>
  decodeURIComponent(url.split('/Special:FilePath/')[1]!).replace(/_/g, ' ');

/** Résultat SPARQL de `figureSparqlQuery` → données de chaque personne par titre d'article. */
export function parseFigureWikidata(json: string): Map<string, FigureWikidata> {
  const data = JSON.parse(json) as { results: { bindings: Binding[] } };
  const found = new Map<
    string,
    { qid: string; images: Map<string, boolean>; categorie: string | null; deces: string | null }
  >();
  for (const b of data.results.bindings) {
    const title = titleOf(b.article!.value);
    const entry = found.get(title) ?? {
      qid: b.person!.value.split('/').pop()!,
      images: new Map<string, boolean>(),
      categorie: null,
      deces: null,
    };
    if (b.image) {
      const file = fileOf(b.image.value);
      const preferred = b.rank?.value.endsWith('PreferredRank') ?? false;
      entry.images.set(file, (entry.images.get(file) ?? false) || preferred);
    }
    if (b.commonsCat) entry.categorie ??= b.commonsCat.value;
    if (b.death) {
      const day = b.death.value.slice(0, 10);
      if (entry.deces === null || day < entry.deces) entry.deces = day;
    }
    found.set(title, entry);
  }
  return new Map(
    [...found].map(([title, e]) => [
      title,
      {
        qid: e.qid,
        images: [...e.images]
          .sort(([a, pa], [b, pb]) => Number(pb) - Number(pa) || a.localeCompare(b))
          .map(([file]) => file),
        categorie: e.categorie,
        deces: e.deces,
      },
    ]),
  );
}
