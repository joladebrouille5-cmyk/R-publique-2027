import { supportsOf, type Actor, type GameState, type Ruleset } from '@r2027/shared';
import { Handshake } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { buttonSecondary, card } from '../../components/ui';
import { portraitOfPersonality } from '../../portraits';

// Soutiens de personnalités (phase 15) : ceux obtenus par le candidat du joueur pendant la
// campagne du cycle, avec leur contrepartie, et les refus récents. Soutiens et refus sont des
// faits de jeu simulés : aucun propos n'est attribué aux personnalités réelles.

export function SupportsCard({
  state,
  actor,
  ruleset,
  onNegotiate,
}: {
  state: GameState;
  actor: Actor;
  ruleset: Ruleset;
  /** Ajoute une négociation au plan de la semaine, si elle est possible. */
  onNegotiate?: (() => void) | undefined;
}) {
  const supports = supportsOf(state, actor.id);
  const refusals = state.negociations.filter(
    (n) => n.actorId === actor.id && n.issue === 'refus' && n.annee === state.cycle.annee,
  ).length;
  const figures = new Map(ruleset.figures.figures.map((f) => [f.id, f]));
  const max = ruleset.negociations.soutiensMax;
  return (
    <section aria-labelledby="titre-soutiens" className={`${card} space-y-3 text-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titre-soutiens" className="flex items-center gap-2 text-lg font-bold">
          <Handshake
            aria-hidden="true"
            className="size-5 text-republique-600 dark:text-republique-300"
          />
          Soutiens et ralliements
        </h2>
        <Badge tone={supports.length > 0 ? 'succes' : 'neutre'}>
          {supports.length}/{max} soutien(s)
        </Badge>
      </div>
      {supports.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {supports.map((s) => {
            const figure = figures.get(s.figureId);
            if (!figure) return null;
            return (
              <li
                key={s.figureId}
                className="flex items-center gap-2 rounded-full bg-slate-50 py-1 pr-3 pl-1 dark:bg-slate-800/60"
              >
                <Avatar portrait={portraitOfPersonality(figure, ruleset)} size="xs" />
                <span>
                  <span className="font-semibold">
                    {figure.prenom} {figure.nom}
                  </span>
                  <span className="text-xs text-encre-3">
                    {' '}
                    · {figure.parti}
                    {s.contrepartie === 'ministere' ? ' · ministère promis' : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-encre-2">
          Aucun soutien pour l’instant. Négociez avec les personnalités proches de vous : une
          personnalité ne soutient qu’un candidat et refuse si un candidat de son parti est en lice.
        </p>
      )}
      <p className="text-xs text-encre-3">
        {refusals > 0 ? `${refusals} refus pendant cette campagne. ` : ''}Soutiens et refus simulés
        (hypothèses du jeu) : aucun propos n’est attribué aux personnalités réelles.
      </p>
      {onNegotiate && supports.length < max && (
        <button type="button" className={buttonSecondary} onClick={onNegotiate}>
          Négocier un soutien
        </button>
      )}
    </section>
  );
}
