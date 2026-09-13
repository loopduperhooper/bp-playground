/** Clamp a numeric value to an inclusive range. */
export function clamp(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) {
    throw new Error('Minimum cannot be greater than maximum')
  }

  return Math.min(maximum, Math.max(minimum, value))
}
