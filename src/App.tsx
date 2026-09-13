import { useEffect, useReducer } from 'react'

import { InputController } from './input/InputController'
import { algorithms, fakeDevices, initialSessionState, sessionReducer } from './state/sessionState'
import './App.css'

const closenessLabels = ['Far', 'Approaching', 'Close', 'Very close', 'At edge']

function App() {
  const [session, dispatch] = useReducer(sessionReducer, initialSessionState)
  const ready = session.status === 'ready' || session.status === 'running'
  const running = session.status === 'running'

  useEffect(() => {
    const controller = new InputController({
      stopReset: () => dispatch({ type: 'stop-reset' }),
      startPause: () => dispatch({ type: 'toggle-run' }),
      intensityDown: () => dispatch({ type: 'set-intensity', intensityScale: Math.max(0, session.intensityScale - 0.05) }),
      intensityUp: () => dispatch({ type: 'set-intensity', intensityScale: Math.min(1, session.intensityScale + 0.05) }),
      closenessDown: () => dispatch({ type: 'set-closeness', closeness: Math.max(1, session.closeness - 1) as 1 | 2 | 3 | 4 | 5 }),
      closenessUp: () => dispatch({ type: 'set-closeness', closeness: Math.min(5, session.closeness + 1) as 1 | 2 | 3 | 4 | 5 }),
      resetSession: () => dispatch({ type: 'reset-session' }),
    })
    controller.attach()
    return () => controller.detach()
  }, [session.closeness, session.intensityScale])

  return (
    <main className="app-shell">
      <header><div><p className="eyebrow">Local-only control surface</p><h1>Edger</h1></div><span className={`status status-${session.status}`}>{session.status}</span></header>
      <section className="panel split"><div><h2>Connection</h2><p>Development mode uses an in-memory fake device. No hardware is contacted.</p></div><button className="secondary" onClick={() => dispatch({ type: ready ? 'disconnect' : 'connect' })}>{ready ? 'Disconnect' : 'Connect fake device'}</button></section>
      <div className="grid">
        <section className="panel"><h2>Device</h2><label>Selected device<select value={session.selectedDeviceId ?? ''} disabled={!ready} onChange={(event) => dispatch({ type: 'select-device', deviceId: event.target.value })}>{!session.selectedDeviceId && <option value="">Connect to choose</option>}{fakeDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label><p className="hint">{fakeDevices.find((device) => device.id === session.selectedDeviceId)?.capabilities ?? '—'}</p></section>
        <section className="panel"><h2>Algorithm</h2><label>Pattern<select value={session.selectedAlgorithmId} onChange={(event) => dispatch({ type: 'select-algorithm', algorithmId: event.target.value })}>{algorithms.map((algorithm) => <option key={algorithm.id} value={algorithm.id}>{algorithm.name}</option>)}</select></label><p className="hint">Engine wiring arrives in the next task.</p></section>
      </div>
      <section className="panel split"><div><h2>Session</h2><p>Start is unavailable until a device is ready.</p></div><div className="buttons"><button disabled={!ready} onClick={() => dispatch({ type: 'toggle-run' })}>{running ? 'Pause' : 'Start'}</button><button className="stop" onClick={() => dispatch({ type: 'stop-reset' })}>Stop &amp; reset <kbd>Esc</kbd></button></div></section>
      <section className="panel split"><div><h2>Closeness</h2><p className="closeness" aria-live="polite">{session.closeness} <span>{closenessLabels[session.closeness - 1]}</span></p></div><div className="buttons" aria-label="Set closeness level">{[1, 2, 3, 4, 5].map((level) => <button className={level === session.closeness ? 'selected' : 'level'} key={level} onClick={() => dispatch({ type: 'set-closeness', closeness: level as 1 | 2 | 3 | 4 | 5 })}>{level}</button>)}</div></section>
      <section className="panel intensity"><label><span>Intensity scale</span><output>{Math.round(session.intensityScale * 100)}%</output><input max="1" min="0" onChange={(event) => dispatch({ type: 'set-intensity', intensityScale: Number(event.target.value) })} step="0.05" type="range" value={session.intensityScale} /></label><label className="check"><input checked={session.softMode} onChange={() => dispatch({ type: 'toggle-soft-mode' })} type="checkbox" />Soft mode</label></section>
      <aside className="event" aria-live="polite"><strong>Session event</strong><span>{session.lastEvent}</span></aside>
      <p className="shortcut-help">Keyboard: Space start/pause · Esc stop/reset · A/D intensity · [ / ] closeness · R reset</p>
    </main>
  )
}

export default App
