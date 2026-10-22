import type { TerritoryLevel } from '@r2027/shared';
import {
  Map as MapLibre,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type LngLatLike,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Expand, Minus, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BORDER, MAP_SURFACE, MOTIFS, motifImage, SELECTED, type Mode, type Motif } from './colors';
import type { TerritoryCollection } from './data';

setWorkerUrl(workerUrl);

export type BBox = [number, number, number, number];
export type MapSelection = { level: TerritoryLevel; code: string };
/** Marges de la carte recouvertes par des panneaux (barre de recherche, fiche), en pixels. */
export type Insets = { top: number; right: number; bottom: number; left: number };

type Props = {
  /** Nom accessible de la carte (« Carte de la métropole », « Encart Mayotte »…). */
  label: string;
  bounds: BBox;
  /** Contraint le déplacement (encarts DROM). */
  maxBounds?: BBox;
  layers: Partial<Record<TerritoryLevel, TerritoryCollection>>;
  level: TerritoryLevel;
  colorOf: (level: TerritoryLevel, code: string) => string;
  /** Motifs superposés aux couleurs (option « Motifs ») ; absent : aucun motif. */
  motifOf?: ((level: TerritoryLevel, code: string) => Motif) | undefined;
  /** Change à chaque nouvelle coloration (évite de recolorer à chaque rendu). */
  colorKey: string;
  selected: MapSelection | null;
  onSelect: (selection: MapSelection) => void;
  describe: (level: TerritoryLevel, code: string) => string;
  /**
   * Territoires du niveau affiché à faire briller un instant (soirée électorale : ceux qui viennent
   * d'être dépouillés) ; l'éclat se rejoue quand `key` change.
   */
  flash?: { codes: readonly string[]; key: string } | null;
  /** Vue demandée (recherche, clic, tableau) : la carte y vole quand `key` change. */
  focus?: { bbox: BBox; key: string; maxZoom?: number } | null;
  /** Zones recouvertes par l'interface, mesurées au moment de cadrer la vue. */
  insets?: () => Insets;
  /** Boutons de zoom et de vue d'ensemble, placés par cette classe ; absent : pas de boutons. */
  controlsClassName?: string;
  onViewChange?: (bounds: BBox, zoom: number) => void;
  mode: Mode;
  compact?: boolean;
  className?: string;
};

const LEVELS: TerritoryLevel[] = ['region', 'departement', 'commune'];

