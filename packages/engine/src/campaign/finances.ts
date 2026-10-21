import {
  candidateName,
  type Actor,
  type CampaignEffect,
  type Factor,
  type FactorSource,
  type FinanceChange,
  type FinancesState,
  type GameState,
  type ReceiptKind,
  type RefusedDonation,
  type Ruleset,
} from '@r2027/shared';
import { compareStrings, type Ledger } from '../core/ledger';
import type { Rng } from '../core/rng';

// Compte de campagne (§6) selon les règles officielles versionnées (guide CNCCFP 2027) :
// plafonds de dépenses, dons des personnes physiques plafonnés, dons interdits refusés,
// emprunts, avance forfaitaire et remboursement prévisionnel. Toute variation de la trésorerie
// passe par le registre (Ledger) ET par le compte : trésorerie = recettes − dépenses.

const MAX_REFUSALS_KEPT = 12;

/** « 4 600 € » (séparateur insécable fin, indépendant de la langue du système). */
export function formatEuros(centimes: number): string {
  const euros = Math.round(centimes / 100);
  const digits = Math.abs(euros)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${euros < 0 ? '−' : ''}${digits} €`;
}

export function emptyFinances(): FinancesState {
  return {
    recettes: { parti: 0, apportPersonnel: 0, dons: 0, emprunts: 0, avance: 0, autres: 0 },
    depenses: 0,
    donateurs: 0,
    refus: { nombre: 0, montantCentimes: 0, derniers: [] },
    emprunts: [],
    depassement: null,
    remboursementPrevisionnel: null,
  };
}

/**
 * Compte d'ouverture : les fonds de départ proviennent du parti et, pour une part fixée par
 * le jeu de règles (hypothèse), de l'apport personnel du candidat.
 */
export function openingAccount(budgetCentimes: number, ruleset: Ruleset): FinancesState {
  const finances = emptyFinances();
  const apport = Math.round(budgetCentimes * ruleset.finances.jeu.partApportPersonnelInitial);
  finances.recettes.apportPersonnel = apport;
  finances.recettes.parti = budgetCentimes - apport;
  return finances;
}

/** Plafond applicable : celui du second tour pour un finaliste, sinon celui du premier. */
export function spendingCap(state: GameState, actorId: string, ruleset: Ruleset): number {
  const t1 = state.elections.t1;
  const finalist = t1 !== null && t1.winner === null && t1.qualified.includes(actorId);
  return finalist ? ruleset.finances.plafondT2Centimes : ruleset.finances.plafondT1Centimes;
}

/** Arrondi stochastique : partie entière, plus 1 avec une probabilité égale à la partie décimale. */
export function stochasticRound(value: number, rng: Rng): number {
  const floor = Math.floor(value);
  return floor + (rng.nextFloat() < value - floor ? 1 : 0);
}

/**
 * Registre hebdomadaire du compte de campagne : applique chaque mouvement de trésorerie par le
 * Ledger (facteurs explicatifs) et l'impute au compte (recette par origine ou dépense).
 */
export class FinanceBook {
  private readonly changes = new Map<string, FinanceChange>();

  constructor(
    private readonly state: GameState,
    private readonly ruleset: Ruleset,
    private readonly ledger: Ledger,
  ) {}

  private change(actorId: string): FinanceChange {
    let change = this.changes.get(actorId);
    if (!change) {
      change = { actorId, depenses: 0, recettes: {}, donateurs: 0, refus: [], notes: [] };
      this.changes.set(actorId, change);
    }
    return change;
  }

  private account(actorId: string): FinancesState {
    const actor = this.state.actors[actorId];
    if (!actor) throw new Error(`Acteur inconnu : ${actorId}`);
    return actor.finances;
  }

  /** Recette d'une origine donnée ; renvoie le montant effectivement encaissé. */
  receive(
    actorId: string,
    kind: ReceiptKind,
    amount: number,
    label: string,
    source: FactorSource,
    step: number,
  ): number {
    if (amount <= 0) return 0;
    const received = this.ledger.apply(actorId, 'budgetCentimes', [
      { label, value: amount, source, step },
    ]);
    this.account(actorId).recettes[kind] += received;
    const change = this.change(actorId);
    change.recettes[kind] = (change.recettes[kind] ?? 0) + received;
    return received;
  }

  /** Dépense électorale ; renvoie le montant effectivement payé (jamais plus que la trésorerie). */
  spend(
    actorId: string,
    amount: number,
    label: string,
    source: FactorSource,
    step: number,
  ): number {
    if (amount <= 0) return 0;
    const paid = -this.ledger.apply(actorId, 'budgetCentimes', [
      { label, value: -amount, source, step },
    ]);
    this.recordExpense(actorId, paid);
    return paid;
  }

  /**
   * Variation de trésorerie issue d'un effet générique (événement, décision, effet différé) :
   * une hausse est une recette « autres », une baisse une dépense.
   */
  applyEffect(actorId: string, factors: Factor[]): void {
    const delta = this.ledger.apply(actorId, 'budgetCentimes', factors);
    if (delta > 0) {
      this.account(actorId).recettes.autres += delta;
      const change = this.change(actorId);
      change.recettes.autres = (change.recettes.autres ?? 0) + delta;
    } else if (delta < 0) {
      this.recordExpense(actorId, -delta);
    }
  }

  private recordExpense(actorId: string, amount: number): void {
    if (amount <= 0) return;
    this.account(actorId).depenses += amount;
    this.change(actorId).depenses += amount;
    this.detectOverspend(actorId);
  }

  /** Dépassement du plafond légal : constaté une fois, avec son montant (§6, test clé). */
  private detectOverspend(actorId: string): void {
    const cap = spendingCap(this.state, actorId, this.ruleset);
    const account = this.account(actorId);
    if (account.depenses <= cap) return;
    const excess = account.depenses - cap;
    if (account.depassement === null) {
      account.depassement = { semaine: this.state.meta.week, montantCentimes: excess };
      this.note(
        actorId,
        `Dépassement du plafond légal de ${formatEuros(excess)} (plafond ${formatEuros(cap)}) : le compte de campagne risque le rejet et le remboursement est perdu.`,
      );
    } else {
      account.depassement.montantCentimes = excess;
    }
  }

  refuse(actorId: string, refusal: RefusedDonation): void {
    const refus = this.account(actorId).refus;
    refus.nombre += 1;
    refus.montantCentimes += refusal.montantCentimes;
    refus.derniers = [...refus.derniers, refusal].slice(-MAX_REFUSALS_KEPT);
    this.change(actorId).refus.push(refusal);
  }

  addDonors(actorId: string, count: number): void {
    if (count <= 0) return;
    this.account(actorId).donateurs += count;
    this.change(actorId).donateurs += count;
  }

  note(actorId: string, text: string): void {
    this.change(actorId).notes.push(text);
  }

  /** Mouvements de la semaine, par acteur (ordre stable). */
  list(): FinanceChange[] {
    return [...this.changes.values()].sort((a, b) => compareStrings(a.actorId, b.actorId));
  }
}

const LAW = 'art. L. 52-8 du Code électoral';

/**
 * Offres de dons d'une collecte ou d'un élan de générosité. Les dons des personnes physiques
 * sont plafonnés ; les dons de personnes morales et les espèces au-delà du seuil sont refusés
 * en entier. Le joueur ne peut jamais choisir d'accepter un don interdit.
 */
export function processDonations(
  book: FinanceBook,
  ruleset: Ruleset,
  actorId: string,
  dons: NonNullable<CampaignEffect['dons']>,
  rng: Rng,
  label: string,
  source: FactorSource,
  step: number,
  week: number,
): void {
  const { donMaxCentimes, donEspecesMaxCentimes } = ruleset.finances;
  const spread = dons.donateurs.ecart;
  const donors = Math.max(
    0,
    dons.donateurs.base + (spread ? rng.nextInt(2 * spread + 1) - spread : 0),
  );
  let accepted = donors * dons.montantMoyenCentimes;
  let acceptedDonors = donors;

  if (rng.nextFloat() < dons.probaDepassement) {
    // Une personne veut donner plus que le maximum légal : seul le maximum est encaissé.
    const offer = donMaxCentimes + 100 * (1 + rng.nextInt(Math.round(donMaxCentimes / 100)));
    accepted += donMaxCentimes;
    acceptedDonors += 1;
    book.refuse(actorId, {
      semaine: week,
      origine: 'depassement',
      montantCentimes: offer - donMaxCentimes,
      motif: `Don de ${formatEuros(offer)} ramené à ${formatEuros(donMaxCentimes)} : maximum par personne et par élection (${LAW}).`,
    });
  }
  if (rng.nextFloat() < dons.probaEspeces) {
    const offer = donEspecesMaxCentimes + 100 * (50 + rng.nextInt(800));
    book.refuse(actorId, {
      semaine: week,
      origine: 'especes',
      montantCentimes: offer,
      motif: `Don de ${formatEuros(offer)} en espèces refusé : au-delà de ${formatEuros(donEspecesMaxCentimes)}, un don se fait par chèque, virement ou carte (${LAW}).`,
    });
  }
  if (rng.nextFloat() < dons.probaPersonneMorale) {
    const offer = 100 * (5_000 + rng.nextInt(45_001));
    book.refuse(actorId, {
      semaine: week,
      origine: 'personne_morale',
      montantCentimes: offer,
      motif: `Offre d'une entreprise (${formatEuros(offer)}) refusée : seules les personnes physiques et les partis peuvent financer une campagne (${LAW}).`,
    });
  }
  book.addDonors(actorId, acceptedDonors);
  book.receive(
    actorId,
    'dons',
    accepted,
    `${label} : dons de ${acceptedDonors} personnes`,
    source,
    step,
  );
}

