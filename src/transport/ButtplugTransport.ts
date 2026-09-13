import {
  ButtplugBrowserWebsocketClientConnector,
  ButtplugClient,
  ButtplugError,
  DeviceOutput,
  InputType,
  OutputType,
  type DeviceOutputCommand,
} from 'buttplug'

import type { DeviceCapabilities, DeviceCommand, DeviceFeature } from '../engine/types'
import type { IntifaceTransport } from './IntifaceTransport'

/** The subset of `ButtplugClientDevice` this transport depends on. */
export interface ButtplugDeviceLike {
  readonly index: number
  readonly name: string
  hasOutput(type: OutputType): boolean
  hasInput(type: InputType): boolean
  runOutput(command: DeviceOutputCommand): Promise<void>
  stop(): Promise<void>
}

/** Maps a Buttplug output-capable device onto our normalized `DeviceCapabilities`. */
function computeCapabilities(device: ButtplugDeviceLike): DeviceCapabilities {
  const features: DeviceFeature[] = []
  // DeviceOutput.PositionWithDuration (what buildOutputCommands sends below) always
  // produces an OutputType.HwPositionWithDuration command — a distinct output type
  // from plain OutputType.Position (which takes no duration and this project's
  // DeviceCommand has no field for) — see BUTTPLUG_API_NOTES.md.
  if (device.hasOutput(OutputType.HwPositionWithDuration)) features.push('linear')
  if (device.hasOutput(OutputType.Vibrate)) features.push('vibration')
  if (device.hasOutput(OutputType.Rotate)) features.push('rotation')
  if (device.hasOutput(OutputType.Oscillate)) features.push('oscillation')
  if (device.hasOutput(OutputType.Constrict)) features.push('constriction')

  return { features, supportsStop: true }
}

const defaultLinearMoveDurationMs = 500

/**
 * Sends a normalized `DeviceCommand` to a Buttplug device, mapping each
 * field onto the output type it actually corresponds to and silently
 * dropping fields the device's capabilities don't support. `vibration`
 * takes priority over `intensity` when both are set (nothing in this
 * project currently sets both); for a vibration-only device, `intensity`
 * acts as the vibration strength — see BUTTPLUG_API_NOTES.md.
 */
function buildOutputCommands(command: DeviceCommand, capabilities: DeviceCapabilities): DeviceOutputCommand[] {
  const outputs: DeviceOutputCommand[] = []

  const vibrationValue = command.vibration ?? command.intensity
  if (capabilities.features.includes('vibration') && vibrationValue !== undefined) {
    outputs.push(DeviceOutput.Vibrate.percent(vibrationValue))
  }

  if (capabilities.features.includes('rotation') && command.speed !== undefined) {
    outputs.push(DeviceOutput.Rotate.percent(command.speed))
  }

  if (capabilities.features.includes('linear') && command.position !== undefined) {
    outputs.push(DeviceOutput.PositionWithDuration.percent(command.position, command.durationMs ?? defaultLinearMoveDurationMs))
  }

  return outputs
}

/**
 * The subset of `ButtplugClient` this transport depends on. Narrowing to an
 * interface (rather than depending on the concrete class directly) lets
 * tests inject a scripted double instead of driving a real WebSocket
 * connection to an Intiface server.
 */
export interface ButtplugClientLike {
  readonly devices: ReadonlyMap<number, ButtplugDeviceLike>
  connect(connector: unknown): Promise<void>
  disconnect(): Promise<void>
  startScanning(): Promise<void>
  stopScanning(): Promise<void>
  stopAllDevices(): Promise<void>
  addListener(event: 'deviceadded' | 'deviceremoved', listener: (device: ButtplugDeviceLike) => void): void
  addListener(event: 'disconnect' | 'scanningfinished', listener: () => void): void
  removeListener(event: 'scanningfinished', listener: () => void): void
}

export interface ButtplugTransportDevice {
  readonly index: number
  readonly name: string
  readonly capabilities: DeviceCapabilities
}

export interface ButtplugTransportOptions {
  clientName?: string
  scanTimeoutMs?: number
  createClient?: (clientName: string) => ButtplugClientLike
  createConnector?: (url: string) => unknown
}

const defaultScanTimeoutMs = 4000

/**
 * The only file allowed to import the `buttplug` client library, per the
 * architecture's transport-isolation rule. This owns the WebSocket
 * connection lifecycle and device discovery only; translating our
 * normalized `DeviceCommand` into Buttplug output commands is capability
 * mapping and belongs to the device-adapter layer built on top of this in a
 * later task.
 */
