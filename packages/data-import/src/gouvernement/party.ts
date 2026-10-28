// Parti des figures (phase 14) : champ « parti » de l'infobox « Personnalité politique » de
// l'article Wikipédia (révision importée), plus à jour que Wikidata (P102) pour la vie politique
// française. Chaque ligne (séparée par `<br>`, ou par « puis » à l'intérieur d'une ligne) cite un
// ou plusieurs partis (liens vers leurs articles) et, le plus souvent, une période entre
// parenthèses. Ligne en cours : période qui porte « depuis », ou aucune période ; ligne close :
// période terminée (« 2015-2017 », « jusqu'en 2015 », « avant 2002 »…).

/** Ligne du champ « parti » : articles des partis cités, période lue, ligne en cours ou close. */
export type PartyLine = {
  partis: string[];
  /** Période entre parenthèses (texte lisible), ou null. */
  periode: string | null;
  enCours: boolean;
};

/** Titre d'article normalisé : espaces, première lettre en capitale, sans ancre. */
export const articleTitle = (target: string) => {
  const title = target.split('#')[0]!.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
};

/** Lignes du champ « parti » (commentaires, références, notes et mise en forme retirés). */
export function partyLines(value: string): PartyLine[] {
  const text = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{\s*(?:petit|small)\s*\|([^{}]*)\}\}/gi, '$1')
    .replace(/\{\{\s*(?:date|période)\s*\|([^{}]*)\}\}/gi, (_m, inner: string) =>
      inner
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean)
        .join('-'),
    )
    .replace(/<\/?small\s*>/gi, '');
  const lines: PartyLine[] = [];
  for (const line of text.split(/<br\s*\/?>/i)) {
    const segments = line.split(/\s+puis\s+/i);
    segments.forEach((segment, i) => {
      const partis = [...segment.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) =>
        articleTitle(m[1]!),
      );
      if (partis.length === 0) return;
      const outside = segment.replace(/\[\[[^\]]*\]\]/g, '');
      const periods = [...outside.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]!.trim());
      const periode = periods.length ? periods[periods.length - 1]! : null;
      // « A puis B » : A est close (B lui a succédé).
      const replaced = i < segments.length - 1;
      lines.push({
        partis,
        periode,
        enCours: !replaced && (periode === null || /depuis/i.test(periode)),
      });
    });
  }
  return lines;
}

/** Parti suivi par le jeu, désigné par les articles Wikipédia qui le nomment (noms anciens compris). */
export type TrackedParty = { articles: readonly string[] };

/**
 * Parti en cours : le dernier parti suivi cité dans une ligne en cours (dans une ligne qui en
 * cite plusieurs, comme « UMP/LR », le dernier suivi) ; null s'il n'y en a pas.
 */
export function currentTrackedParty<P extends TrackedParty>(
  lines: PartyLine[],
  partis: readonly P[],
): { parti: P; ligne: PartyLine } | null {
  for (const ligne of [...lines].reverse()) {
    if (!ligne.enCours) continue;
    for (const article of [...ligne.partis].reverse()) {
      const parti = partis.find((p) => p.articles.includes(article));
      if (parti) return { parti, ligne };
    }
  }
  return null;
}

/** Dernière ligne close citant un parti suivi (ancien parti d'une personne sans étiquette). */
export function lastFormerTrackedParty<P extends TrackedParty>(
  lines: PartyLine[],
  partis: readonly P[],
): { parti: P; ligne: PartyLine } | null {
  for (const ligne of [...lines].reverse()) {
    if (ligne.enCours) continue;
    for (const article of [...ligne.partis].reverse()) {
      const parti = partis.find((p) => p.articles.includes(article));
      if (parti) return { parti, ligne };
    }
  }
  return null;
}
