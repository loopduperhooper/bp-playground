import { useEffect, useReducer, useRef, useState } from 'react'

import { algorithmDescriptors, createAlgorithm } from './algorithms/AlgorithmRegistry'
import type { DeviceAdapter } from './devices/DeviceAdapter'
import { FakeDeviceAdapter } from './devices/adapters/FakeDeviceAdapter'
import { IntifaceDeviceAdapter } from './devices/adapters/IntifaceDeviceAdapter'
import { ControlEngine, type EngineTickDiagnostics } from './engine/ControlEngine'
import type { DeviceCommand } from './engine/types'
import { InputController } from './input/InputController'
import { SafetyController } from './safety/SafetyController'
import { defaultSafetyPolicy } from './safety/SafetyPolicy'
import { fakeDeviceCapabilities, fakeDevices, initialSessionState, sessionReducer } from './state/sessionState'
import { ButtplugTransport } from './transport/ButtplugTransport'
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

/** Renders only the `DeviceCommand` fields actually set, so an unsupported field reads as absent rather than 0. */
function formatCommand(command: DeviceCommand): string {
  const parts: string[] = []
  if (command.position !== undefined) parts.push(`position ${command.position.toFixed(2)}`)
  if (command.speed !== undefined) parts.push(`speed ${command.speed.toFixed(2)}`)
  if (command.intensity !== undefined) parts.push(`intensity ${command.intensity.toFixed(2)}`)
  if (command.vibration !== undefined) parts.push(`vibration ${command.vibration.toFixed(2)}`)
  if (command.durationMs !== undefined) parts.push(`duration ${Math.round(command.durationMs)}ms`)
  if (command.reason) parts.push(`reason ${command.reason}`)
  return parts.length > 0 ? parts.join(' · ') : 'No fields set'
}

function formatDebug(debug: Readonly<Record<string, number | string | boolean>>): string {
  const entries = Object.entries(debug)
  if (entries.length === 0) return '—'
  return entries.map(([key, value]) => `${key} ${typeof value === 'number' ? value.toFixed(3) : String(value)}`).join(' · ')
}

type TransportMode = 'fake' | 'intiface'

function buildSafety(device: DeviceAdapter, isSoftMode: () => boolean): SafetyController {
  return new SafetyController({
    policy: defaultSafetyPolicy,
    isDeviceReady: () => device.isReady(),
    getCapabilities: () => device.getCapabilities(),
    isSoftMode,
  })
}

function buildFakeRuntime(isSoftMode: () => boolean) {
  const transport = new FakeTransport(
    fakeDevices.map((device) => ({
      id: device.id,
      name: device.name,
      capabilities: fakeDeviceCapabilities[device.id],
    })),
  )
  const device = new FakeDeviceAdapter(transport)
  return { transport, device, safety: buildSafety(device, isSoftMode) }
}

/**
 * Builds a runtime backed by a real Buttplug/Intiface connection instead of
 * the in-memory fake. `IntifaceDeviceAdapter.connect()` auto-selects the
 * first discovered device (see its implementation) — a deliberate
 * single-device simplification for this prototype rather than a full
 * multi-device picker.
 */
function buildIntifaceRuntime(url: string, isSoftMode: () => boolean) {
  const transport = new ButtplugTransport(url)
  const device = new IntifaceDeviceAdapter(transport)
  return { transport, device, safety: buildSafety(device, isSoftMode) }
}

