import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { describe, expect, it } from 'vitest';
import { seatingOrder } from '../components/Hemicycle';
import { anneaux, hauteurDuRelief } from './carte';
import { dureeDuPlan, plansDuDebat } from './debat';
import { fouleDuMeeting } from './foule';
import { agitation, centreDuGroupe, disposerSieges, rangs, reactionDeLaSalle } from './hemicycle';
import { creerGardeFps, decider, detecterPalier, palierInferieur, REGLAGES } from './qualite';
import { arcsDeReport, ralliements } from './reports';

const presidentielle2027 = getRuleset(CURRENT_RULESET_KEY);

describe('hémicycle 3D : répartition des sièges', () => {
  const groupes = seatingOrder(presidentielle2027.assemblee.groupes).map((g) => ({
    id: g.id,
    sieges: g.sieges,
  }));
  const total = presidentielle2027.assemblee.siegesTotal;
  const sieges = disposerSieges(total, groupes);

  it('place les 577 sièges, chaque groupe avec son effectif réel', () => {
    expect(total).toBe(577);
    expect(sieges).toHaveLength(577);
    for (const g of groupes) expect(sieges.filter((s) => s.groupe === g.id)).toHaveLength(g.sieges);
    const pourvus = groupes.reduce((a, g) => a + g.sieges, 0);
    expect(sieges.filter((s) => s.groupe === null)).toHaveLength(577 - pourvus);
  });

  it('range les groupes de la gauche vers la droite, en secteurs', () => {
    const angles = groupes
      .filter((g) => g.sieges > 0)
      .map((g) => {
        const siens = sieges.filter((s) => s.groupe === g.id);
        return siens.reduce((a, s) => a + s.angle, 0) / siens.length;
      });
    expect(angles).toEqual([...angles].sort((a, b) => b - a));
    expect(centreDuGroupe(sieges, groupes[0]!.id)!.x).toBeLessThan(0);
    expect(centreDuGroupe(sieges, groupes.at(-1)!.id)!.x).toBeGreaterThan(0);
  });

  it('dispose des arcs concentriques en gradins', () => {
    const arcs = rangs(577);
    expect(arcs.length).toBeGreaterThan(8);
    expect(arcs.reduce((a, r) => a + r.sieges, 0)).toBe(577);
    expect(arcs.at(-1)!.sieges).toBeGreaterThan(arcs[0]!.sieges);
    const fond = sieges.filter((s) => s.rang === arcs.length - 1)[0]!;
    const devant = sieges.filter((s) => s.rang === 0)[0]!;
    expect(fond.y).toBeGreaterThan(devant.y);
  });

  it('suit les effectifs de la partie (groupe vidé, autre groupe renforcé)', () => {
    const [a, b, ...reste] = groupes;
    const partie = [{ ...a!, sieges: 0 }, { ...b!, sieges: b!.sieges + a!.sieges }, ...reste];
    const salle = disposerSieges(total, partie);
    expect(salle.filter((s) => s.groupe === a!.id)).toHaveLength(0);
    expect(salle.filter((s) => s.groupe === b!.id)).toHaveLength(b!.sieges + a!.sieges);
    expect(centreDuGroupe(salle, a!.id)).toBeNull();
  });
});

describe('hémicycle 3D : trois réactions liées à la tension', () => {
  it('lit la réaction dans les points de tension de la réplique', () => {
    expect(reactionDeLaSalle(-4)).toBe('apaisement');
    expect(reactionDeLaSalle(3)).toBe('echauffement');
    expect(reactionDeLaSalle(8)).toBe('contre-attaque');
    const repliques = presidentielle2027.parlement.qag.banques.flatMap((b) => b.reponses);
    expect(new Set(repliques.map((r) => reactionDeLaSalle(r.tension))).size).toBe(3);
  });

  it('calme la salle à l’apaisement, l’agite à l’échauffement, oppose les camps à la contre-attaque', () => {
    const fond = agitation(null, 50, 'opposition');
    expect(agitation('apaisement', 50, 'opposition')).toBeLessThan(fond);
    expect(agitation('echauffement', 50, 'opposition')).toBeGreaterThan(fond);
    expect(agitation('echauffement', 50, 'soutien')).toBe(
      agitation('echauffement', 50, 'opposition'),
    );
    expect(agitation('contre-attaque', 50, 'opposition')).toBeGreaterThan(
      agitation('contre-attaque', 50, 'soutien'),
    );
  });

  it('grandit avec la tension parlementaire de la partie', () => {
    expect(agitation(null, 90, 'soutien')).toBeGreaterThan(agitation(null, 10, 'soutien'));
    expect(agitation('echauffement', 90, 'soutien')).toBeGreaterThan(
      agitation('echauffement', 10, 'soutien'),
    );
  });
});

