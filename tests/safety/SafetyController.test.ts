import { describe, expect, it } from 'vitest'

import type { DeviceCapabilities } from '../../src/engine/types'
import { defaultSafetyPolicy } from '../../src/safety/SafetyPolicy'
import { SafetyController } from '../../src/safety/SafetyController'

interface Options {
  ready?: boolean
  softMode?: boolean
  capabilities?: DeviceCapabilities
  minimumCommandIntervalMs?: number
}

function makeController(options: Options = {}) {
  const capabilities: DeviceCapabilities = options.capabilities ?? {
    features: ['linear', 'vibration'],
    supportsStop: true,
  }
  let time = 0
  const controller = new SafetyController({
    policy: { ...defaultSafetyPolicy, minimumCommandIntervalMs: options.minimumCommandIntervalMs ?? 50 },
    isDeviceReady: () => options.ready ?? true,
    getCapabilities: () => capabilities,
    isSoftMode: () => options.softMode ?? false,
    now: () => time,
  })

  return { controller, advance: (ms: number) => { time += ms } }
}

describe('SafetyController', () => {
  it('rejects starting and sending while the device is not ready', () => {
    const { controller } = makeController({ ready: false })

    expect(controller.canStart()).toBe(false)
    expect(() => controller.validateAndClamp({ intensity: 0.5 })).toThrow()
  })

  it('rejects sending before markRunning is called', () => {
    const { controller } = makeController()

    expect(() => controller.validateAndClamp({ intensity: 0.5 })).toThrow()
  })

  it('clamps normalized values and drops fields unsupported by device capabilities', () => {
    const { controller } = makeController({ capabilities: { features: ['vibration'], supportsStop: true } })
    controller.markRunning()

    const safe = controller.validateAndClamp({ position: 2, vibration: 5, intensity: -1 })

    expect(safe.position).toBeUndefined()
    expect(safe.vibration).toBe(1)
    expect(safe.intensity).toBe(0)
  })

  it('applies the soft-mode multiplier', () => {
    const { controller } = makeController({ softMode: true })
    controller.markRunning()

    const safe = controller.validateAndClamp({ intensity: 1, vibration: 1 })

    expect(safe.intensity).toBe(defaultSafetyPolicy.softModeMultiplier)
    expect(safe.vibration).toBe(defaultSafetyPolicy.softModeMultiplier)
  })

  it('rate-limits commands sent inside the minimum interval', () => {
    const { controller, advance } = makeController({ minimumCommandIntervalMs: 50 })
    controller.markRunning()

    const first = controller.validateAndClamp({ intensity: 0.4 })
    const second = controller.validateAndClamp({ intensity: 0.9 })
    advance(50)
    const third = controller.validateAndClamp({ intensity: 0.9 })

    expect(second).toEqual(first)
    expect(third.intensity).toBe(0.9)
  })

  it('requires markRunning again after markStopped before sending', () => {
    const { controller } = makeController()
    controller.markRunning()
    controller.validateAndClamp({ intensity: 0.2 })

    controller.markStopped('user-stop')

    expect(controller.isRunning()).toBe(false)
    expect(() => controller.validateAndClamp({ intensity: 0.2 })).toThrow()
  })

  it('tracks elapsed running time from the injected clock and resets it on stop', () => {
    const { controller, advance } = makeController()
    controller.markRunning()
    advance(120)

    expect(controller.elapsedMs()).toBe(120)

    controller.markStopped('done')

    expect(controller.elapsedMs()).toBe(0)
  })
})
