import { describe, expect, it, vi } from 'vitest'

import { ConstantPattern } from '../../src/algorithms/implementations/ConstantPattern'
import { FakeDeviceAdapter } from '../../src/devices/adapters/FakeDeviceAdapter'
import { ControlEngine } from '../../src/engine/ControlEngine'
import { defaultSafetyPolicy } from '../../src/safety/SafetyPolicy'
import { SafetyController } from '../../src/safety/SafetyController'
import { FakeTransport } from '../../src/transport/FakeTransport'

describe('SafetyController wired into ControlEngine', () => {
  it('clamps out-of-range algorithm output and stops the engine on a transport error', async () => {
    vi.useFakeTimers()
    const transport = new FakeTransport([
      { id: 'linear-1', name: 'Fake Linear Device', capabilities: { features: ['linear'], supportsStop: true } },
    ])
    const device = new FakeDeviceAdapter(transport)
    await device.connect()

    const safety = new SafetyController({
      policy: defaultSafetyPolicy,
      isDeviceReady: () => device.isReady(),
      getCapabilities: () => device.getCapabilities(),
      isSoftMode: () => false,
    })

    const engine = new ControlEngine(
      device,
      safety,
      new ConstantPattern({ position: 2, speed: 5, intensity: 5 }),
      () => ({ closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0.5 }),
    )

    engine.start()
    await vi.advanceTimersByTimeAsync(50)

    expect(transport.commands[0]).toMatchObject({ position: 1, speed: 1, intensity: 1 })

    vi.spyOn(device, 'send').mockRejectedValueOnce(new Error('transport failure'))
    await vi.advanceTimersByTimeAsync(50)

    expect(safety.isRunning()).toBe(false)
    expect(transport.stopCount).toBeGreaterThan(0)
    vi.useRealTimers()
  })
})
