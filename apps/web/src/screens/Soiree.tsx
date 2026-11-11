import {
  avancement,
  candidateName,
  communeDepouillee,
  departementsTermines,
  DROM_LABELS,
  fraction,
  heureSoiree,
  rythmeDepartements,
  SOIREE_MINUTES,
  SOIREE_PAS,
  soireeElectorale,
  soireeInstant,
  type RoundResult,
  type TerritoryLevel,
} from '@r2027/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Box,
  FastForward,
  Map as MapIcon,
  RotateCcw,
  SkipForward,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useRuleset } from '../api/hooks';
import { verdictCue } from '../audio/ambiance';
import { useAmbiance, useCue } from '../audio/hooks';
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
import { boardShapes } from '../plateau/geometry';
import { colorOf as campColor, portraitOf } from '../portraits';
import { useDecision3D } from '../scenes3d/appareil';
import { Cinematique, FondStatique, Sequence } from '../scenes3d/Cinematique';
import { arcsDeReport, ralliements } from '../scenes3d/reports';
import { Confettis, SceneCarte, SceneInvestiture, SceneRalliement } from '../scenes3d/scenes';
import { useCurrentGame } from './GameLayout';
import { NatureBadge } from './map/parts';
import {
  Feed,
  Leaderboard,
  percent,
  Ticker,
  type FeedItem,
  type Standing,
  type TickerItem,
} from './soiree/parts';

// Écran « Soirée électorale » (phases 9 et 11) : le soir d'un tour, le dépouillement simulé est
// restitué minute par minute (module `soiree` de @r2027/shared), à la vitesse choisie par le
// joueur. La carte se colore département par département puis commune par commune aux couleurs
// du candidat en tête ; rien n'est recalculé ici : chaque chiffre est une part exacte du
// résultat du moteur, et l'état affiché ne dépend que de l'heure de la soirée.

