// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { renderNotices, type Coverage, type TopReference } from './notices'

// Bis zum 17. August 2026 genügte hier ein minimaler DOM-Stub (drei Methoden:
// `getElementById`, `createElement`, `appendChild`/`replaceChildren`) — echtes
// jsdom war im Projekt nicht eingebunden gebraucht, weil `renderNotices`
// nichts als Absätze anhängte. Seit die Box zuklappbar ist (Klick, `aria-
// expanded`, `hidden`), reicht der Stub nicht mehr: dieser Test braucht ein
// echtes `click()`, echte `classList`/`dataset`/`hidden`-Semantik — deshalb
// jetzt `@vitest-environment jsdom`, wie `ui/nav.test.ts` und `ui/legend.
// test.ts` es bereits vormachen.
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

function box(): HTMLElement {
  return document.getElementById('hinweis')!
}

function toggle(): HTMLButtonElement {
  return box().querySelector('.hinweis-umschalter')!
}

function inhalt(): HTMLElement {
  return box().querySelector('.hinweis-inhalt')!
}

const KEINE_BEZUGSZEILE: TopReference | null = null
const KEINE_ABDECKUNG: Coverage | null = null

describe('renderNotices', () => {
  it.each([
    ['sichtbare' as const, 'schweiz' as const],
    ['beschaeftigte' as const, 'schweiz' as const],
    ['beschaeftigte' as const, 'kanton' as const],
  ])('nennt Natural Earth als Seenquelle in jeder Ansicht — %s/%s', (view, level) => {
    renderNotices(view, level, 'umsatz', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    expect(inhalt().textContent).toContain('Natural Earth')
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
    renderNotices('sichtbare', 'schweiz', metric, true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    expect(inhalt().textContent).toContain(expected)
  })

  it('zeigt bei Mitarbeitende keine Währungszeile — die Höhe ist eine Personenzahl', () => {
    renderNotices('sichtbare', 'schweiz', 'mitarbeitende', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    expect(inhalt().textContent).not.toContain('CHF')
  })

  // Finding I6: `stats.profitInChf` existierte im Artefakt bereits, wurde
  // aber von keinem Produktivpfad gelesen — die Währungszeile hing
  // unbedingt an `revenueInChf`, einem Flag über eine andere Grösse als die
  // gerade gezeigte. Bei Kennzahl Gewinn muss `metricInChf` deshalb über
  // `stats.profitInChf` entscheiden, nicht über `stats.revenueInChf`.
  it('nennt bei Gewinn den Reingewinn in der Währungszeile, nicht den Umsatz', () => {
    renderNotices('sichtbare', 'schweiz', 'gewinn', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    const waehrungszeile = [...inhalt().querySelectorAll('p')]
      .map((p) => p.textContent ?? '')
      .find((t) => t.includes('CHF umgerechnet'))
    expect(waehrungszeile).toContain('Reingewinn')
    expect(waehrungszeile).not.toContain('Umsatz')
  })

  it('fällt bei Gewinn ohne vollständige Umrechnung auf die Berichtswährung zurück', () => {
    renderNotices('sichtbare', 'schweiz', 'gewinn', false, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    const waehrungszeile = [...inhalt().querySelectorAll('p')]
      .map((p) => p.textContent ?? '')
      .find((t) => t.includes('Reingewinne in der jeweiligen'))
    expect(waehrungszeile).toBeDefined()
    expect(waehrungszeile).not.toContain('CHF umgerechnet')
  })
})

describe('renderNotices — aus der Legende umgezogene Vorbehalte (Auftrag 2026-08-17)', () => {
  it('nennt die fünf umgezogenen Sätze in Ansicht «sichtbare»', () => {
    const top: TopReference = { name: 'Nestlé', value: 89_500_000_000 }
    const coverage: Coverage = {
      count: 201, totalListed: 224, researched: 201, sixRetrievedDate: '2026-08-14',
    }
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, top, coverage)
    const text = inhalt().textContent!
    expect(text).toContain('201 Gesellschaften von 224 kotierten SIX-Titeln')
    expect(text).toContain('Höchste Säule: Nestlé')
    expect(text).toContain('Mindesthöhe')
    expect(text).toContain('Balken mit Rand')
    expect(text).toContain('noch nicht recherchiert')
  })

  it('lässt die Bezugszeile weg, wenn keine Firma mit Wert in der Auswahl ist', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, null, KEINE_ABDECKUNG)
    expect(inhalt().textContent).not.toContain('Höchste Säule')
  })

  it('nennt bei einem Verlust an der Spitze das Wort «Verlust», nicht nur den Betrag', () => {
    // Dieselbe Herleitung wie vorher in `ui/legend.ts`, Finding I8:
    // `TopReference.value` ist bereits der echte, vorzeichenbehaftete Wert.
    const top: TopReference = { name: 'Grösster Verlust AG', value: -900_000_000 }
    renderNotices('sichtbare', 'schweiz', 'gewinn', true, top, KEINE_ABDECKUNG)
    expect(inhalt().textContent).toMatch(/Höchste Säule: Grösster Verlust AG,[^]*Verlust/)
  })

  it('nennt die fünf Sätze nicht in Ansicht «beschaeftigte»', () => {
    renderNotices('beschaeftigte', 'schweiz', 'umsatz', true, null, null)
    const text = inhalt().textContent!
    expect(text).not.toContain('Höchste Säule')
    expect(text).not.toContain('Balken mit Rand')
    expect(text).not.toContain('noch nicht recherchiert')
    expect(text).not.toContain('kotierten SIX-Titeln')
  })
})

describe('renderNotices — Abdeckungsangabe (Auftraggeber-Korrektur 2026-08-17)', () => {
  // Zurückgeholt, nachdem der Kahlschlag sie zunächst ersatzlos entfernt
  // hatte: die Spec begründet die Zahl ausdrücklich als Teil der Oberfläche
  // — ohne sie liesse sich aus der Karte nicht ablesen, dass ein Teil der
  // kotierten Titel gar nicht erscheint. Sie zieht mit den anderen vier
  // Vorbehalten in die Eckbox, nicht ersatzlos weg.
  it('nennt beide Zahlen und den SIX-Stand', () => {
    const coverage: Coverage = {
      count: 201, totalListed: 224, researched: 201, sixRetrievedDate: '2026-08-14',
    }
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, coverage)
    const text = inhalt().textContent!
    expect(text).toContain('201 Gesellschaften von 224 kotierten SIX-Titeln')
    expect(text).toContain('davon 201 recherchiert')
    expect(text).toContain('SIX-Stand')
  })

  it('lässt den SIX-Stand weg, wenn kein Abrufdatum vorliegt', () => {
    const coverage: Coverage = {
      count: 201, totalListed: 224, researched: 201, sixRetrievedDate: null,
    }
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, coverage)
    expect(inhalt().textContent).not.toContain('SIX-Stand')
  })

  it('zeigt keine Abdeckungsangabe ohne coverage', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, null)
    expect(inhalt().textContent).not.toContain('kotierten SIX-Titeln')
  })
})

