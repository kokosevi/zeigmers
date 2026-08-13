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
  mode: ScaleMode
  opacity: number
  visible: boolean
  onClick?: (index: number) => void
}

export function buildColumnLayer(id: string, options: LayerOptions): ColumnLayer {
  const { level, mode, opacity, visible, onClick } = options
  const { arrays, meta } = level

  const elevations = computeElevations(arrays.values, meta.stats.max, MAX_BAR_HEIGHT_M, mode)
  const colors = buildColors(arrays.noga, arrays.flags)

  return new ColumnLayer({
    id,
    data: {
      length: meta.count,
      attributes: {
        getPosition: { value: arrays.positions, size: 2 },
        getElevation: { value: elevations, size: 1 },
        getFillColor: { value: colors, size: 4, normalized: true },
      },
    },
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
