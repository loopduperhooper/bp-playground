import type { Algorithm } from '../Algorithm'
import type { AlgorithmInput, AlgorithmOutput } from '../../engine/types'
import { clamp } from '../../utils/clamp'

export interface EdgeCyclePatternOptions {
  /** How often the baseline cadence hops between bottom/middle/top. */
  baselineIntervalMs?: number
  /** Random range for how long baseline runs before attempting a pickup. */
  pickupMinDelayMs?: number
  pickupMaxDelayMs?: number
  /** Length of each of the three pickup segments (1min pickup = 3 segments). */
  pickupSegmentDurationMs?: number
  /** Hop interval for each of the three pickup segments, fastest last. */
  pickupSegmentIntervalsMs?: readonly [number, number, number]
  /** How long closeness must stay at 4-5 during pickup before holding. */
  holdGraceMs?: number
  /** How long the position freezes once a hold triggers. */
  holdDurationMs?: number
  intensityScale?: number
}

type Phase = 'baseline' | 'pickup' | 'hold'

const POSITIONS = [0, 0.5, 1] as const

/**
 * A slow bottom/middle/top cadence that periodically accelerates toward
 * climax, then backs off and holds still whenever the closeness input says
 * it's too close, only resuming the approach cycle once closeness drops
 * back down. See WORK_LOG.md (2026-09-13) for the interpretation of the
 * (ambiguous, verbally specified) timing rules this encodes.
 */
export class EdgeCyclePattern implements Algorithm {
  readonly id = 'edge-cycle'
  readonly name = 'Edge cycle'
  readonly description =
    'Hops between bottom/middle/top on a slow cadence, periodically accelerating toward climax and holding still when closeness says to back off.'

  private readonly baselineIntervalMs: number
  private readonly pickupMinDelayMs: number
  private readonly pickupMaxDelayMs: number
  private readonly pickupSegmentDurationMs: number
  private readonly pickupSegmentIntervalsMs: readonly [number, number, number]
  private readonly holdGraceMs: number
  private readonly holdDurationMs: number
  private readonly intensityScale: number

  private phase: Phase = 'baseline'
  private position: number = 0.5
  private phaseElapsedMs = 0
  private nextMoveInMs = 0
  /** ms remaining until the next pickup attempt; null means "wait for closeness <= 3, then roll a fresh delay". */
  private pickupCountdownMs: number | null = null
  private pickupSegment = 0
  /** phaseElapsedMs (within pickup) when closeness first read >= 4; null if not triggered this pickup. */
  private holdTriggeredAtMs: number | null = null

  constructor(options: EdgeCyclePatternOptions = {}) {
    this.baselineIntervalMs = Math.max(1, options.baselineIntervalMs ?? 2000)
    this.pickupMinDelayMs = Math.max(0, options.pickupMinDelayMs ?? 3 * 60 * 1000)
    this.pickupMaxDelayMs = Math.max(this.pickupMinDelayMs, options.pickupMaxDelayMs ?? 5 * 60 * 1000)
    this.pickupSegmentDurationMs = Math.max(1, options.pickupSegmentDurationMs ?? 20_000)
    this.pickupSegmentIntervalsMs = options.pickupSegmentIntervalsMs ?? [1000, 750, 500]
    this.holdGraceMs = Math.max(0, options.holdGraceMs ?? 1000)
    this.holdDurationMs = Math.max(1, options.holdDurationMs ?? 10_000)
    this.intensityScale = options.intensityScale ?? 0.5

    this.nextMoveInMs = this.baselineIntervalMs
  }

  reset(): void {
    this.phase = 'baseline'
    this.position = 0.5
    this.phaseElapsedMs = 0
    this.nextMoveInMs = this.baselineIntervalMs
    this.pickupCountdownMs = null
    this.pickupSegment = 0
    this.holdTriggeredAtMs = null
  }

