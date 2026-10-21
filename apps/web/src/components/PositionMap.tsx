import type { Position } from '@r2027/shared';

export type MapCandidate = {
  id: string;
  /** Nom du candidat (tableau des positions). */
  name: string;
  /** Étiquette courte de la marque (parti). */
  label: string;
  title: string;
  position: Position;
  player: boolean;
};

/** Au-delà, seules les marques du joueur portent une étiquette ; le tableau donne le reste. */
const MAX_DIRECT_LABELS = 8;

/** Candidats de même position réunis en une seule marque (même parti, par exemple). */
function marks(candidates: MapCandidate[]) {
  const byPosition = new Map<string, MapCandidate[]>();
  for (const c of candidates) {
    const key = `${c.position.economie},${c.position.societe}`;
    byPosition.set(key, [...(byPosition.get(key) ?? []), c]);
  }
  return [...byPosition.values()].map((members) => ({
    key: members.map((m) => m.id).join('+'),
    position: members[0]!.position,
    members,
    player: members.some((m) => m.player),
  }));
}
export type MapGroup = { id: string; label: string; share: number; position: Position };

/**
 * Carte des positionnements (économie en abscisse, société en ordonnée, conservateur en haut).
 * Forme « mise en avant » : votre candidat dans la couleur d'accent, les autres en gris, les
 * groupes d'électeurs en disques clairs dont l'aire suit leur poids. Des candidats de même
 * position partagent une marque ; au-delà de huit candidats, seule la marque du joueur porte
 * une étiquette. Le tableau des positions est la vue de référence ; chaque marque porte une
 * infobulle native.
 */
export function PositionMap({
  candidates,
  groups,
}: {
  candidates: MapCandidate[];
  groups: MapGroup[];
}) {
  const y = (position: Position) => -position.societe;
  const crowded = candidates.length > MAX_DIRECT_LABELS;
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
  return (
    <figure className="space-y-2">
      <svg
        viewBox="-125 -112 250 224"
        role="img"
        aria-label="Positionnement des candidats et des groupes d’électeurs sur les axes économique et sociétal"
        className="mx-auto block w-full max-w-lg text-slate-500 dark:text-slate-400"
      >
        <rect
          x={-100}
          y={-100}
          width={200}
          height={200}
          className="fill-none stroke-slate-200 dark:stroke-slate-700"
          strokeWidth={0.6}
        />
        <line
          x1={-100}
          x2={100}
          y1={0}
          y2={0}
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth={0.6}
        />
        <line
          x1={0}
          x2={0}
          y1={-100}
          y2={100}
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth={0.6}
        />
        <g fontSize={7} fill="currentColor">
          <text x={-100} y={108}>
            ← Gauche · ↓ Progressiste
          </text>
          <text x={100} y={108} textAnchor="end">
            Droite →
          </text>
          <text x={-100} y={-103}>
            ↑ Conservateur
          </text>
        </g>
        {groups.map((group) => (
          <circle
            key={group.id}
            cx={group.position.economie}
            cy={y(group.position)}
            r={Math.sqrt(group.share) * 30}
            className="fill-slate-300/40 dark:fill-slate-600/40"
          >
            <title>{`${group.label} — ${Math.round(group.share * 100)} % des inscrits (hypothèse)`}</title>
          </circle>
        ))}
        {marks(candidates).map((mark) => {
          const label = crowded
            ? mark.members.find((m) => m.player)?.label
            : [...new Set(mark.members.map((m) => m.label))].join(' · ');
          return (
            <g key={mark.key}>
              <circle
                cx={mark.position.economie}
                cy={y(mark.position)}
                r={mark.members.length > 1 ? 4.2 : 3.2}
                strokeWidth={1.3}
                className={`stroke-white dark:stroke-slate-900 ${mark.player ? 'fill-republique-600 dark:fill-republique-500' : 'fill-slate-600 dark:fill-slate-300'}`}
              >
                <title>{mark.members.map((m) => m.title).join(' ; ')}</title>
              </circle>
              {label && (
                <text
                  x={mark.position.economie}
                  y={y(mark.position) - 6}
                  textAnchor="middle"
                  fontSize={7}
                  fontWeight={mark.player ? 700 : 500}
                  className="fill-slate-800 dark:fill-slate-100"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full bg-republique-600 dark:bg-republique-500" />{' '}
          Votre candidat
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full bg-slate-600 dark:bg-slate-300" />{' '}
          Autres candidats
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-full bg-slate-300/60 dark:bg-slate-600/60" />{' '}
          Groupes d’électeurs (aire = poids, hypothèse de jeu)
        </span>
        <span>Haut : conservateur · bas : progressiste</span>
      </figcaption>
      <details open={crowded} className="text-sm">
        <summary className="cursor-pointer text-xs font-medium">Tableau des positions</summary>
        <div
          className="relative mt-2 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Positions, tableau défilant"
        >
          <table className="w-full min-w-[22rem] text-left text-xs">
            <caption className="sr-only">Positions des candidats (−100 à +100)</caption>
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-1 font-medium">
                  Candidat
                </th>
                <th scope="col" className="py-1 font-medium">
                  Parti
                </th>
                <th scope="col" className="py-1 pl-2 text-right font-medium">
                  Économie
                </th>
                <th scope="col" className="py-1 pl-2 text-right font-medium">
                  Société
                </th>
              </tr>
            </thead>
            <tbody>
              {[...candidates]
                .sort(
                  (a, b) =>
                    a.position.economie - b.position.economie || a.name.localeCompare(b.name, 'fr'),
                )
                .map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <th
                      scope="row"
                      className={`py-1 pr-2 ${c.player ? 'font-semibold' : 'font-normal'}`}
                    >
                      {c.name}
                      {c.player ? ' (vous)' : ''}
                    </th>
                    <td className="py-1 pr-2">{c.label.replace(/ \(vous\)$/, '')}</td>
                    <td className="py-1 pl-2 text-right tabular-nums">
                      {signed(c.position.economie)}
                    </td>
                    <td className="py-1 pl-2 text-right tabular-nums">
                      {signed(c.position.societe)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Économie : −100 gauche … +100 droite ; société : −100 progressiste … +100 conservateur.
        </p>
      </details>
    </figure>
  );
}
