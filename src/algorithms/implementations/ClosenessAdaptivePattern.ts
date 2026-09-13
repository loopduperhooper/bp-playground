import type { Algorithm } from '../Algorithm'
import type { AlgorithmInput, AlgorithmOutput, Closeness } from '../../engine/types'
import { clamp } from '../../utils/clamp'

export interface ClosenessProfile {
  readonly amplitude: number
  readonly intensityMultiplier: number
  readonly variation: number
}

/**
 * Illustrative defaults, not device-specific truths — see the architecture
 * brief. Closeness is a subjective, manually selected user input, not a
 * physiological measurement.
 */
export function defaultClosenessProfile(closeness: Closeness): ClosenessProfile {
  return {
    amplitude: [0.25, 0.4, 0.55, 0.65, 0.5][closeness - 1],
    intensityMultiplier: [0.45, 0.6, 0.75, 0.85, 0.7][closeness - 1],
    variation: [0.1, 0.2, 0.3, 0.35, 0.15][closeness - 1],
  }
}

export interface ClosenessAdaptivePatternOptions {
  frequencyHz?: number
  baseline?: number
  stepSize?: number
  smoothing?: number
  profile?: (closeness: Closeness) => ClosenessProfile
}

/**
 * Blends a smooth base oscillation with bounded, smoothed randomness, both
 * scaled by the user's manually-selected closeness input via `profile`.
 */
export class ClosenessAdaptivePattern implements Algorithm {
  readonly id = 'closeness-adaptive'
  readonly name = 'Closeness adaptive'
  readonly description = "Blends a smooth oscillation with bounded randomness, both scaled by the closeness input."

  private readonly frequencyHz: number
  private readonly baseline: number
  private readonly stepSize: number
  private readonly smoothing: number
  private readonly profile: (closeness: Closeness) => ClosenessProfile
  private noise = 0

  constructor(options: ClosenessAdaptivePatternOptions = {}) {
    this.frequencyHz = options.frequencyHz ?? 0.2
    this.baseline = options.baseline ?? 0.5
    this.stepSize = options.stepSize ?? 0.1
    this.smoothing = clamp(options.smoothing ?? 0.2, 0, 1)
    this.profile = options.profile ?? defaultClosenessProfile
  }

  reset(): void {
    this.noise = 0
  }

  update(input: AlgorithmInput): AlgorithmOutput {
    const { amplitude, intensityMultiplier, variation } = this.profile(input.closeness)

    const elapsedSeconds = input.elapsedMs / 1000
    const wave = Math.sin(2 * Math.PI * this.frequencyHz * elapsedSeconds)

    const randomStep = (input.random() * 2 - 1) * this.stepSize * variation
    this.noise += (randomStep - this.noise) * this.smoothing

    const position = clamp(this.baseline + amplitude * wave + this.noise, 0, 1)
    const intensity = clamp(intensityMultiplier * input.manualIntensityScale, 0, 1)

    return {
      command: { position, intensity, reason: 'closeness-adaptive' },
      debug: { wave, noise: this.noise, closeness: input.closeness },
    }
  }
}
