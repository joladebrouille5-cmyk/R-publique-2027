import {
  candidateName,
  type GameState,
  type QuinquennatReview,
  type ReportEvent,
  type Ruleset,
} from '@r2027/shared';
import { openingAccount } from '../campaign/finances';
import { emptyParrainages } from '../campaign/parrainages';
import { formatFrenchDate } from '../core/calendar';
import { distributeInitialPromises, initialMeans } from '../core/createGame';
import { compareStrings, type Ledger } from '../core/ledger';
import { nextCycle, shiftToCycle } from './dates';
import { endGovernment, snapshot } from './government';
import { gradeMandate } from './objectifs';
import { applySuccession } from './succession';

// Fin du quinquennat et poursuite de la partie (phase 6, P6-08). Le lundi où commence la
// campagne du cycle suivant (date de départ de la partie décalée du cycle), le quinquennat est
// clos : bilan arrêté, archives (présidentielle et quinquennat), textes en cours caducs, puis
// nouvelle campagne présidentielle avec le même moteur : parrainages et comptes de campagne
// remis à zéro, militants et notoriété relevés au moins à leur niveau de départ (hypothèse),
// président sortant inéligible au terme de deux mandats consécutifs (Constitution, art. 6). Phase
// 23 : le joueur se représente ou passe la main, les autres candidats se représentent ou se
// retirent (candidatures simulées), de nouveaux candidats entrent et le bilan du quinquennat pèse
// sur les intentions du président sortant et de son camp (`succession.ts`). Pendant la campagne, l'action du gouvernement sortant, le Parlement
// et l'économie ne sont pas simulés (simplification du jeu, signalée au joueur).

const IN_PROGRESS = new Set(['commission', 'seance', 'navette', 'lecture_definitive']);

/**
 * Bilan du quinquennat en cours, arrêté à la date de la partie ; phase 15 : note finale du
 * mandat d'après ses objectifs (null sans objectifs fixés).
 */
export function reviewQuinquennat(state: GameState, ruleset: Ruleset): QuinquennatReview {
  const quinquennat = state.quinquennat!;
  const parliament = state.parlement;
  const start = quinquennat.depart.semaine;
  const textes = parliament?.textes ?? [];
  const reformes = (parliament?.reformes ?? []).filter((r) => r.adopteeSemaine >= start);
  const last = state.legislatives?.derniere;
  return {
    debut: quinquennat.depart,
    fin: snapshot(state, quinquennat.mandat.presidentId),
    reformes: {
      adoptees: reformes.map((r) => r.propositionId),
      enVigueur: reformes.filter((r) => r.appliquee).length,
      rejetees: textes.filter((b) => b.etape === 'rejete').length,
      retirees: textes.filter((b) => b.etape === 'retire').length,
      caducs: textes.filter((b) => IN_PROGRESS.has(b.etape)).length,
      engagements49_3: textes.filter((b) => b.procedure === '49-3').length,
      censures: textes.filter((b) => b.censure?.adoptee).length,
    },
    gouvernements:
      quinquennat.anciensGouvernements.length + (quinquennat.gouvernement !== null ? 1 : 0),
    legislatives:
      last && last.t2 >= quinquennat.depart.date
        ? {
            motif: last.motif,
            t2: last.t2,
            cohabitation: last.cohabitation,
            siegesParBloc: { ...last.siegesParBloc },
          }
        : null,
    // Conséquences durables nées pendant le quinquennat (phase 7).
    consequences: state.consequences
      .filter((c) => c.debut > start)
      .map(({ libelle, origine, debut, fin }) => ({ libelle, origine, debut, fin })),
    note: gradeMandate(state, ruleset),
  };
}

const fmt = (centiemes: number) => `${(centiemes / 100).toFixed(2).replace('.', ',')}`;

