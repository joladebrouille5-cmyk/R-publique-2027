import type {
  Actor,
  ElectoralPact,
  GameState,
  PendingDecision,
  ReportEvent,
  Ruleset,
} from '@r2027/shared';
import { formatFrenchDate } from '../core/calendar';
import { compareStrings } from '../core/ledger';
import { distance } from '../election/model';
import { daysBetween } from './dates';
import { blocPositions, presidentBloc } from './legislatives';
import { membersMajority } from './parliament';
import { updateTension } from './tension';

// Alliances des législatives (phase 13). Quand des législatives approchent (quelques semaines
// avant le premier tour, aussitôt après une dissolution), le camp du joueur — le bloc le plus
// proche de son candidat — arrête une stratégie : investitures communes ou désistements
// réciproques avec un bloc qui l'accepte (proximité), front républicain face au bloc exclu, ou
// aucun accord. Les blocs conduits par l'IA suivent une règle : désistements entre plus proches
// voisins mutuels, front républicain des blocs éloignés du bloc exclu ; par convention du jeu,
// ils ne concluent aucun accord avec le bloc que vise le front républicain (le joueur, lui,
// reste libre de ses choix). Après un second tour sans majorité, le président forme une
// coalition ou gouverne en minorité. Règles et paramètres : hypothèses du jeu ; ces accords ne
// décrivent aucun accord réel.

export const ALLIANCE_DECISION_EVENT = 'strategie-legislatives';
export const COALITION_DECISION_EVENT = 'coalition';
const NO_PACT = 'aucune';
const FRONT = 'front-republicain';
const MINORITY = 'minorite';

/** Distance (axes du jeu) entre deux blocs. */
export function blocDistance(ruleset: Ruleset, a: string, b: string): number {
  const positions = blocPositions(ruleset);
  return distance(positions.get(a)!, positions.get(b)!);
}

const blocLabel = (ruleset: Ruleset, id: string) =>
  ruleset.legislatives.blocs.find((b) => b.id === id)?.libelle ?? id;

/** Camp du joueur pour les législatives : le bloc de son candidat, null en observateur. */
export function playerCamp(state: GameState, ruleset: Ruleset): string | null {
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  return actor ? presidentBloc(ruleset, actor) : null;
}

/** Plus proche voisin d'un bloc (le premier dans l'ordre du jeu de règles à égalité). */
function nearest(ruleset: Ruleset, bloc: string): { id: string; d: number } | null {
  const others = ruleset.legislatives.blocs
    .map((b) => b.id)
    .filter((id) => id !== bloc)
    .map((id) => ({ id, d: blocDistance(ruleset, bloc, id) }))
    .sort((a, b) => a.d - b.d || compareStrings(a.id, b.id));
  return others[0] ?? null;
}

/**
 * Accords des blocs conduits par l'IA (le camp du joueur en est exclu : il décide) :
 * désistements réciproques entre plus proches voisins mutuels assez proches, front républicain
 * des blocs assez éloignés du bloc exclu.
 */
export function aiPacts(ruleset: Ruleset, playerBloc: string | null): ElectoralPact[] {
  const rules = ruleset.legislatives.alliances;
  const { contre, distanceMin } = rules.frontRepublicain;
  const blocs = ruleset.legislatives.blocs.map((b) => b.id).filter((id) => id !== playerBloc);
  const pacts: ElectoralPact[] = [];
  if (rules.ia.desistements) {
    for (const a of blocs) {
      const n = nearest(ruleset, a);
      if (!n || n.id === playerBloc || compareStrings(a, n.id) > 0) continue;
      if (a === contre || n.id === contre) continue;
      if (nearest(ruleset, n.id)?.id === a && n.d <= rules.distanceDesistements)
        pacts.push({ type: 'desistements', blocs: [a, n.id], contre: null, origine: 'ia' });
    }
  }
  if (rules.ia.frontRepublicain) {
    const front = blocs.filter(
      (id) => id !== contre && blocDistance(ruleset, id, contre) >= distanceMin,
    );
    if (front.length > 0)
      pacts.push({ type: 'front-republicain', blocs: front, contre, origine: 'ia' });
  }
  return pacts;
}

