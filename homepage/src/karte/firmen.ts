import { presentGroupsFromIndices } from '../domain/legendGroups'
import { METRICS, metricValue } from '../domain/metric'
import { NOGA_GROUPS, NOGA_UNKNOWN_INDEX } from '../domain/noga.generated'
import type { ScaleMode } from '../domain/scale'
import { applySelection, type Selection } from '../domain/selection'
import { buildViewLayers } from '../layers/viewLayers'
import {
  companyElevations,
  loadCompanies,
  MAX_BAR_HEIGHT_M,
  MIN_REAL_BAR_M,
  type Company,
} from '../layers/visible'
import { hideHoverLabel } from '../ui/hoverLabel'
import { renderLegend } from '../ui/legend'
import { DEFAULT_MODE, type NavOptions } from '../ui/nav'
import { hidePanel, showCompanyPanel, type CompanyContext } from '../ui/panel'
import { renderSuche } from '../ui/suche'
import { renderZoom } from '../ui/zoom'
import { createBasis, mountNav } from './basis'

/** Ansicht «Börsennotierte Firmen» — seit Phase 3 national: eine Stufe, kein
 *  Kanton zum Betreten, keine Zurück-Kontrolle, kein Escape. Der gesamte
 *  Navigationsapparat der Beschäftigten-Seite (`karte/beschaeftigte.ts`)
 *  existiert hier deshalb nicht, statt als unerreichbarer Zweig
 *  mitgeschleppt zu werden. */
