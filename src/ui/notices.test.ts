import { afterEach, describe, expect, it } from 'vitest'
import { renderNotices } from './notices'

// `notices.ts` ist bisher DOM-frei ungetestet (anders als `panel.ts`, siehe
// dessen Testdatei) — echtes jsdom ist im Projekt nicht eingebunden
// (`vitest.config`/`vite.config.ts`: `environment: 'node'`). Statt dafür eine
// neue Abhängigkeit einzuziehen, reicht hier ein minimaler DOM-Stub: genau
// die drei Methoden, die `renderNotices`/`paragraph()` tatsächlich benutzen
// (`getElementById`, `createElement`, `appendChild`, `replaceChildren`).
//
// Regressionsgrund (2026-08-16, Fix-Runde): `FOOTER_LAKES` (Seen-Quellenzeile,
// Task 10) hing anfangs an `view === 'sichtbare'`, obwohl der Seenlayer
// selbst auf beiden Kartenseiten zeichnet (`layers/viewLayers.ts`) — die
// Beschäftigten-Seite hätte Natural-Earth-Flächen ohne Quellenangabe gezeigt.
// Dieser Test bewacht direkt, was ein Blick auf den Bildschirm sonst nicht
// verrät: dass die Zeile in JEDER Ansicht in der Eckbox landet.

class FakeElement {
  className = ''
  textContent = ''
  readonly children: FakeElement[] = []
  private registeredId = ''

  constructor(private readonly registry: Map<string, FakeElement>) {}

  get id(): string {
    return this.registeredId
  }

  set id(value: string) {
    this.registeredId = value
    this.registry.set(value, this)
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child)
    return child
  }

  replaceChildren(): void {
    this.children.length = 0
  }
}

function installFakeDocument(): { texts: () => string[] } {
  const registry = new Map<string, FakeElement>()
  const ui = new FakeElement(registry)
  registry.set('ui', ui)

  const fakeDocument = {
    getElementById: (id: string) => registry.get(id) ?? null,
    createElement: () => new FakeElement(registry),
  }

  // `renderNotices` liest/schreibt ausschliesslich über `document` — ein
  // globaler Stub genügt, kein Rendering-Framework nötig.
  ;(globalThis as { document?: unknown }).document = fakeDocument

  return {
    texts: () => (registry.get('hinweis')?.children ?? []).map((p) => p.textContent),
  }
}

const originalDocument = (globalThis as { document?: unknown }).document

afterEach(() => {
  ;(globalThis as { document?: unknown }).document = originalDocument
})

describe('renderNotices', () => {
  it.each([
    ['sichtbare' as const, 'schweiz' as const],
    ['beschaeftigte' as const, 'schweiz' as const],
    ['beschaeftigte' as const, 'kanton' as const],
  ])('nennt Natural Earth als Seenquelle in jeder Ansicht — %s/%s', (view, level) => {
    const { texts } = installFakeDocument()
    renderNotices(view, level, 'umsatz', true)
    expect(texts().some((t) => t.includes('Natural Earth'))).toBe(true)
  })

  // Regressionsgrund (Abschluss-Review, Finding C1): der Pflichthinweis war
  // bis zu diesem Fix fest auf «Umsatz» formuliert — über einer
  // Mitarbeitenden- oder Gewinn-Karte stand weiterhin eine Aussage über den
  // Konzernumsatz, eine Grösse, die die Karte in dem Moment gar nicht zeigt.
  it.each([
    ['umsatz' as const, 'Konzernumsatz'],
    ['mitarbeitende' as const, 'Mitarbeitendenzahl'],
    ['gewinn' as const, 'Reingewinn'],
  ])('nennt in Ansicht «sichtbare» die aktive Kennzahl — %s', (metric, expected) => {
    const { texts } = installFakeDocument()
    renderNotices('sichtbare', 'schweiz', metric, true)
    expect(texts().some((t) => t.includes(expected))).toBe(true)
  })

  it('zeigt bei Mitarbeitende keine Währungszeile — die Höhe ist eine Personenzahl', () => {
    const { texts } = installFakeDocument()
    renderNotices('sichtbare', 'schweiz', 'mitarbeitende', true)
    expect(texts().some((t) => t.includes('CHF'))).toBe(false)
  })

  // Finding I6: `stats.profitInChf` existierte im Artefakt bereits, wurde
  // aber von keinem Produktivpfad gelesen — die Währungszeile hing
  // unbedingt an `revenueInChf`, einem Flag über eine andere Grösse als die
  // gerade gezeigte. Bei Kennzahl Gewinn muss `metricInChf` deshalb über
  // `stats.profitInChf` entscheiden, nicht über `stats.revenueInChf`.
  it('nennt bei Gewinn den Reingewinn in der Währungszeile, nicht den Umsatz', () => {
    const { texts } = installFakeDocument()
    renderNotices('sichtbare', 'schweiz', 'gewinn', true)
    const waehrungszeile = texts().find((t) => t.includes('CHF umgerechnet'))
    expect(waehrungszeile).toContain('Reingewinn')
    expect(waehrungszeile).not.toContain('Umsatz')
  })

  it('fällt bei Gewinn ohne vollständige Umrechnung auf die Berichtswährung zurück', () => {
    const { texts } = installFakeDocument()
    renderNotices('sichtbare', 'schweiz', 'gewinn', false)
    const waehrungszeile = texts().find((t) => t.includes('Reingewinne in der jeweiligen'))
    expect(waehrungszeile).toBeDefined()
    expect(waehrungszeile).not.toContain('CHF umgerechnet')
  })
})
