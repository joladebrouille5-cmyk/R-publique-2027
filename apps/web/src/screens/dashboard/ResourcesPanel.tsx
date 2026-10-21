import { RESOURCE_KEYS, type Resources, type Ruleset } from '@r2027/shared';
import { Badge } from '../../components/Badge';
import { card } from '../../components/ui';
import { formatResource, RESOURCE_LABELS } from '../../labels';

export function ResourcesPanel({ resources, ruleset }: { resources: Resources; ruleset: Ruleset }) {
  return (
    <section aria-labelledby="titre-ressources" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titre-ressources" className="text-lg font-semibold">
          Ressources de campagne
        </h2>
        <Badge tone="simule">Valeurs simulées</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {RESOURCE_KEYS.map((key) => (
          <div key={key} className={card}>
            <dt className="text-xs text-slate-500 dark:text-slate-400">{RESOURCE_LABELS[key]}</dt>
            <dd className="mt-1 text-lg font-semibold" data-testid={`ressource-${key}`}>
              {formatResource(key, resources[key])}
            </dd>
            {key === 'tempsHeures' && (
              <dd className="text-xs text-slate-500 dark:text-slate-400">
                sur {ruleset.jeu.tempsHebdomadaireHeures} h cette semaine
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
