import type { Position } from '@r2027/shared';

export type MapCandidate = {
  id: string;
  label: string;
  title: string;
  position: Position;
  player: boolean;
};
export type MapGroup = { id: string; label: string; share: number; position: Position };

/**
 * Carte des positionnements (économie en abscisse, société en ordonnée, conservateur en haut).
 * Forme « mise en avant » : votre candidat dans la couleur d'accent, les autres en gris, les
 * groupes d'électeurs en disques clairs dont l'aire suit leur poids. Le tableau des candidats
 * reste la vue de référence ; chaque marque porte une infobulle native.
 */
export function PositionMap({
  candidates,
  groups,
}: {
  candidates: MapCandidate[];
  groups: MapGroup[];
}) {
  const y = (position: Position) => -position.societe;
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
        {candidates.map((candidate) => (
          <g key={candidate.id}>
            <circle
              cx={candidate.position.economie}
              cy={y(candidate.position)}
              r={3.2}
              strokeWidth={1.3}
              className={`stroke-white dark:stroke-slate-900 ${candidate.player ? 'fill-republique-600 dark:fill-republique-500' : 'fill-slate-600 dark:fill-slate-300'}`}
            >
              <title>{candidate.title}</title>
            </circle>
            <text
              x={candidate.position.economie}
              y={y(candidate.position) - 6}
              textAnchor="middle"
              fontSize={7}
              fontWeight={candidate.player ? 700 : 500}
              className="fill-slate-800 dark:fill-slate-100"
            >
              {candidate.label}
            </text>
          </g>
        ))}
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
    </figure>
  );
}
