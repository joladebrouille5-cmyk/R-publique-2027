import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { card } from '../../components/ui';
import type { Portrait } from '../../portraits';

// Pièces de l'écran « Soirée électorale » : bandeau défilant, estimation, fil des départements.

const oneDecimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
/** Part (0 à 1) → « 28,3 % », à une décimale comme les estimations des soirées télévisées. */
export const percent = (share: number) => `${oneDecimal.format(share * 100)} %`;

export type TickerItem = { id: string; text: string; color?: string };

/** Secondes de défilement par élément : le bandeau garde la même vitesse de lecture. */
const SECONDS_PER_ITEM = 4.5;
/** Éléments au moins dans chaque moitié du bandeau, pour qu'il ne laisse jamais de vide. */
const MIN_ITEMS = 10;

/**
 * Bandeau défilant des estimations. Purement visuel (masqué aux lecteurs d'écran) : les mêmes
 * informations sont écrites dans le classement et les chiffres de la soirée. Contenu doublé : un
 * demi-défilement boucle sans à-coup ; immobile, et défilable à la main, si le mouvement réduit
 * est demandé.
 */
export function Ticker({ items, live }: { items: TickerItem[]; live: boolean }) {
  const repeat = Math.max(1, Math.ceil(MIN_ITEMS / Math.max(items.length, 1)));
  const half = Array.from({ length: repeat }, (_, copy) =>
    items.map((item) => ({ ...item, id: `${item.id}-${copy}` })),
  ).flat();
  return (
    <div
      aria-hidden="true"
      data-testid="bandeau-soiree"
      className="flex h-11 items-stretch overflow-hidden border-t border-white/10 bg-slate-950 text-white"
    >
      <span
        className={`z-10 flex shrink-0 items-center px-3 font-display text-base font-extrabold ${
          live ? 'bg-red-600 shadow-neon-rouge' : 'bg-republique-600 shadow-neon'
        }`}
      >
        {live ? 'Estimations' : 'Résultats'}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden motion-reduce:overflow-x-auto">
        <div
          className="flex h-full w-max animate-defile items-center hover:[animation-play-state:paused] motion-reduce:animate-none"
          style={{ animationDuration: `${half.length * SECONDS_PER_ITEM}s` }}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center">
              {half.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 border-l border-white/15 px-4 text-sm font-semibold whitespace-nowrap"
                >
                  {item.color && (
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: item.color }}
                    />
                  )}
                  {item.text}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

export type Standing = {
  key: string;
  name: string;
  player: boolean;
  portrait: Portrait;
  /** Estimation simulée (part des exprimés, 0 à 1). */
  estimation: number;
  /** Part des exprimés déjà dépouillés (0 à 1). */
  depouille: number;
  color: string;
  outcome: string | null;
};

/** Classement de l'estimation : barres à la couleur de chaque candidat sur la carte. */
export function Leaderboard({
  standings,
  heure,
  final,
}: {
  standings: Standing[];
  heure: string;
  final: boolean;
}) {
  const max = Math.max(...standings.map((s) => s.estimation), 0.0001);
  return (
    <section aria-labelledby="titre-estimation" className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-estimation" className="text-2xl">
          {final ? 'Résultats définitifs' : `Estimation à ${heure}`}
        </h2>
        <Badge tone="simule">{final ? 'Résultat simulé' : 'Estimation simulée'}</Badge>
      </div>
      <ol className="space-y-1.5">
        {standings.map((s) => (
          <li
            key={s.key}
            aria-label={`${s.name}${s.player ? ' (vous)' : ''} : ${percent(s.estimation)}`}
            className={`flex items-center gap-3 rounded-2xl p-2 transition-colors ${
              s.player
                ? 'bg-republique-50 ring-1 ring-republique-300 dark:bg-republique-500/10 dark:shadow-neon dark:ring-republique-400/50'
                : ''
            }`}
          >
            <Avatar portrait={s.portrait} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold">
                  {s.name}
                  {s.player && ' (vous)'}
                </span>
                <span className="font-display text-2xl leading-none font-extrabold tabular-nums">
                  {percent(s.estimation)}
                </span>
              </p>
              <span
                aria-hidden="true"
                className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
              >
                <span
                  className="block h-full rounded-full transition-[width] duration-700 ease-sortie"
                  style={{ width: `${(s.estimation / max) * 100}%`, backgroundColor: s.color }}
                />
              </span>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600 dark:text-slate-400">
                <span>Bureaux dépouillés : {percent(s.depouille)}</span>
                {s.outcome && <Badge tone="succes">{s.outcome}</Badge>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type FeedItem = {
  id: string;
  heure: string;
  territoire: string;
  leader: string;
  part: string;
  color: string;
};

/** Fil des départements entièrement dépouillés, le plus récent en tête. */
export function Feed({ items }: { items: FeedItem[] }) {
  return (
    <section aria-labelledby="titre-fil-soiree" className={`${card} space-y-2`}>
      <h2 id="titre-fil-soiree" className="text-2xl">
        Départements dépouillés
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Aucun département entièrement dépouillé pour l’instant.
        </p>
      ) : (
        <ol
          aria-labelledby="titre-fil-soiree"
          tabIndex={0}
          className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl pr-1"
        >
          {items.map((item) => (
            <li key={item.id} className="flex animate-apparait items-start gap-2 text-sm">
              <span className="w-14 shrink-0 font-display font-bold text-slate-600 tabular-nums dark:text-slate-400">
                {item.heure}
              </span>
              <span
                aria-hidden="true"
                className="mt-1 size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: item.color }}
              />
              <span>
                <strong className="font-semibold">{item.territoire}</strong> : {item.leader} en tête
                ({item.part})
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
