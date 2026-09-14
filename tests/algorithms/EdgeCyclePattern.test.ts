import { describe, expect, it } from 'vitest'

import { EdgeCyclePattern } from '../../src/algorithms/implementations/EdgeCyclePattern'
import type { AlgorithmInput } from '../../src/engine/types'

function edgeInput(overrides: Partial<AlgorithmInput> = {}): AlgorithmInput {
  return { elapsedMs: 0, deltaMs: 50, closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0, ...overrides }
}

describe('EdgeCyclePattern', () => {
  it('holds position between baseline decisions and alternates when they land', () => {
    const pattern = new EdgeCyclePattern({ baselineIntervalMs: 100 })

    // random() => 0 always picks the first of the two non-current positions.
    expect(pattern.update(edgeInput()).command).toMatchObject({ position: 0.5, durationMs: 50 })
    expect(pattern.update(edgeInput()).command).toMatchObject({ position: 0, durationMs: 100 })
    expect(pattern.update(edgeInput()).command).toMatchObject({ position: 0, durationMs: 50 })
    expect(pattern.update(edgeInput()).command).toMatchObject({ position: 0.5, durationMs: 100 })
    expect(pattern.update(edgeInput()).command).toMatchObject({ position: 0.5, durationMs: 50 })
    expect(pattern.update(edgeInput()).command).toMatchObject({ position: 0, durationMs: 100 })
  })

  it('starts counting toward a pickup only once closeness allows it, then enters pickup on expiry', () => {
    const pattern = new EdgeCyclePattern({ baselineIntervalMs: 1_000_000, pickupMinDelayMs: 100, pickupMaxDelayMs: 100 })

    expect(pattern.update(edgeInput({ closeness: 3 })).debug).toMatchObject({ phase: 'baseline', pickupCountdownMs: 100 })
    expect(pattern.update(edgeInput({ closeness: 3 })).debug).toMatchObject({ phase: 'baseline', pickupCountdownMs: 50 })
    expect(pattern.update(edgeInput({ closeness: 3 })).debug).toMatchObject({ phase: 'pickup' })
  })

  it('never starts a pickup while closeness reads 4-5, and rolls a fresh delay once it drops', () => {
    const pattern = new EdgeCyclePattern({ baselineIntervalMs: 1_000_000, pickupMinDelayMs: 50, pickupMaxDelayMs: 50 })

    for (let i = 0; i < 10; i++) {
      expect(pattern.update(edgeInput({ closeness: 5 })).debug).toMatchObject({ phase: 'baseline', pickupCountdownMs: -1 })
    }

    expect(pattern.update(edgeInput({ closeness: 2 })).debug).toMatchObject({ pickupCountdownMs: 50 })
    expect(pattern.update(edgeInput({ closeness: 2 })).debug).toMatchObject({ phase: 'pickup' })
  })

  it('holds still 1s after closeness hits 4-5 during pickup, for 10s, then returns to baseline gated on closeness dropping again', () => {
    const pattern = new EdgeCyclePattern({
      baselineIntervalMs: 1_000_000,
      pickupMinDelayMs: 0,
      pickupMaxDelayMs: 0,
      pickupSegmentDurationMs: 1_000_000,
      holdGraceMs: 100,
      holdDurationMs: 200,
    })

    pattern.update(edgeInput({ closeness: 3 })) // tick1: rolls the (zero) pickup delay
    expect(pattern.update(edgeInput({ closeness: 3 })).debug).toMatchObject({ phase: 'pickup' }) // tick2: enters pickup, first move

    expect(pattern.update(edgeInput({ closeness: 5 })).debug).toMatchObject({ phase: 'pickup', phaseElapsedMs: 50 }) // tick3: closeness spikes, grace starts
    expect(pattern.update(edgeInput({ closeness: 5 })).debug).toMatchObject({ phase: 'pickup', phaseElapsedMs: 100 }) // tick4: still within 100ms grace

    const held = pattern.update(edgeInput({ closeness: 5 })) // tick5: grace elapsed, hold begins
    expect(held.debug).toMatchObject({ phase: 'hold' })
    expect(held.command.durationMs).toBe(200)
    const frozenPosition = held.command.position

    for (let i = 0; i < 3; i++) {
      const tick = pattern.update(edgeInput({ closeness: 5 }))
      expect(tick.debug?.phase).toBe('hold')
      expect(tick.command.position).toBe(frozenPosition)
    }

    // tick9: 200ms of hold elapsed -> back to baseline, gated (no countdown) until closeness <= 3
    expect(pattern.update(edgeInput({ closeness: 5 })).debug).toMatchObject({ phase: 'baseline', pickupCountdownMs: -1 })

    // closeness drops -> next attempt starts counting again
    expect(pattern.update(edgeInput({ closeness: 3 })).debug).toMatchObject({ phase: 'baseline', pickupCountdownMs: 0 })
  })

  it('scales intensity by the manual intensity scale', () => {
    const pattern = new EdgeCyclePattern({ intensityScale: 0.6 })

    expect(pattern.update(edgeInput({ manualIntensityScale: 0.5 })).command.intensity).toBeCloseTo(0.3)
  })

  it('resets to the middle position and baseline phase', () => {
    const pattern = new EdgeCyclePattern({ baselineIntervalMs: 100 })

    expect(pattern.update(edgeInput({ deltaMs: 100 })).command.position).not.toBe(0.5)

    pattern.reset()

    const out = pattern.update(edgeInput({ deltaMs: 10 }))
    expect(out.command.position).toBe(0.5)
    expect(out.debug).toMatchObject({ phase: 'baseline' })
  })
})
