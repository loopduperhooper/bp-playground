import { useEffect, useReducer, useRef, useState } from 'react'

import type { Algorithm } from './algorithms/Algorithm'
import { ConstantPattern } from './algorithms/implementations/ConstantPattern'
import { FakeDeviceAdapter } from './devices/adapters/FakeDeviceAdapter'
import { ControlEngine } from './engine/ControlEngine'
import { InputController } from './input/InputController'
import { SafetyController } from './safety/SafetyController'
import { defaultSafetyPolicy } from './safety/SafetyPolicy'
import { algorithms, fakeDeviceCapabilities, fakeDevices, initialSessionState, sessionReducer } from './state/sessionState'
import { ButtplugTransport, type ButtplugTransportDevice } from './transport/ButtplugTransport'
import { FakeTransport } from './transport/FakeTransport'
import './App.css'

const closenessLabels = ['Far', 'Approaching', 'Close', 'Very close', 'At edge']

const algorithmFactories: Record<string, () => Algorithm> = {
  constant: () => new ConstantPattern(),
}

function createRuntime(isSoftMode: () => boolean) {
  const transport = new FakeTransport(
    fakeDevices.map((device) => ({
      id: device.id,
      name: device.name,
      capabilities: fakeDeviceCapabilities[device.id],
    })),
  )
  const device = new FakeDeviceAdapter(transport)
  const safety = new SafetyController({
    policy: defaultSafetyPolicy,
    isDeviceReady: () => device.isReady(),
    getCapabilities: () => device.getCapabilities(),
    isSoftMode,
  })

  return { transport, device, safety }
}

type IntifaceDiagnosticsStatus = 'idle' | 'connecting' | 'connected' | 'error'

/**
 * A self-contained diagnostic panel for the real Intiface transport,
 * independent of the fake-device session/engine above. It only connects,
 * discovers, and disconnects — it does not drive Start/Pause. Wiring a real
 * connection into the main session flow, and validating it against a real
 * Intiface service, is future work (see TASKS.md E2-04); this cannot be
 * verified against real hardware in this environment.
 */