function App() {
  const [session, dispatch] = useReducer(sessionReducer, initialSessionState)
  const ready = session.status === 'ready' || session.status === 'running'
  const running = session.status === 'running'
  const [transportMode, setTransportMode] = useState<TransportMode>('fake')
  const [intifaceUrl, setIntifaceUrl] = useState('ws://127.0.0.1:12345')
  const [diagnostics, setDiagnostics] = useState<EngineTickDiagnostics | null>(null)
  const [lastError, setLastError] = useState<{ message: string; context: 'connect' | 'run'; at: number } | null>(null)

  const sessionRef = useRef(session)
  sessionRef.current = session

  const runtimeRef = useRef<{
    mode: TransportMode
    transport: FakeTransport | ButtplugTransport
    device: DeviceAdapter
    engine: ControlEngine
  } | null>(null)

  if (!runtimeRef.current || runtimeRef.current.mode !== transportMode) {
    const { transport, device, safety } = transportMode === 'fake'
      ? buildFakeRuntime(() => softModeEnabled)
      : buildIntifaceRuntime(intifaceUrl, () => softModeEnabled)
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
      {
        onTick: (entry) => setDiagnostics(entry),
        onError: (message) => setLastError({ message, context: 'run', at: Date.now() }),
      },
    )
    runtimeRef.current = { mode: transportMode, transport, device, engine }
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
            setLastError(null)
          } catch (error) {
            setLastError({ message: error instanceof Error ? error.message : String(error), context: 'run', at: Date.now() })
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
      setDiagnostics(null)
      setLastError(null)
    } else {
      try {
        await device.connect()
        dispatch({ type: 'connect' })
        setLastError(null)
      } catch (error) {
        setLastError({ message: error instanceof Error ? error.message : String(error), context: 'connect', at: Date.now() })
      }
    }
  }

  const handleSelectDevice = (deviceId: string) => {
    if (!(transport instanceof FakeTransport)) return
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
        setLastError(null)
      } catch (error) {
        setLastError({ message: error instanceof Error ? error.message : String(error), context: 'run', at: Date.now() })
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
      <section className="panel">
        <h2>Connection</h2>
        <div className="buttons" role="group" aria-label="Transport">
          <button className={transportMode === 'fake' ? 'selected' : 'level'} aria-pressed={transportMode === 'fake'} disabled={ready} onClick={() => setTransportMode('fake')}>Fake device</button>
          <button className={transportMode === 'intiface' ? 'selected' : 'level'} aria-pressed={transportMode === 'intiface'} disabled={ready} onClick={() => setTransportMode('intiface')}>Real Intiface</button>
        </div>
        {transportMode === 'fake' ? (
          <p className="hint">In-memory fake device. No hardware is contacted.</p>
        ) : (
          <label>Server URL<input type="text" value={intifaceUrl} disabled={ready} onChange={(event) => setIntifaceUrl(event.target.value)} /></label>
        )}
        <div className="buttons">
          <button className="secondary" onClick={() => void handleConnectToggle()}>{ready ? 'Disconnect' : transportMode === 'fake' ? 'Connect fake device' : 'Connect'}</button>
        </div>
      </section>
      <div className="grid">
        <section className="panel"><h2>Device</h2>{transportMode === 'fake' ? (
          <>
            <label>Selected device<select value={session.selectedDeviceId ?? ''} disabled={!ready || running} onChange={(event) => handleSelectDevice(event.target.value)}>{!session.selectedDeviceId && <option value="">Connect to choose</option>}{fakeDevices.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <p className="hint">{fakeDevices.find((option) => option.id === session.selectedDeviceId)?.capabilities ?? '—'}</p>
          </>
        ) : (
          <p className="hint">{ready ? `Connected via Intiface · ${device.getCapabilities().features.join(', ') || 'no known outputs'}` : 'Connect to auto-select the first discovered Intiface device.'}</p>
        )}</section>
        <section className="panel"><h2>Algorithm</h2><label>Pattern<select value={session.selectedAlgorithmId} onChange={(event) => handleSelectAlgorithm(event.target.value)}>{algorithmDescriptors.map((algorithm) => <option key={algorithm.id} value={algorithm.id}>{algorithm.name}</option>)}</select></label><p className="hint">{algorithmDescriptors.find((algorithm) => algorithm.id === session.selectedAlgorithmId)?.description ?? 'Runs through the bounded control engine and safety layer.'}</p></section>
      </div>
      <section className="panel split"><div><h2>Session</h2><p>Start is unavailable until a device is ready.</p></div><div className="buttons"><button disabled={!ready} aria-pressed={running} onClick={handleToggleRun}>{running ? 'Pause' : 'Start'} <kbd>Space</kbd></button><button className="stop" onClick={handleStopReset}>Stop &amp; reset <kbd>Esc</kbd></button></div></section>
      <section className="panel split"><div><h2>Closeness <kbd>A</kbd> <kbd>D</kbd></h2><p className="closeness" aria-live="polite" data-testid="closeness-value">{session.closeness} <span>{closenessLabels[session.closeness - 1]}</span></p></div><div className="buttons" role="group" aria-label="Set closeness level">{[1, 2, 3, 4, 5].map((level) => <button className={level === session.closeness ? 'selected' : 'level'} aria-pressed={level === session.closeness} aria-label={`Closeness ${level}: ${closenessLabels[level - 1]}`} key={level} onClick={() => dispatch({ type: 'set-closeness', closeness: level as 1 | 2 | 3 | 4 | 5 })}>{level}</button>)}</div></section>
      <section className="panel">
        <h2>Diagnostics</h2>
        <dl className="diagnostics">
          <div><dt>Transport</dt><dd>{transportMode === 'fake' ? 'Fake device' : 'Real Intiface'} · {ready ? 'connected' : 'not connected'}</dd></div>
          <div><dt>Session</dt><dd>{session.status}</dd></div>
          <div><dt>Last safe command</dt><dd data-testid="diagnostics-command">{diagnostics ? formatCommand(diagnostics.command) : '—'}</dd></div>
          <div><dt>At</dt><dd>{diagnostics ? formatEventTime(diagnostics.at) : '—'}</dd></div>
          <div><dt>Algorithm debug</dt><dd data-testid="diagnostics-debug">{diagnostics?.debug ? formatDebug(diagnostics.debug) : '—'}</dd></div>
        </dl>
        {lastError && (
          <p className="diagnostics-error" role="alert" data-testid="diagnostics-error">
            {lastError.message}
            {lastError.context === 'connect' ? ' — check the server is running and reachable, then try Connect again.' : ' — press Stop & reset, then Start again.'}
          </p>
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
