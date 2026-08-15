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