export async function startFirmen(): Promise<void> {
  // `loadCompanies()` hängt fachlich von nichts ab, was `createBasis()`
  // liefert — erst unten (`year`) werden beide Ergebnisse kombiniert. Beide
  // deshalb parallel statt nacheinander, sonst wartet der grösste Fetch der
  // Seite (companies.json, 320 KB) unnötig auf `createBasis()`s eigenes
  // `Promise.all` (meta, ch_kantone, Kantonsgrenzen).
  const [basis, companies] = await Promise.all([createBasis(), loadCompanies()])

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

  // Rang und Anteil am Gesamtumsatz im Klick-Panel gelten immer über ALLE
  // recherchierten Gesellschaften mit Wert in der aktiven Kennzahl, nie über
  // die (Branchen-/Organisationsform-)gefilterte Auswahl — ein Rang, der sich
  // beim Filtern verschöbe, wäre keine Eigenschaft der Firma mehr (siehe
  // `ui/panel.ts`, `CompanyContext`). Diese beiden Mengen sind deshalb bewusst
  // von `selection` unten unabhängig: `ALL_BRANCHES` enthält jeden möglichen
  // Branchenindex (nicht nur die auf der Karte tatsächlich vorkommenden,
  // anders als `presentGroups.indices`), `ALL_ORG_FORMS` jede im Datensatz
  // vorkommende Rechtsform.
  const ALL_BRANCHES = new Set([...NOGA_GROUPS.map((_, index) => index), NOGA_UNKNOWN_INDEX])
  const ALL_ORG_FORMS = new Set(companies.stats.orgForms)

  // Summe der `revenueChf`-Werte über alle recherchierten Gesellschaften mit
  // umgerechnetem Umsatz — der Nenner für "Anteil am Gesamtumsatz" im Panel
  // (`CompanyContext.revenueTotal`). Unabhängig von der aktiven Kennzahl und
  // vom Filter, deshalb einmalig berechnet statt bei jedem `render()`.
  const revenueTotal = companies.companies.reduce(
    (sum, c) => (c.researched && c.revenueChf !== null ? sum + c.revenueChf : sum),
    0,
  )

  document.title = 'zeigmers — Börsennotierte Firmen Schweiz'

  // Der Zustand der Seite, in drei Dimensionen (siehe `domain/selection.ts`,
  // `Selection`) plus der Höhenskala daneben (`mode`, von der Steuerung selbst
  // gehalten, siehe `ui/nav.ts`) — Startwerte: Kennzahl Umsatz, alle auf der
  // Karte tatsächlich vorkommenden Branchen (`presentGroups.indices`, dieselbe
  // Konvention wie die Legende selbst, siehe `ui/legend.ts`), alle Rechtsformen.
  let selection: Selection = {
    metric: 'umsatz',
    branches: new Set(presentGroups.indices),
    orgForms: new Set(companies.stats.orgForms),
  }
  let mode: ScaleMode = DEFAULT_MODE.sichtbare

  // Ein Pfad, kein zweiter Ort zum Filtern (Auftrag der Vorgängeraufgabe,
  // siehe `domain/selection.ts`): jede Änderung an `selection`/`mode` ruft
  // ausschliesslich `render()`, das aus `applySelection` Layer, Legende,
  // Kennzahlenzeile und Panel-Kontext neu baut.
  const render = () => {
    hidePanel()
    hideHoverLabel()

    const result = applySelection(companies.companies, selection)

    // Ranking für den Panel-Kontext (siehe Kommentar bei `ALL_BRANCHES` oben)
    // — dieselbe Kennzahl wie die aktive Auswahl, aber ungefiltert. Absteigend
    // sortiert: Rang 1 ist der höchste Wert (Umsatz/Mitarbeitende/Gewinn), ein
    // Verlust landet folgerichtig am unteren Ende, nicht an der Spitze einer
    // Betrags-Rangliste.
    const ranking = applySelection(companies.companies, {
      metric: selection.metric,
      branches: ALL_BRANCHES,
      orgForms: ALL_ORG_FORMS,
    })
    const ranked = [...ranking.withValue].sort(
      (a, b) => (metricValue(b, selection.metric) ?? 0) - (metricValue(a, selection.metric) ?? 0),
    )
    const rankOf = new Map<Company, number>(ranked.map((c, index) => [c, index + 1]))

    // Der `CompanyContext` hängt vom angeklickten Unternehmen ab (`rank`),
    // deshalb erst hier, in der Closure des Klick-Handlers, vollständig
    // gebaut — `rankOf`/`ranked.length`/`revenueTotal`/die aktive Kennzahl
    // sind zum Zeitpunkt des Klicks bereits eingefroren (dieser `render()`-
    // Durchlauf), nicht neu berechnet.
    const onShowCompanyPanel = (company: Company) => {
      const context: CompanyContext = {
        metric: selection.metric,
        rank: rankOf.get(company) ?? null,
        rankTotal: ranked.length,
        revenueTotal,
      }
      showCompanyPanel(company, context)
    }

    basis.handle.setLayers(
      buildViewLayers({
        view: 'sichtbare',
        mode,
        cantonsGeo: basis.cantonsGeo,
        // National: kein einzelner Kanton hervorzuheben (bis Phase 2 war das
        // immer Aargau, unabhängig davon, wo die Firmen tatsächlich lagen).
        activeBfsNr: null,
        cantonBorderLayer: basis.cantonBorderLayer,
        lakes: basis.lakesGeo,
        companies,
        result,
        metric: selection.metric,
        onShowCompanyPanel,
      }),
    )

    renderLegend({
      view: 'sichtbare',
      year,
      presentGroups,
      metric: selection.metric,
      result,
      selectedBranches: selection.branches,
      onToggleBranch: (index) => {
        const branches = new Set(selection.branches)
        if (branches.has(index)) branches.delete(index)
        else branches.add(index)
        selection = { ...selection, branches }
        render()
      },
      onAllBranches: () => {
        selection = { ...selection, branches: new Set(presentGroups.indices) }
        render()
      },
    })

    // Suche: navigiert zu einer Firma und öffnet ihr Panel. Sie steht in
    // `render()`, weil ein Treffer denselben Panel-Kontext braucht wie ein
    // Klick auf die Säule (`onShowCompanyPanel` oben, mit dem Rang dieser
    // Kennzahl) — und weil `abschnitt('suche')` die Leiste bei jedem Durchlauf
    // neu befüllt. Durchsucht werden alle recherchierten Gesellschaften, nicht
    // nur die gefilterte Auswahl: wer einen Namen tippt, sucht die Firma, nicht
    // den Filterzustand.
    renderSuche<Company>({
      platzhalter: 'Firma suchen',
      kuerzel: '⌘K',
      eintraege: companies.companies
        .filter((c) => c.researched)
        .map((c) => ({ id: c.uid ?? c.name, name: c.name, wert: c })),
      onPick: (company) => {
        basis.handle.flyTo([company.lon, company.lat], 11)
        onShowCompanyPanel(company)
      },
    })

    // Kein Leistenfuss auf dieser Seite (Auftrag vom 17. August 2026: alles
    // ab der Summe «762.14 Mrd. CHF» abwärts entfernen). Damit sind
    // `renderKennzahlen` UND `renderNotices` hier entfallen — die Summe der
    // Auswahl ebenso wie die Vorbehalte (Währungszeile, Abdeckung, «kein
    // amtliches Statistikprodukt», Mindesthöhen- und Randmarkierungs-Sätze).
    // Das ist bewusst benannt, nicht stillschweigend: diese Seite trägt ihre
    // Vorbehalte damit nirgends mehr; auf `/beschaeftigte/` stehen ihre
    // Pendants weiterhin im Fuss. Beide Module und ihre Tests bleiben
    // bestehen; der leere Fuss-Abschnitt verschwindet per CSS
    // (`#leiste-fuss:empty`, `style.css`).
  }

  // Die Zahl für die Zeile unter dem Höhen-Umschalter: wie viele Säulen bei
  // LINEARER Skala auf der Mindesthöhe sitzen würden. Sie steht in der
  // Oberfläche (`ui/nav.ts`, `HeightNote`) und muss deshalb gemessen sein,
  // nicht geschätzt — gerechnet mit denselben Funktionen, die die Karte
  // zeichnet (`companyElevations`, `MIN_REAL_BAR_M`, `MAX_BAR_HEIGHT_M` aus
  // `layers/visible.ts`, nur gelesen), über die ungefilterte Menge aller
  // recherchierten Gesellschaften mit Umsatzwert. Beim Start ist die Kennzahl
  // «Umsatz»; die Zeile begründet den Startwert der Skala und wandert deshalb
  // nicht mit einem späteren Kennzahlwechsel mit.
  const heightNote = (() => {
    const alle = applySelection(companies.companies, {
      metric: 'umsatz',
      branches: ALL_BRANCHES,
      orgForms: ALL_ORG_FORMS,
    })
    if (alle.withValue.length === 0) return undefined
    const hoehen = companyElevations(
      alle.withValue,
      'umsatz',
      alle.vmax,
      MAX_BAR_HEIGHT_M,
      'linear',
    )
    let flach = 0
    for (const h of hoehen) if (Math.abs(h) <= MIN_REAL_BAR_M) flach++
    return { flach, total: alle.withValue.length }
  })()

  const navOptions: NavOptions = {
    view: 'sichtbare',
    heightNote,
    onModeChange: (newMode) => {
      mode = newMode
      render()
    },
    metrics: {
      available: METRICS,
      onChange: (metric) => {
        selection = { ...selection, metric }
        render()
      },
    },
    // Die Organisationsform-Gruppe ist mit dem Redesign entfallen (siehe
    // `ui/nav.ts`): ein einziger Wert, der nichts filtert. Der Filterpfad
    // bleibt bestehen — `selection.orgForms` trägt weiterhin alle im Datensatz
    // vorkommenden Formen (siehe Startwert oben), damit `applySelection`
    // unverändert eine Dimension mehr hat, sobald Genossenschaften oder nicht
    // kotierte Firmen dazukommen. Nur die Schaltflächen fehlen bis dahin.
  }
  mountNav(navOptions)

  // Zoom-Gruppe und Suche stehen aussen an der Leiste bzw. daneben und hängen
  // an keinem Zustand der Auswahl — beide werden deshalb einmal verdrahtet,
  // nicht bei jedem `render()`. Die Suche NAVIGIERT (Kamera + Panel), sie
  // filtert nicht: der Filter bleibt allein Sache der Branchenzeilen, ein
  // Pfad (siehe `domain/selection.ts`).
  renderZoom({
    onZoomIn: () => basis.handle.zoomIn(),
    onZoomOut: () => basis.handle.zoomOut(),
    onResetNorth: () => basis.handle.resetNorth(),
  })
}
