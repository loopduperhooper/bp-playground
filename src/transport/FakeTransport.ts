import type { DeviceCapabilities, DeviceCommand } from '../engine/types'

import type { IntifaceTransport } from './IntifaceTransport'

export interface FakeTransportDevice {
  id: string
  name: string
  capabilities: DeviceCapabilities
}

/**
 * Deterministic in-memory Intiface boundary for integration tests and local
 * UI development. It sends no commands outside the browser process.
 */
export class FakeTransport implements IntifaceTransport {
  private connected = false
  private selectedDeviceId?: string
  private stopped = false
  private readonly devices: readonly FakeTransportDevice[]

  readonly commands: DeviceCommand[] = []
  stopCount = 0

  constructor(devices: readonly FakeTransportDevice[]) {
    if (devices.length === 0) {
      throw new Error('FakeTransport requires at least one device')
    }

    this.devices = devices
  }

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.selectedDeviceId = undefined
    this.stopped = false
  }

  async listDevices(): Promise<readonly FakeTransportDevice[]> {
    this.requireConnected()
    return this.devices
  }

  selectFakeDevice(deviceId: string): void {
    if (!this.devices.some((device) => device.id === deviceId)) {
      throw new Error(`Unknown fake device: ${deviceId}`)
    }

    this.selectedDeviceId = deviceId
  }

  async selectDevice(): Promise<FakeTransportDevice> {
    this.requireConnected()
    const device = this.getSelectedDevice()
    return device
  }

  async sendNormalizedCommand(
    command: DeviceCommand,
    capabilities: DeviceCapabilities,
  ): Promise<void> {
    void capabilities
    this.requireConnected()
    this.getSelectedDevice()
    this.commands.push({ ...command })
    this.stopped = false
  }

  async stopAll(): Promise<void> {
    this.requireConnected()
    this.getSelectedDevice()

    if (this.stopped) return

    this.stopped = true
    this.stopCount += 1
  }

  private getSelectedDevice(): FakeTransportDevice {
    const deviceId = this.selectedDeviceId ?? this.devices[0]?.id
    const device = this.devices.find((candidate) => candidate.id === deviceId)

    if (!device) throw new Error('No fake device selected')
    return device
  }

  private requireConnected(): void {
    if (!this.connected) throw new Error('Fake transport is not connected')
  }
}
