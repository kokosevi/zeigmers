import type { ViewName } from './toggle'

const TEXTS: Record<ViewName, string> = {
  sichtbare:
    'Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort.',
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
