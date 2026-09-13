import { describe, expect, it } from 'vitest'

import { clamp } from '../../src/utils/clamp'

describe('clamp', () => {
  it('limits values to the inclusive range', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(clamp(2, 0, 1)).toBe(1)
  })

  it('rejects an inverted range', () => {
    expect(() => clamp(0, 2, 1)).toThrow('Minimum cannot be greater than maximum')
  })
})
