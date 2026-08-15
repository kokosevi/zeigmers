# zeigmers — Landing Page und Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus der Einzelseiten-Anwendung «Draufsicht» wird **zeigmers**: eine Landing Page ohne JavaScript mit zwei Einstiegen, je eine eigene Unterseite pro Karte, durchgehend umbenannt und auf Netlify veröffentlicht.

**Architecture:** Vite-Multi-Page-Build mit drei echten HTML-Einstiegen (`/`, `/firmen/`, `/beschaeftigte/`). Weil jede Seite genau eine Ansicht besitzt, hört `view` auf, Zustand zu sein: `src/main.ts` zerfällt in `src/karte/basis.ts` (geteilter Aufbau) plus je eine Datei pro Ansicht, und `ViewLayersInput` wird eine über `view` unterschiedene Union. Das befreit die Beschäftigten-Seite von den 320 KB `companies.json`, ohne dass irgendwo ein optionales Feld mit totem Guard entsteht.

**Tech Stack:** TypeScript 5.6, Vite 5.4, Vitest 2.1, deck.gl 9, MapLibre GL 4.7, Python-ETL über `uv`, Netlify.

**Spec:** `docs/superpowers/specs/2026-08-15-zeigmers-landing-und-golive-design.md`

## Global Constraints

- **Sprache:** Alle Bezeichner, Kommentare und sichtbaren Texte auf Deutsch, wie im bestehenden Code. Kommentare erklären das *Warum*, nicht das *Was* — dem Stil der bestehenden Dateien folgen.
- **Schreibweise des Namens:** durchgehend klein, `zeigmers`. Nie `Zeigmers`, nie `Draufsicht`.
- **Interner Ansichtsschlüssel:** `sichtbare` bleibt unverändert (siehe Begründung in `src/ui/toggle.ts`). Nur `beschaeftigte` und `sichtbare` sind gültige `ViewName`-Werte.
- **Kein neues Bewegungsdesign** über das bestehende Hover-Feedback hinaus; `prefers-reduced-motion` respektieren.
- **Keine neuen Laufzeit-Abhängigkeiten.** `netlify-cli` läuft über `npx` und wird *nicht* in `package.json` eingetragen.
- **Node 22** (steht in `netlify.toml`).
- **Kennzahlen niemals raten.** Jede Zahl auf der Landing kommt aus `public/data/*.json` und wird von `src/landing.test.ts` dort festgehalten.
- **Verifikation vor jedem Commit:** `npm test` muss grün sein. Ab Task 2 zusätzlich `npm run build` (enthält `tsc --noEmit`).
- **`docs/superpowers/`** wird nicht umbenannt — das sind datierte Protokolle, der alte Name ist dort historisch korrekt.

## Bestandsaufnahme

Verifizierte Werte aus den Artefakten (Stand 15. August 2026) — diese Zahlen sind die Wahrheit, nicht das README:

| Quelle | Feld | Wert |
|---|---|---|
| `public/data/companies.json` | `stats.count` | 201 |
| | `stats.totalListed` | **224** (das README sagt fälschlich 202) |
| | `stats.researched` | 201 |
| `public/data/ch_kantone.json` | `count` | 26 |
| | `stats.sum` | 5876865 |
| | `year` | 2023 |

`Intl.NumberFormat('de-CH')` formatiert `5876865` als `5'876'865` — mit geradem Apostroph (U+0027), nicht mit typografischem.

## File Structure

**Neu:**

| Datei | Verantwortung |
|---|---|
| `firmen/index.html` | HTML-Einstieg der Seite `/firmen/` |
| `beschaeftigte/index.html` | HTML-Einstieg der Seite `/beschaeftigte/` |
| `src/firmen.ts` | Skript-Einstieg `/firmen/`: ruft `startFirmen()`, fängt Fehler |
| `src/beschaeftigte.ts` | Skript-Einstieg `/beschaeftigte/`: ruft `startBeschaeftigte()`, fängt Fehler |
| `src/karte/basis.ts` | Geteilt: Karte anlegen, `meta`/`ch_kantone`/Kantonsgrenzen laden, `nationalBounds`, Navigation einhängen |
| `src/karte/firmen.ts` | `companies.json` laden, Abdeckungsangabe bauen, rendern |
| `src/karte/beschaeftigte.ts` | Kantons-Cache, `enterCanton`, `exitToSwitzerland`, Escape, rendern |
| `src/ui/nav.ts` | Navigation (ersetzt `ui/toggle.ts`): Heim-Link, zwei Ansichts-Links, Höhenskala |
| `src/landing.css` | Gestaltung der Landing Page |
| `src/landing.test.ts` | Drift-Schutz: prüft die Kennzahlen in `index.html` gegen die Artefakte |

**Geändert:**

| Datei | Änderung |
|---|---|
| `index.html` | wird die Landing Page |
| `vite.config.ts` | drei `rollupOptions.input`-Einträge |
| `src/layers/viewLayers.ts` | `ViewLayersInput` wird eine unterschiedene Union |
| `src/layers/viewLayers.test.ts` | an die Union angepasst |
| `src/style.css` | Navigation (Links + Heim-Link), Offsets von `#zurueck-gruppe`/`#panel` |
| `src/ui/legend.ts`, `src/ui/notices.ts` | Import `ViewName` aus `./nav` statt `./toggle` |
| `package.json`, `package-lock.json`, `README.md` | Umbenennung |
| `src/layers/visible.ts`, `src/domain/noga.generated.ts` | 5 Pfadverweise in Kommentaren |
| `etl/pyproject.toml`, `etl/src/`, `etl/tests/` | Python-Paket umbenannt |

**Entfällt:** `src/main.ts`, `src/ui/toggle.ts`.

---

### Task 1: `ViewLayersInput` wird eine unterschiedene Union

Reiner Typ-Umbau. Die App läuft danach unverändert weiter — dieser Task ist die Voraussetzung dafür, dass die Beschäftigten-Seite in Task 2 ohne `companies` auskommt.

**Files:**
- Modify: `src/layers/viewLayers.ts:70-110`
- Modify: `src/main.ts:224-243` (Aufrufstelle)
- Test: `src/layers/viewLayers.test.ts:119-170`

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: `ViewLayersInput` als Union mit den Varianten `{ view: 'sichtbare', … }` und `{ view: 'beschaeftigte', … }`. Task 2 baut beide Varianten an je einer Stelle. `buildViewLayers(input: ViewLayersInput): LayersList` behält Name und Rückgabetyp. `CantonEntry` und `kantonRowInfo` bleiben unverändert exportiert.

- [ ] **Step 1: Test an die Union anpassen — `baseInput` wird zwei Fabriken**

Ersetze in `src/layers/viewLayers.test.ts` die Funktion `baseInput` (Zeilen 119-137) durch zwei getrennte Fabriken. Grund: mit einer Union lässt sich kein gemeinsames Objekt mehr über `Partial<…>` variieren, ohne die Verengung zu verlieren.

```typescript
const BASIS = {
  mode: 'logarithmisch' as const,
  cantonsGeo: CANTONS_GEO,
  activeBfsNr: null,
  cantonBorderLayer: CANTON_BORDER_LAYER,
}

function beschaeftigteInput(
  overrides: { level?: 'schweiz' | 'kanton'; activeCanton?: CantonEntry | null } = {},
) {
  return {
    ...BASIS,
    view: 'beschaeftigte' as const,
    level: 'schweiz' as const,
    kantone: kantoneLevel(),
    cantonGeometries: [SWITZERLAND_POLYGON, SWITZERLAND_POLYGON],
    kantoneVmax: 1000,
    activeCanton: null as CantonEntry | null,
    onEnterCanton: () => {},
    onShowMunicipalityPanel: () => {},
    ...overrides,
  }
}

function firmenInput() {
  return {
    ...BASIS,
    view: 'sichtbare' as const,
    companies: COMPANIES,
    onShowCompanyPanel: () => {},
  }
}
```

Und passe die `describe`-Fälle (Zeilen 154-170) an:

```typescript
describe('buildViewLayers', () => {
  it.each([
    ['Beschäftigte · Schweiz', beschaeftigteInput()],
    ['Beschäftigte · Kanton', beschaeftigteInput({ level: 'kanton', activeCanton: cantonEntry() })],
    ['Börsennotierte Firmen', firmenInput()],
  ] as const)('assigns unique deck.gl layer ids — %s', (_label, input) => {
    const ids = idsOf(buildViewLayers(input))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('falls back to the Switzerland level when level is "kanton" but no canton is loaded', () => {
    const ids = idsOf(buildViewLayers(beschaeftigteInput({ level: 'kanton', activeCanton: null })))
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Neu: die Union ist der Grund für diesen Umbau — sie muss die
  // Beschäftigten-Variante ohne `companies` tatsächlich akzeptieren, sonst
  // könnte die Beschäftigten-Seite die 320 KB nicht einsparen.
  it('builds the Beschäftigte view without any company data', () => {
    const input = beschaeftigteInput()
    expect('companies' in input).toBe(false)
    expect(idsOf(buildViewLayers(input)).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen — er muss fehlschlagen**

Run: `npx vitest run src/layers/viewLayers.test.ts`
Expected: FAIL. `tsc` ist in `vitest` nicht aktiv, deshalb schlägt zunächst nur `builds the Beschäftigte view without any company data` fehl — `buildViewLayers` greift für `view: 'beschaeftigte'` zwar nicht auf `companies` zu, aber der Typ verlangt es noch. Zusätzlich `npx tsc --noEmit` laufen lassen: dort erscheinen Fehler, weil `firmenInput()` die Pflichtfelder `kantone`/`cantonGeometries`/`kantoneVmax`/`level`/`activeCanton`/`onEnterCanton`/`onShowMunicipalityPanel` nicht mehr liefert.

- [ ] **Step 3: `ViewLayersInput` zur Union umbauen**

Ersetze in `src/layers/viewLayers.ts` das Interface `ViewLayersInput` (Zeilen 70-85) durch:

```typescript
/** In beiden Ansichten gebraucht: die Basiskarte und die Höhenskala. */
interface ViewLayersBasis {
  mode: ScaleMode
  cantonsGeo: BoundaryFeatureCollection
  activeBfsNr: number | null
  cantonBorderLayer: ReturnType<typeof buildCantonBorderLayer>
}

