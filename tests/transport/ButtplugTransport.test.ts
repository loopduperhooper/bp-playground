import { describe, expect, it, vi } from 'vitest'

import type { ButtplugClientLike, ButtplugDeviceLike } from '../../src/transport/ButtplugTransport'
import { ButtplugTransport } from '../../src/transport/ButtplugTransport'

type Listener = (...args: never[]) => void

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function makeFakeClient() {
  const listeners = new Map<string, Set<Listener>>()
  const devices = new Map<number, ButtplugDeviceLike>()

  const on = (event: string, listener: Listener): void => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)?.add(listener)
  }

  const off = (event: string, listener: Listener): void => {
    listeners.get(event)?.delete(listener)
  }

  const emit = (event: string, ...args: unknown[]): void => {
    for (const listener of listeners.get(event) ?? []) (listener as (...a: unknown[]) => void)(...args)
  }

  const client = {
    devices,
    connect: (connector: unknown) => client.connectImpl(connector),
    disconnect: () => client.disconnectImpl(),
    startScanning: vi.fn().mockResolvedValue(undefined),
    stopScanning: vi.fn().mockResolvedValue(undefined),
    stopAllDevices: vi.fn().mockResolvedValue(undefined),
    addListener: on as ButtplugClientLike['addListener'],
    removeListener: off as ButtplugClientLike['removeListener'],
    emit,
    connectImpl: async () => {},
    disconnectImpl: async () => {},
  }

  return client
}

describe('ButtplugTransport', () => {
  it('connects, tracks devices announced via events, and reports discovery results', async () => {
    const client = makeFakeClient()
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
    })

    await transport.connect()

    const listDevicesPromise = transport.listDevices()
    client.emit('deviceadded', { index: 0, name: 'Fake Vibrator', stop: async () => {} })
    await flushMicrotasks() // let listDevices() await past startScanning() and register its 'scanningfinished' listener
    client.emit('scanningfinished')

    const devices = await listDevicesPromise

    expect(devices).toEqual([{ index: 0, name: 'Fake Vibrator' }])
    expect(client.startScanning).toHaveBeenCalledOnce()
  })

  it('removes a device when the client reports it disconnected', async () => {
    const client = makeFakeClient()
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
    })
    await transport.connect()

    client.emit('deviceadded', { index: 1, name: 'Device A', stop: async () => {} })
    client.emit('deviceremoved', { index: 1, name: 'Device A', stop: async () => {} })

    const listDevicesPromise = transport.listDevices()
    await flushMicrotasks()
    client.emit('scanningfinished')

    await expect(listDevicesPromise).resolves.toEqual([])
  })

  it('clears device state when the underlying client disconnects unexpectedly', async () => {
    const client = makeFakeClient()
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
    })
    await transport.connect()
    client.emit('deviceadded', { index: 0, name: 'Device A', stop: async () => {} })

    client.emit('disconnect')

    await expect(transport.listDevices()).rejects.toThrow('Buttplug transport is not connected')
  })

  it('wraps a connection failure in a descriptive error', async () => {
    const client = makeFakeClient()
    client.connectImpl = async () => {
      throw new Error('ECONNREFUSED')
    }
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
    })

    await expect(transport.connect()).rejects.toThrow('Failed to connect to Intiface at ws://127.0.0.1:12345: ECONNREFUSED')
  })

  it('rejects operations before connecting', async () => {
    const transport = new ButtplugTransport('ws://127.0.0.1:12345')

    await expect(transport.listDevices()).rejects.toThrow('Buttplug transport is not connected')
    await expect(transport.stopAll()).rejects.toThrow('Buttplug transport is not connected')
  })

  it('disconnects, wraps disconnect failures, and always clears local device state', async () => {
    const client = makeFakeClient()
    client.disconnectImpl = async () => {
      throw new Error('socket already closed')
    }
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
    })
    await transport.connect()
    client.emit('deviceadded', { index: 0, name: 'Device A', stop: async () => {} })

    await expect(transport.disconnect()).rejects.toThrow('Failed to disconnect from Intiface: socket already closed')
    await expect(transport.listDevices()).rejects.toThrow('Buttplug transport is not connected')
  })

  it('stops all devices via the client and reports a wrapped error on failure', async () => {
    const client = makeFakeClient()
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
    })
    await transport.connect()

    await transport.stopAll()
    expect(client.stopAllDevices).toHaveBeenCalledOnce()

    client.stopAllDevices.mockRejectedValueOnce(new Error('device unresponsive'))
    await expect(transport.stopAll()).rejects.toThrow('Failed to stop all devices: device unresponsive')
  })

  it('falls back to a timeout when scanningfinished never fires', async () => {
    vi.useFakeTimers()
    const client = makeFakeClient()
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
      scanTimeoutMs: 1000,
    })
    await transport.connect()

    const listDevicesPromise = transport.listDevices()
    await vi.advanceTimersByTimeAsync(1000)

    await expect(listDevicesPromise).resolves.toEqual([])
    expect(client.stopScanning).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