describe('meeting : foule corrélée aux données de la partie', () => {
  const fief = { implantation: 85, militants: 40_000, gain: 12, gainNominal: 12, grand: false };
  const rate = { implantation: 5, militants: 800, gain: 0, gainNominal: 12, grand: false };

  it('remplit et anime plus un meeting réussi dans un fief qu’un meeting raté hors fief', () => {
    for (const palier of ['eleve', 'standard', 'eco'] as const) {
      const plein = fouleDuMeeting(fief, REGLAGES[palier].fouleMax);
      const vide = fouleDuMeeting(rate, REGLAGES[palier].fouleMax);
      expect(plein.spectateurs).toBeGreaterThan(vide.spectateurs * 2);
      expect(plein.ferveur).toBeGreaterThan(vide.ferveur);
      expect(plein.vagues).toBeGreaterThan(vide.vagues);
      expect(plein.reussi).toBe(true);
      expect(vide.reussi).toBe(false);
      expect(vide.remplissage).toBeLessThan(0.5);
      expect(plein.spectateurs).toBeLessThanOrEqual(plein.capacite);
    }
  });

  it('réduit la foule au palier éco', () => {
    expect(fouleDuMeeting(fief, REGLAGES.eco.fouleMax).spectateurs).toBeLessThan(
      fouleDuMeeting(fief, REGLAGES.standard.fouleMax).spectateurs,
    );
    expect(fouleDuMeeting(fief, REGLAGES.standard.fouleMax).spectateurs).toBeGreaterThan(1000);
  });
});

describe('reports de voix : arcs proportionnels', () => {
  const dep = (voix: Record<string, number>) => {
    const exprimes = Object.values(voix).reduce((a, b) => a + b, 0);
    return { inscrits: exprimes, votants: exprimes, blancs: 0, nuls: 0, exprimes, voix };
  };
  const t1 = {
    voix: { a: 9_000_000, b: 8_000_000, c: 4_000_000, d: 1_000_000 },
    territoire: {
      candidats: ['a', 'b', 'c', 'd'],
      departements: {
        '01': dep({ a: 50, b: 20, c: 25, d: 5 }),
        '02': dep({ a: 45, b: 25, c: 10, d: 20 }),
        '03': dep({ a: 20, b: 50, c: 28, d: 2 }),
        '04': dep({ a: 30, b: 40, c: 5, d: 25 }),
        '2A': dep({ a: 35, b: 35, c: 29, d: 1 }),
      },
    },
  } as never;
  const consignes = [
    { fromActorId: 'c', toActorId: 'a', automatic: true },
    { fromActorId: 'd', toActorId: 'a', automatic: true },
  ];

  it('pèse un ralliement par les voix du premier tour du candidat rallié', () => {
    const r = ralliements(consignes, t1);
    expect(r.map((x) => [x.de, x.vers, x.poids])).toEqual([
      ['c', 'a', 4_000_000],
      ['d', 'a', 1_000_000],
    ]);
    expect(r[0]!.part).toBe(1818);
  });

  it('donne à chaque arc une intensité proportionnelle au poids transféré', () => {
    const arcs = arcsDeReport(consignes, t1);
    const de = (id: string) => arcs.filter((a) => a.de === id);
    expect(de('c').length).toBeGreaterThan(0);
    expect(de('d').length).toBe(de('c').length);
    expect(de('c')[0]!.intensite).toBe(1);
    expect(de('d')[0]!.intensite).toBeCloseTo(0.25, 10);
    expect(de('c').reduce((s, a) => s + a.poids, 0)).toBeCloseTo(4_000_000, 6);
    // Du fief du candidat rallié vers un fief du candidat soutenu, jamais sur place.
    expect(de('c')[0]!.depuis).toBe('2A');
    for (const arc of arcs) expect(arc.depuis).not.toBe(arc.jusqua);
  });

  it('ignore une consigne sans destinataire et un tour sans détail territorial', () => {
    expect(arcsDeReport([{ fromActorId: 'c', toActorId: null, automatic: true }], t1)).toEqual([]);
    expect(arcsDeReport(consignes, { voix: { a: 1, c: 1 }, territoire: null } as never)).toEqual(
      [],
    );
    expect(arcsDeReport(consignes, null)).toEqual([]);
  });
});

