import type { WeeklyReport } from '@r2027/shared';
import { Badge } from './Badge';

// Candidatures à la présidentielle suivante (phase 23), dans le bilan et le débriefing de la
// semaine où la campagne s'ouvre : qui se représente, qui se retire, qui entre, et le successeur
// du joueur, avec leur motif de jeu. Annonces du moteur, reconnues à leur identifiant
// (`candidature-<année>-<acteur>`) et classées d'après sa copie fixe ; rien n'est calculé ici.

const CANDIDACY_GROUPS = [
  { id: 'successeur', titre: 'Votre camp', test: /^Vous passez la main : / },
  { id: 'candidat', titre: 'Se représentent', test: / se représente$/ },
  { id: 'entree', titre: 'Entrent dans la course', test: / entre dans la course$/ },
  {
    id: 'retrait',
    titre: 'Ne se présentent pas',
    test: / ne se présente pas à la présidentielle \d{4}$/,
  },
] as const;
const CANDIDACY_EVENT = /^candidature-(\d{4})-(.+)$/;

type Notice = {
  event: WeeklyReport['events'][number];
  year: number;
  actorId: string;
  group: (typeof CANDIDACY_GROUPS)[number]['id'];
};
export type Candidacies = { year: number | null; notices: Notice[] };

/** Annonces de candidature de la semaine (année du cycle et annonces classées). */
export function candidacies(events: WeeklyReport['events']): Candidacies {
  const notices = events.flatMap((event) => {
    const match = CANDIDACY_EVENT.exec(event.id);
    const group = CANDIDACY_GROUPS.find((g) => g.test.test(event.label));
    return match && event.refId === 'succession' && group
      ? [{ event, year: Number(match[1]), actorId: match[2]!, group: group.id }]
      : [];
  });
  return { year: notices[0]?.year ?? null, notices };
}

/** Événements de la semaine, sans les annonces de candidature (présentées à part). */
export function withoutCandidacies(events: WeeklyReport['events'], candidacy: Candidacies) {
  const ids = new Set(candidacy.notices.map((n) => n.event.id));
  return events.filter((event) => !ids.has(event.id));
}

export function CandidaciesSection({
  candidacy,
  nameOf,
  playerId,
  headingClass = 'flex flex-wrap items-center gap-2 font-semibold',
  className = 'space-y-3 rounded-lg border border-republique-200 bg-republique-50/60 p-3 dark:border-republique-900 dark:bg-republique-950/40',
}: {
  candidacy: Candidacies;
  nameOf: (actorId: string) => string;
  playerId: string | null;
  headingClass?: string;
  className?: string;
}) {
  if (candidacy.year === null) return null;
  return (
    <section aria-label={`Candidatures ${candidacy.year}`} className={className}>
      <h3 className={headingClass}>
        Candidatures {candidacy.year}
        <Badge tone="simule">Simulation</Badge>
      </h3>
      <p className="text-encre-2">
        Candidatures simulées par le jeu, avec leur motif ; aucun propos n’est prêté à une personne
        réelle.
      </p>
      {CANDIDACY_GROUPS.map((group) => {
        const notices = candidacy.notices.filter((n) => n.group === group.id);
        if (notices.length === 0) return null;
        return (
          <div key={group.id}>
            <h4 className="font-semibold">{group.titre}</h4>
            <ul className="mt-1 space-y-1">
              {notices.map(({ event, actorId }) => (
                <li key={event.id}>
                  <span className="font-medium">
                    {group.id === 'successeur'
                      ? event.label.replace(/^Vous passez la main : /, '')
                      : nameOf(actorId)}
                  </span>
                  {actorId === playerId && group.id !== 'successeur' ? ' (vous)' : ''}
                  <span className="text-encre-2">
                    {' '}
                    — {event.description.replace(/^Motif du jeu : /, '').replace(/\.$/, '')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
