import type { ViewName } from './toggle'

const TEXTS: Record<ViewName, string> = {
  // Erster Satz wörtlich aus den Global Constraints — nicht umformulieren.
  // Zweiter Satz ergänzt (Abschluss-Review, Finding I3): drei Währungen auf
  // einer Höhenachse ohne Umrechnung müssen offengelegt werden, sonst
  // vergleicht der Betrachter Balkenhöhen, die verschiedene Einheiten messen.
  sichtbare:
    'Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort. ' +
    'Die Balkenhöhen vergleichen zudem unterschiedliche Konzernwährungen (CHF, EUR, USD) ' +
    'unverändert, ohne Umrechnung in eine gemeinsame Einheit.',
  // Neu gefasst am 2026-08-13, als die Hektarstufe entfiel (siehe README):
  // der alte Wortlaut verwies auf eine "gesonderte Markierung" von Hektaren
  // mit Wert 4 — die es, ohne gezeichnete Hektarzellen, nicht mehr gibt. Die
  // Aufrundung selbst bleibt und wirkt jetzt ausschliesslich auf die einzig
  // noch gezeigte Zahl, die Gemeindesumme; die Grössenordnung der Verzerrung
  // (Median ~16 %, bis 54 % bei kleinen Gemeinden) ist gemessen, nicht
  // geschätzt — siehe README, Abschnitte "Warum die Gemeindesumme über der
  // offiziellen Zahl liegt" und "Warum die Hektar- und die Kantonsstufe
  // entfernt wurden". Wortlaut exakt wie vorgegeben, nicht umformulieren.
  viele:
    'Das BFS rundet aus Datenschutzgründen alle Werte unter 4 auf 4 auf. ' +
    'Die Gemeindesummen sind dadurch Obergrenzen — im Median rund 16 %, bei ' +
    'kleinen Gemeinden bis 54 % zu hoch. Das Klick-Panel nennt den Betrag je ' +
    'Gemeinde.',
}

export function renderNotices(view: ViewName): void {
  let box = document.getElementById('hinweis')
  if (!box) {
    box = document.createElement('div')
    box.id = 'hinweis'
    document.getElementById('ui')?.appendChild(box)
  }
  box.textContent = TEXTS[view]
}
