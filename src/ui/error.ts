/** Sichtbarer Fehler statt einer stumm leeren Karte. */
export function showError(message: string): void {
  let box = document.getElementById('fehler')
  if (!box) {
    box = document.createElement('div')
    box.id = 'fehler'
    document.getElementById('ui')?.appendChild(box)
  }
  box.textContent = message
  box.hidden = false
}