function useIntifaceDiagnostics() {
  const [url, setUrl] = useState('ws://127.0.0.1:12345')
  const [status, setStatus] = useState<IntifaceDiagnosticsStatus>('idle')
  const [message, setMessage] = useState('')
  const [devices, setDevices] = useState<readonly ButtplugTransportDevice[]>([])
  const transportRef = useRef<ButtplugTransport | null>(null)

  useEffect(() => () => void transportRef.current?.disconnect().catch(() => {}), [])

  const connect = async () => {
    setStatus('connecting')
    setMessage('')
    const transport = new ButtplugTransport(url)
    transportRef.current = transport

    try {
      await transport.connect()
      const found = await transport.listDevices()
      setDevices(found)
      setStatus('connected')
      setMessage(found.length === 0 ? 'Connected. No devices found — turn one on and reconnect.' : `Connected. Found ${found.length} device(s).`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const disconnect = async () => {
    await transportRef.current?.disconnect().catch(() => {})
    transportRef.current = null
    setStatus('idle')
    setDevices([])
    setMessage('')
  }

  return { url, setUrl, status, message, devices, connect, disconnect }
}

function App() {
  const [session, dispatch] = useReducer(sessionReducer, initialSessionState)
  const ready = session.status === 'ready' || session.status === 'running'
  const running = session.status === 'running'
  const intiface = useIntifaceDiagnostics()

  const sessionRef = useRef(session)
  sessionRef.current = session

  const runtimeRef = useRef<{
    transport: FakeTransport
    device: FakeDeviceAdapter
    engine: ControlEngine
  } | null>(null)

  if (!runtimeRef.current) {
    const { transport, device, safety } = createRuntime(() => sessionRef.current.softMode)
    const engine = new ControlEngine(
      device,
      safety,
      algorithmFactories[sessionRef.current.selectedAlgorithmId](),
      () => ({
        closeness: sessionRef.current.closeness,
        manualIntensityScale: sessionRef.current.intensityScale,
        isRunning: sessionRef.current.status === 'running',
        random: Math.random,
      }),
    )
    runtimeRef.current = { transport, device, engine }
  }

  const { transport, device, engine } = runtimeRef.current

  useEffect(() => () => engine.stop('unmount'), [engine])

  useEffect(() => {
    const controller = new InputController({
      stopReset: () => {
        engine.stop('user-stop')
        dispatch({ type: 'stop-reset' })
      },
      startPause: () => {
        if (session.status === 'running') {
          engine.stop('pause')
        } else if (session.status === 'ready') {
          try {
            engine.start()
          } catch {
            return
          }
        }
        dispatch({ type: 'toggle-run' })
      },
      intensityDown: () => dispatch({ type: 'set-intensity', intensityScale: Math.max(0, session.intensityScale - 0.05) }),
      intensityUp: () => dispatch({ type: 'set-intensity', intensityScale: Math.min(1, session.intensityScale + 0.05) }),
      closenessDown: () => dispatch({ type: 'set-closeness', closeness: Math.max(1, session.closeness - 1) as 1 | 2 | 3 | 4 | 5 }),
      closenessUp: () => dispatch({ type: 'set-closeness', closeness: Math.min(5, session.closeness + 1) as 1 | 2 | 3 | 4 | 5 }),
      resetSession: () => {
        engine.stop('reset')
        dispatch({ type: 'reset-session' })
      },
    })
    controller.attach()
    return () => controller.detach()
  }, [session.closeness, session.intensityScale, session.status, engine])

  const handleConnectToggle = async () => {
    if (ready) {
      engine.stop('disconnect')
      await device.disconnect()
      dispatch({ type: 'disconnect' })
    } else {
      await device.connect()
      dispatch({ type: 'connect' })
    }
  }

  const handleSelectDevice = (deviceId: string) => {
    transport.selectFakeDevice(deviceId)
    dispatch({ type: 'select-device', deviceId })
    if (ready) void device.connect()
  }

  const handleSelectAlgorithm = (algorithmId: string) => {
    const factory = algorithmFactories[algorithmId]
    if (factory) engine.setAlgorithm(factory())
    dispatch({ type: 'select-algorithm', algorithmId })
    if (running) dispatch({ type: 'toggle-run' })
  }

  const handleToggleRun = () => {
    if (running) {
      engine.stop('pause')
    } else if (session.status === 'ready') {
      try {
        engine.start()
      } catch {
        return
      }
    }
    dispatch({ type: 'toggle-run' })
  }

  const handleStopReset = () => {
    engine.stop('user-stop')
    dispatch({ type: 'stop-reset' })
  }

  return (
    <main className="app-shell">
      <header><div><p className="eyebrow">Local-only control surface</p><h1>Edger</h1></div><span className={`status status-${session.status}`} data-testid="session-status">{session.status}</span></header>
      <section className="panel split"><div><h2>Connection</h2><p>Development mode uses an in-memory fake device. No hardware is contacted.</p></div><button className="secondary" onClick={() => void handleConnectToggle()}>{ready ? 'Disconnect' : 'Connect fake device'}</button></section>
      <div className="grid">
        <section className="panel"><h2>Device</h2><label>Selected device<select value={session.selectedDeviceId ?? ''} disabled={!ready || running} onChange={(event) => handleSelectDevice(event.target.value)}>{!session.selectedDeviceId && <option value="">Connect to choose</option>}{fakeDevices.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><p className="hint">{fakeDevices.find((option) => option.id === session.selectedDeviceId)?.capabilities ?? '—'}</p></section>
        <section className="panel"><h2>Algorithm</h2><label>Pattern<select value={session.selectedAlgorithmId} onChange={(event) => handleSelectAlgorithm(event.target.value)}>{algorithms.map((algorithm) => <option key={algorithm.id} value={algorithm.id}>{algorithm.name}</option>)}</select></label><p className="hint">Runs through the bounded control engine and safety layer.</p></section>
      </div>
      <section className="panel split"><div><h2>Session</h2><p>Start is unavailable until a device is ready.</p></div><div className="buttons"><button disabled={!ready} onClick={handleToggleRun}>{running ? 'Pause' : 'Start'}</button><button className="stop" onClick={handleStopReset}>Stop &amp; reset <kbd>Esc</kbd></button></div></section>
      <section className="panel split"><div><h2>Closeness</h2><p className="closeness" aria-live="polite" data-testid="closeness-value">{session.closeness} <span>{closenessLabels[session.closeness - 1]}</span></p></div><div className="buttons" aria-label="Set closeness level">{[1, 2, 3, 4, 5].map((level) => <button className={level === session.closeness ? 'selected' : 'level'} key={level} onClick={() => dispatch({ type: 'set-closeness', closeness: level as 1 | 2 | 3 | 4 | 5 })}>{level}</button>)}</div></section>
      <section className="panel intensity"><label><span>Intensity scale</span><output>{Math.round(session.intensityScale * 100)}%</output><input max="1" min="0" onChange={(event) => dispatch({ type: 'set-intensity', intensityScale: Number(event.target.value) })} step="0.05" type="range" value={session.intensityScale} /></label><label className="check"><input checked={session.softMode} onChange={() => dispatch({ type: 'toggle-soft-mode' })} type="checkbox" />Soft mode</label></section>
      <section className="panel">
        <h2>Real Intiface connection (diagnostic)</h2>
        <p className="hint">Connects to a real Intiface/Buttplug server to discover devices and their capabilities. Does not yet drive Start/Pause above.</p>
        <label>Server URL<input type="text" value={intiface.url} disabled={intiface.status === 'connecting' || intiface.status === 'connected'} onChange={(event) => intiface.setUrl(event.target.value)} /></label>
        <div className="buttons">
          <button className="secondary" disabled={intiface.status === 'connecting' || intiface.status === 'connected'} onClick={() => void intiface.connect()}>Connect &amp; discover</button>
          <button className="secondary" disabled={intiface.status !== 'connected'} onClick={() => void intiface.disconnect()}>Disconnect Intiface</button>
        </div>
        {intiface.message && <p className="hint" data-testid="intiface-message">{intiface.message}</p>}
        {intiface.devices.length > 0 && (
          <ul data-testid="intiface-devices">
            {intiface.devices.map((found) => <li key={found.index}>{found.name} — {found.capabilities.features.join(', ') || 'no known outputs'}</li>)}
          </ul>
        )}
      </section>
      <aside className="event" aria-live="polite"><strong>Session event</strong><span>{session.lastEvent}</span></aside>
      <p className="shortcut-help">Keyboard: Space start/pause · Esc stop/reset · A/D intensity · [ / ] closeness · R reset</p>
    </main>
  )
}

export default App
