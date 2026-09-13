import { describe, expect, it } from 'vitest'

import { RampPattern } from '../../src/algorithms/implementations/RampPattern'
import type { AlgorithmInput } from '../../src/engine/types'

function input(elapsedMs: number, manualIntensityScale = 1): AlgorithmInput {
  return { elapsedMs, deltaMs: 50, closeness: 3, manualIntensityScale, isRunning: true, random: () => 0.5 }
}

describe('RampPattern', () => {
  const options = { rampDurationMs: 1000, holdDurationMs: 200, minimum: 0.1, maximum: 0.9 }

  it('starts at the minimum and ramps linearly toward the maximum', () => {
    const pattern = new RampPattern(options)

    expect(pattern.update(input(0)).command.position).toBeCloseTo(0.1)
    expect(pattern.update(input(500)).command.position).toBeCloseTo(0.5)
    expect(pattern.update(input(999)).command.position).toBeCloseTo(0.9, 1)
  })

  it('holds at the maximum for the configured hold duration', () => {
    const pattern = new RampPattern(options)

    expect(pattern.update(input(1000)).command.position).toBeCloseTo(0.9)
    expect(pattern.update(input(1100)).command.position).toBeCloseTo(0.9)
    expect(pattern.update(input(1199)).command.position).toBeCloseTo(0.9)
  })

  it('ramps back down after the hold, then holds at the minimum', () => {
    const pattern = new RampPattern(options)

    expect(pattern.update(input(1200)).command.position).toBeCloseTo(0.9)
    expect(pattern.update(input(1700)).command.position).toBeCloseTo(0.5)
    expect(pattern.update(input(2200)).command.position).toBeCloseTo(0.1)
    expect(pattern.update(input(2399)).command.position).toBeCloseTo(0.1)
  })

  it('repeats the cycle', () => {
    const pattern = new RampPattern(options)
    const cycleMs = 2 * (options.rampDurationMs + options.holdDurationMs)

    expect(pattern.update(input(cycleMs)).command.position).toBeCloseTo(0.1)
    expect(pattern.update(input(cycleMs + 500)).command.position).toBeCloseTo(0.5)
  })

  it('scales intensity by the manual intensity scale', () => {
    const pattern = new RampPattern({ ...options, intensityScale: 0.6 })

    expect(pattern.update(input(0, 0.5)).command.intensity).toBeCloseTo(0.3)
  })

  it('never divides by zero when ramp duration is configured as zero', () => {
    const pattern = new RampPattern({ ...options, rampDurationMs: 0 })

    const position = pattern.update(input(0)).command.position
    expect(Number.isFinite(position)).toBe(true)
  })
})
