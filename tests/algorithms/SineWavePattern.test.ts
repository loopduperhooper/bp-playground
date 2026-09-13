import { describe, expect, it } from 'vitest'

import { SineWavePattern } from '../../src/algorithms/implementations/SineWavePattern'
import type { AlgorithmInput } from '../../src/engine/types'

function input(overrides: Partial<AlgorithmInput> = {}): AlgorithmInput {
  return { elapsedMs: 0, deltaMs: 50, closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0.5, ...overrides }
}

describe('SineWavePattern', () => {
  it('starts at the baseline when elapsed time is zero', () => {
    const pattern = new SineWavePattern({ frequencyHz: 0.25, amplitude: 0.4, baseline: 0.5 })

    expect(pattern.update(input({ elapsedMs: 0 })).command.position).toBeCloseTo(0.5)
  })

  it('reaches its peak a quarter period in and its trough three-quarters in', () => {
    const pattern = new SineWavePattern({ frequencyHz: 0.25, amplitude: 0.4, baseline: 0.5 })
    const periodMs = 1000 / 0.25

    expect(pattern.update(input({ elapsedMs: periodMs / 4 })).command.position).toBeCloseTo(0.9)
    expect(pattern.update(input({ elapsedMs: (3 * periodMs) / 4 })).command.position).toBeCloseTo(0.1)
  })

  it('clamps position to 0..1 even if baseline plus amplitude would exceed it', () => {
    const pattern = new SineWavePattern({ frequencyHz: 0.25, amplitude: 0.9, baseline: 0.8 })
    const periodMs = 1000 / 0.25

    expect(pattern.update(input({ elapsedMs: periodMs / 4 })).command.position).toBe(1)
  })

  it('scales intensity by the manual intensity scale', () => {
    const pattern = new SineWavePattern({ intensityScale: 0.6 })

    expect(pattern.update(input({ manualIntensityScale: 0.5 })).command.intensity).toBeCloseTo(0.3)
  })

  it('is deterministic for the same input', () => {
    const pattern = new SineWavePattern()
    const a = pattern.update(input({ elapsedMs: 1234 }))
    const b = pattern.update(input({ elapsedMs: 1234 }))

    expect(a.command).toEqual(b.command)
  })
})
