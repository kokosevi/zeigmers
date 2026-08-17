import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VIEW_PATH } from './ui/nav'

// Die Landing nennt Kennzahlen, lädt aber bewusst keine Daten — sie soll nicht
// 320 KB companies.json holen, um zwei Zahlen zu zeigen, und bleibt damit die
// einzige Seite ohne JavaScript. Hartkodierte Zahlen in einer Seite, die neben
// lebenden Artefakten liegt, veralten still: die Seite zeigt dann weiter eine
// Zahl, die niemand mehr nachrechnet. Dieser Test ist der Ersatz für den
// fehlenden Fetch — er vergleicht, was im HTML steht, mit dem, was in den
// Artefakten steht, und lässt `npm test` (und damit den Netlify-Build)
// fehlschlagen, sobald beide auseinanderlaufen.
//
// Redesign (17. August 2026, Handoff 3a): Die Landing zeigt nur noch Wortmarke
// und zwei Kacheln. Damit sind drei früher hier geprüfte Sätze von der Seite
// verschwunden — die Abdeckungsangabe («201 Gesellschaften von 224 kotierten
// SIX-Titeln»), «alle recherchiert» und «alle 26 Kantone». Sie sind nicht
// verloren: die Abdeckungsangabe steht im Fuss der Leiste auf `/firmen/`
// (`ui/notices.ts`), geprüft von `ui/notices.test.ts`. Was auf der Landing
// bleibt, sind die zwei Zahlen der Kacheln und das Datenjahr — und die werden
// unten weiter gegen die Artefakte gehalten.

// `process.cwd()` statt `__dirname`: package.json trägt `"type": "module"`,
// in einem ESM-Modul gibt es kein `__dirname`. Vitest läuft vom Projektwurzel-
// verzeichnis aus, das ist hier der stabilere Bezugspunkt.
const ROOT = process.cwd()
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8')

function json<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, 'public/data', name), 'utf8')) as T
}

const companies = json<{ stats: { count: number } }>('companies.json')

const kantone = json<{
  count: number
  year: number
  stats: { sum: number }
}>('ch_kantone.json')

// Dieselbe Formatierung wie `ui/format.ts`s `formatNumber` — de-CH setzt
// gerade Apostrophe (U+0027) als Tausendertrenner, nicht typografische.
const de = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 })

describe('Landing-Kennzahlen', () => {
  it('nennt als Firmenzahl genau die Zahl der Gesellschaften aus companies.json', () => {
    // Die Kachel zeigt `stats.count` (Gesellschaften — Namen-/PS-Aktien und
    // zweite Handelslinien derselben Firma zusammengefasst), nicht
    // `totalListed` (kotierte Titel). Ohne diese Prüfung könnte die Kachel
    // eines Tages Titel als Gesellschaften ausgeben.
    expect(HTML).toContain(`<span class="zahl">${companies.stats.count}</span>`)
  })

  it('nennt die Beschäftigtenzahl genau so, wie ch_kantone.json sie ausweist', () => {
    expect(HTML).toContain(de.format(kantone.stats.sum))
  })

  it('nennt das Datenjahr der Beschäftigten-Kachel aus dem Artefakt', () => {
    expect(HTML).toContain(`BFS STATENT ${kantone.year}`)
  })

  it('verlinkt beide Kartenseiten mit denselben Pfaden wie ui/nav.ts', () => {
    // Import statt Literal (Abschluss-Review, Fund 8): `index.html` ist
    // bewusst ohne JavaScript gebaut und kann `VIEW_PATH` nie selbst
    // importieren — dieser Test übernimmt die Drift-Prüfung stellvertretend,
    // damit die Kartenseiten und die hier verlinkten Pfade nicht
    // auseinanderlaufen können.
    expect(HTML).toContain(`href="${VIEW_PATH.sichtbare}"`)
    expect(HTML).toContain(`href="${VIEW_PATH.beschaeftigte}"`)
  })

  it('lädt ausser dem Umami-Tracker kein JavaScript', () => {
    // Der ganze Sinn der Landing: kein deck.gl, kein MapLibre (zusammen
    // 1.52 MB), um zwei Kacheln zu zeigen. Ein versehentlich eingefügtes
    // `<script type="module" src="/src/…">` — etwa beim Kopieren aus einer
    // Kartenseite — würde das lautlos zunichte machen, weil die Seite danach
    // trotzdem normal aussieht.
    //
    // Einzige gewollte Ausnahme (17. August 2026): der Umami-Tracker, ~2 KB,
    // `defer`, cookielos — er misst die Besuche und ist kein Anwendungs-Code.
    // Der Test pinnt deshalb GENAU einen Script-Tag samt seiner Quelle statt
    // pauschal null: ein zweiter Tag oder eine andere `src` schlägt weiter fehl.
    const skripte = HTML.match(/<script\b[^>]*>/gi) ?? []
    expect(skripte).toHaveLength(1)
    expect(skripte[0]).toContain('src="https://cloud.umami.is/script.js"')
  })

  it('verweist auf vier Kachelgrafiken, die tatsächlich existieren', () => {
    // Die vier SVG entstehen aus den Artefakten (`tools/build_landing_svg.mjs`)
    // und liegen in `public/grafik/`. Fehlt eine, zeigt die Kachel eine leere
    // Fläche — im Browser sofort sichtbar, im Test bisher nicht.
    const dateien = [
      'firmen-ink.svg',
      'firmen-paper.svg',
      'kantone-ink.svg',
      'kantone-paper.svg',
    ]
    for (const datei of dateien) {
      expect(existsSync(resolve(ROOT, 'public/grafik', datei)), datei).toBe(true)
      expect(HTML).toContain(`/grafik/${datei}`)
    }
  })
})