function webglAvailable(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
const emptyCollection: TerritoryCollection = { type: 'FeatureCollection', features: [] };
const asBounds = (b: BBox): LngLatBoundsLike => [
  [b[0], b[1]],
  [b[2], b[3]],
];
/** Durée des vols de caméra ; MapLibre la ramène à zéro si le mouvement réduit est demandé. */
const FLIGHT_MS = 900;
/** Fondu de l'éclat des territoires qui viennent d'être dépouillés. */
const FLASH_MS = 1_600;
const FLASH = { light: '#2b46d9', dark: '#93aaff' };
const CAMERA_BUTTONS = [
  { kind: 'avant', name: 'Zoom avant', Icon: Plus },
  { kind: 'arriere', name: 'Zoom arrière', Icon: Minus },
  { kind: 'ensemble', name: 'Vue d’ensemble', Icon: Expand },
] as const;

/** Réduit les marges pour qu'il reste au moins 64 px de carte dans chaque direction. */
export function clampInsets(insets: Insets, width: number, height: number): Insets {
  const fit = (a: number, b: number, size: number): [number, number] => {
    const room = Math.max(0, size - 64);
    const total = a + b;
    if (total <= room) return [a, b];
    const ratio = total === 0 ? 0 : room / total;
    return [Math.floor(a * ratio), Math.floor(b * ratio)];
  };
  const [left, right] = fit(insets.left, insets.right, width);
  const [top, bottom] = fit(insets.top, insets.bottom, height);
  return { top, right, bottom, left };
}

/** Marges de cadrage : panneaux qui recouvrent la carte, plus un liseré. */
function paddingFor(element: HTMLElement, props: Pick<Props, 'compact' | 'insets'>): Insets {
  const base = props.compact ? 8 : 16;
  const insets = props.insets?.() ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return clampInsets(
    {
      top: insets.top + base,
      right: insets.right + base,
      bottom: insets.bottom + base,
      left: insets.left + base,
    },
    element.clientWidth,
    element.clientHeight,
  );
}

/**
 * Carte vectorielle d'une zone (métropole ou un DROM), sans fond de carte externe (D6) : les
 * territoires du niveau choisi sont colorés par état d'entité (identifiant = code INSEE), sans
 * recharger les géométries quand les résultats changent.
 */
export function ElectionMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const [ready, setReady] = useState(false);
  /** Territoires affichés après le dernier rendu complet (signal pour les tests et le lecteur d'écran). */
  const [rendered, setRendered] = useState(0);
  const [failure, setFailure] = useState<string | null>(() =>
    webglAvailable() ? null : 'WebGL 2 non pris en charge',
  );
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  /** Point touché sur une commune : la caméra s'y déplace une fois la fiche affichée. */
  const pendingEase = useRef<{ code: string; at: LngLatLike } | null>(null);

  // Création (une fois) : sources et couches vides, gestion des clics et du survol.
  useEffect(() => {
    if (!container.current || failure) return;
    let map: MapLibre;
    try {
      map = new MapLibre({
        container: container.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'fond',
              type: 'background',
              paint: { 'background-color': MAP_SURFACE[latest.current.mode] },
            },
          ],
        },
        bounds: asBounds(latest.current.bounds),
        fitBoundsOptions: { padding: paddingFor(container.current, latest.current) },
        ...(latest.current.maxBounds ? { maxBounds: asBounds(latest.current.maxBounds) } : {}),
        attributionControl: latest.current.compact
          ? false
          : { compact: true, customAttribution: 'IGN, INSEE' },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => setFailure(message));
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      for (const motif of MOTIFS)
        map.addImage(`motif-${motif}`, motifImage(motif, latest.current.mode), { pixelRatio: 2 });
      for (const level of LEVELS) {
        map.addSource(level, { type: 'geojson', data: emptyCollection, promoteId: 'code' });
        map.addLayer({
          id: `remplissage-${level}`,
          type: 'fill',
          source: level,
          paint: { 'fill-color': ['coalesce', ['feature-state', 'color'], '#cbd5e1'] },
        });
        // Une couche par motif, opaque seulement pour les territoires qui portent ce motif
        // (le motif d'un remplissage ne peut pas dépendre de l'état d'entité).
        for (const motif of MOTIFS)
          map.addLayer({
            id: `motif-${level}-${motif}`,
            type: 'fill',
            source: level,
            layout: { visibility: 'none' },
            paint: {
              'fill-pattern': `motif-${motif}`,
              'fill-opacity': [
                'case',
                ['==', ['to-string', ['feature-state', 'motif']], motif],
                1,
                0,
              ],
            },
          });
        map.addLayer({
          id: `contour-${level}`,
          type: 'line',
          source: level,
          paint: {
            'line-color': BORDER[latest.current.mode],
            'line-width': level === 'commune' ? 0.4 : 0.8,
          },
        });
        map.addLayer({
          id: `selection-${level}`,
          type: 'line',
          source: level,
          paint: {
            'line-color': SELECTED[latest.current.mode],
            'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0],
          },
        });
        map.addLayer({
          id: `eclat-${level}`,
          type: 'line',
          source: level,
          paint: {
            'line-color': FLASH[latest.current.mode],
            'line-width': ['case', ['boolean', ['feature-state', 'eclat'], false], 3, 0],
            'line-blur': 1.5,
            'line-opacity': 0,
          },
        });
      }
      setReady(true);
    });
    for (const level of LEVELS) {
      map.on('click', `remplissage-${level}`, (event: MapLayerMouseEvent) => {
        const code = event.features?.[0]?.properties?.code;
        if (typeof code !== 'string' || level !== latest.current.level) return;
        pendingEase.current = level === 'commune' ? { code, at: event.lngLat } : null;
        latest.current.onSelect({ level, code });
      });
      map.on('mousemove', `remplissage-${level}`, (event: MapLayerMouseEvent) => {
        const code = event.features?.[0]?.properties?.code;
        if (typeof code !== 'string' || level !== latest.current.level) return;
        map.getCanvas().style.cursor = 'pointer';
        setHover({
          x: event.point.x,
          y: event.point.y,
          text: latest.current.describe(level, code),
        });
      });
      map.on('mouseleave', `remplissage-${level}`, () => {
        map.getCanvas().style.cursor = '';
        setHover(null);
      });
    }
    map.on('moveend', () => {
      const b = map.getBounds();
      latest.current.onViewChange?.(
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        map.getZoom(),
      );
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [failure]);

  // Géométries de chaque niveau.
  const { layers } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const level of LEVELS) {
      (map.getSource(level) as GeoJSONSource).setData(layers[level] ?? emptyCollection);
    }
    const count = () =>
      setRendered(latest.current.layers[latest.current.level]?.features.length ?? 0);
    map.once('idle', count);
    return () => {
      map.off('idle', count);
    };
  }, [ready, layers]);

  // Niveau affiché ; les contours départementaux restent visibles au niveau communal.
  const motifs = props.motifOf !== undefined;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const level of LEVELS) {
      const visible = level === props.level;
      map.setLayoutProperty(`remplissage-${level}`, 'visibility', visible ? 'visible' : 'none');
      for (const motif of MOTIFS)
        map.setLayoutProperty(
          `motif-${level}-${motif}`,
          'visibility',
          visible && motifs ? 'visible' : 'none',
        );
      map.setLayoutProperty(`selection-${level}`, 'visibility', visible ? 'visible' : 'none');
      map.setLayoutProperty(`eclat-${level}`, 'visibility', visible ? 'visible' : 'none');
      map.setLayoutProperty(
        `contour-${level}`,
        'visibility',
        visible || (props.level === 'commune' && level === 'departement') ? 'visible' : 'none',
      );
    }
    map.setPaintProperty(
      'contour-departement',
      'line-width',
      props.level === 'commune' ? 1.4 : 0.8,
    );
  }, [ready, props.level, motifs]);

  // Couleurs par état d'entité.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const level of LEVELS) {
      for (const feature of layers[level]?.features ?? []) {
        const code = feature.properties.code;
        map.setFeatureState(
          { source: level, id: code },
          {
            color: latest.current.colorOf(level, code),
            motif: latest.current.motifOf?.(level, code) ?? 'aucun',
          },
        );
      }
    }
  }, [ready, layers, props.colorKey]);

  // Thème.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPaintProperty('fond', 'background-color', MAP_SURFACE[props.mode]);
    for (const motif of MOTIFS) map.updateImage(`motif-${motif}`, motifImage(motif, props.mode));
    for (const level of LEVELS) {
      map.setPaintProperty(`contour-${level}`, 'line-color', BORDER[props.mode]);
      map.setPaintProperty(`selection-${level}`, 'line-color', SELECTED[props.mode]);
      map.setPaintProperty(`eclat-${level}`, 'line-color', FLASH[props.mode]);
    }
  }, [ready, props.mode]);

  // Éclat : contour lumineux qui s'estompe (immobile si le mouvement réduit est demandé).
  const flashed = useRef<MapSelection[]>([]);
  const flashKey = props.flash?.key;
  useEffect(() => {
    const map = mapRef.current;
    const flash = latest.current.flash;
    if (!map || !ready || !flash) return;
    const level = latest.current.level;
    for (const previous of flashed.current)
      map.setFeatureState({ source: previous.level, id: previous.code }, { eclat: false });
    for (const code of flash.codes)
      map.setFeatureState({ source: level, id: code }, { eclat: true });
    flashed.current = flash.codes.map((code) => ({ level, code }));
    const layer = `eclat-${level}`;
    map.setPaintProperty(layer, 'line-opacity-transition', { duration: 0, delay: 0 });
    map.setPaintProperty(layer, 'line-opacity', 1);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => {
      map.setPaintProperty(layer, 'line-opacity-transition', { duration: FLASH_MS, delay: 0 });
      map.setPaintProperty(layer, 'line-opacity', 0);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [ready, flashKey]);

  // Sélection.
  const previous = useRef<MapSelection | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (previous.current)
      map.setFeatureState(
        { source: previous.current.level, id: previous.current.code },
        { selected: false },
      );
    if (props.selected)
      map.setFeatureState(
        { source: props.selected.level, id: props.selected.code },
        { selected: true },
      );
    previous.current = props.selected;
    // Commune touchée : la caméra glisse vers elle, dans la partie de la carte restée visible.
    const ease = pendingEase.current;
    pendingEase.current = null;
    if (ease && props.selected?.code === ease.code && container.current) {
      const p = paddingFor(container.current, latest.current);
      map.easeTo({
        center: ease.at,
        zoom: latest.current.compact ? map.getZoom() : Math.min(Math.max(map.getZoom(), 8.5), 11),
        offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2],
        duration: FLIGHT_MS * 0.75,
      });
    }
  }, [ready, props.selected, layers]);

  // Vue demandée.
  const focusKey = props.focus?.key;
  useEffect(() => {
    const map = mapRef.current;
    const focus = latest.current.focus;
    if (!map || !ready || !focus || !container.current) return;
    map.fitBounds(asBounds(focus.bbox), {
      padding: paddingFor(container.current, latest.current),
      maxZoom: focus.maxZoom ?? 11,
      duration: FLIGHT_MS,
    });
  }, [ready, focusKey]);

  const moveCamera = (kind: (typeof CAMERA_BUTTONS)[number]['kind']) => {
    const map = mapRef.current;
    if (!map || !container.current) return;
    if (kind === 'avant') map.zoomIn({ duration: FLIGHT_MS / 3 });
    else if (kind === 'arriere') map.zoomOut({ duration: FLIGHT_MS / 3 });
    else
      map.fitBounds(asBounds(latest.current.bounds), {
        padding: paddingFor(container.current, latest.current),
        duration: FLIGHT_MS,
      });
  };

  if (failure) {
    return (
      <div
        role="note"
        className={`${props.className ?? ''} flex items-center justify-center rounded-[inherit] border border-dashed border-slate-300 p-4 text-center text-sm dark:border-slate-700`}
      >
        La carte nécessite WebGL, indisponible sur cet appareil ({failure}). Le tableau des
        résultats reste consultable.
      </div>
    );
  }
  return (
    <div className={`relative ${props.className ?? ''}`}>
      <div
        ref={container}
        role="region"
        aria-label={props.label}
        data-ready={ready && rendered > 0 ? 'oui' : 'non'}
        data-territoires={rendered}
        className="h-full w-full overflow-hidden rounded-[inherit]"
      />
      {props.controlsClassName !== undefined && (
        <div
          role="group"
          aria-label="Zoom de la carte"
          className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-raised backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 ${props.controlsClassName}`}
        >
          {CAMERA_BUTTONS.map(({ kind, name, Icon }) => (
            <button
              key={name}
              type="button"
              title={name}
              disabled={!ready}
              onClick={() => moveCamera(kind)}
              className="flex size-11 items-center justify-center text-slate-700 transition-colors not-last:border-b not-last:border-slate-200/80 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 dark:text-slate-200 dark:not-last:border-slate-700 dark:hover:bg-slate-800"
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className="sr-only">{name}</span>
            </button>
          ))}
        </div>
      )}
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-60 animate-apparait rounded-xl bg-slate-950/90 px-2.5 py-1.5 text-xs font-medium text-white shadow-raised dark:bg-white/95 dark:text-slate-900"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}
