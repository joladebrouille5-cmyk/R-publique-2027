import {
  avancement,
  candidateName,
  communeDepouillee,
  DROM_LABELS,
  fraction,
  rythmeDepartements,
  SOIREE_DERNIERE,
  SOIREE_TRANCHES,
  soireeElectorale,
  type RoundResult,
  type TerritoryLevel,
} from '@r2027/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FastForward, Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useRuleset } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  buttonPrimary,
  buttonSecondary,
  card,
  input,
  label,
  pressable,
  screenTitle,
} from '../components/ui';
import { formatGameDate, formatRatio } from '../labels';
import { colorScheme, leaderOf, MAP_SURFACE, mixColors, winnerPalette } from '../map/colors';
import {
  fetchCommuneResults,
  fromCounts,
  topologyQuery,
  useGeoManifest,
  useTopology,
  type ResultCandidate,
  type TerritoryCollection,
  type TerritoryResult,
} from '../map/data';
import { ElectionMap, type BBox, type MapSelection } from '../map/ElectionMap';
import { useMediaQuery, useMode } from '../map/useMode';
import { portraitOf } from '../portraits';
import { useCurrentGame } from './GameLayout';
import {
  Feed,
  Leaderboard,
  percent,
  Ticker,
  type FeedItem,
  type Standing,
  type TickerItem,
} from './soiree/parts';

// Écran « Soirée électorale » (phase 9) : le soir d'un tour, le dépouillement simulé est
// restitué tranche horaire par tranche horaire (module `soiree` de @r2027/shared). La carte se
// colore département par département puis commune par commune aux couleurs du candidat en
// tête ; rien n'est recalculé ici : chaque chiffre est une part exacte du résultat du moteur.

/** Durée d'une tranche horaire en lecture automatique. */
const TRANCHE_MS = 2_800;
const DROM = ['971', '972', '973', '974', '976'] as const;
const METROPOLE: BBox = [-5.2, 41.3, 9.6, 51.1];

const roundName = (round: 1 | 2) => (round === 1 ? 'premier' : 'second');

export function Soiree() {
  const game = useCurrentGame();
  const { tour } = useParams();
  const round = tour === '1' ? 1 : tour === '2' ? 2 : null;
  const result =
    round === 1 ? game.state.elections.t1 : round === 2 ? game.state.elections.t2 : null;
  if (!round || !result) {
    return (
      <section aria-labelledby="titre-soiree" className="space-y-4">
        <h1 id="titre-soiree" className={screenTitle}>
          Soirée électorale
        </h1>
        <p className={card}>
          {round
            ? `Le ${roundName(round)} tour n’a pas encore eu lieu : la soirée électorale s’ouvre le soir du scrutin.`
            : 'Ce tour de scrutin n’existe pas.'}{' '}
          <Link
            to="../tableau-de-bord"
            className="font-semibold text-republique-700 underline dark:text-republique-300"
          >
            Retour au tableau de bord
          </Link>
        </p>
      </section>
    );
  }
  return <Night key={`${round}-${result.date}`} result={result} />;
}

