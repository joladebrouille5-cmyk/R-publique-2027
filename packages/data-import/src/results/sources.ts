// Présidentielle 2022 : fichiers communaux du ministère de l'Intérieur (data.gouv.fr) et totaux
// proclamés par le Conseil constitutionnel (docs/SOURCES.md §3.1 et §3.2). La licence des
// fichiers n'est pas précisée sur data.gouv.fr : rien de dérivé n'est commité (question Q8).

export const ELECTION = 'presidentielle-2022';

export type Proclaimed = {
  inscrits: number;
  votants: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  /** Voix par nom de famille, tel qu'écrit dans le fichier de l'Intérieur. */
  voix: Record<string, number>;
};

export type ResultSource = {
  tour: 1 | 2;
  date: string;
  id: string;
  titre: string;
  producteur: string;
  licence: string;
  millesime: string;
  fichier: string;
  url: string;
  proclamation: { reference: string; url: string; totaux: Proclaimed };
};

export const RESULT_SOURCES: ResultSource[] = [
  {
    tour: 1,
    date: '2022-04-10',
    id: 'interieur-presidentielle-2022-t1-communes',
    titre: 'Élection présidentielle 2022, résultats définitifs du 1er tour par commune',
    producteur: 'Ministère de l’Intérieur',
    licence: 'non précisée sur data.gouv.fr (question Q8)',
    millesime: '1er tour du 10 avril 2022',
    fichier: 'resultats-par-niveau-subcom-t1-france-entiere.txt',
    url: 'https://static.data.gouv.fr/resources/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour/20220414-152459/resultats-par-niveau-subcom-t1-france-entiere.txt',
    proclamation: {
      reference: 'Conseil constitutionnel, décision n° 2022-195 PDR du 13 avril 2022',
      url: 'https://www.conseil-constitutionnel.fr/decision/2022/2022195PDR.htm',
      totaux: {
        inscrits: 48_747_876,
        votants: 35_923_707,
        blancs: 543_609,
        nuls: 247_151,
        exprimes: 35_132_947,
        voix: {
          MACRON: 9_783_058,
          'LE PEN': 8_133_828,
          MÉLENCHON: 7_712_520,
          ZEMMOUR: 2_485_226,
          PÉCRESSE: 1_679_001,
          JADOT: 1_627_853,
          LASSALLE: 1_101_387,
          ROUSSEL: 802_422,
          'DUPONT-AIGNAN': 725_176,
          HIDALGO: 616_478,
          POUTOU: 268_904,
          ARTHAUD: 197_094,
        },
      },
    },
  },
  {
    tour: 2,
    date: '2022-04-24',
    id: 'interieur-presidentielle-2022-t2-communes',
    titre: 'Élection présidentielle 2022, résultats définitifs du 2nd tour par commune',
    producteur: 'Ministère de l’Intérieur',
    licence: 'non précisée sur data.gouv.fr (question Q8)',
    millesime: '2nd tour du 24 avril 2022',
    fichier: 'resultats-par-niveau-subcom-t2-france-entiere.txt',
    url: 'https://static.data.gouv.fr/resources/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2nd-tour/20220428-142333/resultats-par-niveau-subcom-t2-france-entiere.txt',
    proclamation: {
      reference: 'Conseil constitutionnel, décision n° 2022-197 PDR du 27 avril 2022',
      url: 'https://www.conseil-constitutionnel.fr/decision/2022/2022197PDR.htm',
      totaux: {
        inscrits: 48_752_339,
        votants: 35_096_478,
        blancs: 2_233_904,
        nuls: 805_249,
        exprimes: 32_057_325,
        voix: { MACRON: 18_768_639, 'LE PEN': 13_288_686 },
      },
    },
  },
];

/** Totaux proclamés dans l'ordre des valeurs importées (abstentions = inscrits − votants). */
export function proclaimedValues(
  totaux: Proclaimed,
  candidats: readonly { nom: string }[],
): number[] {
  const voix = candidats.map((c) => {
    const value = totaux.voix[c.nom];
    if (value === undefined) throw new Error(`Candidat absent de la proclamation : ${c.nom}`);
    return value;
  });
  if (candidats.length !== Object.keys(totaux.voix).length)
    throw new Error('Nombre de candidats différent');
  return [
    totaux.inscrits,
    totaux.inscrits - totaux.votants,
    totaux.votants,
    totaux.blancs,
    totaux.nuls,
    totaux.exprimes,
    ...voix,
  ];
}
