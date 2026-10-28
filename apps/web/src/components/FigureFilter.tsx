import {
  memberExpertise,
  type GovernmentFigure,
  type PostExpertise,
  type Ruleset,
} from '@r2027/shared';
import { input, label } from './ui';

// Filtre du vivier des personnalités nominables (phase 14) : recherche par nom ou parti, parti,
// ministère d'expertise. L'expertise est celle de la règle partagée avec le moteur
// (`@r2027/shared`) : une fonction ministérielle passée ou présente du domaine du poste.

export type FigureFilterValue = { texte: string; parti: string; poste: string };
export const NO_FILTER: FigureFilterValue = { texte: '', parti: '', poste: '' };

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Expertises d'une figure réelle (au plus une par poste). */
export function figureExpertiseOf(ruleset: Ruleset, figureId: string): PostExpertise[] {
  return memberExpertise(ruleset, { nature: 'figure', ref: figureId });
}

/** La figure répond-elle au filtre (texte sur prénom, nom et parti ; parti ; poste) ? */
export function matchesFigure(
  ruleset: Ruleset,
  figure: GovernmentFigure,
  filter: FigureFilterValue,
): boolean {
  const query = fold(filter.texte);
  if (query && !fold(`${figure.prenom} ${figure.nom} ${figure.parti}`).includes(query))
    return false;
  if (filter.parti && figure.parti !== filter.parti) return false;
  if (
    filter.poste &&
    !figureExpertiseOf(ruleset, figure.id).some((e) => e.posteId === filter.poste)
  )
    return false;
  return true;
}

/** Libellé court d'une expertise : « Intérieur (ministre) », « Europe… (secrétaire d’État) ». */
export function expertiseLabel(ruleset: Ruleset, expertise: PostExpertise): string {
  const poste =
    ruleset.quinquennat.postes.find((p) => p.id === expertise.posteId)?.libelle ??
    expertise.posteId;
  return `${poste} (${expertise.niveau === 'ministre' ? 'ministre' : 'secrétaire d’État ou délégué'})`;
}

/** Barre de filtres : recherche, parti, ministère d'expertise ; nombre de résultats annoncé. */
export function FigureFilterBar({
  ruleset,
  value,
  onChange,
  shown,
  total,
  idPrefix,
}: {
  ruleset: Ruleset;
  value: FigureFilterValue;
  onChange: (next: FigureFilterValue) => void;
  shown: number;
  total: number;
  /** Préfixe des identifiants des champs (plusieurs barres peuvent coexister). */
  idPrefix: string;
}) {
  const parties = [...new Set(ruleset.figures.figures.map((f) => f.parti))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  return (
    <div role="search" aria-label="Filtrer les personnalités" className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-texte`} className={label}>
            Rechercher
          </label>
          <input
            id={`${idPrefix}-texte`}
            type="search"
            className={input}
            placeholder="Nom ou parti"
            value={value.texte}
            onChange={(e) => onChange({ ...value, texte: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-parti`} className={label}>
            Parti
          </label>
          <select
            id={`${idPrefix}-parti`}
            className={input}
            value={value.parti}
            onChange={(e) => onChange({ ...value, parti: e.target.value })}
          >
            <option value="">Tous les partis</option>
            {parties.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-poste`} className={label}>
            Expertise
          </label>
          <select
            id={`${idPrefix}-poste`}
            className={input}
            value={value.poste}
            onChange={(e) => onChange({ ...value, poste: e.target.value })}
          >
            <option value="">Tous les ministères</option>
            {ruleset.quinquennat.postes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.libelle}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
        {shown === total ? `${total} personnalités` : `${shown} sur ${total} personnalités`}
      </p>
    </div>
  );
}