export class ButtplugTransport implements IntifaceTransport {
  private readonly url: string
  private readonly clientName: string
  private readonly scanTimeoutMs: number
  private readonly createClient: (clientName: string) => ButtplugClientLike
  private readonly createConnector: (url: string) => unknown
  private client?: ButtplugClientLike
  private devices = new Map<number, ButtplugDeviceLike>()
  private selectedIndex?: number

  constructor(url: string, options: ButtplugTransportOptions = {}) {
    this.url = url
    this.clientName = options.clientName ?? 'Edger'
    this.scanTimeoutMs = options.scanTimeoutMs ?? defaultScanTimeoutMs
    this.createClient = options.createClient ?? ((name) => new ButtplugClient(name))
    this.createConnector = options.createConnector ?? ((address) => new ButtplugBrowserWebsocketClientConnector(address))
  }

  async connect(): Promise<void> {
    const client = this.createClient(this.clientName)
    client.addListener('deviceadded', (device) => this.devices.set(device.index, device))
    client.addListener('deviceremoved', (device) => {
      this.devices.delete(device.index)
      if (this.selectedIndex === device.index) this.selectedIndex = undefined
    })
    client.addListener('disconnect', () => {
      this.client = undefined
      this.devices.clear()
      this.selectedIndex = undefined
    })

    try {
      await client.connect(this.createConnector(this.url))
    } catch (error) {
      throw this.describeError(`connect to Intiface at ${this.url}`, error)
    }

    this.client = client
  }

  async disconnect(): Promise<void> {
    if (!this.client) return

    try {
      await this.client.disconnect()
    } catch (error) {
      throw this.describeError('disconnect from Intiface', error)
    } finally {
      this.client = undefined
      this.devices.clear()
      this.selectedIndex = undefined
    }
  }

  async listDevices(): Promise<readonly ButtplugTransportDevice[]> {
    const client = this.requireClient()

    try {
      await client.startScanning()
      await this.waitForScanEnd(client)
    } catch (error) {
      throw this.describeError('scan for devices', error)
    }

    return Array.from(this.devices.values(), (device) => this.toTransportDevice(device))
  }

  /** Explicitly selects which discovered device subsequent commands target. */
  selectDeviceByIndex(index: number): void {
    if (!this.devices.has(index)) throw new Error(`Unknown Buttplug device index: ${index}`)
    this.selectedIndex = index
  }

  async selectDevice(): Promise<ButtplugTransportDevice> {
    return this.toTransportDevice(this.requireSelectedDevice())
  }

  async sendNormalizedCommand(command: DeviceCommand, capabilities: DeviceCapabilities): Promise<void> {
    const device = this.requireSelectedDevice()
    const outputs = buildOutputCommands(command, capabilities)
    if (outputs.length === 0) return

    try {
      await Promise.all(outputs.map((output) => device.runOutput(output)))
    } catch (error) {
      throw this.describeError('send a command', error)
    }
  }

  async stopAll(): Promise<void> {
    const client = this.requireClient()

    try {
      await client.stopAllDevices()
    } catch (error) {
      throw this.describeError('stop all devices', error)
    }
  }

  private waitForScanEnd(client: ButtplugClientLike): Promise<void> {
    return new Promise((resolve) => {
      const onFinished = (): void => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        client.removeListener('scanningfinished', onFinished)
        void client.stopScanning().catch(() => {})
        resolve()
      }, this.scanTimeoutMs)

      client.addListener('scanningfinished', onFinished)
    })
  }

  private requireClient(): ButtplugClientLike {
    if (!this.client) throw new Error('Buttplug transport is not connected')
    return this.client
  }

  private requireSelectedDevice(): ButtplugDeviceLike {
    const [firstIndex] = this.devices.keys()
    const index = this.selectedIndex ?? firstIndex
    const device = index === undefined ? undefined : this.devices.get(index)
    if (!device) throw new Error('No Buttplug device selected')
    return device
  }

  private toTransportDevice(device: ButtplugDeviceLike): ButtplugTransportDevice {
    return { index: device.index, name: device.name, capabilities: computeCapabilities(device) }
  }

  private describeError(action: string, error: unknown): Error {
    if (error instanceof ButtplugError) return new Error(`Failed to ${action}: ${error.message}`)
    if (error instanceof Error) return new Error(`Failed to ${action}: ${error.message}`)
    return new Error(`Failed to ${action}: ${String(error)}`)
  }
}
