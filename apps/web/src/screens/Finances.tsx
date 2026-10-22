import {
  candidateName,
  RECEIPT_KINDS,
  totalReceipts,
  type Actor,
  type GameState,
  type Ruleset,
} from '@r2027/shared';
import { useRuleset } from '../api/hooks';
import { spendingCapOf } from '../campaign';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card, screenTitle } from '../components/ui';
import { formatCount, formatEuros, RECEIPT_LABELS, REFUSAL_LABELS } from '../labels';
import { useCurrentGame } from './GameLayout';

const pct = (rate: number) => `${(rate * 100).toFixed(2).replace('.', ',').replace(',00', '')} %`;

function Account({ state, actor, ruleset }: { state: GameState; actor: Actor; ruleset: Ruleset }) {
  const f = actor.finances;
  const cap = spendingCapOf(state, actor, ruleset);
  const receipts = totalReceipts(f);
  return (
    <>
      <section aria-labelledby="titre-synthese" className={`${card} space-y-3 text-sm`}>
        <h2 id="titre-synthese" className="text-lg font-semibold">
          Votre compte de campagne
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Recettes', formatEuros(receipts)],
            ['Dépenses électorales', formatEuros(f.depenses)],
            ['Trésorerie', formatEuros(actor.resources.budgetCentimes)],
            ['Plafond applicable', formatEuros(cap)],
          ].map(([term, value]) => (
            <div key={term}>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{term}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <meter
          className="h-3 w-full"
          min={0}
          max={cap}
          value={Math.min(f.depenses, cap)}
          high={cap * 0.9}
          aria-label="Dépenses par rapport au plafond légal"
        />
        <p>
          {state.campagne.finances === 'complet'
            ? 'Trésorerie = recettes − dépenses : chaque mouvement passe par ce compte.'
            : 'Partie créée avant la phase 5 : le compte a été ouvert avec la trésorerie du moment ; les dépenses antérieures ne sont pas comptabilisées.'}{' '}
          Une action qui porterait les dépenses au-delà du plafond est refusée.
        </p>
        {f.depassement && (
          <p role="alert" className="font-semibold text-red-700 dark:text-red-300">
            Dépassement du plafond constaté en semaine {f.depassement.semaine} :{' '}
            {formatEuros(f.depassement.montantCentimes)}. Le compte risque le rejet et aucun
            remboursement n’est dû.
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="titre-recettes" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-recettes" className="text-lg font-semibold">
            Recettes par origine
          </h2>
          <table className="w-full text-left">
            <caption className="sr-only">Recettes du compte de campagne par origine</caption>
            <tbody>
              {RECEIPT_KINDS.map((kind) => (
                <tr key={kind} className="border-t border-slate-100 dark:border-slate-800">
                  <th scope="row" className="py-1 font-normal">
                    {RECEIPT_LABELS[kind]}
                  </th>
                  <td className="py-1 text-right tabular-nums">{formatEuros(f.recettes[kind])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{formatCount(f.donateurs)} donateur(s) depuis le début de la campagne.</p>
        </section>

        <section aria-labelledby="titre-refus" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-refus" className="text-lg font-semibold">
            Dons refusés
          </h2>
          {f.refus.nombre === 0 ? (
            <p>Aucun don refusé.</p>
          ) : (
            <>
              <p>
                {formatCount(f.refus.nombre)} refus pour {formatEuros(f.refus.montantCentimes)}. La
                loi interdit ces dons : ils ne sont jamais encaissés.
              </p>
              <ul className="space-y-1" aria-label="Derniers dons refusés">
                {[...f.refus.derniers].reverse().map((r, i) => (
                  <li key={`${r.semaine}-${i}`}>
                    <span className="font-medium">
                      Semaine {r.semaine} — {REFUSAL_LABELS[r.origine]}
                    </span>{' '}
                    : {r.motif}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="titre-emprunts" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-emprunts" className="text-lg font-semibold">
            Emprunts
          </h2>
          {f.emprunts.length === 0 ? (
            <p>Aucun prêt bancaire.</p>
          ) : (
            <ul className="space-y-1">
              {f.emprunts.map((loan, i) => (
                <li key={i}>
                  Semaine {loan.semaine} : {formatEuros(loan.montantCentimes)} à{' '}
                  {pct(loan.tauxAnnuel)} par an, remboursable après le scrutin.
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titre-remboursement" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-remboursement" className="text-lg font-semibold">
            Remboursement par l’État
          </h2>
          {f.remboursementPrevisionnel === null ? (
            <p>
              Calculé après le premier tour, selon le score : au plus{' '}
              {pct(ruleset.finances.remboursement.tauxSousSeuil)} du plafond sous{' '}
              {pct(ruleset.finances.remboursement.seuilExprimes)} des suffrages exprimés, au plus{' '}
              {pct(ruleset.finances.remboursement.tauxAuDessus)} au-delà.
            </p>
          ) : (
            <p>
              Remboursement prévisionnel :{' '}
              <strong>{formatEuros(f.remboursementPrevisionnel)}</strong> (avance forfaitaire
              déduite), sous réserve de l’approbation du compte par la CNCCFP.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Écran Finances (§6) : compte de campagne selon les règles officielles versionnées (guide de
 * la CNCCFP 2027) — recettes, dépenses, dons autorisés et refusés, emprunts, plafonds.
 */
export function Finances() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const { state } = game;
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  if (ruleset.isError)
    return <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />;
  if (!ruleset.data) return <p>Chargement du jeu de règles…</p>;
  const rules = ruleset.data;
  const source = rules.sources[rules.finances.sourceId];
  const candidates = Object.values(state.actors).sort(
    (a, b) => b.finances.depenses - a.finances.depenses,
  );

  return (
    <section aria-labelledby="titre-finances" className="space-y-6">
      <h1 id="titre-finances" className={screenTitle}>
        Finances
      </h1>
      {actor ? (
        <Account state={state} actor={actor} ruleset={rules} />
      ) : (
        <p className="text-sm">Mode observateur : comptes des candidats ci-dessous.</p>
      )}

      <section aria-labelledby="titre-comptes" className={`${card} space-y-2 text-sm`}>
        <h2 id="titre-comptes" className="text-lg font-semibold">
          Dépenses des candidats (simulées)
        </h2>
        <div
          className="relative overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Dépenses des candidats, tableau défilant"
        >
          <table className="w-full min-w-[30rem] text-left">
            <caption className="sr-only">Dépenses et dons de chaque candidat</caption>
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-1 font-medium">
                  Candidat
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Dépenses
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Dons
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Emprunts
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                  <th scope="row" className="py-1 font-normal">
                    {candidateName(c.candidate)}
                    {c.id === state.player.actorId && ' (vous)'}
                  </th>
                  <td className="py-1 text-right tabular-nums">
                    {formatEuros(c.finances.depenses)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatEuros(c.finances.recettes.dons)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatEuros(c.finances.recettes.emprunts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="titre-regles" className={`${card} space-y-2 text-sm`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="titre-regles" className="text-lg font-semibold">
            Règles appliquées
          </h2>
          <Badge tone="succes">Règles officielles</Badge>
        </div>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Plafond des dépenses : {formatEuros(rules.finances.plafondT1Centimes)} pour un candidat
            du premier tour, {formatEuros(rules.finances.plafondT2Centimes)} pour un candidat du
            second tour.
          </li>
          <li>
            Dons des personnes physiques : au plus {formatEuros(rules.finances.donMaxCentimes)} par
            personne et par élection ; au-delà de{' '}
            {formatEuros(rules.finances.donEspecesMaxCentimes)}, par chèque, virement ou carte. Dons
            des personnes morales (autres que les partis) interdits.
          </li>
          <li>
            Avance forfaitaire de {formatEuros(rules.finances.avanceForfaitaireCentimes)} aux
            candidats retenus ; remboursement de {pct(rules.finances.remboursement.tauxSousSeuil)}{' '}
            ou {pct(rules.finances.remboursement.tauxAuDessus)} du plafond selon le score, dans la
            limite des dépenses et de l’apport personnel.
          </li>
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Source :{' '}
          {source?.url ? (
            <a href={source.url} className="underline" rel="noreferrer" target="_blank">
              {source.titre}
            </a>
          ) : (
            source?.titre
          )}
          . {rules.finances.note} Emprunts bancaires, part d’apport personnel des fonds de départ et
          montants des collectes : hypothèses de jeu.
        </p>
      </section>
    </section>
  );
}
