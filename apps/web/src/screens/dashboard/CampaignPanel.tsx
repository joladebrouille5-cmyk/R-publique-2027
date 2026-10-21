import type { Actor, GameState, Ruleset } from '@r2027/shared';
import { Link } from 'react-router';
import {
  echeanceDate,
  nominationsClosed,
  presentationSummary,
  spendingCapOf,
} from '../../campaign';
import { Badge } from '../../components/Badge';
import { card } from '../../components/ui';
import { formatCount, formatEuros, formatGameDate } from '../../labels';

type Props = { state: GameState; actor: Actor; ruleset: Ruleset };

/** Parrainages et compte de campagne du joueur (phase 5), en un coup d'œil. */
export function CampaignPanel({ state, actor, ruleset }: Props) {
  const s = presentationSummary(actor.parrainages, ruleset);
  const closing = echeanceDate(ruleset, ruleset.parrainages.clotureEcheanceId);
  const closed = nominationsClosed(ruleset, state.meta.date);
  const cap = spendingCapOf(state, actor, ruleset);
  const spent = actor.finances.depenses;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-labelledby="titre-parrainages" className={`${card} space-y-3 text-sm`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="titre-parrainages" className="text-lg font-semibold">
            Parrainages
          </h2>
          {state.campagne.parrainages === 'modelise' &&
            (s.atteint ? (
              <Badge tone="succes">Seuil atteint</Badge>
            ) : (
              <Badge tone="alerte">Seuil non atteint</Badge>
            ))}
        </div>
        {state.campagne.parrainages === 'non_modelise' ? (
          <p>
            Partie créée avant la phase 5 : les parrainages ne sont pas modélisés, aucun candidat
            n’est écarté.
          </p>
        ) : (
          <>
            <p>
              <strong>{formatCount(s.comptees)}</strong> présentations comptées sur {s.seuil}{' '}
              requises, dans <strong>{s.departements}</strong> départements sur {s.departementsMin}{' '}
              (au plus {s.cap} comptées par département).
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Promesses', s.promesses],
                ['Intentions', s.intentions],
                ['Reçues', s.recues],
                ['Validées', s.validees],
              ].map(([term, value]) => (
                <div key={term}>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{term}</dt>
                  <dd className="font-semibold tabular-nums">{formatCount(Number(value))}</dd>
                </div>
              ))}
            </dl>
            {s.invalides > 0 && (
              <p className="text-xs">
                {formatCount(s.invalides)} présentation(s) invalidée(s) par le Conseil
                constitutionnel : elles ne comptent pas.
              </p>
            )}
            {closing && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {closed
                  ? `Présentations closes depuis le ${formatGameDate(closing)}.`
                  : `Clôture le ${formatGameDate(closing)} à 18 h. Les promesses se gagnent en rencontrant des élus locaux ; elles deviennent des intentions puis des présentations envoyées pendant la période d’envoi.`}
              </p>
            )}
          </>
        )}
      </section>
      <section aria-labelledby="titre-compte" className={`${card} space-y-3 text-sm`}>
        <h2 id="titre-compte" className="text-lg font-semibold">
          Compte de campagne
        </h2>
        <p>
          Dépenses : <strong>{formatEuros(spent)}</strong> sur un plafond légal de{' '}
          {formatEuros(cap)}.
        </p>
        <meter
          className="h-3 w-full"
          min={0}
          max={cap}
          value={Math.min(spent, cap)}
          high={cap * 0.9}
          aria-label="Dépenses par rapport au plafond légal"
        />
        {actor.finances.depassement && (
          <p role="alert" className="font-semibold text-red-700 dark:text-red-300">
            Dépassement du plafond constaté :{' '}
            {formatEuros(actor.finances.depassement.montantCentimes)}.
          </p>
        )}
        <Link to="../finances" className="text-republique-600 underline dark:text-republique-100">
          Détail du compte, dons et emprunts
        </Link>
      </section>
    </div>
  );
}