/** Seit der Aufteilung in zwei Seiten (2026-08-15) ist `view` keine
 *  umschaltbare Zustandsvariable mehr, sondern eine Eigenschaft der Seite —
 *  jede Seite ruft `buildViewLayers` mit genau einer der beiden Varianten auf.
 *  Als Union statt als ein Interface mit optionalen Feldern, weil die
 *  Beschäftigten-Seite `companies.json` (320 KB) gar nicht mehr lädt: mit
 *  `companies?: CompanyData` bräuchte der Firmen-Zweig unten einen Guard, den
 *  kein Aufrufer je auslösen kann — toter Code, der behauptet, ein Zustand sei
 *  möglich, den der Bau der Seiten ausschliesst. Über `view` unterschieden
 *  verengt TypeScript stattdessen von selbst, und der Compiler erzwingt, dass
 *  jede Seite genau das übergibt, was ihre Ansicht braucht. */
export type ViewLayersInput =
  | (ViewLayersBasis & {
      view: 'sichtbare'
      companies: CompanyData
      onShowCompanyPanel: (company: Company) => void
    })
  | (ViewLayersBasis & {
      view: 'beschaeftigte'
      level: NoticeLevel
      kantone: Level
      cantonGeometries: Geometry[]
      kantoneVmax: number
      activeCanton: CantonEntry | null
      onEnterCanton: (index: number) => void
      onShowMunicipalityPanel: (level: Level, index: number) => void
    })
```

- [ ] **Step 4: `buildViewLayers` an die Verengung anpassen**

Der Rumpf destrukturiert heute alle Felder in einem Zug (Zeilen 95-110) — das geht bei einer Union nicht mehr, weil die Feldmenge je Variante verschieden ist. Ersetze die Destrukturierung und die drei Zweige durch:

```typescript
export function buildViewLayers(input: ViewLayersInput): LayersList {
  const { mode, cantonsGeo, activeBfsNr, cantonBorderLayer } = input
  const cantonsLayer = buildCantonsLayer({ data: cantonsGeo, activeBfsNr })

  // Ansicht «Börsennotierte Firmen»: seit Phase 3 national (kein Bezug mehr
  // auf einen einzelnen, vorher geladenen Kanton) — zwei Layer, nicht eine:
  // Säulen für die recherchierten Firmen (`buildCompanyLayer`, Inhalt),
  // flache neutrale Marker für alle übrigen kotierten Titel
  // (`buildUnresearchedCompanyLayer`, Kontext — siehe `layers/visible.ts`).
  if (input.view === 'sichtbare') {
    const { companies, onShowCompanyPanel } = input
    return [
      cantonsLayer,
      cantonBorderLayer,
      buildCompanyLayer(companies, mode, onShowCompanyPanel),
      buildUnresearchedCompanyLayer(companies, onShowCompanyPanel, (company, x, y) => {
        if (!company) return hideHoverLabel()
        showHoverLabel(company.name, x, y)
      }),
    ]
  }

  const { level, kantone, cantonGeometries, kantoneVmax, activeCanton } = input

  if (level === 'kanton' && activeCanton) {
    const entry = activeCanton
    return [
      cantonsLayer,
      cantonBorderLayer,
      buildMunicipalityLayer('gemeinde', {
        level: entry.gemeinde,
        geometries: entry.geometries,
        vmax: entry.vmax,
        mode,
        opacity: 1,
        visible: true,
        onClick: (index) => input.onShowMunicipalityPanel(entry.gemeinde, index),
        onHover: (index, x, y) => {
          if (index === null) return hideHoverLabel()
          const name = municipalityName(entry.gemeinde, index)
          if (name) showHoverLabel(name, x, y)
          else hideHoverLabel()
        },
      }),
    ]
  }

  // Deckt sowohl `level === 'schweiz'` als auch den Verteidigungsfall
  // (`level === 'kanton'` ohne `activeCanton`) ab.
  return [
    cantonsLayer,
    cantonBorderLayer,
    buildMunicipalityLayer(KANTONE_BARS_LAYER_ID, {
      level: kantone,
      geometries: cantonGeometries,
      vmax: kantoneVmax,
      mode,
      opacity: 1,
      visible: true,
      onClick: input.onEnterCanton,
      onHover: (index, x, y) => {
        if (index === null) return hideHoverLabel()
        const info = kantonRowInfo(kantone, index)
        if (!info) return hideHoverLabel()
        const value = kantone.arrays.values[index] ?? 0
        showHoverLabel(`${info.name} · ${formatNumber(value)} Beschäftigte`, x, y)
      },
    }),
  ]
}
```

Beachte: Die Reihenfolge der Zweige ist umgedreht — `sichtbare` zuerst, damit TypeScript für den Rest auf die Beschäftigten-Variante verengt und die Destrukturierung von `level`/`kantone`/… gültig ist.

- [ ] **Step 5: `main.ts` an die Union anpassen**

`src/main.ts` baut das Eingabeobjekt heute in einem Zug (Zeilen 225-242) mit allen Feldern beider Ansichten. Ersetze den `buildViewLayers`-Aufruf innerhalb von `render()` durch:

```typescript
    handle.setLayers(
      buildViewLayers(
        view === 'sichtbare'
          ? {
              view,
              mode,
              cantonsGeo,
              activeBfsNr: activeHighlightBfsNr(),
              cantonBorderLayer,
              companies,
              onShowCompanyPanel: showCompanyPanel,
            }
          : {
              view,
              mode,
              cantonsGeo,
              activeBfsNr: activeHighlightBfsNr(),
              cantonBorderLayer,
              level,
              kantone,
              cantonGeometries,
              kantoneVmax,
              activeCanton,
              onEnterCanton: (index) => {
                enterCanton(index).catch(
                  reportNavigationError('Kanton konnte nicht geladen werden'),
                )
              },
              onShowMunicipalityPanel: showMunicipalityPanel,
            },
      ),
    )
```

Das ist bewusst hässlich — dieser Ternär verschwindet in Task 2 vollständig, wenn jede Seite nur noch ihre eigene Variante baut. Er existiert nur, damit die App zwischen Task 1 und Task 2 lauffähig bleibt.

- [ ] **Step 6: Tests und Typprüfung laufen lassen**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 7: Commit**

```bash
git add src/layers/viewLayers.ts src/layers/viewLayers.test.ts src/main.ts
git commit -m "$(cat <<'EOF'
ViewLayersInput wird eine über view unterschiedene Union

Vorbereitung für die zwei getrennten Kartenseiten: die
Beschäftigten-Seite soll companies.json (320 KB) gar nicht mehr laden.
Mit einem optionalen `companies?` bräuchte der Firmen-Zweig dafür einen
Guard, den kein Aufrufer je auslöst — toter Code, der einen Zustand
behauptet, den der Bau der Seiten ausschliesst. Über `view` verengt
TypeScript stattdessen von selbst.

Der Ternär in main.ts ist Übergangszustand und verschwindet mit der
Aufteilung in zwei Seiten.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Drei Seiten — `main.ts` aufteilen, Navigation, Multi-Page-Build

Der grosse Task. Er lässt sich nicht kleiner schneiden, ohne einen kaputten Zwischenzustand zu erzeugen: die Aufteilung in je eine Startfunktion pro Ansicht ist grundsätzlich unvereinbar damit, beide Ansichten weiter in einer Seite umzuschalten.

Die Landing bleibt in diesem Task roh (Titel und zwei Links, kein CSS) — Task 3 gestaltet sie aus.

**Files:**
- Create: `src/karte/basis.ts`, `src/karte/firmen.ts`, `src/karte/beschaeftigte.ts`
- Create: `src/firmen.ts`, `src/beschaeftigte.ts`
- Create: `src/ui/nav.ts`
- Create: `firmen/index.html`, `beschaeftigte/index.html`
- Modify: `index.html` (wird die rohe Landing)
- Modify: `vite.config.ts`
- Modify: `src/style.css` (Navigation, Offsets)
- Modify: `src/ui/legend.ts:5`, `src/ui/notices.ts:1`, `src/layers/viewLayers.ts:11` (Import-Pfad `toggle` → `nav`)
- Delete: `src/main.ts`, `src/ui/toggle.ts`

**Interfaces:**
- Consumes: `ViewLayersInput` (Union) und `buildViewLayers` aus Task 1.
- Produces:
  - `src/ui/nav.ts`: `type ViewName = 'sichtbare' | 'beschaeftigte'`, `const DEFAULT_MODE: Record<ViewName, ScaleMode>`, `const VIEW_PATH: Record<ViewName, string>`, `function createNav(view: ViewName, onModeChange: (mode: ScaleMode) => void): HTMLElement`
  - `src/karte/basis.ts`: `interface Basis`, `async function createBasis(): Promise<Basis>`, `function mountNav(view: ViewName, onModeChange: (mode: ScaleMode) => void): void`
  - `src/karte/firmen.ts`: `async function startFirmen(): Promise<void>`
  - `src/karte/beschaeftigte.ts`: `async function startBeschaeftigte(): Promise<void>`

- [ ] **Step 1: `src/ui/nav.ts` anlegen**

`git mv src/ui/toggle.ts src/ui/nav.ts`, dann den Inhalt ersetzen durch:

