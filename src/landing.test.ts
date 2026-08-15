import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Die Landing nennt Kennzahlen ("201 von 224 …"), lädt aber bewusst keine
// Daten — sie soll nicht 320 KB companies.json holen, um zwei Zahlen zu
// zeigen. Hartkodierte Zahlen in einer Seite, die neben lebenden Artefakten
// liegt, veralten still: die Seite zeigt dann weiter eine Zahl, die niemand
// mehr nachrechnet. Dieser Test ist der Ersatz für den fehlenden Fetch — er
// vergleicht, was im HTML steht, mit dem, was in den Artefakten steht, und
// lässt `npm test` (und damit den Netlify-Build) fehlschlagen, sobald beide
// auseinanderlaufen.

// `process.cwd()` statt `__dirname`: package.json trägt `"type": "module"`,
// in einem ESM-Modul gibt es kein `__dirname`. Vitest läuft vom Projektwurzel-
// verzeichnis aus, das ist hier der stabilere Bezugspunkt.
const ROOT = process.cwd()
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8')

function json<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, 'public/data', name), 'utf8')) as T
}

const companies = json<{
  stats: { count: number; totalListed: number; researched: number }
}>('companies.json')

const kantone = json<{
  count: number
  year: number
  stats: { sum: number }
}>('ch_kantone.json')

// Dieselbe Formatierung wie `ui/format.ts`s `formatNumber` — de-CH setzt
// gerade Apostrophe (U+0027) als Tausendertrenner, nicht typografische.
const de = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 })

describe('Landing-Kennzahlen', () => {
  it('nennt die Firmenzahlen genau so, wie companies.json sie ausweist', () => {
    const { count, totalListed } = companies.stats
    expect(HTML).toContain(`${count} von ${totalListed} kotierten Titeln`)
  })

  it('behauptet nur dann "alle recherchiert", wenn auch alle recherchiert sind', () => {
    expect(companies.stats.researched).toBe(companies.stats.count)
    expect(HTML).toContain('alle recherchiert')
  })

  it('nennt die Beschäftigtenzahl und das Jahr genau so, wie ch_kantone.json sie ausweist', () => {
    expect(HTML).toContain(`${de.format(kantone.stats.sum)} Beschäftigte`)
    expect(HTML).toContain(`BFS STATENT ${kantone.year}`)
  })

  it('nennt die tatsächliche Zahl der Kantone', () => {
    expect(kantone.count).toBe(26)
    expect(HTML).toContain(`alle ${kantone.count} Kantone`)
  })

  it('verlinkt beide Kartenseiten', () => {
    expect(HTML).toContain('href="/firmen/"')
    expect(HTML).toContain('href="/beschaeftigte/"')
  })
})
