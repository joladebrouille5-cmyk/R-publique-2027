import type { DecisionFollowUp, Quinquennat } from '@r2027/shared';
import { CircleCheck, CircleX, Hourglass } from 'lucide-react';
import { card } from '../components/ui';

// Journal de mandat (phase 25 ter) : les décisions ministérielles prises par le président, leur
// statut (suivi en cours ou fait) et leur bilan synthétique, du plus récent au plus ancien. Le
// statut s'écrit en toutes lettres (pas seulement par la couleur) ; tout est lu dans l'état servi
// par l'API, le bilan est simulé par le moteur.

const signedPoints = (hundredths: number) =>
  `${hundredths > 0 ? '+' : hundredths < 0 ? '−' : ''}${(Math.abs(hundredths) / 100)
    .toFixed(2)
    .replace('.', ',')} pt`;

function Status({ suivi }: { suivi: DecisionFollowUp }) {
  if (!suivi.bilan)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-encre-2">
        <Hourglass aria-hidden="true" className="size-3.5" />
        En cours : bilan attendu semaine {suivi.echeance}
      </span>
    );
  const Icon = suivi.bilan.favorable ? CircleCheck : CircleX;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        suivi.bilan.favorable
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-red-700 dark:text-red-300'
      }`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      Suivi fait : bilan {suivi.bilan.favorable ? 'favorable' : 'défavorable'} (
      {signedPoints(suivi.bilan.popularite)})
    </span>
  );
}

export function DecisionJournal({ quinquennat }: { quinquennat: Quinquennat }) {
  const suivis = [...quinquennat.suivisDecisions].reverse();
  const done = suivis.filter((s) => s.bilan);
  const favorable = done.filter((s) => s.bilan!.favorable).length;
  return (
    <section aria-labelledby="titre-suivi-decisions" className="space-y-3">
      <h2 id="titre-suivi-decisions" className="font-display text-xl font-bold">
        Suivi des décisions
      </h2>
      {suivis.length === 0 ? (
        <p className={`${card} text-sm`}>
          Aucune décision ministérielle tranchée pour l’instant. Chaque urgence arbitrée reçoit un
          bilan 2 à 5 semaines plus tard.
        </p>
      ) : (
        <>
          <p className="text-sm text-encre-2">
            {suivis.length} décision{suivis.length > 1 ? 's' : ''} : {suivis.length - done.length}{' '}
            en cours, {favorable} bilan{favorable > 1 ? 's' : ''} favorable
            {favorable > 1 ? 's' : ''}, {done.length - favorable} défavorable
            {done.length - favorable > 1 ? 's' : ''}. Bilans simulés ; effets : hypothèses du jeu.
          </p>
          <ul className="grid gap-2.5 md:grid-cols-2" aria-label="Décisions du mandat">
            {suivis.map((suivi) => (
              <li key={suivi.id} className={`${card} space-y-1 text-sm`}>
                <p className="font-semibold">{suivi.libelle}</p>
                <p className="text-xs text-encre-3">Décidé semaine {suivi.semaine}</p>
                <Status suivi={suivi} />
                {suivi.bilan && <p className="text-xs text-encre-2">{suivi.bilan.texte}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
