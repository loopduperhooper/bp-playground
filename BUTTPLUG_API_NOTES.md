# Buttplug JS client API notes (E2-01)

Research for Milestone 2 (Intiface integration), gathered from primary sources
only (npm registry metadata, the `buttplug-js` GitHub repo's README and
`examples/web/*.js`). The archived `intiface/buttplug-playground` project is
**not** used as an API source — it predates this API and is a behavioral
reference only (see `TASKS.md`).

## Package decision

Pin **`buttplug@^5.0.1`** (`npm i buttplug`).

- Source: `https://registry.npmjs.org/buttplug/latest` (fetched 2026-09-12).
  `version: "5.0.1"`, `dependencies: { ws: "^8.20.1", eventemitter3: "^5.0.4" }`,
  no `engines` field, no bundler-specific `exports`/`browser` field — the
  package publishes separate CJS (`dist/main`), UMD, and ES module
  (`dist/web/buttplug.mjs`) builds instead (per its README's "Compilation
  information" section). Vite/our bundler setup should resolve the package's
  `main`/`types` fields for the Node/bundler build fine; no special config
  found to be required.
- Repo: `https://github.com/buttplugio/buttplug-js` (BSD-3-Clause). This is
  the official reference client from the Buttplug/Intiface project itself,
  and is what Intiface Central/Engine are built to support directly.

**Alternative considered and rejected for now**: the `buttplug-js` README
itself points to a community fork, `@zendrex/buttplug.js` ("Modern
TypeScript client for the Buttplug protocol v4", currently `0.5.0`,
deps: `zod`, `emittery`), saying "We highly recommend checking out [it] ...
that may be ... more features" and that `buttplug-js` itself is "really just
a reference version we keep for documentation." We are staying on the
official `buttplug` package for E2 because: it's what Intiface Central is
guaranteed to interoperate with, it has no heavier dependencies (`zod`), and
its 5.0.1 versioning signals more real-world usage than the fork's 0.5.0.
**Revisit this if the official package is ever deprecated or Intiface Central
drops support for it** — re-check both packages' npm pages before then.

## Connecting

```js
import {
  ButtplugClient,
  ButtplugBrowserWebsocketClientConnector,
} from 'buttplug' // or the CDN ESM build in a plain HTML context

const client = new ButtplugClient('Edger') // display name shown in Intiface Central

// Register listeners BEFORE connecting so you don't miss devices already
// connected to the server, or an immediate disconnect.
client.addListener('deviceadded', (device) => { /* ... */ })
client.addListener('deviceremoved', (device) => { /* ... */ })
client.addListener('scanningfinished', () => { /* ... */ })
client.addListener('disconnect', () => { /* connection lost, incl. ping timeout */ })

const connector = new ButtplugBrowserWebsocketClientConnector('ws://127.0.0.1:12345')
await client.connect(connector) // throws on failure — see Errors below

await client.startScanning()
// ... later:
await client.stopScanning()
await client.disconnect()
```

- Default Intiface Central address: `ws://127.0.0.1:12345` (also written as
  `ws://localhost:12345` in examples — same default port across all
  `examples/web/*.js` files). This matches our architecture brief's
  "session-only, not persisted" endpoint decision from E0-02: we can default
  the input to this value without storing it.
- For a Node context (not our case — we're browser-only per E0-02), swap in
  `ButtplugNodeWebsocketClientConnector`; "all of the API stays the same"
  (README, "Using buttplug-js with Node").
- `client.devices` is a live `Map<number, ButtplugClientDevice>` keyed by
  device index.

## Errors

All errors extend `ButtplugError` (thrown from `connect()`, `startScanning()`,
or a device command, and/or delivered via the `disconnect` event):

| Class | Cause |
| --- | --- |
| `ButtplugClientConnectorException` | Transport/connection issue: server not running, wrong address, network/SSL problem, connection dropped |
| `ButtplugInitError` | Client/server version handshake mismatch (upgrade one side) |
| `ButtplugDeviceError` | Device communication failure: disconnected, rejected command, hardware error |
| `ButtplugMessageError` | Malformed/invalid message (usually a client-library or app bug) |
| `ButtplugPingError` | Server ping timeout — connection was terminated |

```js
try {
  await client.connect(connector)
} catch (e) {
  if (e instanceof ButtplugClientConnectorException) { /* show "is Intiface running?" */ }
  else if (e instanceof ButtplugInitError) { /* version mismatch */ }
  else if (e instanceof ButtplugError) { /* other known Buttplug error */ }
  else { /* unexpected */ }
}
```

## Device capability + command API ("v4 command builder" — the examples'
own term for this generation of the *client library's* API shape; note the
package README separately states the *wire protocol* is "Version 3 Buttplug
Spec" — these are two different version numbers for two different things)

Capability introspection, per connected `ButtplugClientDevice`:

```js
device.name            // string
device.displayName     // optional user-assigned name
device.index           // number, stable per-connection device id
device.hasOutput(OutputType.Vibrate | .Rotate | .Oscillate | .Position | .Constrict | .Inflate | .Temperature | .Led)
device.hasInput(InputType.Battery | .RSSI | .Button | .Pressure)
device.features         // Map<number, Feature> — each Feature has:
                         //   .descriptor (string)
                         //   .outputs: Map<_, { type, valueRange: [min, max] }>
                         //   .inputs:  Map<_, { type, commands: string[] }>
```

Sending commands — every output type has its own builder under
`DeviceOutput`, run via the device's `runOutput`:

```js
await device.runOutput(DeviceOutput.Vibrate.percent(0.5))                 // 0..1
await device.runOutput(DeviceOutput.Rotate.percent(0.5))                  // 0..1
await device.runOutput(DeviceOutput.PositionWithDuration.percent(1.0, 500)) // position 0..1, durationMs
await device.stop()                                                        // stops all outputs on the device

if (device.hasInput(InputType.Battery)) {
  const level = await device.battery() // 0..1
}
```

This maps cleanly onto our existing normalized `DeviceCommand`
(`src/engine/types.ts`) and `DeviceCapabilities.features` list
(`'linear' | 'vibration' | 'rotation' | 'oscillation' | 'constriction'`): a
future `IntifaceTransport` implementation (`src/transport/`, per
`DeviceAdapter`'s existing seam) will need to translate between our
`DeviceFeature` union and Buttplug's `OutputType`/`InputType` enums, and
between our flat `DeviceCommand` fields and `DeviceOutput.<Type>.percent(...)`
calls. `position` maps to `DeviceOutput.PositionWithDuration`, requiring a
`durationMs` — our `DeviceCommand.durationMs` field already exists for this.
There's no `OutputType` for our `intensity` field; it isn't a Buttplug output
type; it should keep acting as our own cross-cutting multiplier applied
before mapping to whichever concrete output types the device has (matches
current `SafetyController`/algorithm behavior).

## Sources

- <https://registry.npmjs.org/buttplug/latest> — version/dependency metadata
- <https://github.com/buttplugio/buttplug-js> (README.md, BSD-3-Clause,
  "reference version" / community-fork recommendation)
- <https://github.com/buttplugio/buttplug-js/tree/master/examples/web> —
  `device-enumeration-example.js`, `device-control-example.js`,
  `device-info-example.js`, `errors-example.js`,
  `remote-connector-example.js`, `ping-timeout-example.js`
- <https://github.com/buttplugio/buttplug-js/blob/master/examples/quickstart.html>
- <https://registry.npmjs.org/@zendrex/buttplug.js/latest> — alternative
  package metadata (considered, not chosen — see above)

Not used as a source: `docs.buttplug.io`'s dev-guide pages (redirected to the
site root at fetch time, 2026-09-12 — re-check if this doc needs updating and
that path is live again) and `buttplugio.github.io/buttplug-js` (TypeDoc site
loaded but an AI summarization tool could not confirm exact per-version
method signatures from it with certainty; the GitHub example sources above
were used instead as the authoritative, version-pinned reference).