type Option = { id: string; libelle: string; description: string };

/** Stratégies proposées au camp du joueur (seuls les accords que le partenaire accepte). */
export function allianceOptions(ruleset: Ruleset, camp: string): Option[] {
  const rules = ruleset.legislatives.alliances;
  const options: Option[] = [
    {
      id: NO_PACT,
      libelle: 'Aucun accord : un candidat dans chaque circonscription',
      description: 'Votre camp présente ses candidats partout et ne se désiste pour personne.',
    },
  ];
  const { contre } = rules.frontRepublicain;
  if (camp !== contre)
    options.push({
      id: FRONT,
      libelle: `Front républicain face au bloc « ${blocLabel(ruleset, contre)} »`,
      description: `Au second tour, votre candidat se retire là où il est distancé par un autre candidat face au bloc « ${blocLabel(ruleset, contre)} » (report : ${Math.round(rules.reportDesistement * 100)} % de ses voix).`,
    });
  for (const bloc of ruleset.legislatives.blocs.map((b) => b.id).filter((id) => id !== camp)) {
    const d = blocDistance(ruleset, camp, bloc);
    if (d <= rules.distanceDesistements)
      options.push({
        id: `desistements:${bloc}`,
        libelle: `Désistements réciproques avec le bloc « ${blocLabel(ruleset, bloc)} »`,
        description: `Au second tour, le moins bien placé des deux alliés se retire (report : ${Math.round(rules.reportDesistement * 100)} % de ses voix). Accord accepté : positions proches.`,
      });
    if (d <= rules.distanceInvestitures)
      options.push({
        id: `investitures:${bloc}`,
        libelle: `Investitures communes avec le bloc « ${blocLabel(ruleset, bloc)} »`,
        description: `Un seul candidat des deux blocs au premier tour, celui du mieux placé (report : ${Math.round(rules.reportInvestitures * 100)} % des voix du partenaire), puis désistements réciproques. Accord accepté : positions très proches.`,
      });
  }
  return options;
}

/** Choix que l'IA ferait pour ce camp (option par défaut de la décision du joueur). */
function defaultStrategy(ruleset: Ruleset, camp: string, options: readonly Option[]): string {
  const { contre, distanceMin } = ruleset.legislatives.alliances.frontRepublicain;
  const n = nearest(ruleset, camp);
  if (
    n &&
    camp !== contre &&
    n.id !== contre &&
    nearest(ruleset, n.id)?.id === camp &&
    options.some((o) => o.id === `desistements:${n.id}`)
  )
    return `desistements:${n.id}`;
  if (camp !== contre && blocDistance(ruleset, camp, contre) >= distanceMin) return FRONT;
  return NO_PACT;
}

export function allianceDecision(
  state: GameState,
  ruleset: Ruleset,
  camp: string,
): PendingDecision {
  const prochaine = state.legislatives!.prochaine!;
  const options = allianceOptions(ruleset, camp);
  return {
    id: `l-${state.meta.week}-${ALLIANCE_DECISION_EVENT}`,
    kind: 'alliance',
    eventId: ALLIANCE_DECISION_EVENT,
    actorId: state.player.actorId!,
    createdWeek: state.meta.week,
    label: `Législatives : stratégie d’alliance de votre camp (« ${blocLabel(ruleset, camp)} »)`,
    description: `Premier tour le ${formatFrenchDate(prochaine.t1)}, second tour le ${formatFrenchDate(prochaine.t2)}. L’acceptation des partenaires est simulée selon la proximité des positions ; les autres blocs suivent une règle du jeu. Accords fictifs : ils ne décrivent aucun accord réel.`,
    options,
    defaultOptionId: defaultStrategy(ruleset, camp, options),
  };
}

/**
 * Ouvre la campagne des législatives quand le premier tour approche (aussitôt après une
 * dissolution) : accords de l'IA, décision du camp du joueur. Renvoie l'événement, ou null.
 */
