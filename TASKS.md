# Edger task board

## How to use this board

- Work tasks in dependency order unless a task explicitly says it can run in
  parallel.
- Before starting a task, change its status to `in progress` and add a dated
  entry to `WORK_LOG.md`. When handing it off, record the branch/commit (if
  any), files changed, verification run, and unresolved questions.
- A task is complete only when its acceptance criteria are met and its work-log
  entry records the evidence.
- The product is local-first. Never add cloud telemetry, automatic device
  movement, or device-specific Bluetooth code to the browser.

Status: `not started` | `in progress` | `blocked` | `done`

## Milestone 0 — Project foundation

| ID | Status | Task | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| E0-01 | done | Capture architecture and working conventions | — | Architecture brief retained; this board and `WORK_LOG.md` exist. |
| E0-02 | done | Confirm product decisions | E0-01 | Edger; npm; Node 20.19+; current desktop Chrome, Edge, and Firefox; endpoint is session-only for v1. Details are logged. |
| E0-03 | done | Scaffold React + TypeScript + Vite application | E0-02 | React + TypeScript Vite scaffold exists; lint, TypeScript compilation, and production build passed under Node 20.19.0. |
| E0-04 | done | Establish quality tooling | E0-03 | Strict TypeScript, ESLint, Vitest, and Playwright smoke tests are configured and pass. |

## Milestone 1 — Safe fake-device vertical slice

| ID | Status | Task | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| E1-01 | done | Define normalized domain and device interfaces | E0-03 | Normalized engine, algorithm, device-adapter, transport contracts, and clamping utility compile and are unit-tested. |
| E1-02 | done | Build fake transport and fake device adapter | E1-01 | Configurable in-memory transport/device adapter connects, records commands, and exposes an idempotent stop; tests pass. |
| E1-03 | done | Implement session store and basic UI shell | E1-01 | Reducer-backed UI renders fake connection/device, algorithm, start/pause, prominent stop/reset, intensity, soft mode, and closeness state; Start is disabled until ready. |
| E1-04 | done | Implement ConstantPattern and control engine | E1-01, E1-02 | ConstantPattern and bounded-cadence engine emit only while running, clamp delta time, stop on errors, and reset cleanly; deterministic tests pass. |
| E1-05 | done | Add global keyboard controller | E1-03, E1-04 | Space, Escape, A/D, [, ], R work outside editable controls; Escape is one-shot, idempotent, cancels the engine, sends stop, and requires a fresh Start. |
| E1-06 | done | Build the safety layer and command limiter | E1-02, E1-04 | Safety clamps normalized/device limits, applies soft mode, rate-limits commands, rejects non-ready sends, and stops on command errors. Tests cover each policy. |
| E1-07 | done | Verify milestone-1 vertical slice | E1-03–E1-06 | Fake-device integration and browser smoke tests cover connect → select → start → closeness/input → Escape reset. |

## Milestone 2 — Intiface integration

| ID | Status | Task | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| E2-01 | done | Research and pin current Buttplug JS client API | E1-07 | Dependency/version, WebSocket endpoint configuration, discovery flow, and relevant command/capability API are documented from primary sources. Do not rely on the archived playground’s APIs. |
| E2-02 | done | Implement isolated Buttplug/Intiface transport wrapper | E2-01 | All client-library code stays under `src/transport`; it connects, disconnects, discovers devices, and reports meaningful errors. |
| E2-03 | not started | Implement capability mapping and device adapter | E2-02 | Linear/scalar/vibration capability mapping is explicit; unsupported command fields are safely ignored or rejected; UI displays discovered capabilities. |
| E2-04 | not started | Manually validate real-service safety behavior | E2-03 | With a local Intiface service, explicit device selection is required, connection never starts movement, and stop/disconnect/error stops the selected device. Findings and version details are logged. |

## Milestone 3 — Patterns and operator controls

| ID | Status | Task | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| E3-01 | not started | Add algorithm registry and selector | E1-07 | Algorithm changes stop/reset the current pattern and create a fresh instance; available algorithms and descriptions are shown. |
| E3-02 | not started | Implement SineWave and Ramp patterns | E3-01, E1-06 | Outputs are deterministic under test inputs, normalized, resettable, and documented. |
| E3-03 | not started | Implement RandomWalk and ClosenessAdaptive patterns | E3-01, E1-06 | Randomness is seedable in tests; closeness 1–5 behavior matches documented profiles and stays safely bounded. |
| E3-04 | not started | Finish closeness, intensity, and soft-mode experience | E1-05, E3-01 | UI provides text plus non-color-only closeness feedback, history/events, visible shortcut hints, and accessible controls. |
| E3-05 | not started | Add diagnostics and error presentation | E2-03, E3-01 | Current safe command, timestamp, transport/session state, algorithm debug values, and actionable errors are visible without exposing sensitive data. |

## Milestone 4 — Hardening and release readiness

| ID | Status | Task | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| E4-01 | not started | Add max-run timeout and recovery policy | E1-06 | Timer causes a safe stop, reports why, and requires an explicit restart; tests cover it. |
| E4-02 | not started | Expand test coverage and CI | E2-04, E3-05, E4-01 | Unit, fake-adapter integration, and Playwright flows run in CI; test instructions are documented. |
| E4-03 | not started | Add configurable shortcuts and local profiles | E4-02 | Changes validate conflicts, persist locally only when approved in E0-02, and retain a guaranteed stop/reset shortcut. |
| E4-04 | not started | Security, accessibility, and release review | E4-02, E4-03 | Local-first behavior, dependency/license review, keyboard accessibility, error handling, and a real-device stop checklist are signed off in the work log. |

## Reference notes

- The architecture source is `edging_buttplug_webapp_architecture(1).txt`.
- `intiface/buttplug-playground` is useful for testing-UI ideas, but it is an
  archived Vue application. Use it as a behavioral reference only; do not
  copy its aging dependency choices or make it the foundation of this project.
- Buttplug JS client API research and the real transport's design are
  recorded in `BUTTPLUG_API_NOTES.md` (E2-01/E2-02): pinned
  `buttplug@^5.0.1`; `src/transport/ButtplugTransport.ts` implements
  `IntifaceTransport`'s connect/disconnect/discovery for real. Its
  `sendNormalizedCommand` deliberately throws — that's E2-03's job.
- The next executable task is **E2-03**: implement capability mapping and a
  real `DeviceAdapter` on top of `ButtplugTransport` (see
  `BUTTPLUG_API_NOTES.md`'s command/capability API section for the
  `hasOutput`/`features`/`runOutput`/`DeviceOutput.*` calls this needs, and
  how they map onto our `DeviceCommand`/`DeviceCapabilities` contracts).
