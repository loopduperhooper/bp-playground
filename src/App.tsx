import { useEffect, useReducer, useRef, useState } from 'react'

import { algorithmDescriptors, createAlgorithm } from './algorithms/AlgorithmRegistry'
import { FakeDeviceAdapter } from './devices/adapters/FakeDeviceAdapter'
import { ControlEngine } from './engine/ControlEngine'
import { InputController } from './input/InputController'
import { SafetyController } from './safety/SafetyController'
import { defaultSafetyPolicy } from './safety/SafetyPolicy'
import { fakeDeviceCapabilities, fakeDevices, initialSessionState, sessionReducer } from './state/sessionState'
import { ButtplugTransport, type ButtplugTransportDevice } from './transport/ButtplugTransport'
import { FakeTransport } from './transport/FakeTransport'
import './App.css'

const closenessLabels = ['Far', 'Approaching', 'Close', 'Very close', 'At edge']

/**
 * Soft mode and intensity are pre-configured, not live UI controls — the
 * only realtime feedback/input this app exposes is closeness. Soft mode
 * fixed off; intensity fixed at full scale so each algorithm's own
 * (pre-configured) parameters are the sole intensity lever.
 */
const softModeEnabled = false
const manualIntensityScale = 1

const eventTimeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Renders an event-log timestamp as a local wall-clock time; falls back to a placeholder for the seeded `at: 0` entry. */
function formatEventTime(at: number): string {
  return at === 0 ? '—' : eventTimeFormatter.format(new Date(at))
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
    const { transport, device, safety } = createRuntime(() => softModeEnabled)
    const engine = new ControlEngine(
      device,
      safety,
      createAlgorithm(sessionRef.current.selectedAlgorithmId),
      () => ({
        closeness: sessionRef.current.closeness,
        manualIntensityScale,
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
      closenessDown: () => dispatch({ type: 'set-closeness', closeness: Math.max(1, session.closeness - 1) as 1 | 2 | 3 | 4 | 5 }),
      closenessUp: () => dispatch({ type: 'set-closeness', closeness: Math.min(5, session.closeness + 1) as 1 | 2 | 3 | 4 | 5 }),
      resetSession: () => {
        engine.stop('reset')
        dispatch({ type: 'reset-session' })
      },
    })
    controller.attach()
    return () => controller.detach()
  }, [session.closeness, session.status, engine])

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
    engine.setAlgorithm(createAlgorithm(algorithmId))
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
      <header><div><p className="eyebrow">Local-only control surface</p><h1>Edger</h1></div><span className={`status status-${session.status}`} aria-live="polite" data-testid="session-status">{session.status}</span></header>
      <section className="panel split"><div><h2>Connection</h2><p>Development mode uses an in-memory fake device. No hardware is contacted.</p></div><button className="secondary" onClick={() => void handleConnectToggle()}>{ready ? 'Disconnect' : 'Connect fake device'}</button></section>
      <div className="grid">
        <section className="panel"><h2>Device</h2><label>Selected device<select value={session.selectedDeviceId ?? ''} disabled={!ready || running} onChange={(event) => handleSelectDevice(event.target.value)}>{!session.selectedDeviceId && <option value="">Connect to choose</option>}{fakeDevices.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><p className="hint">{fakeDevices.find((option) => option.id === session.selectedDeviceId)?.capabilities ?? '—'}</p></section>
        <section className="panel"><h2>Algorithm</h2><label>Pattern<select value={session.selectedAlgorithmId} onChange={(event) => handleSelectAlgorithm(event.target.value)}>{algorithmDescriptors.map((algorithm) => <option key={algorithm.id} value={algorithm.id}>{algorithm.name}</option>)}</select></label><p className="hint">{algorithmDescriptors.find((algorithm) => algorithm.id === session.selectedAlgorithmId)?.description ?? 'Runs through the bounded control engine and safety layer.'}</p></section>
      </div>
      <section className="panel split"><div><h2>Session</h2><p>Start is unavailable until a device is ready.</p></div><div className="buttons"><button disabled={!ready} aria-pressed={running} onClick={handleToggleRun}>{running ? 'Pause' : 'Start'} <kbd>Space</kbd></button><button className="stop" onClick={handleStopReset}>Stop &amp; reset <kbd>Esc</kbd></button></div></section>
      <section className="panel split"><div><h2>Closeness <kbd>A</kbd> <kbd>D</kbd></h2><p className="closeness" aria-live="polite" data-testid="closeness-value">{session.closeness} <span>{closenessLabels[session.closeness - 1]}</span></p></div><div className="buttons" role="group" aria-label="Set closeness level">{[1, 2, 3, 4, 5].map((level) => <button className={level === session.closeness ? 'selected' : 'level'} aria-pressed={level === session.closeness} aria-label={`Closeness ${level}: ${closenessLabels[level - 1]}`} key={level} onClick={() => dispatch({ type: 'set-closeness', closeness: level as 1 | 2 | 3 | 4 | 5 })}>{level}</button>)}</div></section>
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
      <aside className="event">
        <strong>Session history</strong>
        <p aria-live="polite" data-testid="session-event-latest">{session.eventLog[0]?.message ?? 'No events yet.'}</p>
        <ol className="event-log" data-testid="session-event-log">
          {session.eventLog.map((entry) => (
            <li key={`${entry.at}-${entry.message}`}>
              <time dateTime={new Date(entry.at).toISOString()}>{formatEventTime(entry.at)}</time> {entry.message}
            </li>
          ))}
        </ol>
      </aside>
      <p className="shortcut-help">Keyboard: <kbd>Space</kbd> start/pause · <kbd>Esc</kbd> stop/reset · <kbd>A</kbd>/<kbd>D</kbd> closeness · <kbd>R</kbd> reset</p>
    </main>
  )
}

export default App
