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

  // Die Abdeckungsangabe der Karte selbst — zwei Zahlen, nicht nur eine.
  // "201 recherchiert" allein wäre unvollständig: wer die Marker zählt, sieht
  // `stats.count` (platziert, inkl. der unrecherchierten Marker), nicht 224 —
  // ein SIX-Titel ohne eindeutigen Zefix-Sitz erscheint gar nicht auf der
  // Karte (siehe `companies.build_artifact`). Beide Zahlen stehen deshalb
  // nebeneinander. Aus den Artefaktdaten zur Laufzeit berechnet, nicht
  // hartkodiert — ein künftiger Sync-/Recherche-Lauf zieht beide Zahlen
  // automatisch nach.
  //
  // Abschluss-Review, Fund 4 (2026-08-15): `stats.count`/`stats.researched`
  // zählen Gesellschaften (Namen-/PS-Aktien und zweite Handelslinien
  // derselben Firma zusammengefasst, `companies.group_six_titles()`),
  // `stats.totalListed` zählt kotierte Titel — zwei verschiedene Grössen mit
  // demselben Nenner 224 in einen Satz zu setzen ("… von 224 kotierten
  // Titeln") hätte 201 Gesellschaften als Titel ausgegeben. Der Satz nennt
  // deshalb beide Einheiten.
  const coverageLabel =
    `${companies.stats.count} Gesellschaften von ${companies.stats.totalListed} ` +
    `kotierten SIX-Titeln auf der Karte gezeigt, davon ${companies.stats.researched} ` +
    'recherchiert' +
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
        lakes: basis.lakesGeo,
        companies,
        onShowCompanyPanel: showCompanyPanel,
      }),
    )

    renderLegend({ view: 'sichtbare', year, presentGroups, scopeLabel: coverageLabel })
    // Re-Review Fund 2 (2026-08-15): `renderNotices` liest `revenueInChf` nur
    // in dieser Ansicht — ob die Balkenhöhe die «in CHF umgerechnet»-Aussage
    // tragen darf, entscheidet `companies.json`s `stats.revenueInChf` zur
    // Laufzeit, nicht ein hartkodierter Satz (siehe `ui/notices.ts`,
    // `CURRENCY_NOTE_CHF`/`CURRENCY_NOTE_FALLBACK`).
    renderNotices('sichtbare', 'schweiz', companies.stats.revenueInChf)
  }

  // Task 12 ändert nur `createNav`/`mountNav` selbst auf ein Optionsobjekt;
  // das Verdrahten von `metrics`/`orgForms` mit echtem Zustand ist eigene
  // Folgearbeit (Task 13/14) — hier deshalb nur der Aufruf an die neue
  // Signatur angepasst, ohne neue Optionen zu übergeben.
  mountNav({ view: 'sichtbare', onModeChange: render })
}