/** Remboursement maximal attendu, d'après le dernier score connu (premier tour) ou les intentions. */
export function expectedReimbursementCap(ruleset: Ruleset, share: number): number {
  const { remboursement, plafondT1Centimes } = ruleset.finances;
  const rate =
    share >= remboursement.seuilExprimes ? remboursement.tauxAuDessus : remboursement.tauxSousSeuil;
  return Math.floor(plafondT1Centimes * rate);
}

/**
 * Demande de prêt bancaire (hypothèse de jeu) : la banque prête tant que le total emprunté reste
 * couvert par le remboursement forfaitaire attendu au vu des dernières intentions de vote.
 */
export function requestLoan(
  book: FinanceBook,
  state: GameState,
  ruleset: Ruleset,
  actorId: string,
  amount: number,
  label: string,
  step: number,
): void {
  const actor = state.actors[actorId]!;
  const intentions = state.opinion?.intentions[actorId] ?? 0;
  const share = intentions / 10_000;
  const cap = expectedReimbursementCap(ruleset, share);
  const borrowed = actor.finances.recettes.emprunts;
  const { tauxAnnuel, seuilIntentions } = ruleset.finances.jeu.emprunt;
  if (borrowed + amount > cap) {
    book.note(
      actorId,
      `Prêt de ${formatEuros(amount)} refusé par la banque : ${formatEuros(borrowed)} déjà empruntés pour un remboursement attendu d'au plus ${formatEuros(cap)} (intentions ${(intentions / 100).toFixed(1).replace('.', ',')} %${intentions < seuilIntentions ? `, sous le seuil de ${seuilIntentions / 100} %` : ''}).`,
    );
    return;
  }
  const received = book.receive(actorId, 'emprunts', amount, label, 'action', step);
  actor.finances.emprunts.push({
    semaine: state.meta.week,
    montantCentimes: received,
    tauxAnnuel,
  });
  book.note(
    actorId,
    `Prêt bancaire de ${formatEuros(received)} accordé (taux annuel ${(tauxAnnuel * 100).toFixed(1).replace('.', ',')} %), à rembourser après le scrutin.`,
  );
}

