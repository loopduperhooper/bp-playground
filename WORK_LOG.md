# Edger work log

## Handoff protocol

Add a newest-first entry for every meaningful work session. Include the task
IDs, status, summary, files changed, verification, blockers/decisions, and
the exact next action. Keep this log factual so another agent can resume
without reconstructing context.

Template:

```md
## YYYY-MM-DD — <owner/agent> — <task IDs>

- Status: `in progress` | `blocked` | `done`
- Summary:
- Files changed:
- Verification:
- Decisions / blockers:
- Next action:
```

---

## 2026-09-12 — Claude — E1-07

- Status: `done`
- Summary: Wired `SafetyController` + `ControlEngine` + `FakeDeviceAdapter` +
  `FakeTransport` into `App.tsx`. Connect/Disconnect, device selection,
  algorithm selection, Start/Pause, and Stop & reset now drive the real
  engine instead of only flipping UI session state; closeness/intensity/soft
  mode already flowed into the engine's `getInput`/`isSoftMode` callbacks via
  a `sessionRef` kept current every render. Runtime objects (transport,
  device, engine) are created once per mount via a lazy `useRef` so they
  survive re-renders; the keyboard-controller effect now also depends on
  `session.status` so its closures stay correct across start/stop.
- Files changed: `src/App.tsx` (full wiring rewrite), `src/state/sessionState.ts`
  (added `fakeDeviceCapabilities`, the real `DeviceCapabilities` backing each
  fake device, used to construct the `FakeTransport`), `tests/e2e/app.spec.ts`
  (extended smoke test to also cover connect → select device → start →
  closeness/intensity via keyboard → Escape reset → disconnect), and
  `TASKS.md`.
- Verification: ESLint passed; Vitest passed (10 files, 24 tests); `tsc -b`
  passed; Vite production build passed; Playwright Chromium passed both
  tests (shell load + full flow).
