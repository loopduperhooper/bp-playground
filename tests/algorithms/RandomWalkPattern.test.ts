import { describe, expect, it } from 'vitest'

import { RandomWalkPattern } from '../../src/algorithms/implementations/RandomWalkPattern'
import type { AlgorithmInput } from '../../src/engine/types'

function input(random: () => number, manualIntensityScale = 1): AlgorithmInput {
  return { elapsedMs: 0, deltaMs: 50, closeness: 3, manualIntensityScale, isRunning: true, random }
}

describe('RandomWalkPattern', () => {
  it('stays at the target when the RNG always returns the midpoint', () => {
    const pattern = new RandomWalkPattern({ target: 0.5 })

    for (let i = 0; i < 10; i++) {
      expect(pattern.update(input(() => 0.5)).command.position).toBeCloseTo(0.5)
    }
  })

  it('drifts toward the maximum when the RNG always returns the top of its range', () => {
    const pattern = new RandomWalkPattern({ target: 0.5, minimum: 0.1, maximum: 0.9, smoothing: 0.5 })

    let last = 0.5
    for (let i = 0; i < 50; i++) {
      const position = pattern.update(input(() => 1)).command.position
      expect(position).toBeGreaterThanOrEqual(last)
      last = position
    }
    expect(last).toBeCloseTo(0.9, 1)
  })

  it('never exceeds its hard bounds even under sustained extreme randomness', () => {
    const pattern = new RandomWalkPattern({ target: 0.5, minimum: 0.2, maximum: 0.8, stepSize: 0.5, smoothing: 1 })

    for (let i = 0; i < 100; i++) {
      const random = i % 2 === 0 ? 1 : 0
      const position = pattern.update(input(() => random)).command.position
      expect(position).toBeGreaterThanOrEqual(0.2)
      expect(position).toBeLessThanOrEqual(0.8)
    }
  })

  it('resets back to the target position', () => {
    const pattern = new RandomWalkPattern({ target: 0.5 })
    pattern.update(input(() => 1))
    pattern.update(input(() => 1))

    pattern.reset()

    expect(pattern.update(input(() => 0.5)).command.position).toBeCloseTo(0.5)
  })

  it('scales intensity by the manual intensity scale', () => {
    const pattern = new RandomWalkPattern({ intensityScale: 0.6 })

    expect(pattern.update(input(() => 0.5, 0.5)).command.intensity).toBeCloseTo(0.3)
  })
})