function Night({ result }: { result: RoundResult }) {
  const game = useCurrentGame();
  const { state } = game;
  const ruleset = useRuleset(game.rulesetVersion, state.cycle);
  const mode = useMode();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const seed = state.meta.seed;
  const round = result.round;

  // Déroulé : une tranche toutes les TRANCHE_MS en lecture (en pause si le mouvement est réduit).
  const soiree = useMemo(() => soireeElectorale(result, seed), [result, seed]);
  const rythme = useMemo(() => rythmeDepartements(result, seed), [result, seed]);
  const [tranche, setTranche] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion);
  const done = tranche >= SOIREE_DERNIERE;
  useEffect(() => {
    if (!playing || done) return;
    const timer = window.setTimeout(
      () => setTranche((t) => Math.min(SOIREE_DERNIERE, t + 1)),
      TRANCHE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, done, tranche]);
  const now = soiree[tranche]!;

  // Candidats et couleurs : la couleur suit le candidat (rang national final), jamais son rang local.
  const keys = useMemo(() => result.territoire?.candidats ?? Object.keys(result.voix), [result]);
  const candidats: ResultCandidate[] = useMemo(
    () =>
      keys.map((key) => ({
        key,
        label: state.actors[key] ? candidateName(state.actors[key].candidate) : key,
        player: key === state.player.actorId,
      })),
    [keys, state.actors, state.player.actorId],
  );
  const national = useMemo(() => fromCounts(result, keys), [result, keys]);
  const palette = useMemo(
    () => winnerPalette(candidats, national, mode),
    [candidats, national, mode],
  );
  const { noData } = colorScheme({ kind: 'vainqueur' }, candidats, national, mode);
  const leaderColor = (r: TerritoryResult | undefined) => {
    const leader = leaderOf(r);
    return leader === null ? noData : palette.colorOf(leader);
  };

  // Géographie : départements (aperçu), communes du département suivi.
  const manifest = useGeoManifest();
  const overview = useTopology(manifest.data?.apercu ?? null);
  const m = manifest.data;
  const departements = useMemo(() => new Map(m?.departements.map((d) => [d.code, d]) ?? []), [m]);
  const metropole = useMemo((): BBox => {
    const boxes = m?.departements.filter((d) => d.zone === 'metropole').map((d) => d.bbox) ?? [];
    if (boxes.length === 0) return METROPOLE;
    return [
      Math.min(...boxes.map((b) => b[0])),
      Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.max(...boxes.map((b) => b[3])),
    ];
  }, [m]);
  const depName = (code: string) => departements.get(code)?.nom ?? code;
  const counts = result.territoire?.departements ?? {};
  const partOf = (code: string, t = tranche) => avancement(rythme[code], t);
  const depResult = (code: string, t = tranche): TerritoryResult | undefined => {
    const c = counts[code];
    const part = partOf(code, t);
    return c && part > 0 ? fromCounts(fraction(c, part), keys) : undefined;
  };

  const [drill, setDrill] = useState<string | null>(null);
  const drillInfo = drill ? departements.get(drill) : undefined;
  const communeGeo = useQuery({
    ...topologyQuery(drillInfo?.fichier ?? ''),
    enabled: !!drillInfo?.fichier,
  });
  const communeFeatures = useMemo(
    () => (communeGeo.data ? Object.values(communeGeo.data)[0]!.features : []),
    [communeGeo.data],
  );
  const communeNames = useMemo(
    () =>
      new Map(
        communeFeatures.map((f) => [f.properties.code, f.properties.nom ?? f.properties.code]),
      ),
    [communeFeatures],
  );
  const communeResults = useQuery({
    // Même clé que l'écran Carte : les résultats communaux sont partagés en cache.
    queryKey: ['carte', 'communes-de', game.id, 'partie', round, drill],
    enabled: !!drillInfo?.fichier && !!result.territoire,
    staleTime: Infinity,
    queryFn: () =>
      fetchCommuneResults(game.id, { kind: 'partie', tour: round, label: '' }, keys, drill!),
  });
  const level: TerritoryLevel = drill && communeFeatures.length > 0 ? 'commune' : 'departement';
  const drillPart = drill ? partOf(drill) : 0;
  const counted = (code: string, part: number) => communeDepouillee(seed, round, code, part);

  const layers = useMemo(() => {
    const out: Partial<Record<TerritoryLevel, TerritoryCollection>> = {};
    if (overview.data?.departements) out.departement = overview.data.departements;
    if (communeFeatures.length > 0)
      out.commune = { type: 'FeatureCollection', features: communeFeatures };
    return out;
  }, [overview.data, communeFeatures]);

  const colorOf = (lvl: TerritoryLevel, code: string) => {
    if (lvl === 'commune') {
      const r = communeResults.data?.results.get(code);
      return r && counted(code, drillPart) ? leaderColor(r) : noData;
    }
    const r = depResult(code);
    if (!r) return noData;
    const part = partOf(code);
    // En cours de dépouillement : teinte atténuée, qui s'affirme à mesure que les bulletins tombent.
    return part >= 1 ? leaderColor(r) : mixColors(leaderColor(r), noData, 0.35 + 0.4 * part);
  };
  const leadText = (r: TerritoryResult) => {
    const leader = leaderOf(r)!;
    return `${candidats[leader]!.label} en tête (${formatRatio(r.voix[leader]!, r.exprimes)})`;
  };
  const describe = (lvl: TerritoryLevel, code: string) => {
    if (lvl === 'commune') {
      const name = communeNames.get(code) ?? code;
      const r = communeResults.data?.results.get(code);
      if (!r || !counted(code, drillPart) || r.exprimes === 0)
        return drillPart > 0
          ? `${name} : bulletins en cours de dépouillement`
          : `${name} : en attente des premiers résultats`;
      return `${name} : dépouillée, ${leadText(r)}`;
    }
    const name = `${depName(code)} (${code})`;
    const r = depResult(code);
    if (!r || r.exprimes === 0) return `${name} : en attente des premiers résultats`;
    const part = partOf(code);
    return part >= 1
      ? `${name} : dépouillé, ${leadText(r)}`
      : `${name} : ${Math.round(part * 100)} % dépouillé, ${leadText(r)}`;
  };

  // Éclat des territoires qui viennent d'être dépouillés.
  const flash =
    level === 'commune' && drill
      ? {
          key: `c-${drill}-${tranche}`,
          codes: communeFeatures
            .map((f) => f.properties.code)
            .filter(
              (code) =>
                counted(code, drillPart) &&
                !(tranche > 0 && counted(code, partOf(drill, tranche - 1))),
            ),
        }
      : { key: `d-${tranche}`, codes: now.nouveaux };

  // Suivi d'un département (clic, liste, outre-mer) et retour à la vue nationale.
  const [selected, setSelected] = useState<MapSelection | null>(null);
  const [focus, setFocus] = useState<{ bbox: BBox; key: string } | null>(null);
  const serial = useRef(0);
  const flyTo = (bbox: BBox) => {
    serial.current += 1;
    setFocus({ bbox, key: String(serial.current) });
  };
  const follow = (code: string) => {
    const info = departements.get(code);
    if (!info) return;
    setSelected(null);
    if (info.fichier && result.territoire) setDrill(code);
    else setSelected({ level: 'departement', code });
    flyTo(info.bbox);
  };
  const backToNation = () => {
    setDrill(null);
    setSelected(null);
    flyTo(metropole);
  };
  const onSelect = (selection: MapSelection) => {
    if (selection.level === 'departement' && departements.get(selection.code)?.fichier)
      follow(selection.code);
    else setSelected(selection);
  };
  const overlay = useRef<HTMLDivElement>(null);

  // Classement, bandeau, fil et annonce.
  const nameOf = (id: string) => candidats.find((c) => c.key === id)?.label ?? id;
  const outcomeText = result.winner
    ? `${nameOf(result.winner)} est élu(e) président(e) de la République${round === 1 ? ' dès le premier tour' : ''}.`
    : `Qualifiés pour le second tour : ${result.qualified.map(nameOf).join(' et ')}.`;
  const standings: Standing[] = keys
    .map((key, index) => ({
      key,
      name: candidats[index]!.label,
      player: candidats[index]!.player,
      portrait: state.actors[key]
        ? portraitOf(state.actors[key], ruleset.data)
        : { prenom: key, nom: '', photo: null, famille: null },
      estimation: now.estimation[key] ?? 0,
      depouille:
        now.depouille.exprimes > 0 ? (now.depouille.voix[key] ?? 0) / now.depouille.exprimes : 0,
      color: palette.colorOf(index),
      outcome: !done
        ? null
        : result.winner === key
          ? 'Élu(e)'
          : !result.winner && result.qualified.includes(key)
            ? 'Qualifié(e)'
            : null,
    }))
    .sort((a, b) => b.estimation - a.estimation || a.name.localeCompare(b.name, 'fr'));
  const participation =
    now.depouille.inscrits > 0 ? percent(now.depouille.votants / now.depouille.inscrits) : '—';
  const newlyCounted = (t: number) =>
    soiree[t]!.nouveaux.flatMap((code) => {
      const r = depResult(code, t);
      const leader = leaderOf(r);
      return r && leader !== null ? [{ code, r, leader }] : [];
    });
  const ticker: TickerItem[] = [
    ...standings.map((s) => ({
      id: `c-${s.key}`,
      text: `${s.name} ${percent(s.estimation)}`,
      color: s.color,
    })),
    { id: 'depouille', text: `${percent(now.partInscrits)} des inscrits dépouillés` },
    { id: 'participation', text: `Participation ${participation}` },
    {
      id: 'departements',
      text: `${now.departementsTermines} départements sur ${now.departements} entièrement dépouillés`,
    },
    ...newlyCounted(tranche).map(({ code, leader }) => ({
      id: `n-${code}`,
      text: `${depName(code)} : ${candidats[leader]!.label} en tête`,
      color: palette.colorOf(leader),
    })),
  ];
  const feed: FeedItem[] = soiree
    .slice(0, tranche + 1)
    .flatMap((t) =>
      newlyCounted(t.tranche).map(({ code, r, leader }) => ({
        id: `${t.tranche}-${code}`,
        heure: t.heure,
        territoire: `${depName(code)} (${code})`,
        leader: candidats[leader]!.label,
        part: formatRatio(r.voix[leader]!, r.exprimes),
        color: palette.colorOf(leader),
      })),
    )
    .reverse();
  const top = standings
    .slice(0, 3)
    .map((s) => `${s.name} ${percent(s.estimation)}`)
    .join(', ');
  const announcement = done
    ? `Minuit : résultats définitifs. ${outcomeText}`
    : `${now.heure} : ${percent(now.partInscrits)} des inscrits dépouillés. Estimation simulée : ${top}.`;

  const followable = m?.departements.filter((d) => d.fichier !== null) ?? [];
  const communeCount = communeFeatures.filter((f) => counted(f.properties.code, drillPart)).length;
  const next = SOIREE_TRANCHES[tranche + 1];

  return (
    <section aria-labelledby="titre-soiree" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-2">
          {done ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-republique-600 px-3 py-1 text-sm font-bold text-white shadow-neon">
              Résultats définitifs
            </p>
          ) : (
            <p className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white shadow-neon-rouge">
              <span aria-hidden="true" className="size-2 animate-direct rounded-full bg-white" />
              En direct
            </p>
          )}
          <h1 id="titre-soiree" className={screenTitle}>
            Soirée électorale
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {round === 1 ? 'Premier' : 'Second'} tour de la présidentielle {state.cycle.annee},{' '}
            {formatGameDate(result.date)}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Heure de la soirée
          </span>
          <span
            data-testid="horloge-soiree"
            className="block font-display text-6xl leading-none font-extrabold tabular-nums [text-shadow:0_0_24px_rgb(98_134_255/0.45)] sm:text-7xl"
          >
            {now.heure}
          </span>
        </p>
      </header>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['Inscrits dépouillés', percent(now.partInscrits)],
          ['Départements terminés', `${now.departementsTermines} / ${now.departements}`],
          ['Participation', participation],
        ].map(([term, value]) => (
          <div
            key={term}
            className="rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-card dark:border-white/10 dark:bg-white/[0.04]"
          >
            <dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">{term}</dt>
            <dd className="font-display text-2xl font-extrabold tabular-nums sm:text-3xl">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div
        role="progressbar"
        aria-label="Avancement du dépouillement"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(now.partInscrits * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
      >
        <span
          className="block h-full rounded-full bg-gradient-to-r from-republique-500 via-white to-red-500 transition-[width] duration-700 ease-sortie"
          style={{ width: `${now.partInscrits * 100}%` }}
        />
      </div>

      {done && (
        <section
          aria-labelledby="titre-verdict"
          className="animate-revele space-y-3 rounded-dossier border border-republique-300 bg-white p-5 shadow-raised dark:border-republique-400/50 dark:bg-slate-900 dark:shadow-neon"
        >
          <h2 id="titre-verdict" className="text-3xl sm:text-4xl">
            {outcomeText}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Résultat simulé du {roundName(round)} tour, identique à celui de l’écran Résultats.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="../resultats" className={buttonPrimary}>
              Voir les résultats complets
            </Link>
            <Link to="../tableau-de-bord" className={buttonSecondary}>
              Retour au tableau de bord
            </Link>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-3">
          <div
            className="overflow-hidden rounded-dossier border border-slate-200/80 shadow-raised dark:border-slate-800"
            style={{ backgroundColor: MAP_SURFACE[mode] }}
          >
            <div className="relative h-[min(58dvh,30rem)] min-h-72 lg:h-[min(calc(100dvh-20rem),44rem)]">
              {manifest.isError ? (
                <ErrorMessage error={manifest.error} onRetry={() => void manifest.refetch()} />
              ) : overview.isError ? (
                <ErrorMessage error={overview.error} onRetry={() => void overview.refetch()} />
              ) : !m || overview.isPending ? (
                <p className="p-4 text-sm text-slate-300">Chargement de la carte…</p>
              ) : (
                <ElectionMap
                  label="Carte du dépouillement"
                  bounds={metropole}
                  layers={layers}
                  level={level}
                  colorOf={colorOf}
                  colorKey={`${tranche}|${mode}|${level}|${drill}|${communeResults.dataUpdatedAt}`}
                  selected={selected}
                  onSelect={onSelect}
                  describe={describe}
                  focus={focus}
                  flash={flash}
                  insets={() => ({
                    top: overlay.current ? overlay.current.offsetHeight + 8 : 0,
                    right: 56,
                    bottom: 0,
                    left: 0,
                  })}
                  controlsClassName="absolute top-3 right-3 z-10"
                  mode={mode}
                  className="h-full w-full"
                />
              )}
              <div
                ref={overlay}
                className="pointer-events-none absolute top-3 left-3 z-20 max-w-[calc(100%-5rem)]"
              >
                {drill ? (
                  <div className="pointer-events-auto flex animate-monte items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 pr-3 shadow-raised backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                    <button
                      type="button"
                      onClick={backToNation}
                      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 ${pressable}`}
                    >
                      <ArrowLeft aria-hidden="true" className="size-5" />
                      <span className="sr-only">Vue nationale</span>
                    </button>
                    <p className="min-w-0 text-sm">
                      <span className="block truncate font-display text-lg leading-tight font-extrabold">
                        {depName(drill)} ({drill})
                      </span>
                      <span className="block text-xs text-slate-600 tabular-nums dark:text-slate-400">
                        {communeGeo.isPending || communeResults.isPending
                          ? 'Chargement des communes…'
                          : `${communeCount} commune(s) dépouillée(s) sur ${communeFeatures.length}`}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-slate-950/80 px-3 py-2 text-xs font-medium text-white backdrop-blur">
                    Touchez un département au détail communal pour suivre ses communes.
                  </p>
                )}
              </div>
              {selected && (
                <div className="absolute inset-x-3 bottom-3 z-20 flex animate-monte items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-3 text-sm shadow-raised backdrop-blur sm:right-auto sm:max-w-sm dark:border-slate-700 dark:bg-slate-900/95">
                  <p role="status" className="min-w-0 flex-1">
                    {describe(selected.level, selected.code)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X aria-hidden="true" className="size-4" />
                    <span className="sr-only">Fermer</span>
                  </button>
                </div>
              )}
            </div>
            <Ticker items={ticker} live={!done} />
          </div>
          {(communeGeo.isError || communeResults.isError) && (
            <ErrorMessage
              error={communeGeo.error ?? communeResults.error}
              onRetry={() => {
                void communeGeo.refetch();
                void communeResults.refetch();
              }}
            />
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div role="group" aria-label="Déroulé de la soirée" className="flex flex-wrap gap-2">
              {done ? (
                <button
                  type="button"
                  className={buttonSecondary}
                  onClick={() => {
                    setTranche(0);
                    setPlaying(!reducedMotion);
                  }}
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Revoir depuis 20 h
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={buttonSecondary}
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? (
                      <Pause aria-hidden="true" className="size-4" />
                    ) : (
                      <Play aria-hidden="true" className="size-4" />
                    )}
                    {playing ? 'Mettre en pause' : 'Reprendre le direct'}
                  </button>
                  <button
                    type="button"
                    className={buttonSecondary}
                    onClick={() => setTranche((t) => Math.min(SOIREE_DERNIERE, t + 1))}
                  >
                    <SkipForward aria-hidden="true" className="size-4" />
                    Passer à {next}
                  </button>
                  <button
                    type="button"
                    className={buttonPrimary}
                    onClick={() => setTranche(SOIREE_DERNIERE)}
                  >
                    <FastForward aria-hidden="true" className="size-4" />
                    Résultats définitifs
                  </button>
                </>
              )}
            </div>
            <div className="min-w-56 flex-1 space-y-1 sm:max-w-xs">
              <label htmlFor="soiree-communes" className={label}>
                Suivre les communes d’un département
              </label>
              <select
                id="soiree-communes"
                className={input}
                value={drill ?? ''}
                disabled={!result.territoire || followable.length === 0}
                onChange={(e) => (e.target.value ? follow(e.target.value) : backToNation())}
              >
                <option value="">Vue nationale (départements)</option>
                {followable.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.nom} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <section aria-labelledby="titre-legende-soiree" className="space-y-2 text-xs">
            <h2 id="titre-legende-soiree" className="font-sans text-sm font-bold tracking-normal">
              Lecture de la carte
            </h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-[4px] ring-1 ring-slate-400/40"
                  style={{ backgroundColor: noData }}
                />
                En attente des résultats
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-[4px]"
                  style={{
                    backgroundColor: mixColors(palette.legend[0]?.color ?? noData, noData, 0.5),
                  }}
                />
                Dépouillement en cours (teinte atténuée)
              </li>
              {palette.legend.map((entry) => (
                <li key={entry.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-[4px]"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.label}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="titre-outre-mer-soiree" className="space-y-2">
            <h2 id="titre-outre-mer-soiree" className="font-sans text-sm font-bold tracking-normal">
              Outre-mer
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {DROM.map((code) => {
                const r = depResult(code);
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => follow(code)}
                      disabled={!departements.has(code)}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-left text-sm shadow-card hover:border-republique-300 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-republique-400/60 dark:hover:shadow-neon ${pressable}`}
                    >
                      <span
                        aria-hidden="true"
                        className="size-3 shrink-0 rounded-[4px]"
                        style={{ backgroundColor: colorOf('departement', code) }}
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold">{DROM_LABELS[code]}</span>
                        <span className="block text-xs text-slate-600 dark:text-slate-400">
                          {r && r.exprimes > 0
                            ? `${candidats[leaderOf(r)!]!.label} en tête`
                            : 'En attente'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <Leaderboard standings={standings} heure={now.heure} final={done} />
          <Feed items={feed} />
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400">
        Horaires, rythme du dépouillement et estimations : simulation du jeu, déterministe (graine
        de la partie). Chaque chiffre affiché est une part exacte du résultat simulé du tour ; à
        minuit, tout est dépouillé, Français de l’étranger et collectivités d’outre-mer compris.
        {!result.territoire &&
          ' Ce tour n’a pas de détail territorial (partie migrée d’une version antérieure) : la carte reste en attente et le résultat national tombe à minuit.'}
      </p>
    </section>
  );
}
