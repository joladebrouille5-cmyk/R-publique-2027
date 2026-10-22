import { candidateName, type Proposal, type Ruleset } from '@r2027/shared';
import { Link } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { buttonPrimary, buttonSecondary, card, screenTitle } from '../components/ui';
import { CONFIDENCE_LABELS, formatAnnualCost } from '../labels';
import { useWeeklyPlan } from '../stores/plan';
import { useCurrentGame } from './GameLayout';

const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(2).replace('.', ',')}`;

/** Motif pour lequel une proposition ne peut pas être annoncée (règles du jeu de règles). */
function announceBlocker(
  proposal: Proposal,
  planned: readonly string[],
  ruleset: Ruleset,
  label: (id: string) => string,
): string | null {
  const missing = proposal.dependances.filter((d) => !planned.includes(d));
  if (missing.length) return `Suppose d’abord : ${missing.map(label).join(', ')}.`;
  const conflict = proposal.incompatibilites.find((d) => planned.includes(d));
  if (conflict) return `Incompatible avec « ${label(conflict)} ».`;
  if (planned.length >= ruleset.programme.maxPropositions)
    return `Programme complet (${ruleset.programme.maxPropositions} propositions).`;
  return null;
}

/**
 * Écran Programme (§6) : propositions des 17 domaines avec coût, délai, faisabilité,
 * dépendances, effets et niveau de confiance. Les annonces et retraits entrent dans le plan de
 * la semaine et sont appliqués à sa résolution (le serveur les revalide).
 */
export function Programme() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const plan = useWeeklyPlan(game.id, game.week);
  const { state } = game;
  const actor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const editable =
    actor !== undefined &&
    (actor.status === 'candidat' || actor.status === 'qualifie') &&
    state.calendar.blockedBy === null;

  if (ruleset.isError)
    return <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />;
  if (!ruleset.data) return <p>Chargement du jeu de règles…</p>;
  const rules = ruleset.data;
  const proposals = new Map(rules.programme.propositions.map((p) => [p.id, p]));
  const label = (id: string) => proposals.get(id)?.libelle ?? id;
  const groups = new Map(rules.electorat.groupes.map((g) => [g.id, g.libelle]));
  const current = actor?.programme.propositions ?? [];
  // Programme tel qu'il sera après la semaine : retraits puis annonces.
  const planned = [...current.filter((id) => !plan.retirer.includes(id)), ...plan.ajouter];
  const cost = planned.reduce((sum, id) => sum + (proposals.get(id)?.coutMillionsEuros ?? 0), 0);
  const breakdown = actor ? state.opinion?.breakdown[actor.id] : undefined;
  const factor = (name: string) => breakdown?.find((f) => f.label === name)?.value;
  const opponents = Object.values(state.actors).filter((a) => a.kind === 'adversaire');
  const holders = (id: string) =>
    opponents.filter((o) => o.programme.propositions.includes(id)).map((o) => o.candidate.parti);

  return (
    <section aria-labelledby="titre-programme" className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="titre-programme" className={screenTitle}>
          Programme
        </h1>
        <Badge tone="alerte">Estimations de jeu</Badge>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">{rules.programme.note}</p>

      {actor && (
        <section aria-labelledby="titre-mon-programme" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-mon-programme" className="text-lg font-semibold">
            Votre programme
          </h2>
          <p>
            <strong>{planned.length}</strong> proposition(s) sur {rules.programme.maxPropositions}{' '}
            possibles après cette semaine · coût annuel estimé :{' '}
            <strong>{formatAnnualCost(cost)}</strong> (soutenable jusqu’à{' '}
            {formatAnnualCost(rules.programme.coutSoutenable)}) · {actor.programme.revirements}{' '}
            revirement(s).
          </p>
          {factor('Programme') !== undefined && (
            <p>
              Dans le dernier calcul des intentions de vote (semaine {state.opinion!.week}), attrait
              du programme {signed(factor('Programme')!)} et crédibilité{' '}
              {signed(factor('Crédibilité')!)} (contributions moyennes au score).
            </p>
          )}
          {(plan.ajouter.length > 0 || plan.retirer.length > 0) && (
            <p className="text-amber-800 dark:text-amber-300" aria-live="polite">
              Prévu cette semaine : {plan.ajouter.length} annonce(s) (
              {plan.ajouter.length * rules.programme.heuresParProposition} h de préparation),{' '}
              {plan.retirer.length} retrait(s). Appliqué en résolvant la semaine depuis le{' '}
              <Link to="../tableau-de-bord" className="underline">
                tableau de bord
              </Link>
              .
            </p>
          )}
          {!editable && (
            <p className="text-slate-600 dark:text-slate-400">
              Le programme ne peut plus évoluer : vous n’êtes plus en campagne.
            </p>
          )}
        </section>
      )}
      {!actor && (
        <p className="text-sm">
          Mode observateur : consultation des propositions et des programmes des candidats.
        </p>
      )}

      <div className="space-y-3">
        {rules.programme.domaines.map((domaine) => {
          const items = rules.programme.propositions.filter((p) => p.domaine === domaine.id);
          const mine = items.filter((p) => planned.includes(p.id)).length;
          return (
            <details key={domaine.id} className={card} open={mine > 0}>
              <summary className="cursor-pointer font-semibold">
                {domaine.libelle}{' '}
                <span className="font-normal text-slate-600 dark:text-slate-400">
                  — {mine} retenue(s) sur {items.length}
                </span>
              </summary>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {items.map((p) => {
                  const inProgramme = current.includes(p.id);
                  const toAdd = plan.ajouter.includes(p.id);
                  const toRemove = plan.retirer.includes(p.id);
                  const blocker =
                    inProgramme || toAdd
                      ? null
                      : announceBlocker(
                          p,
                          planned.filter((id) => id !== p.id),
                          rules,
                          label,
                        );
                  const parties = holders(p.id);
                  return (
                    <li
                      key={p.id}
                      aria-label={p.libelle}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{p.libelle}</p>
                        {inProgramme && !toRemove && (
                          <Badge tone="succes">Dans votre programme</Badge>
                        )}
                        {toAdd && <Badge tone="alerte">Annonce prévue</Badge>}
                        {toRemove && <Badge tone="danger">Retrait prévu</Badge>}
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{p.description}</p>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-slate-500 dark:text-slate-400">Coût</dt>
                        <dd>{formatAnnualCost(p.coutMillionsEuros)}</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Délai</dt>
                        <dd>{p.delaiMois} mois</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Faisabilité</dt>
                        <dd>{Math.round(p.faisabilite * 100)} %</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Confiance</dt>
                        <dd>{CONFIDENCE_LABELS[p.confiance]}</dd>
                        <dt className="text-slate-500 dark:text-slate-400">Électeurs sensibles</dt>
                        <dd>{p.publics.map((g) => groups.get(g) ?? g).join(', ') || '—'}</dd>
                        {p.dependances.length > 0 && (
                          <>
                            <dt className="text-slate-500 dark:text-slate-400">Suppose</dt>
                            <dd>{p.dependances.map(label).join(', ')}</dd>
                          </>
                        )}
                        {p.incompatibilites.length > 0 && (
                          <>
                            <dt className="text-slate-500 dark:text-slate-400">
                              Incompatible avec
                            </dt>
                            <dd>{p.incompatibilites.map(label).join(', ')}</dd>
                          </>
                        )}
                        {parties.length > 0 && (
                          <>
                            <dt className="text-slate-500 dark:text-slate-400">Portée par</dt>
                            <dd>{parties.join(', ')}</dd>
                          </>
                        )}
                      </dl>
                      {editable && (
                        <div className="mt-auto flex flex-wrap items-center gap-2">
                          {inProgramme ? (
                            <button
                              type="button"
                              className={`${buttonSecondary} px-3 py-1.5`}
                              onClick={() => plan.toggleWithdraw(p.id)}
                              aria-label={
                                toRemove
                                  ? `Garder ${p.libelle}`
                                  : `Retirer ${p.libelle} du programme`
                              }
                            >
                              {toRemove ? 'Garder' : 'Retirer'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`${toAdd ? buttonSecondary : buttonPrimary} px-3 py-1.5`}
                              disabled={!toAdd && blocker !== null}
                              onClick={() => plan.toggleAnnounce(p.id)}
                              aria-label={
                                toAdd ? `Ne pas annoncer ${p.libelle}` : `Annoncer ${p.libelle}`
                              }
                            >
                              {toAdd ? 'Ne pas annoncer' : 'Annoncer'}
                            </button>
                          )}
                          {!toAdd && !inProgramme && blocker && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {blocker}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>

      <section aria-labelledby="titre-programmes-adverses" className={`${card} space-y-3`}>
        <h2 id="titre-programmes-adverses" className="text-lg font-semibold">
          Programmes des autres candidats
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {opponents.map((o) => (
            <li key={o.id} className="text-sm">
              <p className="font-semibold">
                {candidateName(o.candidate)} ({o.candidate.parti})
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                {o.candidate.nature === 'reel'
                  ? 'Personnalité réelle : le jeu ne lui prête aucune proposition.'
                  : o.programme.propositions.map(label).join(' · ') || 'Aucune proposition'}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
