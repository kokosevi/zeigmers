import { describe, expect, it } from 'vitest'
import { litTopFaceColor, TOP_FACE_LIGHT_FACTOR } from './litColor'

describe('TOP_FACE_LIGHT_FACTOR', () => {
  it('stays close to 1 so top faces read near their true hue (Finding 2b)', () => {
    // Der ganze Punkt der Retarierung: Deckflächen sollen weder stark
    // aufgehellt (das "kindliche" Pastell vor der Korrektur) noch verdunkelt
    // wirken — der Gesamtfaktor aus Ambient- + Diffusanteil soll nah bei 1
    // liegen, nicht deutlich darüber (führte vorher zum Clipping heller
    // Farben) oder deutlich darunter.
    expect(TOP_FACE_LIGHT_FACTOR).toBeGreaterThan(0.85)
    expect(TOP_FACE_LIGHT_FACTOR).toBeLessThan(1.05)
  })
})

describe('litTopFaceColor', () => {
  it('scales every channel by the same factor (weisses Licht, keine Farbverschiebung)', () => {
    const rgb: [number, number, number] = [100, 150, 200]
    const lit = litTopFaceColor(rgb)
    for (let i = 0; i < 3; i++) {
      expect(lit[i]).toBeCloseTo(rgb[i]! * TOP_FACE_LIGHT_FACTOR, 0)
    }
  })

  it('never exceeds the 0..255 byte range even for a channel already at 255', () => {
    const lit = litTopFaceColor([255, 255, 255])
    for (const channel of lit) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
  })

  it('maps black to black (no additive term without light)', () => {
    expect(litTopFaceColor([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('keeps a bright branch colour close to its original hue instead of washing it out', () => {
    // IKT-Gelb (240, 228, 66) war unter der alten Beleuchtung (Faktor ~1.36)
    // fast vollständig ins Weiss geclippt — Regressionstest gegen genau
    // dieses "kindliche Pastell"-Symptom aus dem Auftrag.
    const ikt: [number, number, number] = [240, 228, 66]
    const lit = litTopFaceColor(ikt)
    expect(lit[0]).toBeLessThanOrEqual(255)
    expect(lit[1]).toBeLessThanOrEqual(255)
    // Der gelbe Kanal (dominant, am weitesten von 255 entfernt) bleibt klar
    // erkennbar gelb statt ins Weiss zu clippen.
    expect(lit[2]).toBeLessThan(150)
    expect(lit[0] - lit[2]).toBeGreaterThan(100)
  })
})
