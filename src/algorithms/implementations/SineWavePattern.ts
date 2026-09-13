import type { Algorithm } from '../Algorithm'
import type { AlgorithmInput, AlgorithmOutput } from '../../engine/types'
import { clamp } from '../../utils/clamp'

export interface SineWavePatternOptions {
  frequencyHz?: number
  amplitude?: number
  baseline?: number
  intensityScale?: number
}

/** A smooth periodic position that oscillates around a baseline over elapsed time. */
export class SineWavePattern implements Algorithm {
  readonly id = 'sine-wave'
  readonly name = 'Sine wave'
  readonly description = 'A smooth periodic position that oscillates around a baseline.'

  private readonly frequencyHz: number
  private readonly amplitude: number
  private readonly baseline: number
  private readonly intensityScale: number

  constructor(options: SineWavePatternOptions = {}) {
    this.frequencyHz = options.frequencyHz ?? 0.25
    this.amplitude = options.amplitude ?? 0.4
    this.baseline = options.baseline ?? 0.5
    this.intensityScale = options.intensityScale ?? 0.5
  }

  reset(): void {}

  update(input: AlgorithmInput): AlgorithmOutput {
    const elapsedSeconds = input.elapsedMs / 1000
    const wave = Math.sin(2 * Math.PI * this.frequencyHz * elapsedSeconds)
    const position = clamp(this.baseline + this.amplitude * wave, 0, 1)
    const intensity = clamp(this.intensityScale * input.manualIntensityScale, 0, 1)

    return {
      command: { position, intensity, reason: 'sine-wave' },
      debug: { wave, elapsedSeconds },
    }
  }
}
