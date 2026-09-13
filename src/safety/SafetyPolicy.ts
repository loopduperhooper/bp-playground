/** Tunable limits enforced by {@link SafetyController} regardless of algorithm behavior. */
export interface SafetyPolicy {
  maxIntensity: number
  maxSpeed: number
  softModeMultiplier: number
  minimumCommandIntervalMs: number
}

export const defaultSafetyPolicy: SafetyPolicy = {
  maxIntensity: 1,
  maxSpeed: 1,
  softModeMultiplier: 0.5,
  minimumCommandIntervalMs: 40,
}