export function openLegislativeCampaign(state: GameState, ruleset: Ruleset): ReportEvent | null {
  const legislatives = state.legislatives;
  const prochaine = legislatives?.prochaine;
  if (!legislatives || !prochaine || legislatives.campagne || legislatives.premierTour) return null;
  const weeks = daysBetween(state.meta.date, prochaine.t1) / 7;
  if (weeks < 0) return null;
  if (prochaine.motif !== 'dissolution' && weeks > ruleset.legislatives.alliances.campagneSemaines)
    return null;
  const camp = playerCamp(state, ruleset);
  legislatives.campagne = {
    alliances: aiPacts(ruleset, camp),
    strategieArretee: camp === null,
    mobilisation: {},
  };
  if (camp) state.pendingDecisions.push(allianceDecision(state, ruleset, camp));
  return {
    id: `campagne-legislatives-${state.meta.week}`,
    kind: 'evenement',
    refId: 'legislatives',
    label: 'Campagne des élections législatives ouverte',
    description: `Premier tour le ${formatFrenchDate(prochaine.t1)}. Accords électoraux${camp ? ' : votre camp arrête sa stratégie' : ''} ; chaque déplacement du président dans un département y mobilise son camp (hypothèse du jeu).`,
    nature: 'simule',
    majeur: false,
    decisionId: null,
  };
}

/** Applique la stratégie choisie par le joueur pour son camp ; renvoie un événement. */
export function answerAlliance(state: GameState, ruleset: Ruleset, optionId: string): ReportEvent {
  const campagne = state.legislatives?.campagne;
  const camp = playerCamp(state, ruleset);
  if (!campagne || !camp) throw new Error('Aucune campagne des législatives en cours');
  campagne.strategieArretee = true;
  let label: string;
  if (optionId === NO_PACT) label = 'Votre camp présente des candidats partout, sans accord';
  else if (optionId === FRONT) {
    const { contre } = ruleset.legislatives.alliances.frontRepublicain;
    campagne.alliances.push({
      type: 'front-republicain',
      blocs: [camp],
      contre,
      origine: 'joueur',
    });
    label = `Votre camp rejoint le front républicain face au bloc « ${blocLabel(ruleset, contre)} »`;
  } else {
    const [type, partner] = optionId.split(':') as ['desistements' | 'investitures', string];
    campagne.alliances.push({
      type,
      blocs: [camp, partner].sort(compareStrings),
      contre: null,
      origine: 'joueur',
    });
    label = `${type === 'investitures' ? 'Investitures communes' : 'Désistements réciproques'} avec le bloc « ${blocLabel(ruleset, partner)} »`;
  }
  return {
    id: `alliance-${state.meta.week}`,
    kind: 'evenement',
    refId: 'legislatives',
    label,
    description: 'Accord électoral simulé pour les prochaines législatives.',
    nature: 'simule',
    majeur: false,
    decisionId: null,
  };
}

function supporters(state: GameState): number {
  return Object.values(state.parlement!.groupes)
    .filter((g) => g.alignement === 'soutien')
    .reduce((sum, g) => sum + g.sieges, 0);
}

/** Groupes d'un bloc présents à l'Assemblée et qui ne soutiennent pas déjà le président. */
function partnerGroups(state: GameState, ruleset: Ruleset, bloc: string): string[] {
  const groups = ruleset.legislatives.blocs.find((b) => b.id === bloc)?.groupes ?? [];
  return groups.filter((g) => {
    const current = state.parlement!.groupes[g];
    return current && current.sieges > 0 && current.alignement !== 'soutien';
  });
}

const seatsOfGroups = (state: GameState, groups: readonly string[]) =>
  groups.reduce((sum, g) => sum + state.parlement!.groupes[g]!.sieges, 0);

