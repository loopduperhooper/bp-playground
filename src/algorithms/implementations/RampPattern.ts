import type { Algorithm } from '../Algorithm'
import type { AlgorithmInput, AlgorithmOutput } from '../../engine/types'
import { clamp } from '../../utils/clamp'

export interface RampPatternOptions {
  rampDurationMs?: number
  holdDurationMs?: number
  minimum?: number
  maximum?: number
  intensityScale?: number
}

/**
 * Ramps a position up from `minimum` to `maximum` over `rampDurationMs`,
 * holds at the maximum for `holdDurationMs`, ramps back down, holds at the
 * minimum, then repeats — a full trapezoidal cycle driven by elapsed time.
 */
export class RampPattern implements Algorithm {
  readonly id = 'ramp'
  readonly name = 'Ramp'
  readonly description = 'Gradually ramps a value up and down between a minimum and maximum, holding briefly at each end.'

  private readonly rampDurationMs: number
  private readonly holdDurationMs: number
  private readonly minimum: number
  private readonly maximum: number
  private readonly intensityScale: number

  constructor(options: RampPatternOptions = {}) {
    this.rampDurationMs = Math.max(1, options.rampDurationMs ?? 2000)
    this.holdDurationMs = Math.max(0, options.holdDurationMs ?? 500)
    this.minimum = options.minimum ?? 0.1
    this.maximum = options.maximum ?? 0.9
    this.intensityScale = options.intensityScale ?? 0.5
  }

  reset(): void {}

  update(input: AlgorithmInput): AlgorithmOutput {
    const position = clamp(this.positionAt(input.elapsedMs), 0, 1)
    const intensity = clamp(this.intensityScale * input.manualIntensityScale, 0, 1)

    return {
      command: { position, intensity, reason: 'ramp' },
      debug: { position },
    }
  }

  private positionAt(elapsedMs: number): number {
    const cycleMs = 2 * (this.rampDurationMs + this.holdDurationMs)
    const phase = elapsedMs % cycleMs
    const range = this.maximum - this.minimum

    if (phase < this.rampDurationMs) {
      return this.minimum + range * (phase / this.rampDurationMs)
    }

    const afterRampUp = phase - this.rampDurationMs
    if (afterRampUp < this.holdDurationMs) {
      return this.maximum
    }

    const afterHoldAtMax = afterRampUp - this.holdDurationMs
    if (afterHoldAtMax < this.rampDurationMs) {
      return this.maximum - range * (afterHoldAtMax / this.rampDurationMs)
    }

    return this.minimum
  }
}