describe('qualité adaptative', () => {
  it('classe les appareils en trois paliers', () => {
    const tel = { dpr: 2.6, coeurs: 8, memoire: 6 };
    expect(detecterPalier({ ...tel, gpu: 'Mali-G68 MP5' })).toBe('standard');
    expect(detecterPalier({ ...tel, gpu: 'Adreno (TM) 740' })).toBe('eleve');
    expect(detecterPalier({ ...tel, memoire: 2, gpu: 'Mali-G52' })).toBe('eco');
    expect(
      detecterPalier({ dpr: 1, coeurs: 12, memoire: 8, gpu: 'ANGLE (NVIDIA GeForce RTX)' }),
    ).toBe('eleve');
    expect(detecterPalier({ dpr: 1, coeurs: 8, memoire: 8, gpu: 'SwiftShader' })).toBe('eco');
    expect(detecterPalier({ dpr: 2, coeurs: null, memoire: null, gpu: null })).toBe('standard');
  });

  it('coupe le post-traitement, les confettis et la vague au palier éco seulement', () => {
    expect(REGLAGES.eco.postTraitement).toBe(false);
    expect(REGLAGES.eco.confettis).toBe(0);
    expect(REGLAGES.eco.vague).toBe(false);
    expect(REGLAGES.eco.pixelRatioMax).toBeLessThan(REGLAGES.standard.pixelRatioMax);
    for (const palier of ['eleve', 'standard'] as const) {
      expect(REGLAGES[palier].postTraitement).toBe(true);
      expect(REGLAGES[palier].confettis).toBeGreaterThan(0);
      expect(REGLAGES[palier].vague).toBe(true);
    }
  });

  const base = {
    choix: 'auto',
    mouvementReduit: false,
    webgl: true,
    detecte: 'standard',
    abaisse: null,
  } as const;

  it('replie en 2D sans WebGL, en mouvement réduit ou sur choix', () => {
    expect(decider(base)).toEqual({ mode: '3d', palier: 'standard', force: false });
    expect(decider({ ...base, webgl: false })).toEqual({ mode: '2d', raison: 'webgl' });
    expect(decider({ ...base, mouvementReduit: true })).toEqual({
      mode: '2d',
      raison: 'mouvement-reduit',
    });
    expect(decider({ ...base, choix: '2d' })).toEqual({ mode: '2d', raison: 'choix' });
  });

  it('respecte un palier forcé et abaisse le palier automatique jusqu’au repli 2D', () => {
    expect(decider({ ...base, choix: 'eleve', abaisse: '2d' })).toEqual({
      mode: '3d',
      palier: 'eleve',
      force: true,
    });
    expect(decider({ ...base, abaisse: 'eco' })).toEqual({
      mode: '3d',
      palier: 'eco',
      force: false,
    });
    expect(decider({ ...base, abaisse: '2d' })).toEqual({ mode: '2d', raison: 'performances' });
    expect(palierInferieur('eleve')).toBe('standard');
    expect(palierInferieur('standard')).toBe('eco');
    expect(palierInferieur('eco')).toBeNull();
  });

  it('signale moins de 30 images par seconde en continu, pas un à-coup', () => {
    const lente = creerGardeFps();
    let signal = false;
    for (let i = 0; i < 120 && !signal; i++) signal = lente.image(50);
    expect(signal).toBe(true);
    expect(lente.fps).toBeCloseTo(20, 0);

    const fluide = creerGardeFps();
    let alerte = false;
    for (let i = 0; i < 600; i++) alerte ||= fluide.image(i === 200 ? 400 : 16.7);
    expect(alerte).toBe(false);
    expect(fluide.fps).toBeGreaterThan(55);
  });
});

describe('débat et carte', () => {
  it('ajoute des plans quand la tension monte et coupe plus vite', () => {
    expect(plansDuDebat(0.1)).toEqual(['large', 'serre']);
    expect(plansDuDebat(0.4)).toHaveLength(3);
    expect(plansDuDebat(0.8)).toEqual(['large', 'serre', 'champ-contrechamp', 'ecran-partage']);
    expect(dureeDuPlan(0.9)).toBeLessThan(dureeDuPlan(0.1));
  });

  it('lit les anneaux d’un chemin du plateau et élève le relief avec le score', () => {
    expect(anneaux('M0 0L10 0L10 10ZM20 20L30 20L30 30L20 30Z')).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
      ],
    ]);
    expect(hauteurDuRelief(0.6)).toBeGreaterThan(hauteurDuRelief(0.3));
  });
});
