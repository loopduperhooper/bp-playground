import { describe, expect, it, vi } from 'vitest'

import { ConstantPattern } from '../../src/algorithms/implementations/ConstantPattern'
import { SineWavePattern } from '../../src/algorithms/implementations/SineWavePattern'
import { ControlEngine, type EngineSafety, type EngineTickDiagnostics } from '../../src/engine/ControlEngine'
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

  it('fills in durationMs from the measured tick gap when the algorithm omits it', async () => {
    vi.useFakeTimers()
    const commands: DeviceCommand[] = []
    const policy = safety()
    const engine = new ControlEngine(
      device(commands),
      policy,
      new ConstantPattern(),
      () => ({ closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0.5 }),
      { cadenceMs: 50 },
    )

    engine.start()
    await vi.advanceTimersByTimeAsync(151)

    expect(commands.length).toBe(3)
    for (const command of commands) {
      expect(command.durationMs).toBeGreaterThanOrEqual(50)
      expect(command.durationMs).toBeLessThan(55)
    }

    engine.stop()
    vi.useRealTimers()
  })

  it('does not override an explicit durationMs from the algorithm', async () => {
    vi.useFakeTimers()
    const commands: DeviceCommand[] = []
    const policy = safety()
    const explicitDurationAlgorithm = {
      id: 'explicit-duration',
      name: 'Explicit duration',
      description: 'test double',
      reset: () => {},
      update: () => ({ command: { position: 0.5, durationMs: 1234, reason: 'explicit-duration' } }),
    }
    const engine = new ControlEngine(
      device(commands),
      policy,
      explicitDurationAlgorithm,
      () => ({ closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0.5 }),
    )

    engine.start()
    await vi.advanceTimersByTimeAsync(50)

    expect(commands).toHaveLength(1)
    expect(commands[0].durationMs).toBe(1234)

    engine.stop()
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

  it('calls onTick with the safe command, algorithm debug values, and a timestamp on success', async () => {
    vi.useFakeTimers()
    const commands: DeviceCommand[] = []
    const policy = safety()
    const diagnostics: EngineTickDiagnostics[] = []
    const engine = new ControlEngine(
      device(commands),
      policy,
      new SineWavePattern(),
      () => ({ closeness: 3, manualIntensityScale: 1, isRunning: true, random: () => 0.5 }),
      { onTick: (entry) => diagnostics.push(entry) },
    )

    engine.start()
    await vi.advanceTimersByTimeAsync(50)

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].command).toMatchObject({ reason: 'sine-wave' })
    expect(diagnostics[0].debug).toMatchObject({ wave: expect.any(Number), elapsedSeconds: expect.any(Number) })
    expect(diagnostics[0].at).toBeTypeOf('number')

    engine.stop()
    vi.useRealTimers()
  })

  it('calls onError with an actionable message and stops when sending fails', async () => {
    vi.useFakeTimers()
    const commands: DeviceCommand[] = []
    const failingDevice: DeviceAdapter = { ...device(commands), send: async () => { throw new Error('transport unreachable') } }
    const policy = safety()
    const errors: string[] = []
    const engine = new ControlEngine(
      failingDevice,
      policy,
      new ConstantPattern(),
      () => ({ closeness: 1, manualIntensityScale: 1, isRunning: true, random: () => 0 }),
      { onError: (message) => errors.push(message) },
    )

    engine.start()
    await vi.advanceTimersByTimeAsync(50)

    expect(errors).toEqual(['transport unreachable'])
    expect(policy.stopped).toEqual(['send-error'])
    vi.useRealTimers()
  })
})