describe('renderNotices — Eckbox zuklappbar (Auftrag 2026-08-17)', () => {
  it('ist im Ausgangszustand eingeklappt', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    expect(inhalt().hidden).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('ist ein <button>, per Tastatur erreichbar', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    expect(toggle().tagName).toBe('BUTTON')
    expect(toggle().type).toBe('button')
  })

  it('trägt eine sprechende aria-label, die den Zustand nennt', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    expect(toggle().getAttribute('aria-label')).toMatch(/anzeigen/i)
  })

  it('blendet den Text nach einem Klick ein und setzt aria-expanded auf true', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    toggle().click()
    expect(inhalt().hidden).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(toggle().getAttribute('aria-label')).toMatch(/ausblenden/i)
  })

  it('blendet den Text nach einem zweiten Klick wieder aus', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    toggle().click()
    toggle().click()
    expect(inhalt().hidden).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('übersteht einen erneuten renderNotices()-Aufruf (Filter-/Kennzahlwechsel)', () => {
    renderNotices('sichtbare', 'schweiz', 'umsatz', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    toggle().click()
    expect(inhalt().hidden).toBe(false)

    // Simuliert, was `karte/firmen.ts`s `render()` bei jedem Filter- oder
    // Kennzahlwechsel tut: `renderNotices` erneut mit denselben oder anderen
    // Werten aufrufen. Der Auf-/Zugeklappt-Zustand darf dabei nicht auf
    // "eingeklappt" zurückspringen.
    renderNotices('sichtbare', 'schweiz', 'gewinn', true, KEINE_BEZUGSZEILE, KEINE_ABDECKUNG)
    expect(inhalt().hidden).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })
})
