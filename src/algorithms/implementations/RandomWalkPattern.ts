import type { Algorithm } from '../Algorithm'
import type { AlgorithmInput, AlgorithmOutput } from '../../engine/types'
import { clamp } from '../../utils/clamp'

export interface RandomWalkPatternOptions {
  target?: number
  stepSize?: number
  smoothing?: number
  minimum?: number
  maximum?: number
  intensityScale?: number
}

/**
 * Bounded random changes around a target position. Each tick proposes a
 * random step (via the injected, seedable `AlgorithmInput.random`), clamps
 * it to the hard [minimum, maximum] bounds, then blends it in with
 * `smoothing` so the position never jumps abruptly.
 */
export class RandomWalkPattern implements Algorithm {
  readonly id = 'random-walk'
  readonly name = 'Random walk'
  readonly description = 'Bounded random changes around a target position, smoothed to avoid abrupt jumps.'

  private readonly target: number
  private readonly stepSize: number
  private readonly smoothing: number
  private readonly minimum: number
  private readonly maximum: number
  private readonly intensityScale: number
  private position: number

  constructor(options: RandomWalkPatternOptions = {}) {
    this.target = options.target ?? 0.5
    this.stepSize = options.stepSize ?? 0.05
    this.smoothing = clamp(options.smoothing ?? 0.2, 0, 1)
    this.minimum = options.minimum ?? 0.1
    this.maximum = options.maximum ?? 0.9
    this.intensityScale = options.intensityScale ?? 0.5
    this.position = this.target
  }

  reset(): void {
    this.position = this.target
  }

  update(input: AlgorithmInput): AlgorithmOutput {
    const randomStep = (input.random() * 2 - 1) * this.stepSize
    const proposed = clamp(this.position + randomStep, this.minimum, this.maximum)
    this.position = clamp(this.position + (proposed - this.position) * this.smoothing, this.minimum, this.maximum)

    const intensity = clamp(this.intensityScale * input.manualIntensityScale, 0, 1)

    return {
      command: { position: this.position, intensity, reason: 'random-walk' },
      debug: { position: this.position },
    }
  }
}
