import { describe, expect, it } from 'vitest'

import { algorithmDescriptors, createAlgorithm, defaultAlgorithmId } from '../../src/algorithms/AlgorithmRegistry'

describe('AlgorithmRegistry', () => {
  it('lists every registered algorithm with a name and description', () => {
    expect(algorithmDescriptors.length).toBeGreaterThan(0)
    for (const descriptor of algorithmDescriptors) {
      expect(descriptor.id).toBeTruthy()
      expect(descriptor.name).toBeTruthy()
      expect(descriptor.description).toBeTruthy()
    }
  })

  it('defaults to the first registered algorithm', () => {
    expect(defaultAlgorithmId).toBe(algorithmDescriptors[0].id)
  })

  it('creates a fresh instance on every call, not a shared singleton', () => {
    const first = createAlgorithm(defaultAlgorithmId)
    const second = createAlgorithm(defaultAlgorithmId)

    expect(first).not.toBe(second)
    expect(first.id).toBe(second.id)
  })

  it('throws for an unknown algorithm id', () => {
    expect(() => createAlgorithm('does-not-exist')).toThrow('Unknown algorithm: does-not-exist')
  })
})
