import { presentGroupsFromIndices } from '../domain/legendGroups'
import { METRICS, metricValue } from '../domain/metric'
import { NOGA_GROUPS, NOGA_UNKNOWN_INDEX } from '../domain/noga.generated'
import type { ScaleMode } from '../domain/scale'
import { applySelection, type Selection } from '../domain/selection'
import { buildViewLayers } from '../layers/viewLayers'
import { loadCompanies, type Company } from '../layers/visible'
import { hideHoverLabel } from '../ui/hoverLabel'
import { renderKennzahlen } from '../ui/kennzahlen'
import { renderLegend } from '../ui/legend'
import { DEFAULT_MODE, type NavOptions } from '../ui/nav'
import { renderNotices, type Coverage, type TopReference } from '../ui/notices'
import { hidePanel, showCompanyPanel, type CompanyContext } from '../ui/panel'
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

  // Abdeckungsangabe der Karte selbst — bis zum Kahlschlag vom 2026-08-17
  // stand sie in der Legenden-Titelzeile, seither in der Eckbox (Auftraggeber-
  // Korrektur, selbes Datum, siehe `ui/notices.ts`, `Coverage`): ohne sie
  // liesse sich aus der Karte selbst nicht ablesen, dass ein Teil der
  // kotierten Titel gar nicht erscheint (23 von 224 ohne eindeutigen
  // Zefix-Sitz). Unverändert direkt aus `companies.stats` übernommen, keine
  // eigene Berechnung nötig — `coverageNote()` in `ui/notices.ts` formt den
  // Satz daraus, inklusive SIX-Abrufstand.
  const coverage: Coverage = {
    count: companies.stats.count,
    totalListed: companies.stats.totalListed,
    researched: companies.stats.researched,
    sixRetrievedDate: companies.stats.sixRetrievedDate,
  }

  // Beschäftigte der Schweiz insgesamt — der Vergleich, für den es die
  // Kennzahl «Mitarbeitende» gibt (siehe `ui/kennzahlen.ts`). Aus den 26
  // Kantonswerten von `ch_kantone` summiert, das `createBasis()` ohnehin für
  // die Schweiz-Rahmung lädt (siehe dort) — kein zweiter Ladeschritt, keine
  // hartkodierte Zahl. Erwartete Grössenordnung 5'876'865 (STATENT-Stand des
  // geladenen Artefakts).
  let nationalEmployees = 0
  for (const value of basis.kantone.arrays.values) nationalEmployees += value

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

    renderKennzahlen({
      result,
      metric: selection.metric,
      totalCompanies: companies.stats.count,
      nationalEmployees,
    })

    // Re-Review Fund 2 (2026-08-15): `renderNotices` liest `metricInChf` nur
    // in dieser Ansicht — ob die Balkenhöhe die «in CHF umgerechnet»-Aussage
    // tragen darf, entscheidet `companies.json`s `stats.revenueInChf`/
    // `stats.profitInChf` zur Laufzeit, nicht ein hartkodierter Satz (siehe
    // `ui/notices.ts`, `CURRENCY_NOTE_CHF`/`CURRENCY_NOTE_FALLBACK`).
    //
    // Fix-Runde (2026-08-16, Abschluss-Review C1/I6): `renderNotices` bekommt
    // jetzt zusätzlich die aktive Kennzahl, damit Hinweistext und
    // Währungszeile ihr folgen (bis dahin stand über einer Mitarbeitenden-
    // oder Gewinn-Karte weiterhin ein Umsatz-Satz). Welches der beiden
    // Vollständigkeits-Flags gilt, hängt an derselben Kennzahl: Umsatz und
    // Gewinn haben je eine eigene Alles-oder-nichts-Umrechnungsregel
    // (`companies.py`, `build_artifact`) — `stats.profitInChf` existiert im
    // Artefakt schon länger, wurde aber bis zu diesem Fix von keinem
    // Produktivpfad gelesen (Finding I6).
    const metricInChf =
      selection.metric === 'gewinn' ? companies.stats.profitInChf : companies.stats.revenueInChf

    // Auftrag (2026-08-17): die Bezugszeile «Höchste Säule» ist aus der
    // Legende in die Eckbox umgezogen (siehe `ui/notices.ts`, `TopReference`)
    // — dieselbe Herleitung, die vorher in `ui/legend.ts` stand:
    // `result.top` ist `null` bei leerer Auswahl, `metricValue` liest den
    // echten, vorzeichenbehafteten Wert (bei Gewinn ggf. ein Verlust),
    // `result.vmax` bleibt der reine Typsicherheits-Fallback (kann laut
    // `applySelection` nicht eintreten, `result.top` wird nur bei einem
    // echten Wert gesetzt).
    const topReference: TopReference | null = result.top
      ? { name: result.top.name, value: metricValue(result.top, selection.metric) ?? result.vmax }
      : null
    renderNotices('sichtbare', 'schweiz', selection.metric, metricInChf, topReference, coverage)
  }

  const navOptions: NavOptions = {
    view: 'sichtbare',
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
    orgForms: {
      available: companies.stats.orgForms,
      onChange: (orgForms) => {
        selection = { ...selection, orgForms }
        render()
      },
    },
  }
  mountNav(navOptions)
}
