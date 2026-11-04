import {
  actionCompetenceFactor,
  closestGroup,
  departementOfDistrict,
  groupOfActor,
  postOfDomain,
  realLegislativeDepartments,
  themeIndicatorEffects,
  themeOfPost,
  themeSupport,
} from '@r2027/shared';
import { describe, expect, it } from 'vitest';
import { CURRENT_RULESET_KEY, getRuleset } from './index';

// Phase 13 : tables du mandat (thèmes ministériels, actions du chef de l'État, groupe du joueur,
// législatives de 2024 par département) éprouvées sur le jeu de règles réel.

const ruleset = getRuleset(CURRENT_RULESET_KEY);
const postes = new Set(ruleset.quinquennat.postes.map((p) => p.id));
const domaines = new Set(ruleset.programme.propositions.map((p) => p.domaine));

describe('thèmes ministériels (phase 13)', () => {
  it('relient chaque poste à des domaines du programme et à des indicateurs, sans doublon', () => {
    const { themes } = ruleset.quinquennat.equipe;
    expect(new Set(themes.map((t) => t.posteId)).size).toBe(themes.length);
    const covered = themes.flatMap((t) => t.domaines);
    expect(new Set(covered).size).toBe(covered.length);
    for (const theme of themes) {
      expect(postes.has(theme.posteId)).toBe(true);
      for (const d of theme.domaines) expect(domaines.has(d)).toBe(true);
      expect(themeOfPost(ruleset, theme.posteId)).toBe(theme);
      for (const d of theme.domaines) expect(postOfDomain(ruleset, d)).toBe(theme.posteId);
    }
    expect(postOfDomain(ruleset, 'domaine-inconnu')).toBeNull();
  });

  it('donnent un bonus au-dessus d’une compétence de 0,5, un malus en dessous, rien à 0,5', () => {
    expect(themeSupport(ruleset, 0.5)).toBe(0);
    expect(themeSupport(ruleset, 0.9)).toBeGreaterThan(0);
    expect(themeSupport(ruleset, 0.1)).toBeLessThan(0);
    expect(actionCompetenceFactor(ruleset, 0.5)).toBe(1);
    expect(actionCompetenceFactor(ruleset, 1)).toBeGreaterThan(1);
    expect(actionCompetenceFactor(ruleset, 0)).toBeLessThan(1);
    expect(actionCompetenceFactor(ruleset, 0)).toBeGreaterThanOrEqual(0);
    for (const theme of ruleset.quinquennat.equipe.themes) {
      expect(themeIndicatorEffects(ruleset, theme.posteId, 0.5)).toEqual([]);
      for (const effect of themeIndicatorEffects(ruleset, theme.posteId, 1)) {
        const opposite = themeIndicatorEffects(ruleset, theme.posteId, 0).find(
          (e) => e.indicateur === effect.indicateur,
        )!;
        expect(opposite.valeur).toBe(-effect.valeur);
      }
    }
  });
});

