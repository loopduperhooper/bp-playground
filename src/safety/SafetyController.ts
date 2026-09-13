import type { EngineSafety } from '../engine/ControlEngine'
import type { DeviceCapabilities, DeviceCommand } from '../engine/types'
import { clamp } from '../utils/clamp'
import { CommandLimiter } from './CommandLimiter'
import type { SafetyPolicy } from './SafetyPolicy'

export interface SafetyControllerOptions {
  policy: SafetyPolicy
  isDeviceReady: () => boolean
  getCapabilities: () => DeviceCapabilities
  isSoftMode: () => boolean
  now?: () => number
}

/**
 * The single place that enforces limits independent of any algorithm:
 * normalized/device-capability clamping, soft mode, command-rate limiting,
 * and readiness checks. A buggy or hostile algorithm cannot bypass this by
 * emitting out-of-range or unsupported command fields.
 */
export class SafetyController implements EngineSafety {
  private readonly policy: SafetyPolicy
  private readonly isDeviceReady: () => boolean
  private readonly getCapabilities: () => DeviceCapabilities
  private readonly isSoftMode: () => boolean
  private readonly now: () => number
  private readonly limiter: CommandLimiter

  private running = false
  private startedAt = 0
  private lastSafeCommand: DeviceCommand = {}

  constructor(options: SafetyControllerOptions) {
    this.policy = options.policy
    this.isDeviceReady = options.isDeviceReady
    this.getCapabilities = options.getCapabilities
    this.isSoftMode = options.isSoftMode
    this.now = options.now ?? (() => performance.now())
    this.limiter = new CommandLimiter(this.policy.minimumCommandIntervalMs)
  }

  canStart(): boolean {
    return this.isDeviceReady() && !this.running
  }

  isRunning(): boolean {
    return this.running
  }

  markRunning(): void {
    this.running = true
    this.startedAt = this.now()
    this.lastSafeCommand = {}
    this.limiter.reset()
  }

  markStopped(reason: string): void {
    void reason
    this.running = false
  }

  elapsedMs(): number {
    return this.running ? Math.max(0, this.now() - this.startedAt) : 0
  }

  validateAndClamp(command: DeviceCommand): DeviceCommand {
    if (!this.running) throw new Error('Safety: rejected a command while the session is not running')
    if (!this.isDeviceReady()) throw new Error('Safety: rejected a command while the device is not ready')

    const now = this.now()
    if (!this.limiter.canSend(now)) return this.lastSafeCommand

    const capabilities = this.getCapabilities()
    const scale = this.isSoftMode() ? this.policy.softModeMultiplier : 1
    const safeCommand: DeviceCommand = { reason: command.reason }

    if (command.position !== undefined && capabilities.features.includes('linear')) {
      safeCommand.position = clamp(command.position, 0, 1)
    }

    if (
      command.speed !== undefined &&
      (capabilities.features.includes('linear') || capabilities.features.includes('rotation'))
    ) {
      safeCommand.speed = clamp(command.speed * scale, 0, this.policy.maxSpeed)
    }

    if (command.intensity !== undefined) {
      safeCommand.intensity = clamp(command.intensity * scale, 0, this.policy.maxIntensity)
    }

    if (command.vibration !== undefined && capabilities.features.includes('vibration')) {
      safeCommand.vibration = clamp(command.vibration * scale, 0, this.policy.maxIntensity)
    }

    if (command.durationMs !== undefined) {
      safeCommand.durationMs = Math.max(0, command.durationMs)
    }

    this.limiter.recordSend(now)
    this.lastSafeCommand = safeCommand
    return safeCommand
  }
}
