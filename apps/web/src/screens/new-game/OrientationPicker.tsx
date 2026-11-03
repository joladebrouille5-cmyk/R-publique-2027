import type { Orientation, ResourceKey } from '@r2027/shared';
import { useCurrentRuleset } from '../../api/hooks';
import { Badge } from '../../components/Badge';
import { label, optionTile, radio } from '../../components/ui';
import { formatDelta, RESOURCE_LABELS } from '../../labels';

// Orientation stratégique du mouvement (phase 15) : facultative, choisie à la création d'une
// partie avec un candidat du joueur. Ses écarts (moyens et promesses de parrainage de départ,
// base électorale de départ qui s'estompe) sont des hypothèses du jeu, affichées telles quelles.

const GROUPS: Record<Orientation['base']['groupes'], string> = {
  'plus-proche': 'le groupe d’électeurs le plus proche de vous',
  proches: 'les électeurs proches de vos positions',
  peripherie: 'les électorats éloignés du centre',
  tous: 'tous les électeurs',
};

function effects(orientation: Orientation, weeks: number): string[] {
  const entries = Object.entries(orientation.modificateurs) as [ResourceKey, number][];
  const lines: string[] = [];
  if (entries.length)
    lines.push(
      `Moyens de départ : ${entries.map(([k, v]) => `${RESOURCE_LABELS[k]} ${formatDelta(k, v)}`).join(', ')}`,
    );
  if (orientation.promesses)
    lines.push(
      `Promesses de parrainage de départ : ${orientation.promesses > 0 ? '+' : '−'}${Math.abs(orientation.promesses)}`,
    );
  lines.push(
    `Base électorale de départ chez ${GROUPS[orientation.base.groupes]}, qui s’estompe en ${weeks} semaines`,
  );
  return lines;
}

export function OrientationPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const ruleset = useCurrentRuleset();
  if (!ruleset.data) return null;
  const { liste, dureeSemaines } = ruleset.data.orientations;
  const options = [
    {
      id: null,
      libelle: 'Sans orientation particulière',
      description: 'Moyens et base électorale de départ inchangés.',
      lines: [] as string[],
    },
    ...liste.map((o) => ({
      id: o.id as string | null,
      libelle: o.libelle,
      description: o.description,
      lines: effects(o, dureeSemaines),
    })),
  ];
  return (
    <fieldset className="space-y-2">
      <legend className={label}>Variante de campagne (facultative)</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.id ?? 'aucune'} className={optionTile}>
            <input
              type="radio"
              name="orientation"
              value={option.id ?? ''}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className={radio}
            />
            <span className="space-y-1">
              <span className="block font-semibold">{option.libelle}</span>
              <span className="block text-xs text-encre-2">{option.description}</span>
              {option.lines.map((line) => (
                <span key={line} className="block text-xs text-encre-2">
                  {line}
                </span>
              ))}
            </span>
          </label>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-xs text-encre-2">
        <Badge tone="alerte">Hypothèses du jeu</Badge>
        L’orientation ne vaut que pour la première campagne ; elle ne garantit aucun résultat.
      </p>
    </fieldset>
  );
}
