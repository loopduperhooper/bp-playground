import type { DeviceAdapter } from '../DeviceAdapter'
import type { DeviceCapabilities, DeviceCommand } from '../../engine/types'
import { ButtplugTransport } from '../../transport/ButtplugTransport'

/** A DeviceAdapter backed by a real Buttplug/Intiface connection via ButtplugTransport. */
export class IntifaceDeviceAdapter implements DeviceAdapter {
  private ready = false
  private capabilities?: DeviceCapabilities
  private readonly transport: ButtplugTransport

  constructor(transport: ButtplugTransport) {
    this.transport = transport
  }

  async connect(): Promise<void> {
    await this.transport.connect()
    await this.transport.listDevices()
    const device = await this.transport.selectDevice()
    this.capabilities = device.capabilities
    this.ready = true
  }

  async disconnect(): Promise<void> {
    if (this.ready) await this.stop()
    await this.transport.disconnect()
    this.capabilities = undefined
    this.ready = false
  }

  isReady(): boolean {
    return this.ready
  }

  getCapabilities(): DeviceCapabilities {
    if (!this.capabilities) throw new Error('Device is not ready')
    return this.capabilities
  }

  async send(command: DeviceCommand): Promise<void> {
    await this.transport.sendNormalizedCommand(command, this.getCapabilities())
  }

  async stop(): Promise<void> {
    if (!this.ready) return
    await this.transport.stopAll()
  }
}
