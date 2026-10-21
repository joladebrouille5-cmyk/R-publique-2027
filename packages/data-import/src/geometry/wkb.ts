import type { MultiPolygon, Polygon, Position } from 'geojson';

/** Erreur de lecture d'une géométrie : l'import s'arrête, rien n'est deviné. */
export class GeometryError extends Error {
  override name = 'GeometryError';
}

const WKB_POLYGON = 3;
const WKB_MULTIPOLYGON = 6;

/** Taille de l'enveloppe d'un en-tête GeoPackage selon son indicateur (0 à 4). */
const ENVELOPE_BYTES = [0, 32, 48, 48, 64] as const;

class Reader {
  private offset: number;
  private little = true;
  constructor(
    private readonly view: DataView,
    offset: number,
  ) {
    this.offset = offset;
  }

  byteOrder(): void {
    const order = this.view.getUint8(this.offset);
    if (order > 1) throw new GeometryError(`Ordre des octets WKB invalide : ${order}`);
    this.little = order === 1;
    this.offset += 1;
  }

  uint32(): number {
    const value = this.view.getUint32(this.offset, this.little);
    this.offset += 4;
    return value;
  }

  float64(): number {
    const value = this.view.getFloat64(this.offset, this.little);
    this.offset += 8;
    return value;
  }

  ring(): Position[] {
    const count = this.uint32();
    if (count < 4) throw new GeometryError(`Anneau de ${count} points (4 au minimum)`);
    const points: Position[] = [];
    for (let i = 0; i < count; i++) points.push([this.float64(), this.float64()]);
    return points;
  }

  polygonBody(): Position[][] {
    const rings = this.uint32();
    const result: Position[][] = [];
    for (let i = 0; i < rings; i++) result.push(this.ring());
    return result;
  }

  geometry(): Polygon | MultiPolygon {
    this.byteOrder();
    const type = this.uint32();
    if (type === WKB_POLYGON) return { type: 'Polygon', coordinates: this.polygonBody() };
    if (type === WKB_MULTIPOLYGON) {
      const count = this.uint32();
      const polygons: Position[][][] = [];
      for (let i = 0; i < count; i++) {
        this.byteOrder();
        const inner = this.uint32();
        if (inner !== WKB_POLYGON) throw new GeometryError(`Polygone attendu, type WKB ${inner}`);
        polygons.push(this.polygonBody());
      }
      return { type: 'MultiPolygon', coordinates: polygons };
    }
    throw new GeometryError(`Type WKB non pris en charge : ${type} (polygones uniquement)`);
  }
}

/** Lit une géométrie WKB (polygone ou multipolygone, en 2D). */
export function readWkb(bytes: Uint8Array, offset = 0): Polygon | MultiPolygon {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return new Reader(view, offset).geometry();
}

/**
 * Lit une géométrie au format binaire GeoPackage : en-tête « GP », version, indicateurs,
 * identifiant de système de coordonnées, enveloppe facultative, puis WKB standard.
 */
export function readGpkgGeometry(bytes: Uint8Array, expectedSrs = 4326): Polygon | MultiPolygon {
  if (bytes.length < 8 || bytes[0] !== 0x47 || bytes[1] !== 0x50) {
    throw new GeometryError('En-tête GeoPackage absent (« GP » attendu)');
  }
  const flags = bytes[3]!;
  if (flags & 0b0001_0000) throw new GeometryError('Géométrie vide');
  if (flags & 0b0010_0000)
    throw new GeometryError('Géométrie GeoPackage étendue non prise en charge');
  const little = (flags & 1) === 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const srs = view.getInt32(4, little);
  if (srs !== expectedSrs)
    throw new GeometryError(`Système de coordonnées ${srs} (${expectedSrs} attendu)`);
  const envelope = ENVELOPE_BYTES[(flags >> 1) & 0b111];
  if (envelope === undefined) throw new GeometryError('Indicateur d’enveloppe invalide');
  return readWkb(bytes, 8 + envelope);
}
