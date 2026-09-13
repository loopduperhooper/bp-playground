import { OutputType } from 'buttplug'
import { describe, expect, it, vi } from 'vitest'

import { IntifaceDeviceAdapter } from '../../src/devices/adapters/IntifaceDeviceAdapter'
import type { ButtplugClientLike, ButtplugDeviceLike } from '../../src/transport/ButtplugTransport'
import { ButtplugTransport } from '../../src/transport/ButtplugTransport'

type Listener = (...args: never[]) => void

function fakeDevice(outputs: OutputType[] = [OutputType.Vibrate]) {
  const outputSet = new Set(outputs)
  return {
    index: 0,
    name: 'Fake Vibrator',
    hasOutput: (type: OutputType) => outputSet.has(type),
    hasInput: () => false,
    runOutput: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }
}

function makeFakeClient(device: ReturnType<typeof fakeDevice>) {
  const listeners = new Map<string, Set<Listener>>()
  const on = (event: string, listener: Listener): void => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)?.add(listener)
  }
  const off = (event: string, listener: Listener): void => {
    listeners.get(event)?.delete(listener)
  }

  return {
    devices: new Map<number, ButtplugDeviceLike>(),
    connect: async () => {
      // Simulate the server announcing the device once connected.
      for (const listener of listeners.get('deviceadded') ?? []) (listener as (d: unknown) => void)(device)
    },
    disconnect: async () => {},
    startScanning: async () => {
      // Defer past the microtask where ButtplugTransport registers its 'scanningfinished'
      // listener (which only happens after this method's own promise resolves).
      setTimeout(() => {
        for (const listener of listeners.get('scanningfinished') ?? []) (listener as () => void)()
      }, 0)
    },
    stopScanning: vi.fn().mockResolvedValue(undefined),
    stopAllDevices: vi.fn().mockResolvedValue(undefined),
    addListener: on as ButtplugClientLike['addListener'],
    removeListener: off as ButtplugClientLike['removeListener'],
  }
}

describe('IntifaceDeviceAdapter', () => {
  it('connects, discovers and selects the device, and exposes its computed capabilities', async () => {
    const device = fakeDevice()
    const client = makeFakeClient(device)
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', { createClient: () => client, createConnector: () => ({}) })
    const adapter = new IntifaceDeviceAdapter(transport)

    await adapter.connect()

    expect(adapter.isReady()).toBe(true)
    expect(adapter.getCapabilities()).toEqual({ features: ['vibration'], supportsStop: true })
  })

  it('sends a normalized command through the transport to the selected device', async () => {
    const device = fakeDevice()
    const client = makeFakeClient(device)
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', { createClient: () => client, createConnector: () => ({}) })
    const adapter = new IntifaceDeviceAdapter(transport)
    await adapter.connect()

    await adapter.send({ vibration: 0.6 })

    expect(device.runOutput).toHaveBeenCalledOnce()
    expect(device.runOutput.mock.calls[0][0].percent).toBe(0.6)
  })

  it('stops the device and disconnects cleanly', async () => {
    const device = fakeDevice()
    const client = makeFakeClient(device)
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', { createClient: () => client, createConnector: () => ({}) })
    const adapter = new IntifaceDeviceAdapter(transport)
    await adapter.connect()

    await adapter.stop()
    expect(client.stopAllDevices).toHaveBeenCalledOnce()

    await adapter.disconnect()
    expect(adapter.isReady()).toBe(false)
    expect(() => adapter.getCapabilities()).toThrow('Device is not ready')
  })

  it('requires a device to be ready before reading capabilities', () => {
    const device = fakeDevice()
    const client = makeFakeClient(device)
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', { createClient: () => client, createConnector: () => ({}) })
    const adapter = new IntifaceDeviceAdapter(transport)

    expect(() => adapter.getCapabilities()).toThrow('Device is not ready')
  })
})
