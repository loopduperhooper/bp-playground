import { describe, expect, it, vi } from 'vitest'

import { ConstantPattern } from '../../src/algorithms/implementations/ConstantPattern'
import { ControlEngine, type EngineSafety } from '../../src/engine/ControlEngine'
import type { DeviceCommand } from '../../src/engine/types'
import type { DeviceAdapter } from '../../src/devices/DeviceAdapter'

const device = (commands: DeviceCommand[]): DeviceAdapter => ({
  connect: async () => {},
  disconnect: async () => {},
  isReady: () => true,
  getCapabilities: () => ({ features: ['linear'], supportsStop: true }),
  send: async (command) => { commands.push(command) },
  stop: async () => {},
})

const safety = (): EngineSafety & { running: boolean; stopped: string[] } => ({
  running: false,
  stopped: [],
  canStart: () => true,
  isRunning() { return this.running },
  markRunning() { this.running = true },
  markStopped(reason) { this.running = false; this.stopped.push(reason) },
  elapsedMs: () => 50,
  validateAndClamp: (command) => command,
})

describe('ControlEngine', () => {
  it('emits at a bounded cadence while running and stops cleanly', async () => {
    vi.useFakeTimers()
    const commands: DeviceCommand[] = []
    const policy = safety()
    const engine = new ControlEngine(device(commands), policy, new ConstantPattern(), () => ({ closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0.5 }))

    engine.start()
    await vi.advanceTimersByTimeAsync(151)
    expect(commands.length).toBe(3)

    engine.stop()
    await vi.advanceTimersByTimeAsync(100)
    expect(commands.length).toBe(3)
    expect(policy.stopped).toEqual(['user-stop'])
    vi.useRealTimers()
  })

  it('rejects start when the device is not ready', () => {
    const commands: DeviceCommand[] = []
    const policy = safety()
    const notReady = { ...device(commands), isReady: () => false }
    const engine = new ControlEngine(notReady, policy, new ConstantPattern(), () => ({ closeness: 1, manualIntensityScale: 1, isRunning: false, random: () => 0 }))

    expect(() => engine.start()).toThrow('Device is not ready')
    expect(policy.running).toBe(false)
  })
})
