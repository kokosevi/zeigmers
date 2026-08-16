import { TextLayer } from '@deck.gl/layers'
import { CollisionFilterExtension, type CollisionFilterExtensionProps } from '@deck.gl/extensions'
import { metricValue, type Metric } from '../domain/metric'
import type { SelectionResult } from '../domain/selection'
import type { Company } from './visible'

/** Zwölf Namen: genug, dass die Karte lesbar wird («Nestlé», «Roche»,
 *  «Novartis» statt anonymer Stäbe), wenig genug, dass sie nicht zur
 *  Beschriftungstapete wird. */
export const TOP_LABEL_COUNT = 12

/** Die grössten Gesellschaften der aktuellen Auswahl, sortiert nach dem
 *  BETRAG der aktiven Kennzahl — nicht nach dem Wert selbst. Bei der
 *  Kennzahl «Gewinn» ist ein Verlust von 900 Mio. ein grösserer Ausschlag
 *  als ein Gewinn von 10 Mio.; eine Sortierung nach dem Wert würde den
 *  kleinen Gewinn fälschlich vor den grossen Verlust einreihen.
 *
 *  Über `result.withValue`, nicht `result.visible`: eine Firma ohne Wert in
 *  dieser Kennzahl hat nichts, das sich als «grösste» einordnen liesse.
 *  `result` kommt bereits aus `applySelection()` — die Beschriftung folgt
 *  damit demselben Branchen-/Rechtsformfilter wie die Säulen selbst, statt
 *  unabhängig davon immer dieselben Namen zu zeigen. */
export function topByMetric(result: SelectionResult, metric: Metric, count: number): Company[] {
  return [...result.withValue]
    .sort((a, b) => Math.abs(metricValue(b, metric) ?? 0) - Math.abs(metricValue(a, metric) ?? 0))
    .slice(0, count)
}

/** Namen der grössten Gesellschaften, auf ihrer Säulenspitze.
 *
 *  `heights` und `zeroPlane` müssen aus derselben Rechnung stammen wie die
 *  Säulen selbst (`companyElevations`/`zeroPlaneHeight`, `layers/visible.ts`)
 *  — und `heights` muss in derselben Reihenfolge wie `companies` stehen,
 *  denn `getPosition` liest `heights[index]` über den von deck.gl gelieferten
 *  Datenindex. Die Spitze liegt auf `zeroPlane + heights[i]`, nicht auf
 *  `heights[i]` allein: seit dem Umbau der Säulen auf eine auswahlabhängige
 *  Nulllinie (Kennzahl «Gewinn» hängt Verluste von einer gehobenen Ebene
 *  herab) wäre ein Name ohne diesen Summanden unter seiner Säule
 *  eingezeichnet.
 *
 *  `characterSet: 'auto'` statt der `TextLayer`-Vorgabe (ein festes
 *  ASCII-Set): Firmennamen wie «Bâloise», «Zürcher Kantonalbank» oder «DKSH»
 *  enthalten Umlaute, Akzente und Sonderzeichen, die im ASCII-Vorgabe-Set
 *  fehlen und sonst kommentarlos aus der Beschriftung verschwänden.
 *  `CollisionFilterExtension` blendet Namen aus, die sich mit einem anderen,
 *  bereits gezeichneten Namen überlagern würden — bei rund 200 dicht
 *  stehenden Säulen sonst unlesbares Buchstabengewirr. */
export function buildLabelLayer(
  companies: Company[],
  metric: Metric,
  heights: Float32Array,
  zeroPlane: number,
): TextLayer<Company, CollisionFilterExtensionProps<Company>> {
  // `ExtraPropsT` (zweiter Typparameter) macht `collisionEnabled` &co. der
  // `CollisionFilterExtension` erst typsicher bekannt — `TextLayer` selbst
  // kennt diese Props nicht, sie kommen ausschliesslich über die Erweiterung.
  return new TextLayer<Company, CollisionFilterExtensionProps<Company>>({
    id: 'firmen-beschriftung',
    data: companies,
    getPosition: (c, { index }) => [c.lon, c.lat, zeroPlane + heights[index]!],
    getText: (c) => c.name,
    getSize: 11,
    sizeUnits: 'pixels',
    getColor: [27, 39, 51, 235],
    getPixelOffset: [0, -10],
    background: true,
    getBackgroundColor: [255, 255, 255, 200],
    extensions: [new CollisionFilterExtension()],
    collisionEnabled: true,
    collisionTestProps: { sizeScale: 2 },
    characterSet: 'auto',
    // `heights`/`zeroPlane` sind bei jedem Aufruf frische Arrays/Werte
    // (neu berechnet aus der aktuellen Auswahl) — `metric` allein ändert an
    // `getPosition`s Rechnung nichts, das nicht schon über die neue `data`-
    // Referenz erkannt würde. Trotzdem explizit gelistet: derselbe Trigger,
    // den `buildCompanyLayer` für seine `getElevation` pflegt, macht sichtbar,
    // wovon die Position tatsächlich abhängt, statt sich allein auf die
    // implizite Neuberechnung bei geänderter `data`-Referenz zu verlassen.
    updateTriggers: { getPosition: [metric, zeroPlane] },
  })
}
