import { RESOURCE_KEYS, type ResourceKey, type Resources, type Ruleset } from '@r2027/shared';
import {
  Clock,
  Flame,
  Heart,
  Megaphone,
  Sprout,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../../components/Badge';
import { ScreenHeading } from '../../components/Disclosure';
import { formatResource, RESOURCE_LABELS } from '../../labels';

const ICONS: Record<ResourceKey, LucideIcon> = {
  budgetCentimes: Wallet,
  tempsHeures: Clock,
  militants: Users,
  notoriete: Megaphone,
  popularite: Heart,
  jeunesse: Sprout,
  dynamique: Flame,
};

/** Jauge des ressources exprimées en pourcentage (et du temps restant de la semaine). */
function gauge(key: ResourceKey, resources: Resources, ruleset: Ruleset): number | null {
  if (key === 'notoriete' || key === 'popularite' || key === 'jeunesse' || key === 'dynamique')
    return resources[key] / 10_000;
  if (key === 'tempsHeures') return resources.tempsHeures / ruleset.jeu.tempsHebdomadaireHeures;
  return null;
}

export function ResourcesPanel({ resources, ruleset }: { resources: Resources; ruleset: Ruleset }) {
  return (
    <section aria-labelledby="titre-ressources" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ScreenHeading id="titre-ressources" level={2} className="text-xl font-bold">
          Ressources de campagne
        </ScreenHeading>
        <Badge tone="simule">Valeurs simulées</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {RESOURCE_KEYS.map((key) => {
          const Icon = ICONS[key];
          const ratio = gauge(key, resources, ruleset);
          return (
            <div
              key={key}
              className="rounded-card border border-slate-200/80 bg-white p-3.5 shadow-card dark:border-slate-800 dark:bg-slate-900"
            >
              <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <Icon aria-hidden="true" className="size-3.5" />
                {RESOURCE_LABELS[key]}
              </dt>
              <dd
                className="mt-1 font-display text-2xl font-bold tracking-tight"
                data-testid={`ressource-${key}`}
              >
                {formatResource(key, resources[key])}
              </dd>
              {ratio !== null && (
                <dd
                  aria-hidden="true"
                  className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <span
                    className="block h-full rounded-full bg-republique-500 transition-[width] duration-700 ease-sortie dark:bg-republique-400 dark:shadow-lueur"
                    style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
                  />
                </dd>
              )}
              {key === 'tempsHeures' && (
                <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  sur {ruleset.jeu.tempsHebdomadaireHeures} h cette semaine
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
