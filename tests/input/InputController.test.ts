import { describe, expect, it, vi } from 'vitest'

import { InputController, type KeyboardActions } from '../../src/input/InputController'

function dispatchKey(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options })
  window.dispatchEvent(event)
  return event
}

describe('InputController', () => {
  it('maps global shortcuts and prevents their browser defaults', () => {
    const actions: KeyboardActions = {
      stopReset: vi.fn(), startPause: vi.fn(), intensityDown: vi.fn(), intensityUp: vi.fn(),
      closenessDown: vi.fn(), closenessUp: vi.fn(), resetSession: vi.fn(),
    }
    const controller = new InputController(actions)
    controller.attach()

    expect(dispatchKey('Escape').defaultPrevented).toBe(true)
    dispatchKey(' ')
    dispatchKey('A')
    dispatchKey('d')
    dispatchKey('[')
    dispatchKey(']')
    dispatchKey('R')

    expect(actions.stopReset).toHaveBeenCalledOnce()
    expect(actions.startPause).toHaveBeenCalledOnce()
    expect(actions.intensityDown).toHaveBeenCalledOnce()
    expect(actions.intensityUp).toHaveBeenCalledOnce()
    expect(actions.closenessDown).toHaveBeenCalledOnce()
    expect(actions.closenessUp).toHaveBeenCalledOnce()
    expect(actions.resetSession).toHaveBeenCalledOnce()
    controller.detach()
  })

  it('ignores shortcuts in editable controls and repeat one-shot commands', () => {
    const actions: KeyboardActions = {
      stopReset: vi.fn(), startPause: vi.fn(), intensityDown: vi.fn(), intensityUp: vi.fn(),
      closenessDown: vi.fn(), closenessUp: vi.fn(), resetSession: vi.fn(),
    }
    const controller = new InputController(actions)
    controller.attach()
    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }))
    dispatchKey('Escape', { repeat: true })
    dispatchKey(' ', { repeat: true })
    dispatchKey('r', { repeat: true })

    expect(actions.stopReset).not.toHaveBeenCalled()
    expect(actions.startPause).not.toHaveBeenCalled()
    expect(actions.resetSession).not.toHaveBeenCalled()
    input.remove()
    controller.detach()
  })
})
