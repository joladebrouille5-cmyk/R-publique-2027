import type { TerritoryLevel } from '@r2027/shared';
import {
  Map as MapLibre,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BORDER, MAP_SURFACE, MOTIFS, motifImage, SELECTED, type Mode, type Motif } from './colors';
import type { TerritoryCollection } from './data';

setWorkerUrl(workerUrl);

export type BBox = [number, number, number, number];
export type MapSelection = { level: TerritoryLevel; code: string };

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
  /** Vue demandée (recherche, tableau) : la carte s'y ajuste quand `key` change. */
  focus?: { bbox: BBox; key: string } | null;
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
        fitBoundsOptions: { padding: 8 },
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
      }
      setReady(true);
    });
    for (const level of LEVELS) {
      map.on('click', `remplissage-${level}`, (event: MapLayerMouseEvent) => {
        const code = event.features?.[0]?.properties?.code;
        if (typeof code === 'string' && level === latest.current.level)
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
    }
  }, [ready, props.mode]);

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
  }, [ready, props.selected, layers]);

  // Vue demandée.
  const focusKey = props.focus?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !latest.current.focus) return;
    map.fitBounds(asBounds(latest.current.focus.bbox), { padding: 24, maxZoom: 11, duration: 0 });
  }, [ready, focusKey]);

  if (failure) {
    return (
      <div
        role="note"
        className={`${props.className ?? ''} flex items-center justify-center rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm dark:border-slate-700`}
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
        className="h-full w-full overflow-hidden rounded-lg"
      />
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-60 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow dark:bg-slate-100 dark:text-slate-900"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}
