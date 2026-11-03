import type { Ruleset } from '@r2027/shared';
import { useState } from 'react';
import { mainFunction } from '../figures';
import { portraitOfPersonality, type Portrait } from '../portraits';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Drawer } from './Drawer';
import { buttonSecondary, card } from './ui';

// Figures des blocs (phase 14) : pour chaque bloc des législatives, les personnalités réelles des
// partis rattachés à ses groupes de l'Assemblée — candidats réels de la partie et personnalités
// nominables —, avec leur photo et une fonction relevée dans les sources. Information sourcée
// seulement : aucune candidature dans une circonscription ni aucun propos ne leur est prêté.

export type BlocPerson = {
  id: string;
  prenom: string;
  nom: string;
  parti: string;
  fonction: string | null;
  portrait: Portrait;
  candidat: boolean;
};

/** Personnalités réelles d'un bloc : candidats réels d'abord, puis figures par notoriété. */
export function blocPeople(ruleset: Ruleset, blocId: string): BlocPerson[] {
  const bloc = ruleset.legislatives.blocs.find((b) => b.id === blocId);
  if (!bloc) return [];
  const groups = new Set(bloc.groupes);
  const attached = new Map(ruleset.figures.rattachements.map((r) => [r.personnaliteId, r.groupe]));
  const candidates = ruleset.personnalites.personnalites
    .filter((p) => groups.has(attached.get(p.id) ?? ''))
    .map((p) => ({
      id: p.id,
      prenom: p.prenom,
      nom: p.nom,
      parti: p.parti,
      fonction: p.fonctions[0] ?? null,
      portrait: portraitOfPersonality(p, ruleset),
      candidat: true,
    }));
  const figures = ruleset.figures.figures
    .filter((f) => f.groupe !== null && groups.has(f.groupe))
    .sort(
      (a, b) =>
        b.notoriete.niveau - a.notoriete.niveau ||
        a.nom.localeCompare(b.nom, 'fr') ||
        a.prenom.localeCompare(b.prenom, 'fr'),
    )
    .map((f) => ({
      id: f.id,
      prenom: f.prenom,
      nom: f.nom,
      parti: f.parti,
      fonction: mainFunction(f),
      portrait: portraitOfPersonality(f, ruleset),
      candidat: false,
    }));
  return [...candidates, ...figures];
}

/** Rangée de visages d'un bloc (décorative : le bloc est nommé à côté). */
export function BlocFaces({ people, max = 6 }: { people: readonly BlocPerson[]; max?: number }) {
  if (people.length === 0) return null;
  const rest = people.length - max;
  return (
    <span className="flex items-center" aria-hidden="true" data-bloc-faces="">
      <span className="flex -space-x-2">
        {people.slice(0, max).map((p) => (
          <Avatar key={p.id} portrait={p.portrait} size="xs" ring />
        ))}
      </span>
      {rest > 0 && <span className="ml-1.5 text-xs text-encre-2">+{rest}</span>}
    </span>
  );
}

/**
 * Section de l'écran Législatives : une ligne par bloc (visages des premières personnalités) ; la
 * liste complète s'ouvre dans un tiroir (aucun volet imbriqué dans une section, phase 13).
 */
export function BlocFigures({ ruleset }: { ruleset: Ruleset }) {
  const [shown, setShown] = useState<string | null>(null);
  const bloc = ruleset.legislatives.blocs.find((b) => b.id === shown);
  const people = bloc ? blocPeople(ruleset, bloc.id) : [];
  return (
    <section aria-labelledby="titre-figures-blocs" className={`${card} space-y-3 text-sm`}>
      <h2 id="titre-figures-blocs" className="text-lg font-semibold">
        Figures des blocs
      </h2>
      <p className="text-encre-2">
        Personnalités réelles des partis rattachés à chaque bloc : candidats à la présidentielle de
        la partie et personnalités nominables au gouvernement, avec une fonction relevée dans les
        sources. Aucune candidature dans une circonscription ni aucun propos ne leur est prêté.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {ruleset.legislatives.blocs.map((b) => {
          const members = blocPeople(ruleset, b.id);
          return (
            // Sur téléphone, le nom du bloc occupe sa ligne ; visages et bouton passent dessous.
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
              <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <span className="block font-semibold">{b.libelle}</span>
                <span className="block text-xs text-encre-2">
                  {members.length === 0
                    ? 'Aucune personnalité du jeu rattachée à ce bloc.'
                    : `${members.length} personnalité${members.length > 1 ? 's' : ''}`}
                </span>
              </span>
              <BlocFaces people={members} />
              {members.length > 0 && (
                <button
                  type="button"
                  className={`${buttonSecondary} ml-auto`}
                  aria-label={`Voir les personnalités du bloc ${b.libelle}`}
                  onClick={() => setShown(b.id)}
                >
                  Voir
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {bloc && (
        <Drawer
          title={bloc.libelle}
          subtitle={`${people.length} personnalité${people.length > 1 ? 's' : ''} réelle${people.length > 1 ? 's' : ''} des partis du bloc ; fonctions relevées dans les sources, aucune candidature prêtée.`}
          onClose={() => setShown(null)}
        >
          <ul
            aria-label={`Personnalités du bloc ${bloc.libelle}`}
            className="grid gap-2 text-sm sm:grid-cols-2"
          >
            {people.map((p) => (
              <li key={p.id} className="flex items-start gap-3">
                <Avatar portrait={p.portrait} size="sm" />
                <span className="min-w-0 space-y-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {p.prenom} {p.nom}
                    </span>
                    {p.candidat && <Badge tone="reel">Candidat(e) de la partie</Badge>}
                  </span>
                  <span className="block text-xs text-encre-2">
                    {p.parti}
                    {p.fonction && ` — ${p.fonction}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
    </section>
  );
}
