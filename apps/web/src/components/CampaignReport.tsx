import type { WeeklyReport } from '@r2027/shared';
import {
  formatCount,
  formatEuros,
  PRIORITY_LABELS,
  RECEIPT_LABELS,
  REFUSAL_LABELS,
} from '../labels';
import { Badge } from './Badge';

type Props = {
  report: WeeklyReport;
  playerId: string | null;
  nameOf: (actorId: string) => string;
  proposalLabel?: (id: string) => string;
};

/** Volet « campagne » du bilan hebdomadaire (phase 5) : programme, parrainages, compte, relations. */
export function CampaignReport({ report, playerId, nameOf, proposalLabel = (id) => id }: Props) {
  const programme = report.programme.find((p) => p.actorId === playerId);
  const parrainages = report.parrainages.find((p) => p.actorId === playerId);
  const finances = report.finances.find((f) => f.actorId === playerId);
  const hasAny =
    programme ||
    parrainages ||
    finances ||
    report.relations.length > 0 ||
    report.alliances.length > 0 ||
    report.strategies.length > 0;
  if (!hasAny) return null;
  return (
    <section aria-label="Campagne de la semaine" className="space-y-3">
      <h3 className="font-semibold">Campagne</h3>
      {programme && (
        <div>
          <p className="font-medium">Programme</p>
          <ul className="space-y-1">
            {programme.ajoutees.map((id) => (
              <li key={`+${id}`}>
                <Badge tone="succes">Annoncée</Badge> {proposalLabel(id)}
              </li>
            ))}
            {programme.retirees.map((id) => (
              <li key={`-${id}`}>
                <Badge tone="alerte">Retirée</Badge> {proposalLabel(id)} (revirement)
              </li>
            ))}
            {programme.refusees.map((r) => (
              <li key={`x${r.id}`}>
                <Badge tone="danger">Refusée</Badge> {proposalLabel(r.id)} — {r.motif}
              </li>
            ))}
          </ul>
        </div>
      )}
      {parrainages && (
        <div>
          <p className="font-medium">Parrainages</p>
          <ul className="space-y-0.5">
            {parrainages.facteurs.map((f) => (
              <li key={f.label}>
                {f.label} : {f.value > 0 ? '+' : '−'}
                {formatCount(Math.abs(f.value))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {finances && (
        <div>
          <p className="font-medium">Compte de campagne</p>
          <ul className="space-y-0.5">
            {finances.depenses > 0 && <li>Dépenses : {formatEuros(finances.depenses)}</li>}
            {Object.entries(finances.recettes).map(([kind, amount]) => (
              <li key={kind}>
                {RECEIPT_LABELS[kind as keyof typeof RECEIPT_LABELS]} : +{formatEuros(amount)}
              </li>
            ))}
            {finances.donateurs > 0 && <li>{formatCount(finances.donateurs)} donateur(s)</li>}
            {finances.refus.map((r, i) => (
              <li key={i}>
                <Badge tone="danger">Don refusé</Badge> {REFUSAL_LABELS[r.origine]} — {r.motif}
              </li>
            ))}
            {finances.notes.map((note, i) => (
              <li key={`n${i}`}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {(report.relations.length > 0 || report.alliances.length > 0) && (
        <div>
          <p className="font-medium">Relations et alliances</p>
          <ul className="space-y-0.5">
            {report.relations.map((r, i) => (
              <li key={i}>{r.libelle}</li>
            ))}
          </ul>
        </div>
      )}
      {report.strategies.length > 0 && (
        <details>
          <summary className="cursor-pointer">
            Stratégies des adversaires ({report.strategies.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {report.strategies.map((s) => (
              <li key={s.actorId}>
                <span className="font-medium">{nameOf(s.actorId)}</span> —{' '}
                {PRIORITY_LABELS[s.priorite]} : {s.motif}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
