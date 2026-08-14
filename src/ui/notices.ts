import type { ViewName } from './toggle'

/** Pflichthinweis je Ansicht — muss ohne Interaktion sichtbar bleiben (siehe
 *  `style.css`, `#hinweis`); das ist eine Spezifikationsvorgabe, kein
 *  Stilentscheid. Redesign (2026-08-14, Change 1): der Text ist gestrafft,
 *  damit er in eine kleine, ruhige Eckbox passt statt in ein dominantes
 *  Banner — vier inhaltliche Aussagen bleiben in Ansicht B dabei unverändert
 *  erhalten: die «< 4 → 4»-Rundung, die Median-/Maximum-Überschätzung, der
 *  Verweis aufs Klick-Panel für den exakten Betrag je Gemeinde, und der
 *  Flächenverzerrungs-Hinweis (Höhe vs. Grundfläche). Vorheriger, längerer
 *  Wortlaut: siehe Git-Historie bzw. Redesign-Report (`.superpowers/
 *  redesign-report.md`), Abschnitt „Pflichthinweis vorher/nachher". */
const HAUPT: Record<ViewName, string> = {
  // Wörtlich aus den Global Constraints des Umsetzungsplans — nicht
  // umformulieren. Der frühere zweite Satz zur Währungsvermischung ist
  // entfallen: dieselbe Aussage steht jetzt, wortgleich mit der Legende
  // zuvor, in `CURRENCY_NOTE` direkt darunter — zwei Sätze für dieselbe
  // Tatsache in derselben Box wären in einer bewusst ruhigen Ecke Redundanz,
  // keine zusätzliche Information.
  sichtbare:
    'Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort.',
  beschaeftigte:
    'BFS rundet Werte unter 4 auf 4 auf — Gemeindesummen sind Obergrenzen ' +
    '(Median +16 %, einzelne Gemeinden bis +54 %). Genauer Betrag je Gemeinde: ' +
    'Klick-Panel. Höhe = Beschäftigte, Grundfläche = Gemeindefläche — grosse ' +
    'Gemeinden wirken dadurch gewichtiger, als sie sind.',
}

// Verschoben aus `ui/legend.ts` (Redesign Change 2/3, siehe `ui/legend.ts`
// für die Begründung): „die Legende trägt, was man zum Lesen braucht, die
// Eckbox, was man zum Vertrauen braucht" — Quellen- und Währungsangabe
// gehören zu Letzterem. Wörtlicher Inhalt unverändert, nur der Ort.
const CURRENCY_NOTE =
  'Umsätze in der jeweiligen Konzernwährung (CHF, EUR, USD), nicht umgerechnet.'

// Lizenzpflichtig (STATENT: „Freie Nutzung, Quellenangabe Pflicht"; swisstopo-
// Geodaten: Nutzungsbedingungen für kostenlose Geodaten, siehe README) —
// wörtlich und permanent sichtbar, unabhängig von jeder Nutzerinteraktion.
// Wird verschoben, nicht gekürzt.
const FOOTER =
  'Quelle: Bundesamt für Statistik (BFS), Statistik der Unternehmensstruktur (STATENT) 2023 · ' +
  'Gemeindegrenzen: swisstopo, swissBOUNDARIES3D · Basiskarte: swisstopo'

// Zweite Quellenzeile, nur in Ansicht A: die Fixzeile oben nennt STATENT und
// swisstopo, aber jede Zahl in Ansicht A stammt aus keiner dieser Quellen,
// sondern aus den Geschäftsberichten der acht Unternehmen selbst (siehe
// `report_url` je Firma im Panel). Ohne diese Zeile schriebe die Box
// Ansicht-A-Zahlen implizit dem BFS zu (Abschluss-Review, Finding I7).
const FOOTER_COMPANIES =
  'Ansicht A: Umsatz, Mitarbeitende und Geschäftsjahr aus den Geschäftsberichten der ' +
  'acht Unternehmen selbst (Quelle je Firma im Panel, «Geschäftsbericht öffnen»).'

function paragraph(text: string, className: string): HTMLParagraphElement {
  const p = document.createElement('p')
  p.className = className
  p.textContent = text
  return p
}

/** Baut die Eckbox aus mehreren Absätzen statt eines einzelnen `textContent`
 *  (bis 2026-08-13 genügte ein String, weil hier nur der Pflichthinweis
 *  stand) — seit Change 2/3 trägt dieselbe Box zusätzlich die aus der
 *  Legende verschobene Quellen- und Währungszeile, mit eigener, leiserer
 *  Textstufe (`.hinweis-quelle` in style.css). */
export function renderNotices(view: ViewName): void {
  let box = document.getElementById('hinweis')
  if (!box) {
    box = document.createElement('div')
    box.id = 'hinweis'
    document.getElementById('ui')?.appendChild(box)
  }
  box.replaceChildren()
  box.appendChild(paragraph(HAUPT[view], 'hinweis-haupt'))
  if (view === 'sichtbare') box.appendChild(paragraph(CURRENCY_NOTE, 'hinweis-haupt'))
  box.appendChild(paragraph(FOOTER, 'hinweis-quelle'))
  if (view === 'sichtbare') box.appendChild(paragraph(FOOTER_COMPANIES, 'hinweis-quelle'))
}
