/** Lifecycle states for a control session. */
export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'running'
  | 'stopping'
  | 'error'

/** A subjective, manually selected five-level session input. */
export type Closeness = 1 | 2 | 3 | 4 | 5

export type DeviceFeature =
  | 'linear'
  | 'vibration'
  | 'rotation'
  | 'oscillation'
  | 'constriction'

/**
 * The features a selected device exposes after transport-specific discovery.
 * Numeric values describe the device's native range when it is known.
 */
export interface DeviceCapabilities {
  features: readonly DeviceFeature[]
  minPosition?: number
  maxPosition?: number
  minSpeed?: number
  maxSpeed?: number
  minIntensity?: number
  maxIntensity?: number
  supportsStop: boolean
}

/**
 * A transport-independent command. Every supplied control value is normalized
 * to the inclusive range 0..1 before it reaches a device adapter.
 */
export interface DeviceCommand {
  position?: number
  speed?: number
  intensity?: number
  vibration?: number
  durationMs?: number
  reason?: string
}

/** Input supplied by the engine to a stateful algorithm on each tick. */
export interface AlgorithmInput {
  elapsedMs: number
  deltaMs: number
  closeness: Closeness
  /** Normalized user-controlled multiplier in the inclusive range 0..1. */
  manualIntensityScale: number
  isRunning: boolean
  lastCommand?: DeviceCommand
  random: () => number
}

export interface AlgorithmOutput {
  command: DeviceCommand
  debug?: Readonly<Record<string, number | string | boolean>>
}
