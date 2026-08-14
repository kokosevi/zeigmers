import { MATERIAL_AMBIENT, MATERIAL_DIFFUSE } from './material'
import { AMBIENT_INTENSITY, SUN_DIRECTION, SUN_INTENSITY } from './lighting'

/** Normale einer Deckfläche (Gemeinde oder Kanton): immer senkrecht nach
 *  oben — deck.gl setzt `props.normal = vec3(0.0, 0.0, 1.0)` für jeden
 *  Top-Vertex einer extrudierten `GeoJsonLayer`/`SolidPolygonLayer`,
 *  unabhängig von der Polygonform (`@deck.gl/layers`,
 *  `solid-polygon-layer-vertex-top.glsl.ts`). */
const TOP_FACE_NORMAL: readonly [number, number, number] = [0, 0, 1]

function dot3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2])
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length]
}

// luma.gl ruft `lighting_getLightColor(surfaceColor, -directionalLight.direction,
// view_direction, normal, color)` auf (`@luma.gl/shadertools`,
// `phong-shaders-glsl.ts`) — `direction` ist die Richtung, in die das Licht
// unterwegs ist, der Shader braucht dort den Vektor ZUR Quelle, daher das
// Vorzeichen hier ebenfalls umgedreht.
const TO_SUN = normalize3([-SUN_DIRECTION[0], -SUN_DIRECTION[1], -SUN_DIRECTION[2]])

/** `max(dot(lightDirection, normal), 0)` aus derselben Datei — für eine nach
 *  oben zeigende Deckfläche vereinfacht sich das auf die z-Komponente von
 *  `TO_SUN` (≈ 0.9045 bei der aktuellen Lichtrichtung: die Sonne steht fast
 *  im Zenit, siehe `lighting.ts`). */
const TOP_FACE_LAMBERTIAN = Math.max(dot3(TO_SUN, TOP_FACE_NORMAL), 0)

/** Faktor, mit dem eine Deckfläche ihre Rohfarbe unter `mapLightingEffect` +
 *  `MAP_MATERIAL` multipliziert bekommt — Ambient- plus Diffusanteil aus
 *  `lighting_getLightColor` (s. o.), **ohne** den Specular-Anteil (Begründung
 *  bei `litTopFaceColor`). Ambient- und Sonnenlicht sind beide reines Weiss
 *  (`LIGHT_COLOR` in `lighting.ts`), der Faktor ist deshalb ein einzelner
 *  Skalar für alle drei Kanäle — er verschiebt nur die Helligkeit, nie den
 *  Farbton. */
export const TOP_FACE_LIGHT_FACTOR =
  MATERIAL_AMBIENT * AMBIENT_INTENSITY + TOP_FACE_LAMBERTIAN * MATERIAL_DIFFUSE * SUN_INTENSITY

/** Näherung der Farbe, die eine Deckfläche (Gemeinde- oder Kantonsfläche)
 *  unter dem aktuellen Licht/Material tatsächlich zeigt — für die Legende
 *  (Finding 2a des Farb-Reports), die bislang die rohe, ungeshadete
 *  Branchenfarbe zeigte und dadurch sichtbar von der Karte abwich (Bau
 *  orange in der Legende, gelb auf der beleuchteten Deckfläche).
 *
 *  Exakt reproduziert: Ambient- und Diffusanteil aus `lighting_getLightColor`
 *  für eine senkrecht nach oben zeigende Fläche — deterministisch, unabhängig
 *  von Kamera oder Blickwinkel.
 *
 *  Bewusst ausgelassen: der Specular-Anteil. Er hängt von `view_direction`
 *  ab (`normalize(cameraPosition - position)`), also vom tatsächlichen
 *  Blickwinkel der Kamera — der sich in dieser Karte mit jeder Drehung durch
 *  den Nutzer ändert (`viewState` bleibt beim Ansichtswechsel zwar
 *  unangetastet, ist aber jederzeit frei orbitierbar). Für den Specular-Anteil
 *  gibt es damit keinen einzelnen "richtigen" Wert, den ein statischer
 *  Legenden-Punkt zeigen könnte; ihn wegzulassen macht die Näherung zu einer
 *  benennbaren Grösse statt einer geratenen. Da `MAP_MATERIAL.specularColor`
 *  ([45, 45, 45], neutral grau) ist, verschiebt das Weglassen nur die
 *  Helligkeit, nie den Farbton — und zwar nachweisbar begrenzt: der
 *  Specular-Term aus `lighting_getLightColor` ist
 *  `pow(specular_angle, shininess) * specularColor` mit `specular_angle` ∈
 *  [0, 1], multipliziert mit der Sonnenfarbe (`SUN_INTENSITY` × Weiss). Sein
 *  Maximum — unabhängig vom tatsächlichen Blickwinkel — liegt bei
 *  `1 × (45/255) × SUN_INTENSITY` ≈ 0.132 auf den 0..1-Faktor (≈ 34 von 255
 *  Helligkeitseinheiten). Der Swatch kann also höchstens um diesen Betrag
 *  dunkler wirken als der hellste Punkt der echten Deckfläche, nie
 *  andersfarbig. */
export function litTopFaceColor(rgb: readonly [number, number, number]): [number, number, number] {
  const clamp = (channel: number) => Math.min(255, Math.max(0, Math.round(channel * TOP_FACE_LIGHT_FACTOR)))
  return [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])]
}
