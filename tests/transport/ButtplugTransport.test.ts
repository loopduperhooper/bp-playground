import { OutputType } from 'buttplug'
import { describe, expect, it, vi } from 'vitest'

import type { ButtplugClientLike, ButtplugDeviceLike } from '../../src/transport/ButtplugTransport'
import { ButtplugTransport } from '../../src/transport/ButtplugTransport'

type Listener = (...args: never[]) => void

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function fakeDevice(overrides: { index?: number; name?: string; outputs?: OutputType[] } = {}) {
  const outputs = new Set(overrides.outputs ?? [])
  return {
    index: overrides.index ?? 0,
    name: overrides.name ?? 'Fake Device',
    hasOutput: (type: OutputType) => outputs.has(type),
    hasInput: () => false,
    runOutput: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }
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
    connectImpl: async (connector: unknown) => { void connector },
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
    client.emit('deviceadded', fakeDevice({ name: 'Fake Vibrator', outputs: [OutputType.Vibrate] }))
    await flushMicrotasks() // let listDevices() await past startScanning() and register its 'scanningfinished' listener
    client.emit('scanningfinished')

    const devices = await listDevicesPromise

    expect(devices).toEqual([
      { index: 0, name: 'Fake Vibrator', capabilities: { features: ['vibration'], supportsStop: true } },
    ])
    expect(client.startScanning).toHaveBeenCalledOnce()
  })

  it('removes a device when the client reports it disconnected', async () => {
    const client = makeFakeClient()
    const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
      createClient: () => client,
      createConnector: () => ({}),
    })
    await transport.connect()

    client.emit('deviceadded', fakeDevice({ index: 1, name: 'Device A' }))
    client.emit('deviceremoved', fakeDevice({ index: 1, name: 'Device A' }))

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
    client.emit('deviceadded', fakeDevice({ name: 'Device A' }))

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
    client.emit('deviceadded', fakeDevice({ name: 'Device A' }))

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

  describe('sendNormalizedCommand', () => {
    async function connectWithDevice(outputs: OutputType[]) {
      const client = makeFakeClient()
      const device = fakeDevice({ outputs })
      const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
        createClient: () => client,
        createConnector: () => ({}),
      })
      await transport.connect()
      client.emit('deviceadded', device)
      return { device, transport }
    }

    it('maps vibration to the Vibrate output and ignores fields the device does not support', async () => {
      const { device, transport } = await connectWithDevice([OutputType.Vibrate])
      const capabilities = await transport.selectDevice().then((d) => d.capabilities)

      await transport.sendNormalizedCommand({ vibration: 0.5, position: 0.9, speed: 0.3 }, capabilities)

      expect(device.runOutput).toHaveBeenCalledOnce()
      const sent = device.runOutput.mock.calls[0][0]
      expect(sent.outputType).toBe(OutputType.Vibrate)
      expect(sent.percent).toBe(0.5)
    })

    it('uses intensity as vibration strength when vibration is not set', async () => {
      const { device, transport } = await connectWithDevice([OutputType.Vibrate])
      const capabilities = await transport.selectDevice().then((d) => d.capabilities)

      await transport.sendNormalizedCommand({ intensity: 0.7 }, capabilities)

      expect(device.runOutput.mock.calls[0][0].percent).toBe(0.7)
    })

    it('prefers vibration over intensity when both are set', async () => {
      const { device, transport } = await connectWithDevice([OutputType.Vibrate])
      const capabilities = await transport.selectDevice().then((d) => d.capabilities)

      await transport.sendNormalizedCommand({ vibration: 0.9, intensity: 0.2 }, capabilities)

      expect(device.runOutput).toHaveBeenCalledOnce()
      expect(device.runOutput.mock.calls[0][0].percent).toBe(0.9)
    })

    it('maps position and duration to PositionWithDuration for linear devices', async () => {
      // DeviceOutput.PositionWithDuration always produces an OutputType.HwPositionWithDuration
      // command (confirmed from the library's own source) — a device must declare that
      // output type, not plain OutputType.Position, for our 'linear' feature to apply.
      const { device, transport } = await connectWithDevice([OutputType.HwPositionWithDuration])
      const capabilities = await transport.selectDevice().then((d) => d.capabilities)

      await transport.sendNormalizedCommand({ position: 0.8, durationMs: 250 }, capabilities)

      const sent = device.runOutput.mock.calls[0][0]
      expect(sent.outputType).toBe(OutputType.HwPositionWithDuration)
      expect(sent.percent).toBe(0.8)
      expect(sent.duration).toBe(250)
    })

    it('maps speed to the Rotate output for rotation devices', async () => {
      const { device, transport } = await connectWithDevice([OutputType.Rotate])
      const capabilities = await transport.selectDevice().then((d) => d.capabilities)

      await transport.sendNormalizedCommand({ speed: 0.4 }, capabilities)

      const sent = device.runOutput.mock.calls[0][0]
      expect(sent.outputType).toBe(OutputType.Rotate)
      expect(sent.percent).toBe(0.4)
    })

    it('sends nothing when no command field matches the device capabilities', async () => {
      const { device, transport } = await connectWithDevice([OutputType.Vibrate])
      const capabilities = await transport.selectDevice().then((d) => d.capabilities)

      await transport.sendNormalizedCommand({ position: 0.5, speed: 0.5 }, capabilities)

      expect(device.runOutput).not.toHaveBeenCalled()
    })

    it('wraps a runOutput failure in a descriptive error', async () => {
      const { device, transport } = await connectWithDevice([OutputType.Vibrate])
      const capabilities = await transport.selectDevice().then((d) => d.capabilities)
      device.runOutput.mockRejectedValueOnce(new Error('device rejected command'))

      await expect(transport.sendNormalizedCommand({ vibration: 0.5 }, capabilities)).rejects.toThrow(
        'Failed to send a command: device rejected command',
      )
    })

    it('rejects when no device is selected', async () => {
      const client = makeFakeClient()
      const transport = new ButtplugTransport('ws://127.0.0.1:12345', {
        createClient: () => client,
        createConnector: () => ({}),
      })
      await transport.connect()

      await expect(
        transport.sendNormalizedCommand({ vibration: 0.5 }, { features: ['vibration'], supportsStop: true }),
      ).rejects.toThrow('No Buttplug device selected')
    })
  })
})
