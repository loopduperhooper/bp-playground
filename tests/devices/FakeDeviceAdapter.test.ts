import { describe, expect, it } from 'vitest'

import { FakeDeviceAdapter } from '../../src/devices/adapters/FakeDeviceAdapter'
import { FakeTransport } from '../../src/transport/FakeTransport'

const capabilities = {
  features: ['linear'] as const,
  minPosition: 0,
  maxPosition: 1,
  minSpeed: 0,
  maxSpeed: 1,
  supportsStop: true,
}

describe('FakeDeviceAdapter', () => {
  it('connects, emits commands, and stops idempotently', async () => {
    const transport = new FakeTransport([
      { id: 'linear-1', name: 'Fake Linear Device', capabilities },
    ])
    const adapter = new FakeDeviceAdapter(transport)

    await adapter.connect()
    await adapter.send({ position: 0.5, speed: 0.4, reason: 'test' })
    await adapter.stop()
    await adapter.stop()

    expect(adapter.isReady()).toBe(true)
    expect(adapter.getCapabilities()).toEqual(capabilities)
    expect(transport.commands).toEqual([
      { position: 0.5, speed: 0.4, reason: 'test' },
    ])
    expect(transport.stopCount).toBe(1)
  })

  it('requires connection before a command can be sent', async () => {
    const transport = new FakeTransport([
      { id: 'vibe-1', name: 'Fake Vibration Device', capabilities },
    ])
    const adapter = new FakeDeviceAdapter(transport)

    await expect(adapter.send({ vibration: 0.2 })).rejects.toThrow(
      'Device is not ready',
    )
  })
})
