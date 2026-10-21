import { candidateName, type GameState, type Ruleset } from '@r2027/shared';
import { Badge } from '../../components/Badge';
import { card } from '../../components/ui';

const TYPES = {
  television: 'télévision',
  radio: 'radio',
  presse: 'presse',
  numerique: 'numérique',
};
const PORTEES = { nationale: 'nationale', regionale: 'régionale' };

/** Organes de presse (fictifs) et couverture des candidats la semaine passée (§8). */
export function Media({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const domains = new Map(ruleset.programme.domaines.map((d) => [d.id, d.libelle]));
  const coverage = state.medias;
  const name = (id: string) => (state.actors[id] ? candidateName(state.actors[id].candidate) : id);
  return (
    <section aria-labelledby="titre-medias" className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titre-medias" className="text-lg font-semibold">
          Médias
        </h2>
        <Badge tone="fictif">Organes fictifs</Badge>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {coverage
          ? `Couverture de la semaine ${coverage.semaine} : exposition (part de l’attention de l’organe) et tonalité (−100 à +100). Elle dépend de la notoriété, des actions de la semaine (interviews, meetings) et de la rencontre entre programmes et priorités de chaque organe.`
          : 'La couverture médiatique sera calculée à la résolution de la première semaine.'}
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {ruleset.medias.organes.map((outlet) => {
          const rows = Object.entries(coverage?.couverture[outlet.id] ?? {})
            .sort(([, a], [, b]) => b.exposition - a.exposition)
            .slice(0, 4);
          return (
            <li
              key={outlet.id}
              aria-label={outlet.libelle}
              className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <p className="font-semibold">{outlet.libelle}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {TYPES[outlet.type]}, portée {PORTEES[outlet.portee]} · audience{' '}
                {Math.round(outlet.audience * 100)} % · crédibilité{' '}
                {Math.round(outlet.credibilite * 100)} % · priorités :{' '}
                {outlet.priorites.map((d) => domains.get(d) ?? d).join(', ')}
              </p>
              {rows.length > 0 && (
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">
                    Couverture des candidats par {outlet.libelle}
                  </caption>
                  <thead>
                    <tr className="text-slate-500 dark:text-slate-400">
                      <th scope="col" className="font-medium">
                        Candidat
                      </th>
                      <th scope="col" className="text-right font-medium">
                        Exposition
                      </th>
                      <th scope="col" className="text-right font-medium">
                        Tonalité
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([actorId, c]) => (
                      <tr key={actorId} className="border-t border-slate-100 dark:border-slate-800">
                        <th scope="row" className="py-0.5 font-normal">
                          {name(actorId)}
                          {actorId === state.player.actorId && ' (vous)'}
                        </th>
                        <td className="py-0.5 text-right tabular-nums">
                          {Math.round(c.exposition / 100)} %
                        </td>
                        <td className="py-0.5 text-right tabular-nums">
                          {c.tonalite > 0 ? '+' : ''}
                          {c.tonalite}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