describe('actions du chef de l’État (phase 13)', () => {
  const actions = ruleset.quinquennat.actions;
  const byId = (id: string) => actions.find((a) => a.id === id)!;

  it('comptent visites, sommet, négociation, Congrès, commémoration, panthéonisation et réunion de la majorité', () => {
    for (const id of [
      'deplacement-presidentiel',
      'visite-usine',
      'visite-chu',
      'sommet-crise',
      'negociation-sociale',
      'discours-congres',
      'commemoration',
      'pantheonisation',
      'reunion-majorite',
    ])
      expect(byId(id)).toBeDefined();
    expect(byId('sommet-crise').condition).toBe('crise-recente');
    expect(byId('discours-congres').delaiSemaines).toBeGreaterThanOrEqual(52);
    expect(byId('pantheonisation').delaiSemaines).toBeGreaterThanOrEqual(52);
  });

  it('citent leur source quand elles s’appuient sur une règle ou un usage, sans propos ni nom prêtés', () => {
    expect(byId('discours-congres').sourceId).toBe('constitution-art-18');
    expect(byId('pantheonisation').sourceId).toBe('pantheon-usage');
    for (const action of actions) {
      if (action.sourceId) expect(ruleset.sources[action.sourceId]).toBeDefined();
      if (action.poste) expect(postes.has(action.poste)).toBe(true);
      // Aucune citation ni aucun propos prêté (guillemets interdits dans les textes affichés).
      expect(`${action.libelle} ${action.description}`).not.toMatch(/[«»“”"]/);
    }
    // La figure panthéonisée n'est pas nommée.
    expect(byId('pantheonisation').description).toMatch(/n’est pas nommée|n'est pas nommée/);
  });
});

describe('groupe du joueur (phase 13)', () => {
  it('celui de la personnalité réelle (table de rattachement), sinon le groupe le plus proche (convention)', () => {
    for (const r of ruleset.figures.rattachements) {
      expect(
        groupOfActor(ruleset, {
          candidate: {
            prenom: 'X',
            nom: 'Y',
            parti: 'Z',
            positionnement: { economie: 0, societe: 0 },
            parcours: '',
            profilId: null,
            nature: 'reel',
            personnaliteId: r.personnaliteId,
            photo: null,
          },
        }),
      ).toEqual({ groupe: r.groupe, convention: false });
    }
    const fictional = groupOfActor(ruleset, {
      candidate: {
        prenom: 'Camille',
        nom: 'Test',
        parti: 'Parti du test',
        positionnement: { economie: 24, societe: -18 },
        parcours: '',
        profilId: null,
        nature: 'personnalise',
        personnaliteId: null,
        photo: null,
      },
    });
    expect(fictional).toEqual({ groupe: 'epr', convention: true });
  });

  it('jamais les non-inscrits ; à égalité de distance, le groupe le plus nombreux', () => {
    // LIOT et les non-inscrits partagent la position (0, 0) : LIOT l'emporte, les NI sont exclus.
    expect(closestGroup(ruleset, { economie: 0, societe: 0 })).toBe('liot');
    for (let economie = -100; economie <= 100; economie += 25)
      for (let societe = -100; societe <= 100; societe += 25)
        expect(closestGroup(ruleset, { economie, societe })).not.toBe('ni');
  });
});

describe('législatives de 2024 par département (phase 13)', () => {
  const departments = realLegislativeDepartments(ruleset);
  const districts = ruleset.legislatives2024.circonscriptions;

  it('regroupent les 577 circonscriptions et leurs 577 élus, codes en chaînes de caractères', () => {
    const all = [...departments.values()];
    expect(all.reduce((s, d) => s + d.circonscriptions, 0)).toBe(577);
    expect(all.reduce((s, d) => s + Object.values(d.sieges).reduce((a, b) => a + b, 0), 0)).toBe(
      577,
    );
    for (const d of districts) expect(departementOfDistrict(d.code)).toBe(d.departement);
    expect(departments.get('2A')?.circonscriptions).toBe(2);
    expect(departments.get('971')?.circonscriptions).toBe(4);
    expect(departments.get('ZZ')?.circonscriptions).toBe(11);
    for (const code of departments.keys()) expect(typeof code).toBe('string');
  });

  it('conservent les voix exprimées de chaque département, réparties par bloc', () => {
    for (const [code, d] of departments) {
      const own = districts.filter((c) => c.departement === code);
      expect(d.inscrits).toBe(own.reduce((s, c) => s + c.inscrits, 0));
      expect(d.exprimes).toBe(own.reduce((s, c) => s + c.exprimes, 0));
      const voix = Object.values(d.voix).reduce((a, b) => a + b, 0);
      // Écart déclaré des données importées (voix non ventilées par nuance).
      expect(voix + own.reduce((s, c) => s + c.ecart, 0)).toBe(d.exprimes);
      for (const bloc of Object.keys(d.voix))
        expect(ruleset.legislatives.blocs.map((b) => b.id)).toContain(bloc);
    }
  });
});