/**
 * Étape 9 du quinquennat : si la campagne du cycle suivant commence, clôt le quinquennat et
 * ouvre la nouvelle présidentielle. Renvoie les événements du bilan, ou null si le quinquennat
 * continue (ou si le jeu de règles ne prévoit plus de cycle).
 */
export function openNextCampaign(
  state: GameState,
  ruleset: Ruleset,
  ledger: Ledger,
  step: number,
): ReportEvent[] | null {
  const next = nextCycle(ruleset, state.cycle);
  if (!next) return null;
  const start = shiftToCycle(state.meta.startDate, next);
  if (state.meta.date < start) return null;
  const quinquennat = state.quinquennat!;
  const { mandat } = quinquennat;
  const president = state.actors[mandat.presidentId]!;
  const presidentName = candidateName(president.candidate);
  const week = state.meta.week;

  // 1. Bilan, puis archives de la présidentielle et du quinquennat ; dernier gouvernement et
  // popularité prêtée de ses membres, pour les candidatures (phase 23).
  const bilan = reviewQuinquennat(state, ruleset);
  const government = quinquennat.gouvernement;
  const suivi = quinquennat.suivi;
  endGovernment(quinquennat, state.meta.date, 'fin du quinquennat');
  state.historique.quinquennats.push({
    mandat,
    gouvernements: quinquennat.anciensGouvernements,
    bilan,
  });
  if (state.elections.t1) {
    state.historique.presidentielles.push({
      annee: state.cycle.annee,
      t1: state.elections.t1,
      t2: state.elections.t2,
      eluId: mandat.presidentId,
    });
  }
  const previous = state.elections.t1 ? state.historique.presidentielles.at(-1)! : null;
  const rallied = state.alliances.map((a) => a.de);
  // Textes en cours : caducs (simplification : le nouveau président aura sa feuille de route).
  for (const bill of state.parlement?.textes ?? []) {
    if (!IN_PROGRESS.has(bill.etape)) continue;
    bill.etape = 'retire';
    bill.issue = { semaine: week, motif: 'caduc à la fin du quinquennat (simplification du jeu)' };
  }
  const lapsed = state.pendingDecisions.length;

  // 2. Nouvelle campagne : même moteur, calendrier du cycle suivant.
  const termLimited = mandat.numero >= ruleset.quinquennat.mandat.mandatsConsecutifsMax;
  state.cycle = next;
  state.quinquennat = null;
  state.meta.phase = 'campagne';
  state.pendingDecisions = [];
  state.opinion = null;
  state.polls = [];
  state.sondagesBase = {};
  state.elections = { t1: null, t2: null, consignes: [], debate: null, debateDetail: null };
  state.debats = { seances: [] };
  state.medias = null;
  state.alliances = [];
  state.calendar = { blockedBy: null, blockedMessage: null };
  // Conséquences achevées : archivées dans le bilan, retirées de l'état courant.
  state.consequences = state.consequences.filter((c) => c.fin >= week);
  // 3. Candidatures (phase 23) : qui se représente, qui se retire, qui entre ; facteurs de bilan.
  const candidacies = applySuccession(state, ruleset, ledger, step, bilan, {
    presidentId: president.id,
    termLimited,
    previous,
    government,
    suivi,
    rallied,
  });
  for (const id of Object.keys(state.actors).sort(compareStrings)) {
    const actor = state.actors[id]!;
    actor.parrainages = emptyParrainages();
    actor.preparationDebat = 0;
    actor.strategie = null;
    actor.programme = { ...actor.programme, revirements: 0 };
    if (actor.status !== 'candidat') {
      actor.finances = openingAccount(ledger.current(id, 'budgetCentimes'), ruleset);
      continue;
    }
    // Moyens de départ des candidats déclarés : nouveau budget ; militants et notoriété relevés
    // au moins à leur niveau de création de la partie (remobilisation, hypothèse de jeu).
    const means = initialMeans(state, ruleset, actor);
    const label = `Présidentielle ${next.annee}`;
    ledger.apply(id, 'budgetCentimes', [
      {
        label: `${label} : nouveau compte de campagne, moyens de départ`,
        value: means.budgetCentimes - ledger.current(id, 'budgetCentimes'),
        source: 'calendrier',
        step,
      },
    ]);
    ledger.apply(id, 'militants', [
      {
        label: `${label} : remobilisation des militants (niveau de départ)`,
        value: Math.max(0, means.militants - ledger.current(id, 'militants')),
        source: 'calendrier',
        step,
      },
    ]);
    ledger.apply(id, 'notoriete', [
      {
        label: `${label} : notoriété d'un candidat déclaré (niveau de départ)`,
        value: Math.max(0, means.notoriete - ledger.current(id, 'notoriete')),
        source: 'calendrier',
        step,
      },
    ]);
    actor.finances = openingAccount(ledger.current(id, 'budgetCentimes'), ruleset);
  }
  // Les relations entre candidats (confiance, rivalités) se poursuivent d'une campagne à l'autre.
  distributeInitialPromises(state, ruleset);

  const t1 = shiftToCycle(ruleset.calendrier.scrutins[0]!.date, next);
  const t2 = shiftToCycle(ruleset.calendrier.scrutins.at(-1)!.date, next);
  const end = bilan.fin;
  const unemployment =
    bilan.debut.indicateurs && end.indicateurs
      ? ` Chômage : ${fmt(bilan.debut.indicateurs.chomage ?? 0)} % au début, ${fmt(end.indicateurs.chomage ?? 0)} % à la fin (simulé).`
      : '';
  const popularity =
    bilan.debut.popularite !== null && end.popularite !== null
      ? ` Popularité du président : ${fmt(bilan.debut.popularite)} % au début, ${fmt(end.popularite)} % à la fin (simulée).`
      : '';
  return [
    {
      id: `fin-quinquennat-${week}`,
      kind: 'evenement',
      refId: 'quinquennat',
      label: `Fin du quinquennat ${mandat.debut.slice(0, 4)}–${mandat.fin.slice(0, 4)} : bilan arrêté`,
      description:
        `${presidentName} : ${bilan.reformes.adoptees.length} réforme(s) adoptée(s), ${bilan.gouvernements} gouvernement(s).` +
        unemployment +
        popularity +
        (bilan.reformes.caducs
          ? ` ${bilan.reformes.caducs} texte(s) en cours devenu(s) caduc(s).`
          : '') +
        (lapsed ? ` ${lapsed} décision(s) en attente devenue(s) sans objet.` : ''),
      nature: 'simule',
      majeur: true,
      decisionId: null,
    },
    {
      id: `campagne-${next.annee}-${week}`,
      kind: 'evenement',
      refId: 'presidentielle',
      label: `Présidentielle ${next.annee} : la campagne commence`,
      description:
        `Premier tour le ${formatFrenchDate(t1)}, second tour le ${formatFrenchDate(t2)} (hypothèse : calendrier de 2027 transposé ; dates réelles fixées par décret). ` +
        'Parrainages et comptes de campagne remis à zéro ; militants et notoriété relevés au moins à leur niveau de départ (hypothèse de jeu). ' +
        (termLimited
          ? `${presidentName}, au terme de deux mandats consécutifs, ne peut pas se représenter (Constitution, art. 6). `
          : '') +
        `Candidatures simulées : ${Object.values(state.actors).filter((a) => a.status === 'candidat').length} candidats déclarés ; le bilan du quinquennat pèse sur les intentions du président sortant et de son camp (hypothèse de jeu). ` +
        `Le mandat en cours s'achève le ${formatFrenchDate(mandat.fin)} ; pendant la campagne, l'action du gouvernement sortant, le Parlement et l'économie ne sont pas simulés (simplification du jeu).`,
      nature: 'simule',
      majeur: true,
      decisionId: null,
    },
    ...candidacies,
  ];
}
