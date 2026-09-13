import type { AlgorithmInput, AlgorithmOutput } from '../engine/types'

/**
 * A stateful, UI- and transport-independent command generator.
 */
export interface Algorithm {
  readonly id: string
  readonly name: string
  readonly description: string
  reset(): void
  update(input: AlgorithmInput): AlgorithmOutput
}