```typescript
import type { ScaleMode } from '../domain/scale'

// Interner Schlüssel folgt dem sichtbaren Namen: die Ansicht hiess bis zu
// ihrer Umbenennung «Die Vielen» und der Schlüssel entsprechend `viele`. Ein
// Name-ohne-passenden-Schlüssel wäre genau die Art Drift, die die nächste
// Leserin fehlleitet — deshalb wurde `viele` mitumbenannt, nicht nur das Label.
//
// Ausnahme, bewusst: Change 6 (2026-08-14) benennt das sichtbare Label «Die
// Sichtbaren» → «Börsennotierte Firmen» um, der interne Schlüssel `sichtbare`
// bleibt. Eine Umbenennung hätte hier keinen Gewinn: anders als bei `viele` →
// `beschaeftigte` (Einheit vs. Anzeigename) trägt `sichtbare` keine
// Zahl/Einheit, die aus dem Tritt geraten könnte — er ist nur ein interner
// Bezeichner für die Firmenansicht, und zieht sich durch `layers/visible.ts`,
// `ui/legend.ts` (`UNIT_LABEL`), `ui/notices.ts` und die Tests. Ihn
// mitzuziehen wäre für eine reine Label-Änderung unverhältnismässig.
export type ViewName = 'sichtbare' | 'beschaeftigte'

/** Je Ansicht ein eigener Default. Ansicht B (Gemeinden) ist extrem schief
 *  verteilt und braucht die gedämpfte Skala (Exponent 0.4, siehe
 *  `domain/scale.ts`) — seit Change 6 eine Potenzskala, nicht mehr die
 *  ursprüngliche echte Logarithmusskala.
 *
 *  Namensstand (Redesign Change 5, 2026-08-14): Schlüssel und Button-Label
 *  heissen wieder `'logarithmisch'` — der vertraute Name aus jeder anderen
 *  Kartenanwendung, an der Stelle, an der Nutzende navigieren. Das ist eine
 *  reine Umbenennung, keine Rückkehr zur echten `log10`-Skala: die Formel
 *  bleibt `(v/vmax)**0.4` (siehe `domain/scale.ts`). Die ehrliche Herkunft
 *  der Formel steht in der Eckbox (`ui/notices.ts`), nicht im Button.
 *
 *  Seit der Aufteilung in zwei Seiten (2026-08-15) gilt je Seite genau ein
 *  Eintrag; die zuletzt gewählte Skala überlebt einen Seitenwechsel nicht
 *  mehr, weil der Wechsel jetzt ein echter Seitenaufbau ist. Beide Ansichten
 *  starten damit immer in ihrem fachlich richtigen Default statt in dem, was
 *  zuletzt in der anderen Ansicht eingestellt war. */
export const DEFAULT_MODE: Record<ViewName, ScaleMode> = {
  sichtbare: 'linear',
  beschaeftigte: 'logarithmisch',
}

/** Die URL je Ansicht — an einer Stelle, damit `createNav` unten und die
 *  Landing (`index.html`) nicht auseinanderlaufen können. Mit Schrägstrich am
 *  Ende: Netlify serviert `/firmen/` aus `dist/firmen/index.html` und leitet
 *  `/firmen` zusätzlich dorthin um; der direkte Pfad spart die Umleitung. */
export const VIEW_PATH: Record<ViewName, string> = {
  sichtbare: '/firmen/',
  beschaeftigte: '/beschaeftigte/',
}

const VIEW_LABEL: Record<ViewName, string> = {
  sichtbare: 'Börsennotierte Firmen',
  beschaeftigte: 'Beschäftigte',
}

const MODES: readonly ScaleMode[] = ['logarithmisch', 'linear']

/** Baut die Steuerung oben links. Zwei Gruppen mit unterschiedlicher Natur,
 *  deshalb unterschiedliche Semantik trotz gleicher Optik:
 *
 *  - Die Ansichten sind seit der Aufteilung in zwei Seiten **Navigation** —
 *    `<a>` in einem `<nav>`, die aktuelle Seite mit `aria-current="page"`.
 *    Ein `role="radiogroup"` wäre hier falsch: es verspricht eine Auswahl
 *    innerhalb der Seite, es ist aber ein Seitenwechsel.
 *  - Die Höhenskala bleibt eine echte Auswahl innerhalb der Seite und
 *    behält `role="radiogroup"` und `aria-checked`.
 *
 *  Ruft `onModeChange` einmal bei der Konstruktion auf — das übernimmt den
 *  ersten Render, ein zusätzlicher expliziter Aufruf beim Aufrufer wäre nur
 *  eine Wiederholung. */
export function createNav(
  view: ViewName,
  onModeChange: (mode: ScaleMode) => void,
): HTMLElement {
  let mode: ScaleMode = DEFAULT_MODE[view]

  const root = document.createElement('div')
  root.id = 'steuerung'

  const marke = document.createElement('a')
  marke.className = 'marke'
  marke.href = '/'
  marke.textContent = 'zeigmers'
  root.appendChild(marke)

  const ansichten = document.createElement('nav')
  ansichten.className = 'gruppe'
  ansichten.setAttribute('aria-label', 'Ansicht')
  for (const name of ['sichtbare', 'beschaeftigte'] as const) {
    const link = document.createElement('a')
    link.className = 'ansicht'
    link.href = VIEW_PATH[name]
    link.textContent = VIEW_LABEL[name]
    if (name === view) {
      link.classList.add('aktiv')
      link.setAttribute('aria-current', 'page')
    }
    ansichten.appendChild(link)
  }
  root.appendChild(ansichten)

  const skala = document.createElement('div')
  skala.className = 'gruppe'
  skala.setAttribute('role', 'radiogroup')
  skala.setAttribute('aria-label', 'Höhenskala')
  const buttons = MODES.map((name) => {
    const button = document.createElement('button')
    button.dataset.mode = name
    button.textContent = name
    skala.appendChild(button)
    return button
  })
  root.appendChild(skala)

  const sync = () => {
    for (const button of buttons) {
      const active = button.dataset.mode === mode
      button.classList.toggle('aktiv', active)
      button.setAttribute('aria-checked', String(active))
    }
    onModeChange(mode)
  }

  skala.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (!button?.dataset.mode) return
    mode = button.dataset.mode as ScaleMode
    sync()
  })

  sync()
  return root
}
```

- [ ] **Step 2: Import-Pfade auf `nav` umstellen**

Drei Dateien importieren `ViewName` aus `./toggle` bzw. `../ui/toggle`:

- `src/ui/legend.ts:5` → `import type { ViewName } from './nav'`
- `src/ui/notices.ts:1` → `import type { ViewName } from './nav'`
- `src/layers/viewLayers.ts:11` → `import type { ViewName } from '../ui/nav'`

Prüfen, dass keine weitere Stelle übrig ist:

Run: `grep -rn "ui/toggle\|from './toggle'" src/`
Expected: keine Treffer.

- [ ] **Step 3: `src/karte/basis.ts` anlegen**

```typescript
import type { Geometry } from 'geojson'
import {
  loadCantons,
  joinCantonGeometry,
  type BoundaryFeatureCollection,
} from '../data/boundaries'
import { loadLevel, loadMeta, type Level, type Meta } from '../data/loader'
import { boundsOfGeometries, type LngLatBounds } from '../domain/bounds'
import type { ScaleMode } from '../domain/scale'
import { buildCantonBorderLayer } from '../layers/cantons'
import { createMap, type MapHandle } from '../map'
import { showError } from '../ui/error'
import { createNav, type ViewName } from '../ui/nav'

/** Alles, was beide Kartenseiten gemeinsam brauchen — einmal geladen und
 *  hergeleitet. Bewusst ein einfacher Datenhalter ohne Methoden: was damit
 *  geschieht, entscheidet die jeweilige Seite (`karte/firmen.ts`,
 *  `karte/beschaeftigte.ts`), nicht dieser gemeinsame Aufbau. */
export interface Basis {
  handle: MapHandle
  meta: Meta
  cantonsGeo: BoundaryFeatureCollection
  cantonBorderLayer: ReturnType<typeof buildCantonBorderLayer>
  kantone: Level
  cantonGeometries: Geometry[]
  nationalBounds: LngLatBounds
}

/** Legt die Karte an und lädt, was beide Seiten brauchen.
 *
 *  `ch_kantone.{json,bin}` (zusammen 5.6 KB) lädt bewusst auf **beiden**
 *  Seiten, obwohl die Firmen-Ansicht die Kantons-Aggregatwerte selbst nicht
 *  zeichnet: daraus leitet sich über `joinCantonGeometry` die Schweiz-Rahmung
 *  der Kamera ab. Die Rahmung aus `cantonsGeo` allein zu bilden wäre möglich,
 *  ergäbe aber bei einem unvollständigen Join eine andere Rahmung als auf der
 *  Beschäftigten-Seite — zwei Seiten, die die Schweiz verschieden rahmen, für
 *  5.6 KB. `companies.json` (320 KB) lädt dagegen nur die Firmen-Seite.
 *
 *  Wirft statt selbst zu melden: die Seiten-Einstiege (`src/firmen.ts`,
 *  `src/beschaeftigte.ts`) haben den einen Fehlerweg nach `showError`. */
export async function createBasis(): Promise<Basis> {
  const container = document.getElementById('map')
  if (!container) throw new Error('Kartencontainer #map fehlt im HTML.')

  const handle = createMap(container)
  handle.onError((message) => showError(`Basiskarte: ${message}`))

  const [meta, kantone, cantonsGeo] = await Promise.all([
    loadMeta(),
    loadLevel('ch_kantone'),
    loadCantons(),
  ])

  const cantonGeometries = joinCantonGeometry(kantone, cantonsGeo)
  // Schweiz-Rahmung aus der tatsächlichen Geometrie hergeleitet (Auftrag:
  // „Derive the canton framing from the geometry rather than hardcoding 26
  // camera positions") — kein von Hand gewählter Zentrum/Zoom-Wert.
  // `instant: true`: die erste Rahmung beim Laden ist keine Reaktion auf eine
  // Nutzerinteraktion, die eine Kameraanimation ankündigen müsste — sie stellt
  // nur den Platzhalter aus `map.ts` (`INITIAL_VIEW`) richtig, bevor
  // irgendetwas gezeichnet ist.
  const nationalBounds = boundsOfGeometries(cantonGeometries)
  handle.frameBounds(nationalBounds, { instant: true })

  return {
    handle,
    meta,
    cantonsGeo,
    cantonBorderLayer: buildCantonBorderLayer({ data: cantonsGeo }),
    kantone,
    cantonGeometries,
    nationalBounds,
  }
}

/** Hängt die Steuerung in `#ui` ein. `createNav` ruft `onModeChange` schon bei
 *  der Konstruktion einmal auf — das übernimmt den ersten Render. */
