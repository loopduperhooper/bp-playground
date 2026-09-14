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

/** What actually went out on a successful tick, for diagnostics UI. */
export interface EngineTickDiagnostics {
  command: DeviceCommand
  debug?: Readonly<Record<string, number | string | boolean>>
  at: number
}

export interface ControlEngineOptions {
  cadenceMs?: number
  now?: () => number
  scheduler?: EngineScheduler
  onTick?: (diagnostics: EngineTickDiagnostics) => void
  onError?: (message: string) => void
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
  private readonly onTick?: (diagnostics: EngineTickDiagnostics) => void
  private readonly onError?: (message: string) => void

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
    this.onTick = options.onTick
    this.onError = options.onError
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
      // Algorithms are timing-independent and never set durationMs, so without this
      // the transport's fixed 500ms fallback would apply every tick regardless of
      // actual cadence — each command would restart a still-in-flight 500ms move
      // long before it finished, producing stutter on real devices. Tying duration
      // to the measured tick gap instead lets each move finish right as the next
      // command arrives (same fix as MultiFunPlayer's FixedUpdate).
      const command: DeviceCommand = {
        ...output.command,
        durationMs: output.command.durationMs ?? Math.max(1, Math.round(deltaMs) + 1),
      }
      const safeCommand = this.safety.validateAndClamp(command)
      await this.device.send(safeCommand)
      this.onTick?.({ command: safeCommand, debug: output.debug, at: this.now() })
    } catch (error) {
      this.onError?.(error instanceof Error ? error.message : String(error))
      this.safety.markStopped('send-error')
      await this.device.stop()
      return
    }

    if (this.safety.isRunning()) this.scheduleNext()
  }
}
