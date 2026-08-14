// Eigenständiges Element statt ein dritter Kindknoten in `#steuerung`
// (`ui/toggle.ts`): dessen `sync()` iteriert bei jedem Ansichts-/Skalenwechsel
// über *alle* `<button>`-Nachfahren seines Wurzelelements und setzt dort
// `aria-checked`/`.aktiv` — ein „Zurück"-Knopf als Kind von `#steuerung` würde
// von dieser Schleife mitbehandelt, obwohl er kein Radio-Button ist (Auftrag:
// „make sure the two do not collide"). Eigenes Element, eigenes CSS
// (`style.css`, `#zurueck-gruppe`), unterhalb von `#steuerung` positioniert.
function box(): { group: HTMLElement; button: HTMLButtonElement } {
  let group = document.getElementById('zurueck-gruppe')
  if (!group) {
    group = document.createElement('div')
    group.id = 'zurueck-gruppe'
    const button = document.createElement('button')
    button.type = 'button'
    button.id = 'zurueck'
    button.textContent = '← Alle Kantone'
    group.appendChild(button)
    document.getElementById('ui')?.appendChild(group)
  }
  const button = group.querySelector('button')
  if (!button) throw new Error('zurueck-gruppe ohne button — DOM wurde extern verändert.')
  return { group, button }
}

/** Nur sichtbar auf der Kantonsstufe von Ansicht «Beschäftigte» (siehe
 *  `main.ts`) — dort ist es der einzige Weg zurück zur Schweiz-Übersicht neben
 *  Escape (`main.ts`, `keydown`-Listener). `onBack` wird bei jedem Aufruf neu
 *  zugewiesen (Property, nicht `addEventListener`): eine Neuzuweisung ersetzt
 *  den vorigen Handler, statt Listener über Renders hinweg anzuhäufen. */
export function renderBackControl(visible: boolean, onBack: () => void): void {
  const { group, button } = box()
  group.hidden = !visible
  button.onclick = onBack
}
