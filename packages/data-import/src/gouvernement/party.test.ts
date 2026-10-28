import { describe, expect, it } from 'vitest';
import { currentTrackedParty, lastFormerTrackedParty, partyLines } from './party';
import { PARTIS } from './selection';

// Valeurs du champ « parti » au format des infobox réelles (mise en forme reproduite).

const current = (value: string) => currentTrackedParty(partyLines(value), PARTIS)?.parti.parti;

describe('champ « parti » de l’infobox', () => {
  it('lit les lignes, leurs partis, leur période et si elles sont en cours', () => {
    expect(
      partyLines(
        '[[Union pour un mouvement populaire|UMP]] <small>(2004-2015)</small><br>[[Les Républicains|LR]]<small> (2015-2019 ; depuis 2021)</small><br>[[Soyons libres|SL]] {{petit|(depuis {{date|2017}})}}<ref>Note.</ref>',
      ),
    ).toEqual([
      { partis: ['Union pour un mouvement populaire'], periode: '2004-2015', enCours: false },
      { partis: ['Les Républicains'], periode: '2015-2019 ; depuis 2021', enCours: true },
      { partis: ['Soyons libres'], periode: 'depuis 2017', enCours: true },
    ]);
    // « A puis B » : A est close ; une ligne sans période est en cours.
    expect(
      partyLines(
        '[[Union pour la démocratie française|UDF]] puis [[Mouvement démocrate (France)|MoDem]]',
      ),
    ).toEqual([
      { partis: ['Union pour la démocratie française'], periode: null, enCours: false },
      { partis: ['Mouvement démocrate (France)'], periode: null, enCours: true },
    ]);
    expect(partyLines('')).toEqual([]);
    // Commentaire de la page (entre parenthèses) : ni période ni parti.
    expect(
      partyLines(
        '[[La France insoumise|LFI]] <small>(depuis 2016)</small>\n<!-- Autres paramètres (uniquement s’ils font l’objet d’un article) -->',
      ),
    ).toEqual([{ partis: ['La France insoumise'], periode: 'depuis 2016', enCours: true }]);
    expect(partyLines("''[[Indépendant (politique)|Aucun]]''")).toEqual([
      { partis: ['Indépendant (politique)'], periode: null, enCours: true },
    ]);
  });

  it('retient le dernier parti suivi d’une ligne en cours, anciens noms compris', () => {
    expect(
      current(
        '[[Union pour un mouvement populaire|UMP]] <small>(2002-2015)</small><br>[[Les Républicains|LR]] <small>(2015-2019 ; depuis 2021)</small><br>[[Soyons libres|SL]] <small>(depuis 2017)</small>',
      ),
    ).toBe('Les Républicains');
    expect(
      current(
        '[[Renaissance (parti)|LREM/RE]] <small>(depuis 2017)</small><br/>[[Démocrates et progressistes|TdP/D&P]] <small>(depuis 2020)</small>',
      ),
    ).toBe('Renaissance');
    expect(
      current('[[Renaissance (parti)|RE]]<br>[[Bâtissons Ensemble]] <small>(depuis 2026)</small>'),
    ).toBe('Renaissance');
    expect(
      current(
        '[[Parti socialiste (France)|PS]]<br>[[Renaissance (parti)|LREM/RE]] <small>(depuis 2017)</small>',
      ),
    ).toBe('Renaissance');
    expect(
      current(
        '[[Financement des partis politiques français|Rattaché]] [[Europe Écologie Les Verts|EELV/LE]] <small>(depuis 2018)</small>',
      ),
    ).toBe('Les Écologistes');
    expect(
      current(
        '[[Union pour un mouvement populaire|UMP]]/[[Les Républicains|LR]] <small>(2006-2024 ; depuis 2025)</small>',
      ),
    ).toBe('Les Républicains');
    expect(
      current('[[Parti socialiste (France)|PS]] <small>(1979-2012 ; depuis 2017)</small>'),
    ).toBe('Parti socialiste');
    expect(current('[[Rassemblement national|FN/RN]] <small>(depuis 2012)</small>')).toBe(
      'Rassemblement national',
    );
  });

  it('distingue l’absence de parti en cours d’un parti en cours non suivi', () => {
    const left =
      '[[Les Républicains|LR]] <small>(2015-2017)</small><br/>[[Renaissance (parti)|LREM/RE]] <small>(2017-2025)</small><br>[[Populaires]] <small>(2024-2025)</small>';
    expect(current(left)).toBeUndefined();
    expect(lastFormerTrackedParty(partyLines(left), PARTIS)).toMatchObject({
      parti: { parti: 'Renaissance' },
      ligne: { periode: '2017-2025' },
    });
    const untracked =
      '[[Parti socialiste (France)|PS]] <small>(jusqu’en 2022)</small><br>[[La Convention]] <small>(depuis 2022)</small>';
    expect(current(untracked)).toBeUndefined();
    expect(partyLines(untracked).filter((l) => l.enCours)).toHaveLength(1);
  });
});
