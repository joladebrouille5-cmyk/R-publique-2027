// Relevés mensuels des temps de parole des personnalités politiques hors période électorale
// (Arcom) : un fichier CSV par mois, trois colonnes par service (journaux, magazines, autres
// programmes), une ligne par parti. L'import vérifie que les partis totalisent le « Total
// Partis politiques » publié et que les parts publiées du pouvoir exécutif et des partis font
// 100 % ; il agrège ensuite les mois de la période de référence.
import { parseCsv } from '../cog/csv';
import { ImportError } from '../geometry/coverage';

export type ArcomService = {
  libelle: string;
  /** « Chaîne généraliste », « Chaîne d'information », « Radio généraliste »… */
  typeService: string;
  /** Temps du pouvoir exécutif retenu par l'Arcom (secondes). */
  executif: number;
  /** Temps de chaque parti (secondes). */
  partis: Map<string, number>;
  totalPartis: number;
};

export type ArcomMonth = { mois: string; services: ArcomService[] };

const EXECUTIF_TOTAL = 'Total Pouvoir exécutif';
const EXECUTIF_PART = 'Part Pouvoir exécutif';
const PARTIS_TOTAL = 'Total Partis politiques';
const PARTIS_PART = 'Part Partis politiques';

/** Durée « hh:mm:ss » en secondes ; cellule vide ou « - » : zéro. */
export function seconds(value: string, context: string): number {
  const v = value.trim();
  if (v === '' || v === '-') return 0;
  const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(v);
  if (!m) throw new ImportError(`Arcom ${context} : durée illisible « ${value} ».`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Pourcentage « 76,35% » ; cellule vide ou « - » : null. */
function percent(value: string, context: string): number | null {
  const v = value.trim();
  if (v === '' || v === '-') return null;
  const m = /^(\d+(?:,\d+)?)\s?%$/.exec(v);
  if (!m) throw new ImportError(`Arcom ${context} : pourcentage illisible « ${value} ».`);
  return Number(m[1]!.replace(',', '.'));
}

/** Lecture et contrôle d'un fichier mensuel. */
export function parseArcomMonth(text: string, mois: string): ArcomMonth {
  const rows = parseCsv(text, ';').filter((r) => r.some((c) => c.trim() !== ''));
  const labels = rows.map((r) => r[0]!.trim());
  const row = (label: string) => {
    const i = labels.indexOf(label);
    if (i < 0) throw new ImportError(`Arcom ${mois} : ligne « ${label} » absente.`);
    return rows[i]!;
  };
  const header = rows[0]!;
  const types = row('Type de service');
  const start = labels.indexOf(EXECUTIF_PART) + 1;
  const end = labels.indexOf(PARTIS_TOTAL);
  if (start <= 0 || end <= start)
    throw new ImportError(`Arcom ${mois} : bloc des partis introuvable.`);
  const parties = rows.slice(start, end);
  const services = new Map<string, ArcomService>();
  for (let c = 1; c < header.length; c++) {
    const libelle = header[c]!.trim();
    if (libelle === '') continue;
    const context = `${mois}, ${libelle}, colonne ${c}`;
    const service = services.get(libelle) ?? {
      libelle,
      typeService: types[c]!.trim(),
      executif: 0,
      partis: new Map<string, number>(),
      totalPartis: 0,
    };
    let sum = 0;
    for (const r of parties) {
      const label = r[0]!.trim();
      const s = seconds(r[c] ?? '', context);
      sum += s;
      if (s > 0) service.partis.set(label, (service.partis.get(label) ?? 0) + s);
    }
    const total = seconds(row(PARTIS_TOTAL)[c] ?? '', context);
    if (sum !== total)
      throw new ImportError(
        `Arcom ${context} : les partis totalisent ${sum} s au lieu des ${total} s publiées.`,
      );
    const executif = seconds(row(EXECUTIF_TOTAL)[c] ?? '', context);
    const shares = [
      percent(row(EXECUTIF_PART)[c] ?? '', context),
      percent(row(PARTIS_PART)[c] ?? '', context),
    ];
    if (total + executif > 0) {
      const published = (shares[0] ?? 0) + (shares[1] ?? 0);
      if (Math.abs(published - 100) > 0.02)
        throw new ImportError(
          `Arcom ${context} : parts du pouvoir exécutif et des partis = ${published.toFixed(2)} % au lieu de 100 %.`,
        );
    }
    service.executif += executif;
    service.totalPartis += total;
    services.set(libelle, service);
  }
  return { mois, services: [...services.values()] };
}

export type ArcomTotals = {
  libelle: string;
  typeService: string;
  mois: number;
  executif: number;
  totalPartis: number;
  partis: Map<string, number>;
};

/** Cumul des mois de la période, service par service ; chaque mois doit être présent. */
export function aggregateArcom(months: readonly ArcomMonth[]): Map<string, ArcomTotals> {
  const totals = new Map<string, ArcomTotals>();
  for (const month of months) {
    for (const s of month.services) {
      const t = totals.get(s.libelle) ?? {
        libelle: s.libelle,
        typeService: s.typeService,
        mois: 0,
        executif: 0,
        totalPartis: 0,
        partis: new Map<string, number>(),
      };
      t.mois += 1;
      t.executif += s.executif;
      t.totalPartis += s.totalPartis;
      for (const [party, value] of s.partis)
        t.partis.set(party, (t.partis.get(party) ?? 0) + value);
      totals.set(s.libelle, t);
    }
  }
  return totals;
}

export type SpeakingTimeEstimate = {
  partisSecondes: number;
  executifSecondes: number;
  parts: Record<string, number>;
  autres: number;
  propension: Record<string, number>;
};

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Parts et propensions des services retenus. Partis suivis : au moins `seuilSecondes` cumulées
 * sur l'ensemble des services retenus ; les autres sont réunis dans « autres ». Propension d'un
 * parti sur un service : sa part sur ce service divisée par sa part sur l'ensemble des services
 * retenus (temps cumulés), arrondie au centième.
 */
export function speakingTimeEstimates(
  services: readonly ArcomTotals[],
  seuilSecondes: number,
): { suivis: string[]; estimates: Map<string, SpeakingTimeEstimate> } {
  const pooled = new Map<string, number>();
  let pooledTotal = 0;
  for (const s of services) {
    pooledTotal += s.totalPartis;
    for (const [party, value] of s.partis) pooled.set(party, (pooled.get(party) ?? 0) + value);
  }
  const suivis = [...pooled]
    .filter(([, value]) => value >= seuilSecondes)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([party]) => party);
  const estimates = new Map<string, SpeakingTimeEstimate>();
  for (const s of services) {
    if (s.totalPartis <= 0)
      throw new ImportError(`Arcom : aucun temps de parole des partis pour ${s.libelle}.`);
    const parts: Record<string, number> = {};
    const propension: Record<string, number> = {};
    let followed = 0;
    for (const party of suivis) {
      const value = s.partis.get(party) ?? 0;
      followed += value;
      const share = value / s.totalPartis;
      parts[party] = round4(share);
      propension[party] = round2(share / (pooled.get(party)! / pooledTotal));
    }
    const autres = round4((s.totalPartis - followed) / s.totalPartis);
    const total = Object.values(parts).reduce((sum, v) => sum + v, autres);
    if (Math.abs(total - 1) > 0.002)
      throw new ImportError(
        `Arcom : les parts de ${s.libelle} totalisent ${(total * 100).toFixed(2)} % au lieu de 100 %.`,
      );
    estimates.set(s.libelle, {
      partisSecondes: s.totalPartis,
      executifSecondes: s.executif,
      parts,
      autres,
      propension,
    });
  }
  return { suivis, estimates };
}
