import { ColumnLayer } from '@deck.gl/layers'
import type { Level } from '../data/loader'
import { buildColors } from '../domain/colors'
import { computeElevations, type ScaleMode } from '../domain/scale'

export const MAX_BAR_HEIGHT_M = 12000

/** Hektarbalken füllen ihre Zelle; höhere Stufen brauchen sichtbare Grundflächen. */
export function radiusFor(level: string): number {
  switch (level) {
    case 'hektar':
      return 50
    case 'gemeinde':
      return 700
    default:
      return 4000
  }
}

export interface LayerOptions {
  level: Level
  vmax: number
  mode: ScaleMode
  opacity: number
  visible: boolean
  onClick?: (index: number) => void
}

interface LayerData {
  length: number
  attributes: {
    getPosition: { value: Float32Array; size: 2 }
    getElevation: { value: Float32Array; size: 1 }
    getFillColor: { value: Uint8Array; size: 4; normalized: true }
  }
}

interface CacheEntry {
  values: Float32Array
  noga: Uint8Array
  flags: Uint8Array
  vmax: number
  mode: ScaleMode
  data: LayerData
}

/** Hält je Stufe die zuletzt berechneten Höhen/Farben und das dazugehörige
 *  `data`-Objekt fest. `computeElevations`/`buildColors` hängen nur von
 *  (values, vmax, maxHeight, mode) bzw. (noga, flags) ab — keiner dieser Werte
 *  ändert sich beim Zoomen, nur `opacity`/`visible` tun das. Ohne diesen Cache
 *  würde `buildColumnLayer` bei jedem Zoom-Tick neue Arrays UND ein neues
 *  `data.attributes`-Objekt anlegen; deck.gls `AttributeManager` erkennt einen
 *  unveränderten Buffer nur über Referenzgleichheit (siehe
 *  `Attribute.setBinaryValue`: `state.binaryValue === buffer`) und würde sonst
 *  auch die numerisch unveränderten Positionen bei jedem Tick neu ins GPU
 *  hochladen. Der Cache ist bewusst pro Level-Id (nicht pro Level-Objekt), weil
 *  `main.ts` dieselben drei Level-Objekte über die gesamte Sitzung wiederverwendet. */
const cache = new Map<string, CacheEntry>()

function getLayerData(id: string, level: Level, vmax: number, mode: ScaleMode): LayerData {
  const { arrays, meta } = level
  const cached = cache.get(id)
  if (
    cached &&
    cached.values === arrays.values &&
    cached.noga === arrays.noga &&
    cached.flags === arrays.flags &&
    cached.vmax === vmax &&
    cached.mode === mode
  ) {
    return cached.data
  }

  const elevations = computeElevations(arrays.values, vmax, MAX_BAR_HEIGHT_M, mode)
  const colors = buildColors(arrays.noga, arrays.flags)
  const data: LayerData = {
    length: meta.count,
    attributes: {
      getPosition: { value: arrays.positions, size: 2 },
      getElevation: { value: elevations, size: 1 },
      getFillColor: { value: colors, size: 4, normalized: true },
    },
  }
  cache.set(id, { values: arrays.values, noga: arrays.noga, flags: arrays.flags, vmax, mode, data })
  return data
}

export function buildColumnLayer(id: string, options: LayerOptions): ColumnLayer {
  const { level, vmax, mode, opacity, visible, onClick } = options
  const { meta } = level

  const data = getLayerData(id, level, vmax, mode)

  return new ColumnLayer({
    id,
    data,
    positionFormat: 'XY',
    diskResolution: 4, // Quadrate, passend zum Hektarraster
    angle: 45,
    radius: radiusFor(meta.level),
    radiusUnits: 'meters',
    extruded: true,
    material: false, // flaches Shading, spürbar günstiger
    pickable: true,
    visible: visible && opacity > 0.01,
    opacity,
    updateTriggers: { getElevation: [mode, meta.level] },
    onClick: onClick ? (info) => onClick(info.index) : undefined,
  })
}
