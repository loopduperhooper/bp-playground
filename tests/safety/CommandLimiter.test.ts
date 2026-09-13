import { describe, expect, it } from 'vitest'

import { CommandLimiter } from '../../src/safety/CommandLimiter'

describe('CommandLimiter', () => {
  it('allows the first send and blocks sends inside the minimum interval', () => {
    const limiter = new CommandLimiter(50)

    expect(limiter.canSend(0)).toBe(true)
    limiter.recordSend(0)
    expect(limiter.canSend(10)).toBe(false)
    expect(limiter.canSend(50)).toBe(true)
  })

  it('resets to allow an immediate send again', () => {
    const limiter = new CommandLimiter(50)
    limiter.recordSend(0)

    limiter.reset()

    expect(limiter.canSend(1)).toBe(true)
  })
})
