// ERZEUGT AUS etl/noga_groups.json — NICHT VON HAND ÄNDERN.
// Neu erzeugen mit: uv run --project etl zeigmers-etl noga

export interface NogaGroup {
  readonly key: string
  readonly label: string
  readonly color: readonly [number, number, number]
}

export const NOGA_GROUPS: readonly NogaGroup[] = [
  { key: "landwirtschaft", label: "Land- und Forstwirtschaft", color: [0, 158, 115] },
  { key: "industrie", label: "Industrie und Energie", color: [0, 114, 178] },
  { key: "bau", label: "Bau", color: [230, 159, 0] },
  { key: "handel", label: "Handel", color: [213, 94, 0] },
  { key: "verkehr", label: "Verkehr und Logistik", color: [86, 180, 233] },
  { key: "gastgewerbe", label: "Gastgewerbe", color: [204, 121, 167] },
  { key: "ikt", label: "Information und Kommunikation", color: [240, 228, 66] },
  { key: "finanz", label: "Finanz und Versicherung", color: [0, 73, 73] },
  { key: "dienstleistung", label: "Unternehmensdienstleistungen", color: [221, 204, 119] },
  { key: "oeffentlich", label: "Öffentlich, Bildung, Gesundheit", color: [73, 0, 146] },
  { key: "uebrige", label: "Übrige", color: [0, 0, 0] },
]

export const UNKNOWN_COLOR: readonly [number, number, number] = [191, 191, 191]
export const NOGA_UNKNOWN_INDEX = 255
