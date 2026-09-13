import type { Closeness, SessionStatus } from '../engine/types'

export interface SessionState {
  status: SessionStatus
  selectedDeviceId?: string
  selectedAlgorithmId: string
  closeness: Closeness
  intensityScale: number
  softMode: boolean
  lastEvent: string
}

export const fakeDevices = [
  { id: 'linear-1', name: 'Fake Linear Device', capabilities: 'Linear · stop' },
  { id: 'vibe-1', name: 'Fake Vibration Device', capabilities: 'Vibration · stop' },
] as const

export const algorithms = [{ id: 'constant', name: 'Constant pattern' }] as const

export const initialSessionState: SessionState = {
  status: 'idle',
  selectedAlgorithmId: 'constant',
  closeness: 1,
  intensityScale: 0.5,
  softMode: false,
  lastEvent: 'Waiting for a fake device connection.',
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
  | { type: 'set-intensity'; intensityScale: number }
  | { type: 'toggle-soft-mode' }

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'connect':
      return { ...state, status: 'ready', selectedDeviceId: state.selectedDeviceId ?? fakeDevices[0].id, lastEvent: 'Fake device connected. Select Start when ready.' }
    case 'disconnect':
      return { ...initialSessionState, selectedAlgorithmId: state.selectedAlgorithmId, lastEvent: 'Device disconnected.' }
    case 'select-device':
      return { ...state, selectedDeviceId: action.deviceId, lastEvent: 'Selected fake device.' }
    case 'select-algorithm':
      return { ...state, selectedAlgorithmId: action.algorithmId, lastEvent: 'Selected algorithm.' }
    case 'toggle-run':
      if (state.status !== 'ready' && state.status !== 'running') return state
      return { ...state, status: state.status === 'running' ? 'ready' : 'running', lastEvent: state.status === 'running' ? 'Session paused.' : 'Session started (command engine pending).' }
    case 'stop-reset':
      return { ...state, status: state.selectedDeviceId ? 'ready' : 'idle', closeness: 1, intensityScale: 0.5, softMode: false, lastEvent: 'Stop and reset requested.' }
    case 'reset-session':
      return { ...state, status: state.selectedDeviceId ? 'ready' : 'idle', closeness: 1, intensityScale: 0.5, softMode: false, lastEvent: 'Session reset requested.' }
    case 'set-closeness': return { ...state, closeness: action.closeness }
    case 'set-intensity': return { ...state, intensityScale: action.intensityScale }
    case 'toggle-soft-mode': return { ...state, softMode: !state.softMode }
  }
}