export function mountNav(
  view: ViewName,
  onModeChange: (mode: ScaleMode) => void,
): void {
  document.getElementById('ui')?.appendChild(createNav(view, onModeChange))
}
```

- [ ] **Step 4: `src/karte/firmen.ts` anlegen**

```typescript
import { presentGroupsFromIndices } from '../domain/legendGroups'
import { NOGA_UNKNOWN_INDEX } from '../domain/noga.generated'
import type { ScaleMode } from '../domain/scale'
import { buildViewLayers } from '../layers/viewLayers'
import { loadCompanies } from '../layers/visible'
import { formatGermanDate } from '../ui/format'
import { hideHoverLabel } from '../ui/hoverLabel'
import { renderLegend } from '../ui/legend'
import { renderNotices } from '../ui/notices'
import { hidePanel, showCompanyPanel } from '../ui/panel'
import { createBasis, mountNav } from './basis'

/** Ansicht «Börsennotierte Firmen» — seit Phase 3 national: eine Stufe, kein
 *  Kanton zum Betreten, keine Zurück-Kontrolle, kein Escape. Der gesamte
 *  Navigationsapparat der Beschäftigten-Seite (`karte/beschaeftigte.ts`)
 *  existiert hier deshalb nicht, statt als unerreichbarer Zweig
 *  mitgeschleppt zu werden. */
export async function startFirmen(): Promise<void> {
  const basis = await createBasis()
  const companies = await loadCompanies()

  const year =
    Math.max(0, ...companies.companies.map((c) => c.fiscalYear ?? 0)) ||
    basis.kantone.meta.year

  // Nur die recherchierten Firmen tragen eine Branchenfarbe (eine Säule) —
  // die übrigen kotierten Titel erscheinen als neutrale Marker ohne
  // Branchenbezug (siehe `layers/visible.ts`) und sollen die Legende nicht
  // um Branchen erweitern, die keine Säule tatsächlich zeigt.
  const presentGroups = presentGroupsFromIndices(
    companies.companies
      .filter((c) => c.researched)
      .map((c) => (c.placeholder ? NOGA_UNKNOWN_INDEX : c.nogaGroupIndex)),
  )

  // Die Abdeckungsangabe der Karte selbst — zwei Zahlen, nicht nur eine.
  // "8 von 224 recherchiert" allein wäre unvollständig: wer die Marker zählt,
  // sieht `stats.count` (platziert, inkl. der unrecherchierten Marker), nicht
  // 224 — ein SIX-Titel ohne eindeutigen Zefix-Sitz erscheint gar nicht auf
  // der Karte (siehe `companies.build_artifact`). Beide Zahlen stehen deshalb
  // nebeneinander. Aus den Artefaktdaten zur Laufzeit berechnet, nicht
  // hartkodiert — ein künftiger Sync-/Recherche-Lauf zieht beide Zahlen
  // automatisch nach.
  const coverageLabel =
    `${companies.stats.count} von ${companies.stats.totalListed} kotierten Titeln ` +
    `auf der Karte gezeigt, davon ${companies.stats.researched} recherchiert` +
    (companies.stats.sixRetrievedDate
      ? ` · SIX-Stand ${formatGermanDate(companies.stats.sixRetrievedDate)}`
      : '')

  document.title = 'zeigmers — Börsennotierte Firmen Schweiz'

  const render = (mode: ScaleMode) => {
    hidePanel()
    hideHoverLabel()

    basis.handle.setLayers(
      buildViewLayers({
        view: 'sichtbare',
        mode,
        cantonsGeo: basis.cantonsGeo,
        // National: kein einzelner Kanton hervorzuheben (bis Phase 2 war das
        // immer Aargau, unabhängig davon, wo die Firmen tatsächlich lagen).
        activeBfsNr: null,
        cantonBorderLayer: basis.cantonBorderLayer,
        companies,
        onShowCompanyPanel: showCompanyPanel,
      }),
    )

    renderLegend({ view: 'sichtbare', year, presentGroups, scopeLabel: coverageLabel })
    renderNotices('sichtbare', 'schweiz')
  }

  mountNav('sichtbare', render)
}
```

- [ ] **Step 5: `src/karte/beschaeftigte.ts` anlegen**

```typescript
import { joinMunicipalityGeometry, loadMunicipalityBoundaries } from '../data/boundaries'
import { loadLevel } from '../data/loader'
import { boundsOfGeometries } from '../domain/bounds'
import { presentGroupsFromIndices } from '../domain/legendGroups'
import type { ScaleMode } from '../domain/scale'
import { buildMunicipalityBorderLayer } from '../layers/many'
import { buildViewLayers, kantonRowInfo, type CantonEntry } from '../layers/viewLayers'
import { renderBackControl } from '../ui/backControl'
import { showError } from '../ui/error'
import { hideHoverLabel } from '../ui/hoverLabel'
import { renderLegend } from '../ui/legend'
import { renderNotices, type NoticeLevel } from '../ui/notices'
import { configureCanton, hidePanel, showMunicipalityPanel } from '../ui/panel'
import { createBasis, mountNav } from './basis'

/** Zeigt einen Fehler aus einer fehlgeschlagenen Kanton-Navigation über den
 *  bestehenden `showError`-Weg an. Ohne diesen Aufrufer verschwand ein
 *  abgelehntes Promise stillschweigend — genau der Grund, warum sich ein
 *  fehlgeschlagener Fetch früher als „gar nichts passiert" zeigte statt als
 *  sichtbarer Fehler. */
function reportNavigationError(context: string): (error: unknown) => void {
  return (error) => showError(`${context}: ${String(error)}`)
}

/** Ansicht «Beschäftigte» — zwei Stufen: `'schweiz'` (26 Kantonsbalken,
 *  Startzustand) und `'kanton'` (die Gemeinden des zuletzt betretenen
 *  Kantons). Zwei getrennte Bildschirme, kein Zoom-/LOD-Überblenden zwischen
 *  ihnen (Auftrag) — ein Klick auf einen Kantonsbalken wechselt den
 *  Bildschirm, löst keine Kameraüberblendung „hinein" aus. */
export async function startBeschaeftigte(): Promise<void> {
  const basis = await createBasis()
  const { handle, kantone, cantonsGeo, cantonGeometries, cantonBorderLayer, nationalBounds } =
    basis

  // Titel der Gemeindezelle im Panel — nur diese Ansicht zeigt Gemeinden,
  // deshalb steht der Aufruf hier und nicht im geteilten `createBasis`.
  configureCanton(basis.meta.canton.name)

  const kantoneVmax = kantone.meta.stats.max
  const nationalYear = kantone.meta.year
  const kantonePresentGroups = presentGroupsFromIndices(kantone.arrays.noga)

  // Pro Kanton einmal geladen, danach für die Sitzung im Speicher (Auftrag:
  // „re-entering a canton already visited must not fetch again"). 26 Kantone
  // vollständig geladen wären zusammen rund 12 MB — für eine Kartenanwendung
  // in einem einzelnen Tab unkritisch; ein Verdrängungs-Cache hätte hier nur
  // Komplexität ohne tatsächlichen Speicherdruck gelöst. `cantonFetches`
  // dedupliziert gleichzeitige Anfragen für denselben Kanton (z. B. ein
  // schneller Doppelklick).
  const cantonCache = new Map<string, CantonEntry>()
  const cantonFetches = new Map<string, Promise<CantonEntry>>()

  function loadCantonEntry(bfsNr: number, code: string, name: string): Promise<CantonEntry> {
    const cached = cantonCache.get(code)
    if (cached) return Promise.resolve(cached)
    const pending = cantonFetches.get(code)
    if (pending) return pending
    const prefix = code.toLowerCase()
    const promise = (async () => {
      const [gemeinde, boundaries] = await Promise.all([
        loadLevel(`${prefix}_gemeinde`),
        loadMunicipalityBoundaries(prefix),
      ])
      const geometries = joinMunicipalityGeometry(gemeinde, boundaries)
      const entry: CantonEntry = {
        code,
        name,
        bfsNr,
        gemeinde,
        geometries,
        vmax: gemeinde.meta.stats.max,
        presentGroups: presentGroupsFromIndices(gemeinde.arrays.noga),
        borderLayer: buildMunicipalityBorderLayer(geometries),
      }
      cantonCache.set(code, entry)
      return entry
    })()
    cantonFetches.set(code, promise)
    // `.finally()` gibt eine eigene, zweite Promise-Kette zurück, die bei
    // einem fehlgeschlagenen Fetch ebenfalls ablehnt — `promise` selbst trägt
    // den eigentlichen Fehler bereits und wird beim Aufrufer behandelt. Ohne
    // `.catch(() => {})` hier würde diese zweite, nur für die
    // Cache-Aufräumung gebaute Kette zusätzlich als unbehandelte Ablehnung
    // auffallen.
    promise.finally(() => cantonFetches.delete(code)).catch(() => {})
    return promise
  }

  let mode: ScaleMode = 'logarithmisch'
  let level: NoticeLevel = 'schweiz'
  let activeCanton: CantonEntry | null = null
  // Wird bei jeder Navigation erhöht — ein `enterCanton`-Aufruf, der erst nach
  // einer inzwischen überholten Navigation (z. B. Escape zurück zur Schweiz,
  // oder ein Klick auf einen anderen Kanton) fertig lädt, erkennt daran, dass
  // er nicht mehr der aktuelle ist, und lässt `level`/`activeCanton`
  // unangetastet.
  let navToken = 0

  // Zustand ist (mode, level, activeCanton). Jede Änderung rendert komplett
  // neu: Layer, Legende, Pflichthinweis, Titel, Zurück-Kontrolle. Der
  // viewState der Karte wird hier nirgends angefasst — Kamerabewegungen laufen
  // ausschliesslich über `handle.frameBounds()` in `enterCanton`/
  // `exitToSwitzerland`, nie in `render()` selbst.
  const render = () => {
    // Verteidigung gegen einen Zustand, der nie entstehen sollte
    // (Kantonsstufe ohne geladenen Kanton) — fällt statt eines leeren Renders
    // auf die Schweiz-Stufe zurück. `buildViewLayers` hat dieselbe
    // Verteidigung nochmals eingebaut (siehe `viewLayers.test.ts`), diese hier
    // hält zusätzlich `level` selbst konsistent (für den Titel,
    // `renderBackControl`, den `keydown`-Listener).
    if (level === 'kanton' && !activeCanton) level = 'schweiz'

    hidePanel()
    hideHoverLabel()
    document.title =
      level === 'kanton' && activeCanton
        ? `zeigmers — Beschäftigte Kanton ${activeCanton.name}`
        : 'zeigmers — Beschäftigte Schweiz'

    handle.setLayers(
      buildViewLayers({
        view: 'beschaeftigte',
        mode,
        cantonsGeo,
        activeBfsNr: level === 'kanton' && activeCanton ? activeCanton.bfsNr : null,
        cantonBorderLayer,
        level,
        kantone,
        cantonGeometries,
        kantoneVmax,
        activeCanton,
        onEnterCanton: (index) => {
          enterCanton(index).catch(reportNavigationError('Kanton konnte nicht geladen werden'))
        },
        onShowMunicipalityPanel: showMunicipalityPanel,
      }),
    )

    renderLegend({
      view: 'beschaeftigte',
      year: level === 'kanton' && activeCanton ? activeCanton.gemeinde.meta.year : nationalYear,
      presentGroups:
        level === 'kanton' && activeCanton ? activeCanton.presentGroups : kantonePresentGroups,
      scopeLabel: level === 'kanton' && activeCanton ? `Kanton ${activeCanton.name}` : undefined,
    })
    renderNotices('beschaeftigte', level)
    renderBackControl(level === 'kanton', exitToSwitzerland)
  }

  /** Betritt den Kanton der angeklickten Zeile der Schweiz-Stufe: schwenkt die
   *  Kamera sofort auf dessen bereits geladenen Umriss (kein Warten auf den
   *  Datenfetch), lädt parallel die beiden kantonsspezifischen Dateien und
   *  rendert erst danach um. Wirft weiter, statt den Fehler selbst zu
   *  schlucken — der Aufrufer hängt `reportNavigationError` an. */
  async function enterCanton(index: number) {
    const info = kantonRowInfo(kantone, index)
    const geometry = cantonGeometries[index]
    if (!info || !geometry) return
    const token = ++navToken
    handle.frameBounds(boundsOfGeometries([geometry]))
    const entry = await loadCantonEntry(info.bfsNr, info.code, info.name)
    if (token !== navToken) return // durch eine spätere Navigation überholt
    activeCanton = entry
    level = 'kanton'
    configureCanton(entry.name)
    render()
  }

  /** Zurück zur Schweiz-Übersicht — Klick auf `renderBackControl`s Knopf oder
   *  Escape. Kein Fetch nötig: die Schweiz-Stufe ist seit dem Start geladen. */
  function exitToSwitzerland() {
    if (level !== 'kanton') return
    navToken++ // invalidiert einen noch laufenden enterCanton()
    level = 'schweiz'
    activeCanton = null
    handle.frameBounds(nationalBounds)
    render()
  }

  mountNav('beschaeftigte', (newMode) => {
    mode = newMode
    render()
  })

  // Auftrag: „Escape should do it too" — derselbe Weg zurück wie der
  // Zurück-Knopf, nur über die Tastatur. Nur wirksam, wenn dieser Knopf auch
  // sichtbar wäre (Kantonsstufe).
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && level === 'kanton') exitToSwitzerland()
  })
}
```

- [ ] **Step 6: Die zwei Seiten-Einstiege anlegen**

`src/firmen.ts`:

```typescript
import './style.css'
import { startFirmen } from './karte/firmen'
import { showError } from './ui/error'

