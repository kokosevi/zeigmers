#!/usr/bin/env node
/* Erzeugt die vier Landing-Grafiken aus denselben Artefakten, die die Karten
 * laden — keine zweite Datenquelle, keine Handzeichnung:
 *
 *   public/data/companies.json      -> public/grafik/firmen-{ink,paper}.svg
 *   public/data/ch_kantone.geojson  -> public/grafik/kantone-{ink,paper}.svg
 *   public/data/meta.json           (Beschäftigte je Kanton, für die Höhen)
 *
 * Aufruf:  node tools/build_landing_svg.mjs
 * Sinnvoll als npm-Skript vor dem Build und nach jedem ETL-Lauf, damit die
 * Kacheln nicht gegenüber den Karten veralten.
 *
 * Projektion: beide Grafiken benutzen exakt dieselbe (Äquirektangular mit
 * cos(46.8°)-Stauchung, danach 0.62 vertikale Kompression als Kameraneigung).
 * Dadurch stehen die Firmensäulen und die Kantonsflächen auf derselben
 * gedachten Platte und die zwei Kacheln lesen sich als eine Karte.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const DATA = 'public/data'
const OUT = 'public/grafik'

const LON0 = 5.956          // westlichster Punkt CH
const LAT1 = 47.808         // nördlichster Punkt CH
const K = 0.684             // cos(46.8°) — Längengrade in Breitengradmass
const S = 322.3             // Einheiten je Grad (ergibt ~1007 Einheiten Breite)
const PITCH = 0.62          // vertikale Stauchung = Kameraneigung
const EPS = 0.03            // Vereinfachung der Kantonsringe in Grad (~3 km)

const project = (lon, lat) => [(lon - LON0) * K * S, (LAT1 - lat) * S * PITCH]
const r1 = (n) => Math.round(n * 10) / 10

/* ---------- Gemeinsamer Rahmen ----------
 * Beide Kacheln zeigen exakt denselben Bildausschnitt: er ergibt sich aus den
 * Kantonsflächen (Platte plus höchste Extrusion), und die Firmensäulen werden
 * hineingesetzt. Dadurch liegt jede Säule dort, wo ihr Kanton in der zweiten
 * Kachel liegt, und die zwei Grafiken lesen sich als ein Paar.
 */
function frame(cantons) {
  const PAD = 4
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of cantons) {
    for (const p of c.ring) {
      const [x, y] = project(p[0], p[1])
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y - c.h); maxY = Math.max(maxY, y)
    }
  }
  return {
    VW: Math.round(maxX - minX + 2 * PAD),
    VH: Math.round(maxY - minY + 2 * PAD),
    to: (lon, lat) => {
      const [x, y] = project(lon, lat)
      return [x - minX + PAD, y - minY + PAD]
    },
  }
}

/* ---------- Kachel 01: Börsennotierte Firmen ---------- */
function firmen({ VW, VH, to }) {
  const { companies } = JSON.parse(readFileSync(`${DATA}/companies.json`, 'utf8'))
  const rows = companies.filter((c) => c.researched && c.lon && c.lat)
  const maxRevenue = Math.max(...rows.map((c) => c.revenueChf || 0))
  const MAXH = 132

  const bars = rows
    .map((c) => {
      const [x, y] = to(c.lon, c.lat)
      const t = Math.pow((c.revenueChf || 0) / maxRevenue, 0.4)   // gedämpft wie die Karte
      // Deckel: keine Säule darf oben aus dem Rahmen laufen.
      return { x, y, h: Math.min(Math.max(4, t * MAXH), y - 2), t, lat: c.lat }
    })
    .sort((a, b) => b.lat - a.lat)                               // Norden zuerst = hinten

  const draw = (fill) =>
    bars
      .map(
        (b) =>
          `<rect x="${r1(b.x - 1.75)}" y="${r1(b.y - b.h)}" width="3.5" height="${r1(b.h)}" fill="${fill}" opacity="${(0.34 + b.t * 0.5).toFixed(2)}"/>`,
      )
      .join('')

  const wrap = (body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}">${body}</svg>`
  return {
    'firmen-ink.svg': wrap(draw('#1B2733')),
    'firmen-paper.svg': wrap(draw('#F7F8F9')),
  }
}

/* ---------- Kachel 02: Beschäftigte ---------- */
function ringe() {
  const geo = JSON.parse(readFileSync(`${DATA}/ch_kantone.geojson`, 'utf8'))
  const meta = JSON.parse(readFileSync(`${DATA}/meta.json`, 'utf8'))
  const employment = new Map(meta.cantons.map((c) => [c.bfsNr, c.employment]))
  const maxE = Math.max(...employment.values())
  const MAXH = 112

  // Grösster Ring je Kanton, punktweise gedünnt: die Kachel wird ~500 px breit
  // gezeigt, alles unter ~3 km Auflösung ist dort unsichtbar und kostet nur
  // Bytes. 26 Kantone landen so bei rund 1'650 Punkten (aus 300'000).
  const cantons = geo.features.map((f) => {
    const rings =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates[0]]
        : f.geometry.coordinates.map((c) => c[0])
    rings.sort((a, b) => b.length - a.length)
    const kept = [rings[0][0]]
    for (const p of rings[0]) {
      const q = kept[kept.length - 1]
      if (Math.abs(p[0] - q[0]) > EPS || Math.abs(p[1] - q[1]) > EPS) kept.push(p)
    }
    kept.push(kept[0])
    const bfsNr = f.properties.bfs_nr ?? f.properties.bfsNr
    const e = employment.get(bfsNr) ?? 0
    return {
      bfsNr,
      ring: kept,
      h: Math.max(3, Math.pow(e / maxE, 0.55) * MAXH),
      lat: kept.reduce((s, p) => s + p[1], 0) / kept.length,
    }
  })

  return cantons
}

function kantone(cantons, { VW, VH, to }) {
  const draw = (wall, top, line) =>
    [...cantons]
      .sort((a, b) => b.lat - a.lat)          // Norden zuerst = hinten
      .map((c) => {
        const h = Math.round(c.h)
        const base = c.ring.map((p) => to(p[0], p[1]).map(Math.round))
        // Seitenwände: je Kante ein Viereck von der Grundlinie zur Deckfläche.
        // Überlappungen sind unschädlich, weil deckend und ohne Kontur.
        let d = ''
        for (let i = 0; i < base.length - 1; i++) {
          const a = base[i], b = base[i + 1]
          if (Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1) continue
          d += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${b[0]} ${b[1] - h}L${a[0]} ${a[1] - h}Z`
        }
        const face = base.map((p) => `${p[0]} ${p[1] - h}`).join('L')
        return `<path fill="${wall}" d="${d}"/><path fill="${top}" stroke="${line}" stroke-width="1.2" d="M${face}Z"/>`
      })
      .join('')

  return {
    'kantone-ink.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}">${draw('#A9B4BF', '#1B2733', '#E8EDF2')}</svg>`,
    'kantone-paper.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}">${draw('#4C5C6B', '#F7F8F9', '#14202B')}</svg>`,
  }
}

const cantons = ringe()
const f = frame(cantons)

mkdirSync(OUT, { recursive: true })
for (const [name, svg] of Object.entries({ ...firmen(f), ...kantone(cantons, f) })) {
  writeFileSync(`${OUT}/${name}`, svg)
  console.log(`${OUT}/${name}  ${(svg.length / 1024).toFixed(1)} KB`)
}
