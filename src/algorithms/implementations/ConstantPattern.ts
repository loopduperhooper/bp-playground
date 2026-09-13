import type { Algorithm } from '../Algorithm'
import type { AlgorithmInput, AlgorithmOutput } from '../../engine/types'

export interface ConstantPatternOptions {
  position?: number
  speed?: number
  intensity?: number
}

/** Emits a stable normalized command, useful for calibration and smoke tests. */
export class ConstantPattern implements Algorithm {
  readonly id = 'constant'
  readonly name = 'Constant pattern'
  readonly description = 'A stable command for connection and calibration tests.'

  private readonly position: number
  private readonly speed: number
  private readonly intensity: number

  constructor(options: ConstantPatternOptions = {}) {
    this.position = options.position ?? 0.5
    this.speed = options.speed ?? 0.25
    this.intensity = options.intensity ?? 0.25
  }

  reset(): void {}

  update(input: AlgorithmInput): AlgorithmOutput {
    return {
      command: {
        position: this.position,
        speed: this.speed * input.manualIntensityScale,
        intensity: this.intensity * input.manualIntensityScale,
        reason: 'constant',
      },
    }
  }
}
