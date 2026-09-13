import type { DeviceCapabilities, DeviceCommand } from '../engine/types'

/**
 * Normalized device boundary used by the control engine. Implementations are
 * responsible for mapping commands to the selected device's capabilities.
 */
export interface DeviceAdapter {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isReady(): boolean
  getCapabilities(): DeviceCapabilities
  send(command: DeviceCommand): Promise<void>
  stop(): Promise<void>
}