  update(input: AlgorithmInput): AlgorithmOutput {
    this.phaseElapsedMs += input.deltaMs

    if (this.phase === 'baseline') this.advancePickupCountdown(input)
    if (this.phase === 'pickup') {
      this.advancePickupSegment()
      this.checkHoldTrigger(input)
    }
    if (this.phase === 'hold' && this.phaseElapsedMs >= this.holdDurationMs) this.enterBaseline()

    if (this.phase === 'baseline') this.applyMovementSchedule(this.baselineIntervalMs, input)
    else if (this.phase === 'pickup') this.applyMovementSchedule(this.currentPickupIntervalMs(), input)
    // 'hold': position stays frozen, no movement schedule.

    const durationMs =
      this.phase === 'hold'
        ? Math.max(1, Math.round(this.holdDurationMs - this.phaseElapsedMs))
        : Math.max(1, Math.round(this.nextMoveInMs))
    const intensity = clamp(this.intensityScale * input.manualIntensityScale, 0, 1)

    return {
      command: { position: this.position, intensity, durationMs, reason: `edge-${this.phase}` },
      debug: {
        phase: this.phase,
        pickupCountdownMs: Math.round(this.pickupCountdownMs ?? -1),
        pickupSegment: this.pickupSegment,
        phaseElapsedMs: Math.round(this.phaseElapsedMs),
      },
    }
  }

  private advancePickupCountdown(input: AlgorithmInput): void {
    if (this.pickupCountdownMs === null) {
      if (input.closeness <= 3) this.pickupCountdownMs = this.randomPickupDelayMs(input.random)
      return
    }

    this.pickupCountdownMs -= input.deltaMs
    if (this.pickupCountdownMs > 0) return

    if (input.closeness <= 3) this.enterPickup()
    else this.pickupCountdownMs = null // too close to start; wait for closeness <= 3 to reroll
  }

  private randomPickupDelayMs(random: () => number): number {
    const span = this.pickupMaxDelayMs - this.pickupMinDelayMs
    return this.pickupMinDelayMs + random() * span
  }

  private advancePickupSegment(): void {
    this.pickupSegment = Math.min(2, Math.floor(this.phaseElapsedMs / this.pickupSegmentDurationMs))
    if (this.phaseElapsedMs >= this.pickupSegmentDurationMs * 3) this.enterBaseline()
  }

  private checkHoldTrigger(input: AlgorithmInput): void {
    if (this.phase !== 'pickup') return

    if (this.holdTriggeredAtMs === null) {
      if (input.closeness >= 4) this.holdTriggeredAtMs = this.phaseElapsedMs
      return
    }

    if (this.phaseElapsedMs - this.holdTriggeredAtMs >= this.holdGraceMs) this.enterHold()
  }

  private applyMovementSchedule(intervalMs: number, input: AlgorithmInput): void {
    this.nextMoveInMs -= input.deltaMs
    while (this.nextMoveInMs <= 0) {
      this.position = this.pickOtherPosition(input.random)
      this.nextMoveInMs += intervalMs
    }
  }

  private pickOtherPosition(random: () => number): number {
    const others = POSITIONS.filter((p) => p !== this.position)
    return others[random() < 0.5 ? 0 : 1]
  }

  private currentPickupIntervalMs(): number {
    return this.pickupSegmentIntervalsMs[this.pickupSegment]
  }

  private enterPickup(): void {
    this.phase = 'pickup'
    this.phaseElapsedMs = 0
    this.pickupSegment = 0
    this.holdTriggeredAtMs = null
    this.nextMoveInMs = 0 // decide the first accelerated position immediately
  }

  private enterHold(): void {
    this.phase = 'hold'
    this.phaseElapsedMs = 0
  }

  private enterBaseline(): void {
    this.phase = 'baseline'
    this.phaseElapsedMs = 0
    this.nextMoveInMs = this.baselineIntervalMs
    this.pickupCountdownMs = null // next attempt only starts counting once closeness <= 3
  }
}