- Decisions / blockers: **Found and fixed a real bug while writing the
  browser flow test**, not a test-environment issue: `InputController`'s
  `isEditableTarget` (from E1-05) included `'button'` in its editable-tag
  exclusion list. Since a clicked `<button>` keeps browser focus after the
  click, this meant every global shortcut (Space, Escape, A/D, [/], R) went
  silently dead as soon as the user clicked *any* button in the app —
  including the app's own Start/Stop buttons — which defeats the purpose of
  hands-off global shortcuts on a safety-critical control surface. Removed
  `'button'` from that list in `src/input/InputController.ts`; `preventDefault()`
  on the shortcut keydown already suppresses the browser's native
  space-bar-activates-focused-button behavior, so no double-firing. Added a
  regression test (`tests/input/InputController.test.ts`, "still fires global
  shortcuts while a plain button has focus") so this can't silently regress
  again. Kept "Pause" as a plain engine stop (not a suspend/resume) and
  reserved a full resume-in-place behavior for later if ever needed — not
  required by any current acceptance criterion. Switching the selected
  device is only allowed while `ready` and not `running`, to avoid needing
  to define hot-swap-mid-session safety semantics before Milestone 2 exists.
  Environment notes from the E1-06 entry below still apply unchanged (Node 20
  standalone toolchain, `--no-bin-links`, pinned `jsdom@27.4.0`, and the
  `/home/dev/.local/edger-bin/vite` shim for Playwright's `webServer`).
- Next action: Begin Milestone 2 with **E2-01** — research and pin the
  current Buttplug JS client API (dependency/version, WebSocket endpoint
  configuration, discovery flow, relevant command/capability API) from
  primary sources; do not rely on the archived `buttplug-playground`'s APIs.

## 2026-09-12 — Claude — E1-06

- Status: `done`
- Summary: Added `SafetyPolicy`/`defaultSafetyPolicy`, a standalone
  `CommandLimiter`, and a `SafetyController` implementing `EngineSafety`. It
  rejects `validateAndClamp`/`canStart` while the device isn't ready or the
  session isn't running, clamps every normalized field to 0..1 and to
  `maxIntensity`/`maxSpeed`, drops `position`/`vibration` when the connected
  device's capabilities don't list `linear`/`vibration`, applies the
  soft-mode multiplier, and holds the last safe command steady when called
  inside `minimumCommandIntervalMs`.
- Files changed: `src/safety/SafetyPolicy.ts`, `src/safety/CommandLimiter.ts`,
  `src/safety/SafetyController.ts`, `tests/safety/CommandLimiter.test.ts`,
  `tests/safety/SafetyController.test.ts`,
  `tests/safety/ControlEngineSafetyIntegration.test.ts` (wires the real
  `SafetyController` into `ControlEngine` + `FakeDeviceAdapter` and asserts a
  transport failure stops the engine), `vitest.config.ts` (added
  `environment: 'jsdom'` — E1-05's `InputController` tests were silently
  failing with `window is not defined` because no DOM environment was
  configured), `src/input/InputController.ts` (replaced a parameter-property
  constructor with an explicit field; `tsconfig.app.json`'s
  `erasableSyntaxOnly` rejects that syntax and `E1-04`/`E1-05`'s `npm run
  build` had apparently never been re-verified after each other's edits —
  `tsc -b` was failing before this session's fix), and `TASKS.md`.
- Verification: ESLint passed; Vitest passed (10 files, 23 tests); `tsc -b`
  passed; Vite production build passed; Playwright Chromium smoke test
  passed (1 test).
- Decisions / blockers: This shared-folder workspace (vboxsf) still cannot
  create symlinks under any Node version, so `npm install` requires
  `--no-bin-links` here (a normal local checkout does not need this flag).
  System Node is 18.19.1, but this project's own dependencies (`jsdom`
  transitively via `whatwg-url`/`undici`, etc.) now require Node ≥20; I
  downloaded a standalone Node v20.19.0 build to `/home/dev/.local/node20`
  (outside the shared mount) and ran all tooling through it — do not rely on
  the system `/usr/bin/node`. `jsdom` is pinned to `27.4.0`; newer jsdom
  majors require Node ≥22. Playwright's Chromium browser was reinstalled to
  `/home/dev/.cache/ms-playwright` (`--with-deps` needs root and isn't
  available; the plain browser download worked without it). Because
  `--no-bin-links` skips `node_modules/.bin`, `npm run dev` can't find `vite`
  on `PATH` when Playwright's `webServer` shells out to it; I added a
  one-line `vite` wrapper script at `/home/dev/.local/edger-bin/vite` and
  prepended that directory to `PATH` — this is a workaround for the
  environment, not a project file, and shouldn't be committed anywhere.
  Kept E1-06 scoped to the safety layer itself (no `App.tsx`/UI wiring) since
  the task board explicitly reserves that wiring plus the full
  connect→start→Escape browser flow for E1-07.
- Next action: Implement E1-07 — wire `SafetyController` + `ControlEngine` +
  `FakeDeviceAdapter` into `App.tsx` so Start/Pause/Escape actually drive the
  fake device (they currently only change session UI state), then extend
  `tests/e2e/app.spec.ts` to cover connect → select → start →
  closeness/input → Escape reset.

## 2026-09-12 — Codex — E1-05

- Status: `done`
- Summary: Added a global keyboard controller for Space, Escape, A/D, [, ], and R. Editable elements and contenteditable regions retain their native key behavior; Escape, Space, and R are one-shot while held. The session reducer now has an explicit in-place reset action and the UI displays the key map.
- Files changed: `src/input/InputController.ts`, `src/App.tsx`, `src/App.css`, `src/state/sessionState.ts`, controller and reducer tests, and `TASKS.md`.
- Verification: Pending lint, unit tests, TypeScript compilation, and production build.
- Decisions / blockers: The controller invokes the session stop/reset action. The engine itself remains isolated and will be bound to the fake adapter during E1-06/E1-07 safety integration, where Escape will also cancel the command loop and issue the adapter stop.
- Next action: Implement E1-06 safety policy and command limiter, then use it to wire the fake adapter and engine into the UI.

## 2026-09-12 — Codex — E1-04

- Status: `done`
- Summary: Added `ConstantPattern` and a transport-independent
  `ControlEngine` with injected scheduler/clock seams. It emits on a bounded
  cadence, clamps elapsed deltas, resets algorithms on stop/change, and stops
  on send failures.
- Files changed: `src/algorithms/implementations/ConstantPattern.ts`,
  `src/engine/ControlEngine.ts`, associated tests, and `TASKS.md`.
- Verification: ESLint passed; Vitest passed (6 files, 10 tests); TypeScript
  compilation passed; Vite production build passed.
- Decisions / blockers: Engine safety is intentionally injected and not yet a
  full policy layer. E1-06 will supply normalized clamping, rate limits, soft
  mode, and capability enforcement. The current UI's Start action remains a
  session-state placeholder until engine wiring is completed.
- Next action: Implement E1-05 keyboard controls, then connect the engine to
  the fake adapter and UI.

## 2026-09-12 — Codex — E1-03

- Status: `done`
- Summary: Replaced the default Vite screen with a reducer-backed Edger session
  shell. It exposes explicit fake-device connection state, device and pattern
  selectors, disabled-until-ready Start/Pause, prominent Stop & Reset,
  closeness, intensity, soft mode, and an event message.
- Files changed: `src/App.tsx`, `src/App.css`, `src/index.css`,
  `src/state/sessionState.ts`, `tests/state/sessionState.test.ts`, and
  `TASKS.md`.
- Verification: ESLint passed; Vitest passed (4 files, 7 tests); TypeScript
  compilation passed; Vite production build passed.
- Decisions / blockers: Start/Pause currently changes only session UI state and
  visibly says that the command engine is pending. This deliberately cannot
  move real or fake hardware until E1-04 supplies the bounded engine.
- Next action: Implement ConstantPattern and the command-cadenced ControlEngine
  using the existing FakeDeviceAdapter.

## 2026-09-12 — Codex — E1-01, E1-02

- Status: `done`
- Summary: Added normalized domain contracts for session state, commands,
  capabilities, algorithms, devices, and transports. Implemented an in-memory
  `FakeTransport` and `FakeDeviceAdapter` for no-hardware development.
- Files changed: `src/engine/types.ts`, `src/algorithms/Algorithm.ts`,
  `src/devices/DeviceAdapter.ts`, `src/devices/adapters/FakeDeviceAdapter.ts`,
  `src/transport/IntifaceTransport.ts`, `src/transport/FakeTransport.ts`,
  `src/utils/clamp.ts`, related unit tests, and `TASKS.md`.
- Verification: ESLint passed; Vitest passed (3 files, 5 tests); TypeScript
  compilation passed; Vite production build passed.
- Decisions / blockers: All device command controls are transport-independent
  normalized values. The fake transport records copies of commands and makes
  repeated stops idempotent; it never contacts hardware.
- Next action: Implement the E1-03 session state and UI shell on top of the
  fake-device path.

## 2026-09-12 — Codex — E0-04

- Status: `done`
- Summary: Added a Vitest unit-test harness and a Playwright Chromium browser
  smoke test, along with documented commands and project-specific test configs.
- Files changed: `package.json`, `package-lock.json`, `README.md`,
  `index.html`, `vitest.config.ts`, `playwright.config.ts`,
  `tests/smoke.test.ts`, `tests/e2e/app.spec.ts`, and `TASKS.md`.
- Verification: ESLint passed; Vitest 3.2.4 passed (1 test); TypeScript
  compilation passed; Vite production build passed; Playwright Chromium passed
  the browser title smoke test (1 test). The browser binary is stored under
  `/tmp/edger-playwright-browsers` for this environment only.
- Decisions / blockers: The mounted workspace blocks symbolic and hard links,
  so npm scripts cannot run directly here from its normal `node_modules/.bin`
  layout. A normal local checkout is unaffected. This session ran the exact
  underlying tools from `/tmp/edger-dependency-store`; do not commit the
  generated dependency directory or `dist/`.
- Next action: Begin E1-01 by defining the normalized engine, algorithm, and
  device contracts.

## 2026-09-12 — Codex — E0-03

- Status: `done`
- Summary: Verified the React + TypeScript Vite scaffold using a temporary,
  project-scoped Node 20.19.0 runtime. The shared mount does not support the
  links npm normally creates in `node_modules`, so verification directly used
  the complete dependency store in `/tmp/edger-dependency-store` while running
  against the Edger source directory.
- Files changed: Added `package-lock.json`; generated ignored `node_modules`
  and `dist/` artifacts; marked E0-03 done and E0-04 in progress.
- Verification: ESLint passed; `tsc -b` passed; Vite 6.4.3 production build
  passed (32 modules transformed).
- Decisions / blockers: Node 20.19.0 is available only under
  `/tmp/edger-toolchain` in this environment. A normal developer checkout on
  a filesystem that supports symlinks can simply use `npm install` and the
  package scripts. Do not version generated dependencies or `dist/`.
- Next action: Add Vitest and Playwright configuration and a smoke test for
  E0-04.

## 2026-09-12 — Codex — E0-03

- Status: `blocked`
- Summary: The Vite source scaffold is present, but dependency installation
  could not finish in this workspace. npm repeatedly left an incomplete
  `node_modules` directory and then failed atomic rename with `ETXTBSY` on
  TypeScript. The partial directory is not a validated dependency install.
- Files changed: Added the Node engine requirement to `package.json`; updated
  `TASKS.md` and this log. A recoverable partial dependency directory was
  moved to `/tmp/edger-node_modules-incomplete-20260912`; another incomplete
  directory remains at `edger/node_modules`.
- Verification: `npm run lint` resolved the global ESLint 6.4.0 because the
  project-local install is incomplete; it consequently could not read the
  flat ESLint configuration. The currently resolved ESLint TypeScript parser
  dependencies also warn that they require Node 20.19+ (current environment:
  Node 18.19.1).
- Decisions / blockers: Updated the project minimum to **Node 20.19.0**.
  Do not treat lint or build as passing yet. Keep `node_modules` out of source
  control; after switching to Node 20.19+ in a non-contentious local
  workspace, remove the incomplete generated dependency directory, run
  `npm install`, then run `npm run lint` and `npm run build`.
- Next action: Resolve the Node/runtime workspace issue, complete E0-03
  verification, and continue with E0-04.

## 2026-09-12 — Codex — E0-02, E0-03

- Status: `in progress`
- Summary: Recorded the implementation defaults and generated the React +
  TypeScript Vite application at the project root. The scaffold has not yet
  had its dependencies installed or been verified.
- Files changed: Standard Vite scaffold (`src/`, `public/`, config files,
  `package.json`); renamed the package to `edger`; updated `TASKS.md`.
- Verification: Node 18.19.1 and npm 9.2.0 are available. Vite 6.5.0
  successfully generated the TypeScript React template.
- Decisions / blockers: Product name is **Edger**. Use npm and initially
  selected Node 18.18 or newer. Target currently supported desktop Chrome, Edge, and
  Firefox. The Intiface WebSocket endpoint is session-only in v1; it is not
  persisted until the later profiles/settings task approves local storage.
- Next action: Install the locked dependencies, run lint/build, then complete
  E0-03 and add test tooling in E0-04.

## 2026-09-12 — Codex — E0-01

- Status: `done`
- Summary: Reviewed the supplied architecture brief and created the initial
  dependency-ordered task board plus this handoff log. No application code has
  been scaffolded or executed.
- Files changed: `TASKS.md`, `WORK_LOG.md`.
- Verification: Confirmed the architecture brief is the only pre-existing
  file in `edger/`; reviewed the referenced `intiface/buttplug-playground`
  repository. It is an archived Vue.js device-connectivity test application,
  so it is recorded as a behavioral reference rather than an implementation
  base.
- Decisions / blockers: The project still needs E0-02 decisions: application
  name, supported browser target, Node/package-manager choice, and whether a
  local WebSocket endpoint can be persisted. The actual Buttplug client API
  must be researched and pinned before real Intiface integration (E2-01).
- Next action: Complete E0-02, then scaffold the React + TypeScript + Vite
  project in E0-03.