startFirmen().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
```

`src/beschaeftigte.ts`:

```typescript
import './style.css'
import { startBeschaeftigte } from './karte/beschaeftigte'
import { showError } from './ui/error'

startBeschaeftigte().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
```

- [ ] **Step 7: `src/main.ts` und die alte `index.html`-Verdrahtung entfernen**

```bash
git rm src/main.ts
```

- [ ] **Step 8: Die zwei Karten-HTML-Seiten anlegen**

`firmen/index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>zeigmers — Börsennotierte Firmen Schweiz</title>
  </head>
  <body>
    <div id="map"></div>
    <div id="ui"></div>
    <script type="module" src="/src/firmen.ts"></script>
  </body>
</html>
```

`beschaeftigte/index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>zeigmers — Beschäftigte Schweiz</title>
  </head>
  <body>
    <div id="map"></div>
    <div id="ui"></div>
    <script type="module" src="/src/beschaeftigte.ts"></script>
  </body>
</html>
```

- [ ] **Step 9: `index.html` wird die (noch rohe) Landing**

Task 3 gestaltet sie aus. Hier zählt nur, dass die drei Seiten stehen und erreichbar sind:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>zeigmers — Die Schweizer Wirtschaft als 3D-Karte</title>
  </head>
  <body>
    <main>
      <h1>zeigmers</h1>
      <a href="/firmen/">Börsennotierte Firmen</a>
      <a href="/beschaeftigte/">Beschäftigte</a>
    </main>
  </body>
</html>
```

- [ ] **Step 10: `vite.config.ts` auf drei Einstiege umstellen**

```typescript
// defineConfig stammt aus vitest/config, nicht aus vite — sonst lehnt TypeScript
// den `test`-Block als unbekannte Eigenschaft ab und `npm run build` bricht ab.
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Drei echte HTML-Einstiege statt einer SPA mit Router: die Landing lädt
    // damit kein einziges Byte deck.gl/MapLibre (zusammen 1.52 MB), und jede
    // Karte bekommt eine eigene, teilbare URL. Vite spiegelt die
    // Verzeichnisstruktur nach `dist/`; Netlify serviert `/firmen/` von sich
    // aus aus `dist/firmen/index.html` — es braucht keine Redirect-Regel.
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        firmen: resolve(__dirname, 'firmen/index.html'),
        beschaeftigte: resolve(__dirname, 'beschaeftigte/index.html'),
      },
    },
  },
  test: { environment: 'node' },
})
```

- [ ] **Step 11: `src/style.css` — Navigation und die zwei Offsets**

Ersetze den Block `#steuerung button` / `#steuerung button.aktiv` (Zeilen 91-96) durch:

```css
/* Der Heim-Link steht über den beiden Gruppen, nicht in einer — er ist weder
   eine Ansicht noch eine Skala, sondern der Weg aus der Karte heraus. */
#steuerung .marke {
  color: var(--tinte); text-decoration: none;
  font-size: .9375rem; font-weight: 600; letter-spacing: -.01em;
  padding: 0 .25rem;
}

/* Ansichten sind seit der Aufteilung in zwei Seiten Links, die Höhenskala
   sind weiterhin Buttons (siehe `ui/nav.ts`) — gleiche Optik, verschiedene
   Elemente, deshalb beide Selektoren. */
#steuerung button, #steuerung a.ansicht {
  border: none; background: transparent; color: var(--tinte-leise);
  padding: .4rem .75rem; border-radius: .375rem; font-size: .8125rem;
  cursor: pointer; font-family: inherit; text-decoration: none;
  white-space: nowrap;
}
#steuerung button.aktiv, #steuerung a.ansicht.aktiv {
  background: var(--tinte); color: var(--grund);
}
```

`#steuerung` ist durch die Markenzeile um rund 1.9rem höher geworden (Zeilenhöhe plus `gap: .5rem`). Beide von Hand auf die alte Höhe abgestimmten Offsets müssen mitwandern:

- `#zurueck-gruppe` (Zeile 109): `top: 5.75rem` → `top: 7.75rem`
- `#panel` (Zeile 172): `top: 4.5rem` → `top: 6.5rem`

Und in `#panel` mit dem Offset auch die Höhenbegrenzung: `max-height: calc(100vh - 6rem)` → `calc(100vh - 8rem)`.

Beide Werte sind wie bisher von Hand gesetzt, nicht hergeleitet — Step 14 prüft sie im Browser.

- [ ] **Step 12: Tests und Typprüfung**

Run: `npm test && npm run build`
Expected: PASS, Build erzeugt `dist/index.html`, `dist/firmen/index.html`, `dist/beschaeftigte/index.html`.

- [ ] **Step 13: Belegen, dass die Beschäftigten-Seite `companies.json` nicht mehr lädt**

Run: `grep -rn "loadCompanies" dist/assets/*.js | head`

Erwartung: Die Vite-Ausgabe teilt gemeinsamen Code in Chunks; entscheidend ist nicht der Chunk-Inhalt, sondern dass zur Laufzeit kein Fetch erfolgt. Deshalb zusätzlich im Browser prüfen (Step 14).

- [ ] **Step 14: Von Hand im Browser prüfen**

Run: `npm run build && npx vite preview`

Prüfen:
1. `/` zeigt die rohe Landing mit zwei Links.
2. `/firmen/` lädt die Firmen-Karte, Titel `zeigmers — Börsennotierte Firmen Schweiz`, Skala steht auf `linear`.
3. `/beschaeftigte/` lädt die Kantonsbalken, Titel `zeigmers — Beschäftigte Schweiz`, Skala steht auf `logarithmisch`.
4. **Netzwerk-Tab auf `/beschaeftigte/`:** `companies.json` erscheint **nicht**.
5. Navigation: von `/firmen/` auf «Beschäftigte» klicken wechselt die Seite; `zeigmers` führt auf `/`.
6. Auf `/beschaeftigte/` einen Kanton anklicken → Gemeinden, Titel `zeigmers — Beschäftigte Kanton <Name>`, Zurück-Knopf sichtbar und **nicht** von der Steuerung überlappt. Escape führt zurück.
7. Ein Klick auf eine Gemeinde öffnet das Panel rechts, **ohne** die Steuerung zu überlappen.

Falls 6 oder 7 überlappen: `#zurueck-gruppe`s `top` bzw. `#panel`s `top` in `src/style.css` nachziehen, bis es passt.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Drei Seiten statt einer — jede Ansicht bekommt ihre eigene URL

