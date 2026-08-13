// defineConfig stammt aus vitest/config, nicht aus vite — sonst lehnt TypeScript
// den `test`-Block als unbekannte Eigenschaft ab und `npm run build` bricht ab.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { environment: 'node' },
})