/**
 * Remboursement forfaitaire prévisionnel (guide CNCCFP) : un pourcentage du plafond selon le
 * score, dans la limite des dépenses et de l'apport personnel (emprunts du candidat compris,
 * hypothèse), avance déduite. Rien en cas de dépassement du plafond.
 */
export function provisionalReimbursement(
  actor: Actor,
  ruleset: Ruleset,
  shareFirstRound: number,
  secondRound: boolean,
): number {
  const { remboursement, plafondT1Centimes, plafondT2Centimes } = ruleset.finances;
  if (actor.finances.depassement) return 0;
  const cap = secondRound
    ? Math.floor(plafondT2Centimes * remboursement.tauxAuDessus)
    : shareFirstRound >= remboursement.seuilExprimes
      ? Math.floor(plafondT1Centimes * remboursement.tauxAuDessus)
      : Math.floor(plafondT1Centimes * remboursement.tauxSousSeuil);
  const contribution = actor.finances.recettes.apportPersonnel + actor.finances.recettes.emprunts;
  const gross = Math.min(cap, actor.finances.depenses, contribution);
  return Math.max(0, gross - actor.finances.recettes.avance);
}

/** Avance forfaitaire versée aux candidats dont la candidature est validée. */
export function payAdvance(book: FinanceBook, ruleset: Ruleset, actor: Actor, step: number): void {
  const amount = ruleset.finances.avanceForfaitaireCentimes;
  book.receive(
    actor.id,
    'avance',
    amount,
    `Avance forfaitaire de l'État (candidature de ${candidateName(actor.candidate)} validée)`,
    'calendrier',
    step,
  );
}