main.ts zerfällt in karte/basis.ts (geteilter Aufbau) plus je eine
Datei pro Ansicht. Damit hört `view` auf, Zustand zu sein: die vier
`view === 'sichtbare' ? … : …`-Ternäre in render() verschwinden
ersatzlos, und der gesamte Navigationsapparat der Beschäftigten-Seite
existiert auf der Firmen-Seite nicht mehr, statt als unerreichbarer
Zweig mitgeschleppt zu werden.

Die Beschäftigten-Seite lädt companies.json (320 KB) dadurch gar
nicht mehr, die Landing kein einziges Byte deck.gl.

toggle.ts wird nav.ts: die Ansichten sind jetzt Navigation, also <a>
in einem <nav> mit aria-current statt Buttons in einer radiogroup.
Die Höhenskala bleibt eine echte Auswahl und behält ihre radiogroup.

#zurueck-gruppe und #panel wandern um 2rem nach unten — beide Offsets
waren von Hand auf die Höhe von #steuerung abgestimmt, die durch die
Markenzeile gewachsen ist.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Landing Page ausgestalten

**Files:**
- Modify: `index.html`
- Create: `src/landing.css`
- Test: `src/landing.test.ts`

**Interfaces:**
- Consumes: `index.html` und `VIEW_PATH` aus Task 2 (die Pfade `/firmen/` und `/beschaeftigte/`).
- Produces: nichts, worauf spätere Tasks sich stützen — ausser dass Task 4 in dieselbe `index.html` die Meta-Tags einträgt.

- [ ] **Step 1: Den Drift-Test schreiben**

`src/landing.test.ts`:

```typescript
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
//
// Dass das kein theoretisches Risiko ist, zeigt das README: es nannte
// "201 der 202 an der SIX kotierten Gesellschaften", während totalListed
// längst bei 224 stand.

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
    expect(HTML).toContain(`${count} von ${totalListed} an der SIX kotierten Gesellschaften`)
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
```

- [ ] **Step 2: Test laufen lassen — er muss fehlschlagen**

Run: `npx vitest run src/landing.test.ts`
Expected: FAIL. Die rohe `index.html` aus Task 2 enthält keine der Kennzahlen; die ersten vier Tests scheitern, der fünfte (Links) besteht bereits.

- [ ] **Step 3: `index.html` mit den echten Texten und Zahlen füllen**

Die Zahlen unten sind der verifizierte Stand vom 15. August 2026. Wenn der Test in Step 5 andere Werte meldet, gilt der Test — die Artefakte sind die Wahrheit, nicht dieses Dokument.

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>zeigmers — Die Schweizer Wirtschaft als 3D-Karte</title>
    <link rel="stylesheet" href="/src/landing.css" />
  </head>
  <body>
    <main>
      <header>
        <h1>zeigmers</h1>
        <p class="unterzeile">
          Die Schweizer Wirtschaft als 3D-Karte — zwei Ansichten derselben Fläche,
          nebeneinander gehalten, damit der Unterschied sichtbar wird.
        </p>
      </header>

      <nav class="karten" aria-label="Karten">
        <a class="karte" href="/firmen/">
          <h2>Börsennotierte Firmen</h2>
          <p>
            Wo die Schweizer Börse sitzt: jede Säule eine Gesellschaft, ihre Höhe
            der Jahresumsatz.
          </p>
          <p class="kennzahl">
            201 von 224 an der SIX kotierten Gesellschaften · alle recherchiert
          </p>
        </a>

        <a class="karte" href="/beschaeftigte/">
          <h2>Beschäftigte</h2>
          <p>
            Wo tatsächlich gearbeitet wird: alle 26 Kantone, nach einem Klick
            jede einzelne Gemeinde.
          </p>
          <p class="kennzahl">5'876'865 Beschäftigte · BFS STATENT 2023</p>
        </a>
      </nav>

      <footer>
        <p>
          Quellen: BFS STATENT, SIX Swiss Exchange, swisstopo, Zefix.
        </p>
        <p>
          Technischer Machbarkeitsnachweis, keine amtliche Statistik — die Zahlen
          sind korrekt im Rahmen dessen, was die Quellen hergeben.
        </p>
      </footer>
    </main>
  </body>
</html>
```

- [ ] **Step 4: `src/landing.css` anlegen**

```css
/* Dieselben Tokens wie die Karte (`src/style.css`), aber nur die, die eine
   Textseite braucht — keine Kopie der 244 Zeilen dort, die fast ausschliesslich
   Karten-Chrome (Legende, Panel, Hover-Label, Stapelreihenfolge) beschreiben.
   Die Landing ist bewusst die einzige Seite ohne JavaScript: sie lädt keine
   Zeile deck.gl/MapLibre (zusammen 1.52 MB). */
:root {
  --grund: #E8EDF2;
  --land: #CFD8E3;
  --land-kante: #A8B6C6;
  --tinte: #1B2733;
  --tinte-leise: #5A6B7C;
  --oberflaeche: rgba(255, 255, 255, .84);
  --oberflaeche-rand: rgba(168, 182, 198, .55);
  --schrift: "Helvetica Neue", Inter, system-ui, sans-serif;
}

* { box-sizing: border-box; }

