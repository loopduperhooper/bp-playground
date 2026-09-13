export interface KeyboardActions {
  stopReset(): void
  startPause(): void
  closenessDown(): void
  closenessUp(): void
  resetSession(): void
}

const oneShotKeys = new Set(['Escape', ' ', 'r', 'R'])

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return target.isContentEditable || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
}

/** Maps the safety-focused global keyboard shortcuts to session actions. */
export class InputController {
  private readonly actions: KeyboardActions

  constructor(actions: KeyboardActions) {
    this.actions = actions
  }

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown)
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return

    const action = this.resolve(event.key)
    if (!action) return

    event.preventDefault()
    if (event.repeat && oneShotKeys.has(event.key)) return
    action()
  }

  private resolve(key: string): (() => void) | undefined {
    switch (key) {
      case 'Escape': return this.actions.stopReset
      case ' ': return this.actions.startPause
      case 'a':
      case 'A': return this.actions.closenessDown
      case 'd':
      case 'D': return this.actions.closenessUp
      case 'r':
      case 'R': return this.actions.resetSession
      default: return undefined
    }
  }
}
