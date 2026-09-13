import { describe, expect, it } from 'vitest'

import { initialSessionState, sessionReducer } from '../../src/state/sessionState'

describe('sessionReducer', () => {
  it('does not start before a device is ready', () => {
    expect(sessionReducer(initialSessionState, { type: 'toggle-run' })).toEqual(
      initialSessionState,
    )
  })

  it('connects, starts, and resets to a safe UI baseline', () => {
    const connected = sessionReducer(initialSessionState, { type: 'connect' })
    const running = sessionReducer(connected, { type: 'toggle-run' })
    const changed = sessionReducer(running, { type: 'set-closeness', closeness: 4 })
    const reset = sessionReducer(changed, { type: 'stop-reset' })

    expect(running.status).toBe('running')
    expect(reset).toMatchObject({
      status: 'ready',
      closeness: 1,
    })
  })

  it('resets without disconnecting the selected device', () => {
    const connected = sessionReducer(initialSessionState, { type: 'connect' })
    const reset = sessionReducer(
      sessionReducer(connected, { type: 'toggle-run' }),
      { type: 'reset-session' },
    )

    expect(reset).toMatchObject({
      status: 'ready',
      selectedDeviceId: connected.selectedDeviceId,
      closeness: 1,
    })
  })
})
