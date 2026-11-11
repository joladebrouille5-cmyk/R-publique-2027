// Foule d'un meeting (phase 26) : sa taille et sa ferveur se lisent dans la partie — implantation
// du candidat dans le département, militants, gain d'implantation obtenu. Estimations de mise en
// scène, sans prétention de mesure : aucune jauge réelle de salle.

export type Meeting = {
  /** Implantation dans le département avant le meeting (0 à 100). */
  implantation: number;
  /** Militants de la campagne. */
  militants: number;
  /** Points d'implantation gagnés par le meeting (0 : action rejetée ou sans effet). */
  gain: number;
  /** Gain nominal de la carte (jeu de règles). */
  gainNominal: number;
  /** Grand meeting national : salle plus vaste. */
  grand: boolean;
};

export type Foule = {
  /** Places de la salle (instances au plus). */
  capacite: number;
  /** Spectateurs présents : nombre d'instances dessinées. */
  spectateurs: number;
  /** Part de la salle occupée (0 à 1). */
  remplissage: number;
  /** Ferveur (0 à 1) : amplitude des applaudissements et de la houle. */
  ferveur: number;
  /** Vagues (ola) pendant la scène. */
  vagues: number;
  reussi: boolean;
};

const borne = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Foule d'un meeting au palier donné. Un fief (implantation forte) et une base militante
 * remplissent la salle ; le résultat du meeting (gain obtenu rapporté au gain nominal) fait la
 * ferveur. Un meeting raté hors fief : salle à moitié vide, sans vague.
 */
export function fouleDuMeeting(meeting: Meeting, fouleMax: number): Foule {
  const resultat = meeting.gainNominal > 0 ? borne(meeting.gain / meeting.gainNominal) : 0;
  const ancrage = borne(meeting.implantation / 100);
  const base = borne(Math.log10(1 + meeting.militants) / 5);
  const remplissage = borne(0.18 + 0.4 * ancrage + 0.17 * base + 0.25 * resultat);
  const capacite = Math.round(fouleMax * (meeting.grand ? 1 : 0.6));
  const ferveur = borne(0.1 + 0.55 * resultat + 0.35 * ancrage);
  return {
    capacite,
    spectateurs: Math.max(12, Math.round(capacite * remplissage)),
    remplissage,
    ferveur,
    vagues: ferveur >= 0.75 ? 2 : ferveur >= 0.5 ? 1 : 0,
    reussi: resultat >= 0.5,
  };
}

const MEETINGS = new Set(['meeting', 'grand-meeting']);

/**
 * Meeting du joueur dans le bilan de la semaine (le premier, s'il y en a plusieurs), avec ce que
 * la partie en dit : implantation avant, gain obtenu, militants. Null sans meeting validé.
 */
export function meetingDuBilan(
  report: {
    actions: readonly {
      actorId: string;
      actionId: string;
      label: string;
      status: string;
      cible: string | null;
    }[];
    implantation: readonly {
      actorId: string;
      departement: string;
      before: number;
      after: number;
    }[];
  },
  joueur: { id: string; militants: number; implantation: Readonly<Record<string, number>> },
  gains: Readonly<Record<string, number>>,
): { meeting: Meeting; departement: string; lieu: string; libelle: string } | null {
  const action = report.actions.find(
    (a) => a.actorId === joueur.id && a.status === 'validee' && MEETINGS.has(a.actionId) && a.cible,
  );
  const code = action?.cible?.match(/\(([0-9AB]{2,3})\)$/)?.[1] ?? action?.cible;
  if (!action || !code) return null;
  const change = report.implantation.find((c) => c.actorId === joueur.id && c.departement === code);
  return {
    departement: code,
    lieu: action.cible!.replace(/\s*\([0-9AB]{2,3}\)$/, ''),
    libelle: action.label,
    meeting: {
      implantation: change?.before ?? joueur.implantation[code] ?? 0,
      militants: joueur.militants,
      gain: Math.max(0, (change?.after ?? 0) - (change?.before ?? 0)),
      gainNominal: gains[action.actionId] ?? 0,
      grand: action.actionId === 'grand-meeting',
    },
  };
}
