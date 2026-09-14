import type { Algorithm } from './Algorithm'
import { ClosenessAdaptivePattern } from './implementations/ClosenessAdaptivePattern'
import { ConstantPattern } from './implementations/ConstantPattern'
import { EdgeCyclePattern } from './implementations/EdgeCyclePattern'
import { RampPattern } from './implementations/RampPattern'
import { RandomWalkPattern } from './implementations/RandomWalkPattern'
import { SineWavePattern } from './implementations/SineWavePattern'

export interface AlgorithmDescriptor {
  readonly id: string
  readonly name: string
  readonly description: string
}

interface AlgorithmRegistryEntry extends AlgorithmDescriptor {
  create(): Algorithm
}

/**
 * The single source of truth for which algorithms exist. An algorithm's
 * id/name/description come from the `Algorithm` interface itself (read off
 * one throwaway instance here), so the registry never duplicates — and
 * risks drifting from — what each implementation already declares about
 * itself.
 */
const factories: readonly (() => Algorithm)[] = [
  () => new ConstantPattern(),
  () => new SineWavePattern(),
  () => new RampPattern(),
  () => new RandomWalkPattern(),
  () => new ClosenessAdaptivePattern(),
  () => new EdgeCyclePattern(),
]

const entries: readonly AlgorithmRegistryEntry[] = factories.map((create) => {
  const sample = create()
  return { id: sample.id, name: sample.name, description: sample.description, create }
})

const entriesById = new Map(entries.map((entry) => [entry.id, entry]))

export const algorithmDescriptors: readonly AlgorithmDescriptor[] = entries

export const defaultAlgorithmId: string = entries[0].id

/** Creates a fresh algorithm instance. Never returns a shared/reused instance. */
export function createAlgorithm(id: string): Algorithm {
  const entry = entriesById.get(id)
  if (!entry) throw new Error(`Unknown algorithm: ${id}`)
  return entry.create()
}
