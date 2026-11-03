import type { Parliament } from '@r2027/shared';
import { filledSeats, membersMajority, supportSeats } from '@r2027/shared';
import { Flame, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';

// Jauges du Parlement (phase 13) : majorité des membres et tension parlementaire, telles que le
// moteur les a calculées (aucun calcul d'état dans le navigateur). La couleur n'est jamais
// seule : valeur chiffrée, libellé du niveau et icône.

const pct = (value: number, total: number) => `${(100 * value) / Math.max(1, total)}%`;

/** Majorité des membres : sièges des soutiens du président face au seuil (289 sur 577). */
export function MajorityGauge({
  parliament,
  coalition = null,
}: {
  parliament: Pick<Parliament, 'groupes'>;
  /** Partenaire de coalition et ses sièges, s'il y en a un. */
  coalition?: { libelle: string; sieges: number } | null;
}) {
  const filled = filledSeats(parliament);
  const majority = membersMajority(parliament);
  const supporters = supportSeats(parliament);
  const reached = supporters >= majority;
  const text = reached
    ? `Majorité absolue : ${supporters} sièges, ${supporters - majority} de plus que les ${majority} requis.`
    : `Il manque ${majority - supporters} voix : ${supporters} sièges de soutien pour ${majority} requis.`;
  return (
    <div className="space-y-1.5">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">Majorité des membres</span>
        <span className="font-display text-lg font-bold tabular-nums">
          {supporters}
          <span className="text-sm font-semibold text-encre-3"> / {majority}</span>
        </span>
      </p>
      <div
        role="meter"
        aria-label="Soutiens du président face à la majorité des membres"
        aria-valuemin={0}
        aria-valuemax={filled}
        aria-valuenow={supporters}
        aria-valuetext={text}
        className="relative h-3 rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className={`h-full rounded-full ${reached ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-republique-600 dark:bg-republique-400'}`}
          style={{ width: pct(supporters, filled) }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-1 -bottom-1 w-0.5 rounded bg-slate-900 dark:bg-white"
          style={{ left: pct(majority, filled) }}
        />
      </div>
      <p className="text-xs text-encre-2">
        {text} Seuil : majorité des {filled} sièges pourvus.
        {coalition &&
          ` Dont coalition avec le bloc « ${coalition.libelle} » (${coalition.sieges}).`}
      </p>
    </div>
  );
}

type Level = { label: string; icon: LucideIcon; bar: string; text: string };

/** Niveau affiché de la tension (convention d'affichage ; le seuil des motions vient des règles). */
export function tensionLevel(value: number, seuilMotion: number): Level {
  if (value >= seuilMotion)
    return {
      label: 'Explosive : motions de censure spontanées possibles',
      icon: Flame,
      bar: 'bg-red-600 dark:bg-red-500',
      text: 'text-red-800 dark:text-red-300',
    };
  if (value >= seuilMotion / 2)
    return {
      label: 'Tendue',
      icon: TriangleAlert,
      bar: 'bg-amber-500 dark:bg-amber-400',
      text: 'text-amber-800 dark:text-amber-300',
    };
  return {
    label: 'Apaisée',
    icon: ShieldCheck,
    bar: 'bg-emerald-600 dark:bg-emerald-500',
    text: 'text-emerald-800 dark:text-emerald-300',
  };
}

/** Tension parlementaire (0 à 100) : valeur, niveau, facteurs et censure projetée. */
export function TensionGauge({
  tension,
  seuilMotion,
  details = true,
  compact = false,
}: {
  tension: Parliament['tension'];
  seuilMotion: number;
  /** Liste des facteurs (vue détaillée) ; sinon la valeur et le niveau seuls. */
  details?: boolean;
  /** Pop-up (phase 15) : valeur, jauge et niveau seuls, sans projection ni explication. */
  compact?: boolean;
}) {
  const level = tensionLevel(tension.valeur, seuilMotion);
  const Icon = level.icon;
  return (
    <div className="space-y-1.5">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">Tension parlementaire</span>
        <span className="font-display text-lg font-bold tabular-nums">
          {tension.valeur}
          <span className="text-sm font-semibold text-encre-3"> / 100</span>
        </span>
      </p>
      <div
        role="meter"
        aria-label="Tension parlementaire"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={tension.valeur}
        aria-valuetext={`${tension.valeur} sur 100 : ${level.label}`}
        className="relative h-3 rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className={`h-full rounded-full ${level.bar}`}
          style={{ width: `${tension.valeur}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-1 -bottom-1 w-0.5 rounded bg-slate-900 dark:bg-white"
          style={{ left: `${seuilMotion}%` }}
        />
      </div>
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${level.text}`}>
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {level.label}
        {compact && (
          <span className="font-normal text-encre-3">· indicateur du jeu (hypothèses)</span>
        )}
      </p>
      {!compact && tension.censure && (
        <p className="text-xs text-encre-2">
          Censure projetée : {tension.censure.pour} voix pour {tension.censure.majorite} requises
          (projection du jeu, sans aléa).
        </p>
      )}
      {details && !compact && <TensionFactors tension={tension} />}
      {!compact && (
        <p className="text-xs text-encre-3">
          Indicateur du jeu (hypothèses) : il renchérit le 49.3, nourrit la censure et, au-delà de{' '}
          {seuilMotion}, peut provoquer des motions de censure spontanées (au plus trois par
          session).
        </p>
      )}
    </div>
  );
}

/** Facteurs de la tension parlementaire, dont la somme exacte est la valeur affichée. */
export function TensionFactors({ tension }: { tension: Parliament['tension'] }) {
  if (tension.facteurs.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-xs" aria-label="Facteurs de la tension parlementaire">
      {tension.facteurs.map((f) => (
        <li key={f.libelle} className="flex justify-between gap-3">
          <span className="text-encre-2">{f.libelle}</span>
          <span className="shrink-0 font-semibold tabular-nums">
            {f.valeur > 0 ? `+${f.valeur}` : `−${Math.abs(f.valeur)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
