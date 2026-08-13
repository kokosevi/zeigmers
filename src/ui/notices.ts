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
  viele:
    'Das BFS rundet aus Datenschutzgründen alle Werte unter 4 auf 4 auf. ' +
    'Hektaren mit dem Wert 4 sind gesondert markiert — ihr wahrer Wert liegt ' +
    'zwischen 1 und 4. Summen sind dadurch Obergrenzen.',
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
