import type { Algorithm } from '../algorithms/Algorithm'
import type { DeviceAdapter } from '../devices/DeviceAdapter'
import type { AlgorithmInput, DeviceCommand } from './types'

export interface EngineSafety {
  canStart(): boolean
  isRunning(): boolean
  markRunning(): void
  markStopped(reason: string): void
  elapsedMs(): number
  validateAndClamp(command: DeviceCommand): DeviceCommand
}

export interface EngineScheduler {
  set(callback: () => void, delayMs: number): number
  clear(timer: number): void
}

const defaultScheduler: EngineScheduler = {
  set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clear: (timer) => globalThis.clearTimeout(timer),
}

export interface ControlEngineOptions {
  cadenceMs?: number
  now?: () => number
  scheduler?: EngineScheduler
}

/** Owns the bounded command loop and keeps algorithms independent of devices. */
export class ControlEngine {
  private timer?: number
  private lastTime = 0
  private readonly device: DeviceAdapter
  private readonly safety: EngineSafety
  private algorithm: Algorithm
  private readonly getInput: () => Omit<AlgorithmInput, 'elapsedMs' | 'deltaMs'>
  private readonly cadenceMs: number
  private readonly now: () => number
  private readonly scheduler: EngineScheduler

  constructor(
    device: DeviceAdapter,
    safety: EngineSafety,
    algorithm: Algorithm,
    getInput: () => Omit<AlgorithmInput, 'elapsedMs' | 'deltaMs'>,
    options: ControlEngineOptions = {},
  ) {
    this.device = device
    this.safety = safety
    this.algorithm = algorithm
    this.getInput = getInput
    this.cadenceMs = options.cadenceMs ?? 50
    this.now = options.now ?? (() => performance.now())
    this.scheduler = options.scheduler ?? defaultScheduler
  }

  setAlgorithm(algorithm: Algorithm): void {
    this.stop('algorithm-change')
    this.algorithm.reset()
    this.algorithm = algorithm
  }

  start(): void {
    if (!this.device.isReady()) throw new Error('Device is not ready')
    if (!this.safety.canStart() || this.safety.isRunning()) return

    this.safety.markRunning()
    this.lastTime = this.now()
    this.scheduleNext()
  }

  stop(reason = 'user-stop'): void {
    if (this.timer !== undefined) {
      this.scheduler.clear(this.timer)
      this.timer = undefined
    }

    this.algorithm.reset()
    this.safety.markStopped(reason)
    void this.device.stop()
  }

  private scheduleNext(): void {
    this.timer = this.scheduler.set(() => void this.tick(), this.cadenceMs)
  }

  private async tick(): Promise<void> {
    this.timer = undefined
    if (!this.safety.isRunning()) return

    const currentTime = this.now()
    const deltaMs = Math.min(250, Math.max(0, currentTime - this.lastTime))
    this.lastTime = currentTime
    const input: AlgorithmInput = {
      ...this.getInput(),
      elapsedMs: this.safety.elapsedMs(),
      deltaMs,
    }

    try {
      const output = this.algorithm.update(input)
      await this.device.send(this.safety.validateAndClamp(output.command))
    } catch {
      this.safety.markStopped('send-error')
      await this.device.stop()
      return
    }

    if (this.safety.isRunning()) this.scheduleNext()
  }
}