/** Partenaires de coalition possibles (proximité avec le camp du président). */
function coalitionPartners(state: GameState, ruleset: Ruleset, president: Actor) {
  const camp = presidentBloc(ruleset, president);
  return ruleset.legislatives.blocs
    .map((b) => b.id)
    .filter((id) => id !== camp)
    .map((id) => ({
      id,
      d: blocDistance(ruleset, camp, id),
      groupes: partnerGroups(state, ruleset, id),
    }))
    .filter(
      (p) => p.groupes.length > 0 && p.d <= ruleset.legislatives.alliances.coalition.distanceMax,
    );
}

/** Les soutiens du président sont-ils minoritaires à l'Assemblée ? */
export function needsCoalition(state: GameState): boolean {
  return state.parlement !== null && supporters(state) < membersMajority(state.parlement);
}

export function coalitionDecision(
  state: GameState,
  ruleset: Ruleset,
  president: Actor,
): PendingDecision {
  const majority = membersMajority(state.parlement!);
  const current = supporters(state);
  const options: Option[] = [
    ...coalitionPartners(state, ruleset, president).map((p) => {
      const seats = seatsOfGroups(state, p.groupes);
      return {
        id: `coalition:${p.id}`,
        libelle: `Coalition avec le bloc « ${blocLabel(ruleset, p.id)} »`,
        description: `${current + seats} sièges avec ses ${seats} députés (majorité : ${majority}). Ses groupes soutiennent le gouvernement ; ses frondeurs sont plus nombreux.`,
      };
    }),
    {
      id: MINORITY,
      libelle: 'Gouverner en minorité',
      description: `${current} sièges de soutien pour ${majority} requis : chaque texte se négocie.`,
    },
  ];
  return {
    id: `c-${state.meta.week}-${COALITION_DECISION_EVENT}`,
    kind: 'alliance',
    eventId: COALITION_DECISION_EVENT,
    actorId: president.id,
    createdWeek: state.meta.week,
    label: 'Nouvelle Assemblée sans majorité : coalition ou gouvernement minoritaire',
    description: `Vos soutiens ont ${current} sièges ; la majorité des membres est de ${majority}. Acceptation des partenaires simulée selon la proximité des positions.`,
    options,
    defaultOptionId: aiCoalitionChoice(state, ruleset, president),
  };
}

/** Règle de l'IA : la coalition qui donne la majorité avec le partenaire le plus proche, sinon la plus nombreuse. */
export function aiCoalitionChoice(state: GameState, ruleset: Ruleset, president: Actor): string {
  const majority = membersMajority(state.parlement!);
  const current = supporters(state);
  const partners = coalitionPartners(state, ruleset, president).map((p) => ({
    ...p,
    total: current + seatsOfGroups(state, p.groupes),
  }));
  const winning = partners
    .filter((p) => p.total >= majority)
    .sort((a, b) => a.d - b.d || compareStrings(a.id, b.id));
  const best = winning[0] ?? [...partners].sort((a, b) => b.total - a.total || a.d - b.d)[0];
  return best ? `coalition:${best.id}` : MINORITY;
}

/** Forme la coalition retenue (ou constate le gouvernement minoritaire) ; renvoie un événement. */
export function answerCoalition(state: GameState, ruleset: Ruleset, optionId: string): ReportEvent {
  const parliament = state.parlement!;
  let label = 'Le président gouverne en minorité';
  if (optionId !== MINORITY) {
    const bloc = optionId.split(':')[1]!;
    const groupes = partnerGroups(state, ruleset, bloc);
    for (const g of groupes) parliament.groupes[g]!.alignement = 'soutien';
    parliament.coalition = { bloc, groupes, depuis: state.meta.week };
    label = `Coalition de gouvernement avec le bloc « ${blocLabel(ruleset, bloc)} »`;
  }
  updateTension(state, ruleset);
  return {
    id: `coalition-${state.meta.week}`,
    kind: 'evenement',
    refId: 'parlement',
    label,
    description: `Soutiens du président : ${supporters(state)} sièges sur ${Object.values(parliament.groupes).reduce((s, g) => s + g.sieges, 0)} (simulé).`,
    nature: 'simule',
    majeur: true,
    decisionId: null,
  };
}
