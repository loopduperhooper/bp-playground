import { describe, expect, it } from 'vitest'

import { ClosenessAdaptivePattern, defaultClosenessProfile } from '../../src/algorithms/implementations/ClosenessAdaptivePattern'
import type { AlgorithmInput, Closeness } from '../../src/engine/types'

function input(overrides: Partial<AlgorithmInput> = {}): AlgorithmInput {
  return { elapsedMs: 0, deltaMs: 50, closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0.5, ...overrides }
}

describe('defaultClosenessProfile', () => {
  it('increases amplitude and intensity multiplier as closeness rises from 1 to 4', () => {
    const low = defaultClosenessProfile(1)
    const high = defaultClosenessProfile(4)

    expect(high.amplitude).toBeGreaterThan(low.amplitude)
    expect(high.intensityMultiplier).toBeGreaterThan(low.intensityMultiplier)
  })
})

describe('ClosenessAdaptivePattern', () => {
  it('reduces to a pure sine wave when the RNG always returns the midpoint (zero net noise)', () => {
    const pattern = new ClosenessAdaptivePattern({ frequencyHz: 0.25, baseline: 0.5 })
    const profile = defaultClosenessProfile(1)
    const periodMs = 1000 / 0.25

    const position = pattern.update(input({ elapsedMs: periodMs / 4, closeness: 1, random: () => 0.5 })).command.position

    expect(position).toBeCloseTo(0.5 + profile.amplitude)
  })

  it('scales intensity using the closeness profile, not the base intensity scale', () => {
    const pattern = new ClosenessAdaptivePattern()

    const output = pattern.update(input({ closeness: 4, manualIntensityScale: 0.5 }))

    expect(output.command.intensity).toBeCloseTo(defaultClosenessProfile(4).intensityMultiplier * 0.5)
  })

  it('accepts a custom closeness profile', () => {
    const customProfile = (closeness: Closeness) => ({ amplitude: 0, intensityMultiplier: closeness / 5, variation: 0 })
    const pattern = new ClosenessAdaptivePattern({ profile: customProfile, baseline: 0.5 })

    const output = pattern.update(input({ closeness: 5, random: () => 0.5 }))

    expect(output.command.position).toBeCloseTo(0.5)
    expect(output.command.intensity).toBeCloseTo(1)
  })

  it('resets its accumulated noise', () => {
    const pattern = new ClosenessAdaptivePattern({ baseline: 0.5, frequencyHz: 0 })
    pattern.update(input({ closeness: 5, random: () => 1 }))
    pattern.update(input({ closeness: 5, random: () => 1 }))

    pattern.reset()

    const position = pattern.update(input({ closeness: 5, random: () => 0.5 })).command.position
    expect(position).toBeCloseTo(0.5)
  })
})
