// Wikidata (CC0) : identifiant de chaque personnalité et historique de ses partis (propriété
// P102 « membre du parti politique », avec dates de début et de fin quand elles existent).

export type PartyMembership = {
  /** Titre de l'article Wikipédia en français du parti (ou libellé si l'article manque). */
  parti: string;
  debut: string | null;
  fin: string | null;
};

export type WikidataPerson = { qid: string; partis: PartyMembership[] };

export const articleUrl = (title: string) =>
  `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2C/g, ',')}`;

/** Requête SPARQL : identifiant et partis des personnes dont on donne les articles. */
export function sparqlQuery(titles: string[]): string {
  const values = titles.map((t) => `<${articleUrl(t)}>`).join(' ');
  return `SELECT ?article ?person ?partyArticle ?partyLabel ?start ?end WHERE {
  VALUES ?article { ${values} }
  ?article schema:about ?person ; schema:isPartOf <https://fr.wikipedia.org/> .
  OPTIONAL {
    ?person p:P102 ?st . ?st ps:P102 ?party .
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
    OPTIONAL { ?partyArticle schema:about ?party ; schema:isPartOf <https://fr.wikipedia.org/> }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}`;
}

type Binding = Record<string, { value: string } | undefined>;

const titleOf = (url: string) => decodeURIComponent(url.split('/wiki/')[1]!).replace(/_/g, ' ');

/** Résultat SPARQL (JSON) → personnes par titre d'article. */
export function parseSparql(json: string): Map<string, WikidataPerson> {
  const data = JSON.parse(json) as { results: { bindings: Binding[] } };
  const people = new Map<string, WikidataPerson>();
  for (const b of data.results.bindings) {
    const title = titleOf(b.article!.value);
    const person = people.get(title) ?? { qid: b.person!.value.split('/').pop()!, partis: [] };
    if (b.partyLabel || b.partyArticle) {
      const parti = b.partyArticle ? titleOf(b.partyArticle.value) : b.partyLabel!.value;
      const debut = b.start?.value.slice(0, 10) ?? null;
      const fin = b.end?.value.slice(0, 10) ?? null;
      if (!person.partis.some((p) => p.parti === parti && p.debut === debut && p.fin === fin)) {
        person.partis.push({ parti, debut, fin });
      }
    }
    people.set(title, person);
  }
  return people;
}