/** Vitesses de lecture : minutes de soirée par seconde réelle. */
export const SOIREE_VITESSES = [
  { id: 'pause', libelle: 'Pause', minutesParSeconde: 0 },
  { id: 'reel', libelle: 'Temps réel', minutesParSeconde: 1 / 60 },
  { id: 'lent', libelle: 'Lent', minutesParSeconde: 1 },
  { id: 'x2', libelle: '×2', minutesParSeconde: 2 },
  { id: 'x5', libelle: '×5', minutesParSeconde: 5 },
] as const;
type Vitesse = (typeof SOIREE_VITESSES)[number]['id'];
const VITESSE_AIDE: Record<Vitesse, string> = {
  pause: 'Dépouillement arrêté : explorez la carte et les départements.',
  reel: 'Une minute de soirée par minute, comme à la télévision.',
  lent: 'Une minute de soirée par seconde.',
  x2: 'Deux minutes de soirée par seconde.',
  x5: 'Cinq minutes de soirée par seconde.',
};
/** Pas de l'horloge de lecture, en millisecondes. */
const TICK_MS = 250;
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

  // Déroulé : l'horloge avance à la vitesse choisie (en pause si le mouvement est réduit) ; tout
  // l'affichage découle de la minute entamée.
  const soiree = useMemo(() => soireeElectorale(result, seed), [result, seed]);
  const rythme = useMemo(() => rythmeDepartements(result, seed), [result, seed]);
  const [clock, setClock] = useState(0);
  const [vitesse, setVitesse] = useState<Vitesse>(() => (reducedMotion ? 'pause' : 'x5'));
  const minute = Math.min(SOIREE_MINUTES, Math.floor(clock));
  const done = minute >= SOIREE_MINUTES;
  // Son (phase 19) : pas de musique pendant le direct ; le jingle de 20 h à l'ouverture (et à
  // chaque « Revoir depuis 20 h »), celui de la victoire ou de la défaite à la fin du dépouillement.
  useAmbiance('silence', 2);
  useCue(minute === 0 ? 'vingt-heures' : null);
  useCue(done ? verdictCue(result, state.player.actorId) : null);
  const rate = SOIREE_VITESSES.find((v) => v.id === vitesse)!.minutesParSeconde;
  useEffect(() => {
    if (rate === 0 || done) return;
    const timer = window.setInterval(
      () => setClock((c) => Math.min(SOIREE_MINUTES, c + (rate * TICK_MS) / 1000)),
      TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [rate, done]);
  const now = useMemo(
    () => soireeInstant(result, seed, minute, rythme),
    [result, seed, minute, rythme],
  );
  // Minute précédemment affichée : les territoires terminés depuis brillent un instant.
  const [shown, setShown] = useState({ minute, previous: -1 });
  if (shown.minute !== minute) setShown({ minute, previous: shown.minute });
  const jumpTo = (target: number) => setClock(Math.max(0, Math.min(SOIREE_MINUTES, target)));

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
  const counts = useMemo(() => result.territoire?.departements ?? {}, [result]);
  const partOf = (code: string, t = minute) => avancement(rythme[code], t);
  const depResult = (code: string, t = minute): TerritoryResult | undefined => {
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

  // Éclat des territoires qui viennent d'être dépouillés (depuis la minute affichée avant).
  const flash =
    level === 'commune' && drill
      ? {
          key: `c-${drill}-${minute}`,
          codes: communeFeatures
            .map((f) => f.properties.code)
            .filter(
              (code) =>
                counted(code, drillPart) &&
                !(shown.previous >= 0 && counted(code, partOf(drill, shown.previous))),
            ),
        }
      : { key: `d-${minute}`, codes: departementsTermines(rythme, shown.previous, minute) };

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

  // Phase 26 : la soirée en 3D (repli : la carte 2D). Départements extrudés à la hauteur du score
  // du candidat en tête, colorés en onde au fil du dépouillement ; au second tour, les arcs des
  // reports de voix. Tout vient du résultat déjà dépouillé par le moteur.
  const scene3d = useDecision3D().mode === '3d';
  const [vue, setVue] = useState<'3d' | '2d'>('3d');
  const [reports, setReports] = useState(true);
  const shapes = useMemo(
    () => (overview.data?.departements ? boardShapes(overview.data.departements) : null),
    [overview.data],
  );
  const etats3d = (() => {
    const out: Record<string, { couleur: string; score: number; avancement: number }> = {};
    for (const [code, c] of Object.entries(counts)) {
      const final = fromCounts(c, keys);
      const leader = leaderOf(final);
      out[code] = {
        couleur: leader === null ? noData : palette.colorOf(leader),
        score: leader === null || final.exprimes === 0 ? 0 : final.voix[leader]! / final.exprimes,
        avancement: avancement(rythme[code], minute),
      };
    }
    return out;
  })();
  const transferts = useMemo(
    () => (round === 2 ? ralliements(state.elections.consignes, state.elections.t1) : []),
    [round, state.elections],
  );
  const arcs3d = useMemo(
    () =>
      round === 2 && reports
        ? arcsDeReport(state.elections.consignes, state.elections.t1).map((arc) => ({
            ...arc,
            couleur: palette.colorOf(keys.indexOf(arc.vers)),
          }))
        : [],
    [round, reports, state.elections, palette, keys],
  );
  const en3d = scene3d && vue === '3d' && !drill && shapes !== null;

  // Transitions de fin de soirée : ralliement (premier tour, des candidats éliminés soutiennent le
  // joueur qualifié), investiture (second tour, le mandat commence) et confettis de la victoire.
  const playerId = state.player.actorId;
  const rallies = useMemo(
    () =>
      round === 1 && playerId && result.qualified.includes(playerId)
        ? ralliements(state.elections.consignes, result).filter((r) => r.vers === playerId)
        : [],
    [round, playerId, result, state.elections.consignes],
  );
  const [transition, setTransition] = useState<'ralliement' | 'investiture' | null>(null);
  const [joue, setJoue] = useState(false);
  if (done && !joue) {
    setJoue(true);
    if (rallies.length > 0) setTransition('ralliement');
    else if (round === 2 && result.winner && state.meta.phase === 'presidence')
      setTransition('investiture');
  }
  const victoire = done && result.winner !== null && result.winner === playerId;
  const campJoueur = campColor(playerId ? state.actors[playerId] : undefined, ruleset.data);

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
        : { prenom: key, nom: '', photo: null, famille: null, illustration: null },
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
  // Départements terminés dans l'intervalle de minutes ]de, a], avec leur candidat en tête.
  const finishedBetween = (de: number, a: number) =>
    departementsTermines(rythme, de, a).flatMap((code) => {
      const r = depResult(code, a);
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
    ...finishedBetween(minute < SOIREE_PAS ? -1 : minute - SOIREE_PAS, minute).map(
      ({ code, leader }) => ({
        id: `n-${code}`,
        text: `${depName(code)} : ${candidats[leader]!.label} en tête`,
        color: palette.colorOf(leader),
      }),
    ),
  ];
  const feed: FeedItem[] = finishedBetween(-1, minute)
    .map((item) => ({ ...item, fin: rythme[item.code]!.fin }))
    .sort((a, b) => b.fin - a.fin || a.code.localeCompare(b.code))
    .map(({ code, r, leader, fin }) => ({
      id: code,
      heure: heureSoiree(fin),
      territoire: `${depName(code)} (${code})`,
      leader: candidats[leader]!.label,
      part: formatRatio(r.voix[leader]!, r.exprimes),
      color: palette.colorOf(leader),
    }));
  const top = standings
    .slice(0, 3)
    .map((s) => `${s.name} ${percent(s.estimation)}`)
    .join(', ');
  // Annonce polie à chaque nouvelle estimation (toutes les 30 minutes), pas à chaque minute.
  const point = soiree[now.tranche]!;
  const announcement = done
    ? `Minuit : résultats définitifs. ${outcomeText}`
    : `${point.heure} : ${percent(point.partInscrits)} des inscrits dépouillés. Estimation simulée : ${top}.`;

  const followable = m?.departements.filter((d) => d.fichier !== null) ?? [];
  const communeCount = communeFeatures.filter((f) => counted(f.properties.code, drillPart)).length;
  const nextEstimate = Math.min(SOIREE_MINUTES, (now.tranche + 1) * SOIREE_PAS);

  return (
    <section aria-labelledby="titre-soiree" className="habillage-tele space-y-4">
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
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-encre-2">
            <span>
              {round === 1 ? 'Premier' : 'Second'} tour de la présidentielle {state.cycle.annee},{' '}
              {formatGameDate(result.date)}
            </span>
            {/* Géographie électorale de démonstration (fictive) ou simulée sur la base importée. */}
            {result.territoire && (
              <NatureBadge nature={result.territoire.nature === 'fictif' ? 'fictif' : 'simule'} />
            )}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xs font-semibold text-encre-2">Heure de la soirée</span>
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
            <dt className="text-xs font-semibold text-encre-2">{term}</dt>
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

      {victoire && !transition && <Confettis couleur={campJoueur} />}
      {transition === 'ralliement' && (
        <Cinematique
          titre={
            rallies.length === 1
              ? `${nameOf(rallies[0]!.de)} appelle à voter pour vous`
              : `${rallies.length} candidats appellent à voter pour vous`
          }
          sousTitre={`${rallies.map((r) => `${nameOf(r.de)} (${percent(r.part / 10_000)} au premier tour)`).join(', ')}.`}
          note="Consignes de vote simulées : aucun propos n’est prêté à une personne réelle."
          dureeMs={12_000}
          onFin={() => setTransition(null)}
        >
          <Sequence
            apresMs={7500}
            premier={
              <SceneRalliement
                rallie={campColor(state.actors[rallies[0]!.de], ruleset.data)}
                camp={campJoueur}
                duree={8}
                label="Deux foules aux couleurs de chaque camp se rejoignent et n’en font plus qu’une"
                repli={
                  <FondStatique
                    couleurs={[campColor(state.actors[rallies[0]!.de], ruleset.data), campJoueur]}
                  />
                }
                className="h-full w-full"
              />
            }
            second={
              shapes && (
                <SceneCarte
                  nom="reports"
                  label={`Reports de voix : ${rallies.length} arc(s) vers vos départements les plus forts`}
                  shapes={shapes}
                  etats={Object.fromEntries(
                    Object.entries(etats3d).map(([code, e]) => [code, { ...e, avancement: 1 }]),
                  )}
                  arcs={arcsDeReport(
                    state.elections.consignes.filter((c) => c.toActorId === playerId),
                    result,
                  ).map((arc) => ({ ...arc, couleur: campJoueur }))}
                  attente={noData}
                  repli={null}
                  intro={false}
                  className="h-full w-full"
                />
              )
            }
          />
        </Cinematique>
      )}
      {transition === 'investiture' && (
        <Cinematique
          titre="L’investiture"
          sousTitre={`${nameOf(result.winner!)} entre à l’Élysée : le quinquennat commence.`}
          note="Cour de l’Élysée stylisée ; cérémonie simulée."
          dureeMs={11_000}
          onFin={() => setTransition(null)}
        >
          <SceneInvestiture
            duree={10}
            label="La cour d’honneur de l’Élysée : tapis rouge, garde républicaine, drapeau"
            repli={<FondStatique couleurs={['#1f3a93', '#f4f1ea', '#d0312d']} />}
            className="h-full w-full bg-linear-to-b from-[#f2c9a0] via-[#f6e3c8] to-[#cfe0f2]"
          />
        </Cinematique>
      )}
      {done && (
        <section
          aria-labelledby="titre-verdict"
          className="animate-revele space-y-3 rounded-dossier border border-republique-300 bg-white p-5 shadow-raised dark:border-republique-400/50 dark:bg-slate-900 dark:shadow-neon"
        >
          <h2 id="titre-verdict" className="text-3xl sm:text-4xl">
            {outcomeText}
          </h2>
          <p className="text-sm text-encre-2">
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
              ) : en3d ? (
                <SceneCarte
                  label={`Carte de France en relief : ${now.departementsTermines} départements dépouillés sur ${now.departements}`}
                  shapes={shapes}
                  etats={etats3d}
                  arcs={arcs3d}
                  attente={noData}
                  repli={<p className="p-4 text-sm text-slate-300">Chargement de la carte…</p>}
                  className="h-full w-full"
                />
              ) : (
                <ElectionMap
                  label="Carte du dépouillement"
                  bounds={metropole}
                  layers={layers}
                  level={level}
                  colorOf={colorOf}
                  colorKey={`${minute}|${mode}|${level}|${drill}|${communeResults.dataUpdatedAt}`}
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
                  <div className="pointer-events-auto flex animate-monte items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 pr-3 shadow-raised dark:border-slate-700 dark:bg-slate-900/95">
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
                ) : en3d ? (
                  <p className="rounded-2xl bg-slate-950/90 px-3 py-2 text-xs font-medium text-white">
                    Relief : score du candidat en tête. Tournez et zoomez la carte au doigt.
                  </p>
                ) : (
                  <p className="rounded-2xl bg-slate-950/90 px-3 py-2 text-xs font-medium text-white">
                    Touchez un département au détail communal pour suivre ses communes.
                  </p>
                )}
              </div>
              {scene3d && shapes && !drill && (
                <button
                  type="button"
                  onClick={() => setVue(vue === '3d' ? '2d' : '3d')}
                  aria-pressed={vue === '3d'}
                  className={`absolute right-3 bottom-3 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-4 text-sm font-bold shadow-raised dark:border-slate-700 dark:bg-slate-900/95 ${pressable}`}
                >
                  {vue === '3d' ? (
                    <MapIcon aria-hidden="true" className="size-4" />
                  ) : (
                    <Box aria-hidden="true" className="size-4" />
                  )}
                  {vue === '3d' ? 'Vue 2D' : 'Vue 3D'}
                </button>
              )}
              {selected && (
                <div className="absolute inset-x-3 bottom-3 z-20 flex animate-monte items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-3 text-sm shadow-raised sm:right-auto sm:max-w-sm dark:border-slate-700 dark:bg-slate-900/95">
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
            <div className="w-full space-y-2">
              <fieldset className="space-y-1.5">
                <legend className={label}>Vitesse du dépouillement</legend>
                <div className="flex flex-wrap gap-1.5">
                  {SOIREE_VITESSES.map((v) => (
                    <label
                      key={v.id}
                      className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-republique-500 ${
                        vitesse === v.id
                          ? 'border-republique-600 bg-republique-600 text-white shadow-neon'
                          : 'border-slate-200/80 bg-white hover:border-republique-300 dark:border-white/10 dark:bg-white/[0.04]'
                      } ${done && v.id !== 'pause' ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="vitesse-soiree"
                        value={v.id}
                        checked={vitesse === v.id}
                        disabled={done && v.id !== 'pause'}
                        onChange={() => setVitesse(v.id)}
                        className="sr-only"
                      />
                      {v.libelle}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-encre-2">{VITESSE_AIDE[vitesse]}</p>
              </fieldset>
              <div role="group" aria-label="Déroulé de la soirée" className="flex flex-wrap gap-2">
                {done ? (
                  <button
                    type="button"
                    className={buttonSecondary}
                    onClick={() => {
                      jumpTo(0);
                      setVitesse(reducedMotion ? 'pause' : 'x5');
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
                      onClick={() => jumpTo(nextEstimate)}
                    >
                      <SkipForward aria-hidden="true" className="size-4" />
                      Passer à {heureSoiree(nextEstimate)}
                    </button>
                    <button
                      type="button"
                      className={buttonPrimary}
                      onClick={() => jumpTo(SOIREE_MINUTES)}
                    >
                      <FastForward aria-hidden="true" className="size-4" />
                      Résultats définitifs
                    </button>
                  </>
                )}
              </div>
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

          {transferts.length > 0 && (
            <section aria-labelledby="titre-reports" className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="titre-reports" className="font-sans text-sm font-bold tracking-normal">
                  Reports de voix
                </h2>
                {en3d && (
                  <label className="inline-flex min-h-9 items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={reports}
                      onChange={(event) => setReports(event.target.checked)}
                      className="size-4 accent-republique-600"
                    />
                    Arcs sur la carte 3D
                  </label>
                )}
              </div>
              <ReportsListe
                transferts={transferts}
                nameOf={nameOf}
                colorOf={(id) => palette.colorOf(keys.indexOf(id))}
              />
            </section>
          )}

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
                        <span className="block text-xs text-encre-2">
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
          <Leaderboard standings={standings} heure={point.heure} final={done} />
          <Feed items={feed} />
        </div>
      </div>

      <p className="text-xs text-encre-2">
        Horaires, rythme du dépouillement et estimations : simulation du jeu, déterministe (graine
        de la partie). Chaque chiffre affiché est une part exacte du résultat simulé du tour ; à
        minuit, tout est dépouillé, Français de l’étranger et collectivités d’outre-mer compris.
        {!result.territoire &&
          ' Ce tour n’a pas de détail territorial (partie migrée d’une version antérieure) : la carte reste en attente et le résultat national tombe à minuit.'}
      </p>
    </section>
  );
}

/**
 * Reports de voix en liste (phase 26) : la lecture écrite des arcs de la carte 3D, et leur repli.
 * La barre de chaque ralliement est proportionnelle aux voix du premier tour du candidat rallié.
 */
export function ReportsListe({
  transferts,
  nameOf,
  colorOf,
}: {
  transferts: readonly { de: string; vers: string; poids: number; part: number }[];
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
}) {
  const max = Math.max(1, ...transferts.map((t) => t.poids));
  return (
    <ul className="space-y-1.5" aria-label="Reports de voix du premier tour">
      {transferts.map((t) => (
        <li key={`${t.de}-${t.vers}`} className="space-y-0.5">
          <span className="block">
            <strong>{nameOf(t.de)}</strong> → {nameOf(t.vers)} :{' '}
            <span className="tabular-nums">
              {t.poids.toLocaleString('fr-FR')} voix du premier tour ({percent(t.part / 10_000)})
            </span>
          </span>
          <span
            aria-hidden="true"
            className="block h-1.5 rounded-full"
            style={{ width: `${(t.poids / max) * 100}%`, backgroundColor: colorOf(t.vers) }}
          />
        </li>
      ))}
      <li className="text-encre-2">
        Consignes de vote simulées ; le réservoir de voix n’est pas un report mesuré.
      </li>
    </ul>
  );
}