html, body {
  margin: 0; min-height: 100%;
  font-family: var(--schrift);
  background: var(--grund);
  color: var(--tinte);
  /* Wie auf der Karte: Zahlen müssen untereinander ausrichten. */
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

main {
  max-width: 52rem;
  margin: 0 auto;
  padding: clamp(2rem, 8vh, 6rem) 1.5rem 3rem;
}

h1 {
  margin: 0;
  font-size: clamp(2.5rem, 8vw, 4rem);
  font-weight: 600;
  letter-spacing: -.03em;
  line-height: 1;
}

.unterzeile {
  margin: 1rem 0 0;
  max-width: 34rem;
  font-size: 1.0625rem;
  line-height: 1.5;
  color: var(--tinte-leise);
}

.karten {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: clamp(2rem, 6vh, 3.5rem) 0 0;
}

/* Unter 640 px gestapelt — zwei Karten nebeneinander werden dort zu schmal,
   um die Kennzahl in einer lesbaren Zeile zu halten. */
@media (max-width: 640px) {
  .karten { grid-template-columns: 1fr; }
}

.karte {
  display: block;
  padding: 1.5rem;
  border: 1px solid var(--oberflaeche-rand);
  border-radius: .75rem;
  background: var(--oberflaeche);
  box-shadow: 0 1px 3px rgba(27, 39, 51, .1);
  color: inherit;
  text-decoration: none;
}

/* Das einzige Bewegungsdesign der Seite, und es ist Hover-Feedback — genau
   die Grenze, die auch die Karte einhält (siehe `src/style.css`). */
.karte:hover {
  border-color: var(--land-kante);
  box-shadow: 0 2px 8px rgba(27, 39, 51, .14);
}

.karte h2 {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -.015em;
}

.karte p {
  margin: .625rem 0 0;
  font-size: .9375rem;
  line-height: 1.5;
  color: var(--tinte-leise);
}

.karte .kennzahl {
  margin-top: 1rem;
  padding-top: .875rem;
  border-top: 1px solid var(--oberflaeche-rand);
  font-size: .8125rem;
  color: var(--tinte);
}

footer {
  margin-top: clamp(2.5rem, 8vh, 4rem);
  padding-top: 1.25rem;
  border-top: 1px solid var(--oberflaeche-rand);
  font-size: .75rem;
  line-height: 1.5;
  color: var(--tinte-leise);
}

footer p { margin: 0 0 .35rem; }
footer p:last-child { margin-bottom: 0; }

/* Sichtbarer Tastaturfokus, wie auf der Karte. */
a:focus-visible {
  outline: 2px solid var(--tinte);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 5: Test laufen lassen — er muss bestehen**

Run: `npx vitest run src/landing.test.ts`
Expected: PASS, alle fünf Fälle.

Falls ein Fall fehlschlägt, weil die Artefakte inzwischen andere Zahlen tragen: **die Zahlen in `index.html` an die Artefakte anpassen**, nie umgekehrt den Test aufweichen.

- [ ] **Step 6: Vollständige Prüfung**

Run: `npm test && npm run build`
Expected: PASS. In `dist/index.html` prüfen, dass `<link rel="stylesheet">` auf ein gehashtes CSS-Asset zeigt und **kein** `<script>`-Tag vorhanden ist:

Run: `grep -c "<script" dist/index.html`
Expected: `0`

- [ ] **Step 7: Von Hand im Browser prüfen**

Run: `npx vite preview`

Prüfen: Landing bei voller Breite zweispaltig, unter 640 px gestapelt; beide Karten führen auf die richtige Seite; Tab-Fokus sichtbar auf beiden Karten.

- [ ] **Step 8: Commit**

```bash
git add index.html src/landing.css src/landing.test.ts
git commit -m "$(cat <<'EOF'
Landing Page — zwei Einstiege, ohne eine Zeile JavaScript

Die Kennzahlen stehen fest im HTML, weil die Seite sonst 320 KB
companies.json laden müsste, um zwei Zahlen zu zeigen. Hartkodierte
Zahlen neben lebenden Artefakten veralten still, deshalb hält
src/landing.test.ts sie dort fest: er liest companies.json und
ch_kantone.json und lässt npm test (und damit den Netlify-Build)
fehlschlagen, sobald beide auseinanderlaufen.

Das ist nicht theoretisch — das README nannte "201 der 202 an der SIX
kotierten Gesellschaften", während totalListed längst bei 224 stand.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Favicon und Meta-Tags auf allen drei Seiten

**Files:**
- Modify: `index.html`, `firmen/index.html`, `beschaeftigte/index.html`

**Interfaces:**
- Consumes: die drei HTML-Dateien aus Task 2 und 3.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Favicon und Meta-Tags in alle drei `<head>` eintragen**

Das Favicon ist ein Inline-SVG als Data-URI — keine zusätzliche Datei, kein zusätzlicher Request, und es verschwindet die 404, die heute jeder Seitenaufruf erzeugt. Motiv: drei Säulen unterschiedlicher Höhe auf dem Kartengrund, in der Kartenpalette (`--grund` als Fläche, `--tinte` als Säulen).

In **allen drei** Dateien direkt nach dem `<title>` einfügen:

```html
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23E8EDF2'/%3E%3Crect x='6' y='18' width='5' height='8' fill='%231B2733'/%3E%3Crect x='13.5' y='9' width='5' height='17' fill='%231B2733'/%3E%3Crect x='21' y='14' width='5' height='12' fill='%231B2733'/%3E%3C/svg%3E"
    />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="de_CH" />
    <meta property="og:site_name" content="zeigmers" />
```

- [ ] **Step 2: Je Seite Beschreibung und `og:title`/`og:description`**

In `index.html`:

```html
    <meta
      name="description"
      content="Die Schweizer Wirtschaft als 3D-Karte: die an der SIX kotierten Gesellschaften nach Umsatz, und die Beschäftigten aller 26 Kantone nach Arbeitsort."
    />
    <meta property="og:title" content="zeigmers — Die Schweizer Wirtschaft als 3D-Karte" />
    <meta
      property="og:description"
      content="Zwei Ansichten derselben Fläche: die sichtbaren börsennotierten Firmen, und die Arbeit, die tatsächlich stattfindet."
    />
```

In `firmen/index.html`:

```html
    <meta
      name="description"
      content="Die an der SIX kotierten Gesellschaften an ihrem operativen Hauptsitz, als 3D-Karte der Schweiz — Säulenhöhe ist der Jahresumsatz."
    />
    <meta property="og:title" content="zeigmers — Börsennotierte Firmen Schweiz" />
    <meta
      property="og:description"
      content="Jede Säule eine Gesellschaft, ihre Höhe der Jahresumsatz — jede Zahl mit Primärquelle und unabhängiger Gegenprüfung."
    />
```

In `beschaeftigte/index.html`:

```html
    <meta
      name="description"
      content="Beschäftigte am Arbeitsort in allen 26 Kantonen der Schweiz, als 3D-Karte — nach einem Klick auf einen Kanton bis auf die einzelne Gemeinde."
    />
    <meta property="og:title" content="zeigmers — Beschäftigte Schweiz" />
    <meta
      property="og:description"
      content="Die Arbeit, die tatsächlich stattfindet: extrudierte Gemeindeflächen nach Beschäftigten am Arbeitsort, aus der BFS-STATENT."
    />
```

Kein `og:image` — dafür bräuchte es einen Screenshot, den es noch nicht gibt. Ein `og:image`-Tag mit einem Pfad, hinter dem keine Datei liegt, wäre schlechter als keins.

- [ ] **Step 3: Prüfen, dass alle drei Seiten vollständig sind**

Run: `for f in index.html firmen/index.html beschaeftigte/index.html; do echo "$f: $(grep -c 'og:\|rel="icon"\|name="description"' $f)"; done`
Expected: jede Datei `7` (icon, og:type, og:locale, og:site_name, description, og:title, og:description).

- [ ] **Step 4: Build und Tests**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Von Hand prüfen**

Run: `npx vite preview` — im Browser-Tab muss auf allen drei Seiten das Säulen-Favicon erscheinen, und die Konsole darf keine 404 für `/favicon.ico` mehr zeigen.

- [ ] **Step 6: Commit**

```bash
git add index.html firmen/index.html beschaeftigte/index.html
git commit -m "$(cat <<'EOF'
Favicon und Meta-Tags — drei Seiten, die sich teilen lassen

Das Favicon ist ein Inline-SVG als Data-URI: keine zusätzliche Datei,
kein zusätzlicher Request, und die 404, die bisher jeder Seitenaufruf
erzeugte, verschwindet.

Kein og:image — dafür bräuchte es einen Screenshot, den es noch nicht
gibt, und ein Tag mit einem Pfad ohne Datei dahinter wäre schlechter
als keins.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Umbenennung im Frontend, npm und README

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `README.md`
- Modify: `src/layers/visible.ts` (Zeilen 24, 34, 48, 68, 76), `src/domain/noga.generated.ts` (Zeile 2)

**Interfaces:**
- Consumes: nichts.
- Produces: `package.json` `"name": "zeigmers"` und das Skript `build:data` → `uv run --project etl zeigmers-etl all`, auf das Task 6 den Python-Entry-Point ausrichtet.

- [ ] **Step 1: `package.json` umbenennen**

`"name": "draufsicht"` → `"name": "zeigmers"`.
`"build:data": "uv run --project etl draufsicht-etl all"` → `"build:data": "uv run --project etl zeigmers-etl all"`.

Hinweis: Der ETL-Entry-Point heisst erst nach Task 6 `zeigmers-etl`. `build:data` läuft in der Zwischenzeit nicht — das ist kein Bau-Skript und blockiert weder `npm run build` noch Netlify.

- [ ] **Step 2: `package-lock.json` nachziehen**

Run: `npm install --package-lock-only`

Das schreibt den neuen Namen an beiden Stellen (`name` und `packages[""].name`), ohne `node_modules` anzufassen.

Run: `grep -c draufsicht package-lock.json`
Expected: `0`

- [ ] **Step 3: Kommentar-Pfadverweise korrigieren**

Sechs Stellen verweisen auf `etl/src/draufsicht_etl/…` bzw. auf den CLI-Namen:

Run: `grep -rn "draufsicht" src/`
Expected: 6 Treffer — `src/domain/noga.generated.ts:2` und `src/layers/visible.ts` (5×).

Ersetze in beiden Dateien `draufsicht_etl` → `zeigmers_etl` und `draufsicht-etl` → `zeigmers-etl`:

```bash
sed -i '' 's/draufsicht_etl/zeigmers_etl/g; s/draufsicht-etl/zeigmers-etl/g' \
  src/domain/noga.generated.ts src/layers/visible.ts
```

Run: `grep -rn "draufsicht" -i src/`
Expected: keine Treffer.

- [ ] **Step 4: README umbenennen und die falsche Firmenzahl korrigieren**

Zwei getrennte Änderungen in derselben Datei:

1. Überschrift `# Draufsicht` → `# zeigmers`, und alle weiteren 23 Vorkommen von «Draufsicht» → «zeigmers» bzw. `draufsicht_etl`/`draufsicht-etl` entsprechend.
2. **Die Sachkorrektur:** Der Absatz zu Ansicht A nennt «201 der 202 an der SIX kotierten Gesellschaften». `companies.json` weist `totalListed: 224` aus. Ersetze die Formulierung durch:

> **201 der 224 an der SIX kotierten Gesellschaften stehen an ihrem operativen Hauptsitz, und alle 201 sind recherchiert**

Prüfen, ob «202» sonst noch irgendwo im README steht:

Run: `grep -n "202" README.md`

Jeden weiteren Treffer einzeln beurteilen — Jahreszahlen (2026, 2023) sind keine Firmenzahlen.

Run: `grep -ci draufsicht README.md`
Expected: `0`

- [ ] **Step 5: Tests und Build**

Run: `npm test && npm run build`
Expected: PASS. Der Landing-Test aus Task 3 prüft weiterhin die Zahlen im HTML gegen die Artefakte.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json README.md src/
git commit -m "$(cat <<'EOF'
Draufsicht wird zeigmers — Frontend, npm, README

Dazu eine Sachkorrektur, die beim Nachrechnen der Landing-Kennzahlen
auffiel: das README nannte "201 der 202 an der SIX kotierten
Gesellschaften", companies.json weist totalListed: 224 aus. Die 202
war seit einem früheren SIX-Stand stehengeblieben und von nichts
gedeckt.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Umbenennung des Python-ETL-Pakets

Rein mechanisch, aber breit — 27 Dateien. Die ETL-Testsuite ist der Beleg, dass nichts übersehen wurde.

**Files:**
- Modify: `etl/pyproject.toml`
- Rename: `etl/src/draufsicht_etl/` → `etl/src/zeigmers_etl/`
- Modify: alle Dateien in `etl/src/zeigmers_etl/` und `etl/tests/` mit `draufsicht`-Vorkommen

**Interfaces:**
- Consumes: den Skriptnamen `zeigmers-etl` aus `package.json` (Task 5, Step 1).
- Produces: das Python-Paket `zeigmers_etl` mit dem Konsolen-Entry-Point `zeigmers-etl`.

- [ ] **Step 1: Ausgangslage festhalten — die ETL-Tests müssen jetzt schon grün sein**

Run: `uv run --project etl pytest -q`
Expected: PASS. Falls hier bereits etwas rot ist, **zuerst klären** — sonst lässt sich nach der Umbenennung nicht unterscheiden, was sie gebrochen hat.

Die Zahl der bestandenen Tests notieren; Step 5 muss dieselbe Zahl liefern.

- [ ] **Step 2: Paketverzeichnis umbenennen**

```bash
git mv etl/src/draufsicht_etl etl/src/zeigmers_etl
```

- [ ] **Step 3: Alle Vorkommen ersetzen**

```bash
grep -rl "draufsicht" etl/ | xargs sed -i '' 's/draufsicht_etl/zeigmers_etl/g; s/draufsicht-etl/zeigmers-etl/g; s/Draufsicht/zeigmers/g; s/draufsicht/zeigmers/g'
```

Reihenfolge der Ersetzungen ist wichtig: die spezifischen Formen (`draufsicht_etl`, `draufsicht-etl`) müssen vor den allgemeinen stehen, sonst zerlegt die letzte Regel sie zu `zeigmers_etl` über einen Umweg mit falschem Zwischenergebnis.

`etl/pyproject.toml` trägt danach:

```toml
name = "zeigmers-etl"
...
zeigmers-etl = "zeigmers_etl.cli:run"
...
packages = ["src/zeigmers_etl"]
```

Run: `grep -rn "draufsicht" -i etl/`
Expected: keine Treffer.

- [ ] **Step 4: Die Umgebung neu auflösen**

Der Entry-Point-Name hat sich geändert; `uv` muss das Paket neu installieren:

Run: `uv sync --project etl`
Expected: läuft ohne Fehler durch.

- [ ] **Step 5: ETL-Tests laufen lassen**

Run: `uv run --project etl pytest -q`
Expected: PASS, mit derselben Testzahl wie in Step 1.

- [ ] **Step 6: Den Entry-Point tatsächlich aufrufen**

Ein bestandener Test beweist noch nicht, dass das Konsolenskript registriert ist — das ist genau die Stelle, die eine Umbenennung bricht:

Run: `uv run --project etl zeigmers-etl --help`
Expected: die Hilfe erscheint, kein «command not found».

- [ ] **Step 7: Frontend-Tests und Build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Draufsicht wird zeigmers — auch im ETL

Rein mechanisch über 27 Dateien: Paketverzeichnis, pyproject, alle
Imports. Der Beleg ist nicht das Fehlen von Treffern, sondern dass die
ETL-Testsuite unverändert durchläuft und `zeigmers-etl --help`
antwortet — ein registrierter Konsolen-Entry-Point ist genau das, was
eine Paketumbenennung still bricht.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Vollständige Verifikation und Push nach GitHub

**Files:** keine Codeänderung.

**Interfaces:**
- Consumes: den fertigen Stand aus Task 1-6.
- Produces: den Branch `main` auf `kokosevi/zeigmers`, auf den Task 8 die Netlify-Site verknüpft.

- [ ] **Step 1: Sicherstellen, dass nichts uncommittet ist**

Run: `git status --short`
Expected: leer (ausser `Links/`, das ungetrackt bleibt).

- [ ] **Step 2: Alle drei Testsuiten**

Run: `npm test && npm run build && uv run --project etl pytest -q`
Expected: alle PASS.

- [ ] **Step 3: Letzte Prüfung, dass der alte Name nur noch dort steht, wo er hingehört**

Run: `grep -rli "draufsicht" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=data --exclude-dir=dist`

Expected: **ausschliesslich** Treffer unter `docs/superpowers/` (die datierten Protokolle) und in `README.md`, falls dort ein historischer Rückblick den alten Namen bewusst nennt. Jeder andere Treffer ist ein übersehener.

- [ ] **Step 4: Die veröffentlichte Version von Hand durchklicken**

Run: `npm run build && npx vite preview`

Die vollständige Runde:
1. `/` — Landing, zweispaltig, beide Kennzahlen sichtbar
2. `/firmen/` — Karte lädt, Legende zeigt die Abdeckungsangabe, ein Klick auf eine Säule öffnet das Panel
3. Navigation «Beschäftigte» — Seitenwechsel
4. `/beschaeftigte/` — 26 Kantonsbalken, Netzwerk-Tab zeigt **kein** `companies.json`
5. Klick auf einen Kanton — Gemeinden, Zurück-Knopf ohne Überlappung
6. Escape — zurück zur Schweiz
7. `zeigmers` oben links — zurück auf `/`
8. Browserfenster auf ~400 px verschmälern — Landing gestapelt, lesbar

- [ ] **Step 5: GitHub-Repo umbenennen**

```bash
gh repo rename zeigmers --repo kokosevi/Zeigmers --yes
```

Run: `gh repo view kokosevi/zeigmers --json name,url`
Expected: `{"name":"zeigmers","url":"https://github.com/kokosevi/zeigmers"}`

- [ ] **Step 6: Branch umbenennen und pushen**

```bash
git branch -m master main
git remote add origin https://github.com/kokosevi/zeigmers.git
git push -u origin main
```

Run: `git log origin/main --oneline -1`
Expected: derselbe Commit wie lokal.

- [ ] **Step 7: Prüfen, dass die Daten tatsächlich mitgegangen sind**

`public/data` ist eingecheckt (83 Dateien, rund 13 MB) — ohne sie baut Netlify eine leere Karte:

Run: `git ls-tree -r origin/main --name-only | grep -c "^public/data/"`
Expected: `83`

---

### Task 8: Netlify einrichten und Ordner umbenennen

**Files:** keine Codeänderung.

**Interfaces:**
- Consumes: `kokosevi/zeigmers`, Branch `main` (Task 7).
- Produces: eine öffentlich erreichbare `*.netlify.app`-Adresse.

**Achtung:** Step 2 verlangt eine Bestätigung des Nutzers im Browser. Ohne sie geht es nicht weiter — nicht versuchen, sie zu umgehen.

- [ ] **Step 1: Bestätigen, dass Netlify nichts zusätzlich braucht**

`netlify.toml` steht bereits und wird nicht geändert:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"
```

Netlify liest Build-Befehl, Publish-Verzeichnis und Node-Version daraus; im Einrichtungsdialog müssen sie nicht gesetzt werden.

- [ ] **Step 2: Bei Netlify anmelden**

```bash
npx netlify-cli@latest login
```

Öffnet den Browser. **Hier auf den Nutzer warten.** `netlify-cli` läuft bewusst über `npx` und wird nicht in `package.json` eingetragen — es ist ein einmaliges Einrichtungswerkzeug, keine Bauabhängigkeit.

- [ ] **Step 3: Site anlegen und mit dem Repo verknüpfen**

```bash
npx netlify-cli@latest init
```

Im Dialog:
- «Create & configure a new site»
- Team: das vorhandene
- Site name: `zeigmers` (falls vergeben, einen Zusatz wählen — der Name bestimmt nur die `*.netlify.app`-Adresse und lässt sich später ändern)
- Build command / Directory: die aus `netlify.toml` vorgeschlagenen bestätigen

- [ ] **Step 4: Den ersten Build abwarten und prüfen**

Run: `npx netlify-cli@latest watch`
Expected: Build erfolgreich.

Run: `npx netlify-cli@latest status`
Expected: nennt die URL der Site.

- [ ] **Step 5: Die veröffentlichte Seite prüfen**

Auf der `*.netlify.app`-Adresse:

1. `/` lädt die Landing
2. `/firmen/` **direkt aufgerufen** (nicht über die Landing) lädt die Karte
3. `/beschaeftigte/` **direkt aufgerufen** lädt die Karte
4. `/firmen` (ohne Schrägstrich) landet auf `/firmen/`

Und die Header für die Binärdaten:

Run: `curl -sI https://<site>.netlify.app/data/ch_kantone.bin | grep -i "content-type\|cache-control"`
Expected: `content-type: application/octet-stream` und `cache-control: public, max-age=3600`

- [ ] **Step 6: Netlify-Zustandsdateien nicht einchecken**

`netlify init` legt `.netlify/` an. Prüfen und gegebenenfalls ignorieren:

Run: `git status --short`

Falls `.netlify/` erscheint, eine Zeile an `.gitignore` anfügen:

```
.netlify/
```

```bash
git add .gitignore && git commit -m "netlify-Zustandsverzeichnis ignorieren

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" && git push
```

- [ ] **Step 7: Den lokalen Ordner umbenennen — allerletzter Schritt**

Erst hier, nach dem erfolgreichen Deploy: die Umbenennung bricht jeden absoluten Pfad einer laufenden Sitzung.

```bash
mv /Users/sevi/Claude/Draufsicht /Users/sevi/Claude/zeigmers
```

Run: `ls -d /Users/sevi/Claude/zeigmers && git -C /Users/sevi/Claude/zeigmers status --short`
Expected: Verzeichnis existiert, Arbeitsbaum sauber.

Danach dem Nutzer sagen, dass jede weitere Sitzung im neuen Pfad startet.

---

## Self-Review

**Spec-Abdeckung** — jeder Abschnitt der Spec hat einen Task:

| Spec-Abschnitt | Task |
|---|---|
| 1 — Seitenstruktur | 2 (Steps 8-10) |
| 2 — Aufteilung von `main.ts` | 2 (Steps 3-7) |
| 2 — `ViewLayersInput` als Union | 1 |
| 3 — Navigation | 2 (Steps 1-2, 11) |
| 4 — Landing Page, Kennzahlen, Drift-Schutz | 3 |
| 4 — Favicon, Meta, OG | 4 |
| 5 — Umbenennung Frontend/npm/README | 5 |
| 5 — Umbenennung Python-ETL | 6 |
| 5 — GitHub-Repo und Branch | 7 (Steps 5-6) |
| 5 — Ordner | 8 (Step 7) |
| 6 — Verifikation | 7 (Steps 1-4) |
| 6 — Deploy | 8 (Steps 1-5) |
| 6 — Prüfung nach dem Deploy | 8 (Step 5) |

**Platzhalter:** keine. Jeder Code-Step trägt den vollständigen Code, jeder Prüf-Step den konkreten Befehl und die erwartete Ausgabe.

**Typ-Konsistenz:**

- `ViewName` wird in Task 2 Step 1 in `src/ui/nav.ts` definiert und in Task 2 Step 2 an drei Stellen so importiert.
- `createNav(view, onModeChange)` (Task 2 Step 1) wird von `mountNav` (Step 3) mit genau dieser Signatur aufgerufen, und `mountNav` von beiden Seitenmodulen (Steps 4, 5).
- `Basis` (Step 3) liefert `handle`, `meta`, `cantonsGeo`, `cantonBorderLayer`, `kantone`, `cantonGeometries`, `nationalBounds`; `karte/firmen.ts` verwendet `handle`, `kantone`, `cantonsGeo`, `cantonBorderLayer`, `karte/beschaeftigte.ts` alle sieben.
- Die beiden Varianten von `ViewLayersInput` (Task 1 Step 3) werden in Task 2 Steps 4 und 5 mit exakt den dort deklarierten Feldern gebaut.
- `NoticeLevel` bleibt der Typ für `level`; `karte/beschaeftigte.ts` importiert ihn aus `../ui/notices`, wie `main.ts` es tat.

**Bewusste kleine Verhaltensänderungen**, die beim Durchklicken nicht als Fehler missverstanden werden dürfen:

1. Die zuletzt gewählte Höhenskala überlebt einen Ansichtswechsel nicht mehr — jede Seite startet in ihrem Default. Folgt zwingend daraus, dass der Wechsel jetzt ein Seitenaufbau ist.
2. Der Kantons-Seitentitel heisst «Beschäftigte Kanton X» statt «Wirtschaftskarte Kanton X» (Spec, Abschnitt 5).
3. Ein fehlendes `#map` meldet sich jetzt als «Daten konnten nicht geladen werden: Error: Kartencontainer #map fehlt im HTML.» statt ohne Präfix. Betrifft einen Fall, den nur ein Fehler in unserem eigenen HTML auslösen könnte.
