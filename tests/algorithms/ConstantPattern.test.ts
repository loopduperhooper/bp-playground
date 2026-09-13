import { describe, expect, it } from 'vitest'

import { ConstantPattern } from '../../src/algorithms/implementations/ConstantPattern'

describe('ConstantPattern', () => {
  it('returns a stable normalized command scaled by intensity', () => {
    const pattern = new ConstantPattern({ position: 0.4, speed: 0.8, intensity: 0.6 })
    const input = { elapsedMs: 0, deltaMs: 50, closeness: 3 as const, manualIntensityScale: 0.5, isRunning: true, random: () => 0.5 }

    expect(pattern.update(input).command).toEqual({
      position: 0.4,
      speed: 0.4,
      intensity: 0.3,
      reason: 'constant',
    })
  })
})
