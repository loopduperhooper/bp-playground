import { defaultAlgorithmId } from '../algorithms/AlgorithmRegistry'
import type { Closeness, DeviceCapabilities, SessionStatus } from '../engine/types'

/** One entry in the session's event history, newest first. */
export interface SessionEvent {
  message: string
  at: number
}

const maxEventLogEntries = 20

export interface SessionState {
  status: SessionStatus
  selectedDeviceId?: string
  selectedAlgorithmId: string
  closeness: Closeness
  eventLog: readonly SessionEvent[]
}

export const fakeDevices = [
  { id: 'linear-1', name: 'Fake Linear Device', capabilities: 'Linear · stop' },
  { id: 'vibe-1', name: 'Fake Vibration Device', capabilities: 'Vibration · stop' },
] as const

/** Normalized capabilities backing each entry in {@link fakeDevices}, used to build the in-memory FakeTransport. */
export const fakeDeviceCapabilities: Record<string, DeviceCapabilities> = {
  'linear-1': { features: ['linear'], minPosition: 0, maxPosition: 1, minSpeed: 0, maxSpeed: 1, supportsStop: true },
  'vibe-1': { features: ['vibration'], minIntensity: 0, maxIntensity: 1, supportsStop: true },
}

export const initialSessionState: SessionState = {
  status: 'idle',
  selectedAlgorithmId: defaultAlgorithmId,
  closeness: 1,
  eventLog: [{ message: 'Waiting for a fake device connection.', at: 0 }],
}

/** Prepends a timestamped entry to `state.eventLog`, capped at {@link maxEventLogEntries}. */
function withEvent(state: SessionState, message: string): SessionState {
  return { ...state, eventLog: [{ message, at: Date.now() }, ...state.eventLog].slice(0, maxEventLogEntries) }
}

export type SessionAction =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'select-device'; deviceId: string }
  | { type: 'select-algorithm'; algorithmId: string }
  | { type: 'toggle-run' }
  | { type: 'stop-reset' }
  | { type: 'reset-session' }
  | { type: 'set-closeness'; closeness: Closeness }

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'connect':
      return withEvent(
        { ...state, status: 'ready', selectedDeviceId: state.selectedDeviceId ?? fakeDevices[0].id },
        'Fake device connected. Select Start when ready.',
      )
    case 'disconnect':
      return withEvent(
        { ...initialSessionState, selectedAlgorithmId: state.selectedAlgorithmId, eventLog: state.eventLog },
        'Device disconnected.',
      )
    case 'select-device':
      return withEvent({ ...state, selectedDeviceId: action.deviceId }, 'Selected fake device.')
    case 'select-algorithm':
      return withEvent({ ...state, selectedAlgorithmId: action.algorithmId }, 'Selected algorithm.')
    case 'toggle-run': {
      if (state.status !== 'ready' && state.status !== 'running') return state
      const running = state.status !== 'running'
      return withEvent(
        { ...state, status: running ? 'running' : 'ready' },
        running ? 'Session started (command engine pending).' : 'Session paused.',
      )
    }
    case 'stop-reset':
      return withEvent(
        { ...state, status: state.selectedDeviceId ? 'ready' : 'idle', closeness: 1 },
        'Stop and reset requested.',
      )
    case 'reset-session':
      return withEvent(
        { ...state, status: state.selectedDeviceId ? 'ready' : 'idle', closeness: 1 },
        'Session reset requested.',
      )
    case 'set-closeness': return { ...state, closeness: action.closeness }
  }
}
