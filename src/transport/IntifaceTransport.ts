import type { DeviceCapabilities, DeviceCommand } from '../engine/types'

/**
 * The only boundary that will know the concrete Buttplug client API.
 */
export interface IntifaceTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  listDevices(): Promise<readonly unknown[]>
  selectDevice(): Promise<unknown>
  sendNormalizedCommand(
    command: DeviceCommand,
    capabilities: DeviceCapabilities,
  ): Promise<void>
  stopAll(): Promise<void>
}
