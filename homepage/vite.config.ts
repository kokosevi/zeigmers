// defineConfig stammt aus vitest/config, nicht aus vite — sonst lehnt TypeScript
// den `test`-Block als unbekannte Eigenschaft ab und `npm run build` bricht ab.
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Drei echte HTML-Einstiege statt einer SPA mit Router: die Landing lädt
    // damit kein einziges Byte deck.gl/MapLibre (zusammen 1.52 MB), und jede
    // Karte bekommt eine eigene, teilbare URL. Vite spiegelt die
    // Verzeichnisstruktur nach `dist/`; Netlify serviert `/firmen/` von sich
    // aus aus `dist/firmen/index.html` — es braucht keine Redirect-Regel.
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        firmen: resolve(__dirname, 'firmen/index.html'),
        beschaeftigte: resolve(__dirname, 'beschaeftigte/index.html'),
      },
    },
  },
  test: { environment: 'node' },
})
