import {
  ButtplugBrowserWebsocketClientConnector,
  ButtplugClient,
  ButtplugError,
} from 'buttplug'

import type { IntifaceTransport } from './IntifaceTransport'

/** The subset of `ButtplugClientDevice` this transport depends on. */
export interface ButtplugDeviceLike {
  readonly index: number
  readonly name: string
  stop(): Promise<void>
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
    client.addListener('deviceremoved', (device) => this.devices.delete(device.index))
    client.addListener('disconnect', () => {
      this.client = undefined
      this.devices.clear()
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

    return Array.from(this.devices.values(), (device) => ({ index: device.index, name: device.name }))
  }

  async selectDevice(): Promise<ButtplugTransportDevice> {
    const [first] = this.devices.values()
    if (!first) throw new Error('No Buttplug device is available to select')
    return { index: first.index, name: first.name }
  }

  sendNormalizedCommand(): Promise<void> {
    throw new Error('ButtplugTransport.sendNormalizedCommand is implemented by the capability-mapping device adapter (E2-03), not the transport')
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

  private describeError(action: string, error: unknown): Error {
    if (error instanceof ButtplugError) return new Error(`Failed to ${action}: ${error.message}`)
    if (error instanceof Error) return new Error(`Failed to ${action}: ${error.message}`)
    return new Error(`Failed to ${action}: ${String(error)}`)
  }
}
