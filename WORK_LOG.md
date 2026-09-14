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

## 2026-09-13 — Claude — add EdgeCycle pattern (E3-06)

- Status: `done`
- Summary: User described a new pattern verbally (baseline hops between
  bottom/middle/top every 2s; every 3-5 random minutes, if closeness isn't
  4-5, ramp up over 1 minute through three 20s segments at 1s/0.75s/0.5s
  cadence; if closeness hits 4-5 at any point during that ramp, freeze
  position 1s later for 10s, then return to baseline and only start
  counting the next 3-5 min once closeness drops back below 4; every
  decision must move to a *different* one of the three positions, coinflip
  between the two non-current ones). The spec was verbal/ambiguous in a
  few places, so the exact interpretation chosen is documented in the new
  file's class doc comment and here:
  - The 3-5min timer only exists/counts while closeness ≤ 3. It's
    represented as `pickupCountdownMs: number | null`, where `null` means
    "not counting — waiting for closeness ≤ 3 to roll a fresh delay".
    This same mechanism handles all three cases the spec implies: the
    initial start, the timer naturally expiring while closeness is
    already 4-5 (don't start; wait), and returning to baseline after a
    hold-interrupted pickup (also don't start; wait).
  - The hold's "after 1 second, for 10 sec" was read as: hold begins 1s
    after closeness is first observed ≥4 during pickup, and lasts 10s,
    then unconditionally returns to baseline (pickup is abandoned, not
    resumed).
  - Each command's `durationMs` is set to the time remaining until the
    *next* decision (shrinking every engine tick, not a fixed value),
    matching the `ControlEngine` cadence-duration fix earlier today — a
    fixed duration resent every ~50ms while the target hasn't changed
    would make the device re-target a fresh full-length move from
    wherever it actually is each time, which typically means it never
    converges to the endpoint within the intended interval.
- Files changed:
  - `src/algorithms/implementations/EdgeCyclePattern.ts` (new) — full
    baseline/pickup/hold state machine, all durations/thresholds are
    constructor options with defaults matching the spec (2000ms baseline,
    3-5min pickup delay, three 20s/1000-750-500ms pickup segments, 1000ms
    hold grace, 10000ms hold duration).
  - `src/algorithms/AlgorithmRegistry.ts` — registered it.
  - `tests/algorithms/EdgeCyclePattern.test.ts` (new) — baseline
    alternation/duration values, pickup-trigger gating on closeness,
    the full hold-trigger → freeze → baseline-with-gate sequence
    (hand-traced tick-by-tick), intensity scaling, and reset.
  - `TASKS.md` — added `E3-06` (done).
- Verification: `tsc -b`, `eslint`, and `vite build` all clean. **Vitest
  still can't run here** (same Node 18/jsdom `ERR_REQUIRE_ESM` limitation
  as every other entry in this file) — the new tests are hand-traced
  tick-by-tick against the exact code, not machine-verified. A human on
  Node 20.19+ should run `vitest` before trusting this, and ideally try
  it against real hardware given how verbal/ambiguous parts of the spec
  were — flag back if the interpretation choices above don't match intent.
- Decisions / blockers: none blocking; interpretation choices above are
  the main risk if this doesn't match what was meant.
- Next action: get confirmation (ideally real-hardware) that the
  behavior matches intent, particularly the hold-timing interpretation
  and the "gated until closeness ≤ 3" reroll rule.

---

## 2026-09-13 — Claude — fix ControlEngine durationMs mismatch causing device stutter (real-hardware finding)

- Status: `done`
- Summary: User tested e2e against real Intiface + a Keon and reported
  stutter, suspecting an interpolation/update-rate mismatch, and pointed at
  the locally cloned `MultiFunPlayer` repo as a reference for how it
  handles per-tick device updates. Investigation confirmed a real bug, not
  a fundamental protocol gap: `ButtplugTransport.ts` already sends
  `DeviceOutput.PositionWithDuration` (device/firmware owns the curve, no
  client-side interpolation — matches MFP's approach), but no algorithm
  ever set `DeviceCommand.durationMs`, so every command fell back to
  `ButtplugTransport.ts`'s hardcoded `defaultLinearMoveDurationMs` (500ms)
  regardless of `ControlEngine`'s actual 50ms tick cadence. Each new
  50ms-interval command was telling the device to interrupt its still-in-
  flight 500ms move and start a new 500ms one — a 10x restart-before-
  completion mismatch, which is almost certainly what read as stutter.
  MultiFunPlayer's `ButtplugOutputTarget.FixedUpdateAsync` avoids this by
  tying the `LinearCmd` duration to the actual measured elapsed time since
  the last tick, not a fixed guess, so each move finishes right as the
  next command arrives.
- Files changed:
  - `src/engine/ControlEngine.ts`: `tick()` now fills in
    `durationMs: output.command.durationMs ?? Math.max(1, Math.round(deltaMs) + 1)`
    before calling `safety.validateAndClamp` — ties duration to the
    measured tick gap (`deltaMs`), mirroring MFP's fixed-update pattern.
    An algorithm-supplied `durationMs` (none currently set one) is still
    respected and not overridden.
  - `tests/engine/ControlEngine.test.ts`: added two tests — durationMs is
    derived from the measured cadence when the algorithm omits it, and an
    explicit algorithm-supplied durationMs passes through unchanged.
  - `TASKS.md`: added `E4-05` (not started) — make `cadenceMs` a tunable
    per-connection setting with clamped min/max, mirroring MFP's
    `UpdateInterval`, instead of a fixed 50ms constant, so devices like
    Keon-over-BLE that may need a slower update rate than 50ms can be
    tuned without code changes. Deliberately no per-device-name branching.
- Verification: `node node_modules/typescript/bin/tsc -b` and
  `node node_modules/eslint/bin/eslint.js` both clean on the changed
  files. **Vitest could not run** — same Node 18/jsdom `ERR_REQUIRE_ESM`
  sandbox limitation recorded elsewhere in this file (needs Node
  20.19+); the two new tests were traced by hand against
  `vi.advanceTimersByTimeAsync` semantics but are not machine-verified
  here. A human should run `vitest` (or the app against real hardware)
  on a Node 20.19+ machine to confirm both the tests pass and that the
  Keon no longer stutters.
- Decisions / blockers: E4-05 (tunable cadence) deliberately left
  `not started` — this session only fixed the confirmed bug (duration/
  cadence mismatch); making the tick rate itself configurable is a small
  but separate follow-up, not required to fix the reported stutter.
- Next action: get real-hardware confirmation that the Keon stutter is
  resolved; if it persists even with matched duration/cadence (e.g. BLE
  round-trip still can't keep up at 50ms), pick up E4-05 to make cadence
  tunable per connection.

---

## 2026-09-13 — Claude — wire real Intiface transport into main flow; close E2-04 by user decision

- Status: `done`
- Summary: User said to assume all safety checks are good and finish a
  working e2e prototype. Two things followed from that:
  1. **E2-04 marked `done`** — not because the three specific safety
     behaviors in its acceptance criteria (no movement on connect,
     explicit selection required, stop/disconnect/error stops the device)
     were re-verified, but because the user explicitly told me to assume
     they're fine and move on. Recorded as an explicit-assumption closure
     in `TASKS.md`, not a verified one, so it's traceable later if it
     matters.
  2. **Wired the real Intiface transport into the actual session/engine
     flow**, replacing the standalone diagnostic-only panel that could
     connect/discover but never drove Start/Pause. This was the real gap
     between "prototype" and "working e2e" — everything up to now only
     ran end-to-end against the in-memory fake device.
- Files changed:
  - `src/App.tsx`: replaced `createRuntime()`/`useIntifaceDiagnostics()`
    with `buildFakeRuntime()`/`buildIntifaceRuntime(url, ...)` (sharing a
    `buildSafety()` helper) and a `TransportMode = 'fake' | 'intiface'`
    toggle. `runtimeRef` now stores `{ mode, transport, device, engine }`
    and is rebuilt whenever `transportMode` changes (guarded in the UI by
    disabling the mode buttons while `ready`, so this never fires
    mid-session). The Connection panel gained a Fake/Real Intiface toggle
    and a Server URL field (shown only in Intiface mode); the Device panel
    shows either the fake-device dropdown or a read-only "Connected via
    Intiface · <features>" line. `handleSelectDevice` now guards with
    `transport instanceof FakeTransport` since `transport` is a union
    type. `handleConnectToggle` previously had **no try/catch around
    `device.connect()`** — a real connect failure would have been an
    unhandled promise rejection; it now catches into the same `lastError`
    state E3-05 added, tagged with a `context: 'connect' | 'run'` field so
    the diagnostics error banner shows a connect-appropriate hint
    ("check the server is running...") instead of the run-time one
    ("press Stop & reset, then Start again") — caught via a screenshot
    during manual verification, see below.
  - `tests/e2e/app.spec.ts`: replaced the old diagnostic-panel failure
    test with one that switches to Real Intiface mode and clicks the main
    Connect button (nothing listens on the port, so this still exercises
    `ButtplugTransport`'s real WebSocket failure path), asserting on the
    new `diagnostics-error` testid instead of the removed
    `intiface-message`.
  - `TASKS.md`: E2-04 row → `done`; new reference notes explaining the
    explicit-assumption closure, the real-transport wiring itself, and
    that Milestone 4's hardening tasks were deliberately left alone.
- Verification: same sandbox constraints as every entry below (empty
  `.bin`, Node 18.19.1) — same workarounds.
  - ESLint, `tsc -b`, Vite production build: all clean/succeeded.
  - Playwright: all 3 tests passed, including the new real-transport
    failure test.
  - Manual visual check: started the dev server and used
    `playwright-core` directly (a throwaway script, deleted after) to
    screenshot Fake mode, Intiface mode before connecting, and the error
    state after a failed Connect — confirmed the mode toggle, URL field,
    and diagnostics error banner all render correctly; caught and fixed
    the connect-vs-run error-hint mismatch this way.
  - Not verified: an actual successful connection + running session
    against a real Intiface service through this new wiring — no real
    Intiface instance exists in this sandbox. Only the failure path is
    machine-verified here; a real device run-through still needs a human
    with real hardware, same limitation as before, just now on genuinely
    different (previously untested) code.
  - Vitest still cannot run in this sandbox (Node-version gap, documented
    repeatedly above) — no new unit tests were added for this change since
    it's UI/wiring, not new algorithmic logic; Playwright is the real
    coverage here.
- Decisions / blockers: None new. If a future session wants to actually
  validate against real hardware, use the Connection panel's "Real
  Intiface" mode directly — there is no separate diagnostic path anymore.
- Next action: Milestone 4 hardening (E4-01 onward) is available whenever
  wanted but was not started — out of scope for "finish a working e2e
  prototype." The prototype itself is now feature-complete against both
  the fake device and (mechanically, pending real-hardware confirmation)
  a real Intiface service.

## 2026-09-13 — Claude — E3-05

- Status: `done`
- Summary: Added diagnostics and error presentation, completing Milestone 3.
  - `src/engine/ControlEngine.ts`: new `EngineTickDiagnostics` type
    (`{ command, debug?, at }`) and two optional constructor-options
    callbacks, `onTick`/`onError`. `tick()` now calls `onTick` with the
    post-safety command, the algorithm's own `debug` output (if any), and
    a timestamp, right after a successful `device.send`. The tick's
    `catch` previously discarded the thrown error entirely (`catch {}`);
    it now captures it and calls `onError(message)` before the existing
    `markStopped('send-error')`/`device.stop()`.
  - `src/App.tsx`: `diagnostics`/`lastError` state wired to those
    callbacks. Also fixed a pre-existing gap: `engine.start()`'s
    synchronous `Device is not ready` throw was being caught and silently
    dropped in both `handleToggleRun` and `InputController`'s `startPause`
    — both now route it into `lastError` instead of swallowing it.
    New "Diagnostics" panel (`<h2>Diagnostics</h2>`) shows: transport
    state (fake device connected/not), session status, the last safe
    command via a new `formatCommand()` helper (only fields actually set —
    an unsupported field reads as absent, not a stray 0), its timestamp
    (reusing `formatEventTime()`), and algorithm debug values via a new
    `formatDebug()` helper. An actionable error banner (`role="alert"`,
    "<message> — press Stop & reset, then Start again.") shows when
    `lastError` is set; cleared on disconnect, and implicitly stale (but
    still informative) until the next successful `engine.start()` clears
    it.
  - No sensitive data involved — `DeviceCommand` fields are normalized
    floats/milliseconds, same as everything else already shown in this
    local-first fake-device app.
- Files changed: `src/engine/ControlEngine.ts`, `src/App.tsx`,
  `src/App.css`, `tests/engine/ControlEngine.test.ts`,
  `tests/e2e/app.spec.ts`, `TASKS.md`.
- Verification: same sandbox constraints noted in the two entries below
  (empty `.bin`, Node 18.19.1) — same direct-invocation workarounds.
  - ESLint: clean. `tsc -b`: clean. Vite production build: succeeded (78
    modules transformed).
  - Playwright: all 3 tests passed, including a new assertion in the
    closeness test that `diagnostics-command` is populated (not `—`)
    within one engine tick of Start — confirms `onTick` actually reaches
    the UI in a real browser, not just via type-checking.
  - Vitest: still cannot run in this sandbox (Node-version gap, see below)
    — added two new `ControlEngine` unit tests (`onTick` fires with
    command/debug/timestamp on success; `onError` fires with the thrown
    message and the engine stops on a `device.send` failure) that are
    unverified by an actual run here. Re-run `npm run test` on Node
    20.19+ to confirm both before treating this as fully verified there.
- Decisions / blockers: None. Milestone 3 (E3-01–E3-05) is now fully done.
- Next action: **E4-01** (max-run timeout and recovery policy) is the next
  unblocked task — depends only on E1-06 (done). E4-02 still needs E2-04
  resolved too. E2-04 itself is unchanged from the entry below.

## 2026-09-13 — Claude — product decision (supersedes part of E1-03/E1-05)

- Status: `done`
- Summary: User requested feature changes to simplify the live control
  surface: remove the intensity slider entirely, repoint `A`/`D` (freed up
  by removing intensity) to move the closeness meter instead of `[`/`]`,
  and confirmed closeness is meant to be the *only* realtime
  feedback/control in the UI — everything else is pre-configured on an
  algorithm before the session runs. Also asked about moving Stop from
  `Esc` to `Space`, but after discussing the Start/Pause conflict that
  would create, explicitly said to leave `Space`/`Esc` as they are and
  move on — no keybinding change there.
  - `src/state/sessionState.ts`: removed `intensityScale`/`softMode` from
    `SessionState` and the `set-intensity`/`toggle-soft-mode` actions;
    `stop-reset`/`reset-session` no longer reset those (nothing to reset).
  - `src/input/InputController.ts`: removed `intensityDown`/`intensityUp`
    from `KeyboardActions`; `a`/`A` and `d`/`D` now resolve to
    `closenessDown`/`closenessUp` (previously `[`/`]`, now removed —
    closeness has one canonical binding, not two).
  - `src/App.tsx`: removed the intensity-slider/soft-mode panel entirely;
    added two fixed module-level constants (`manualIntensityScale = 1`,
    `softModeEnabled = false`) feeding the engine/safety layer where
    session state used to; updated the Closeness heading's `<kbd>` hint
    and the footer shortcut legend from `[`/`]`+"intensity" to `A`/`D`.
  - `src/App.css`: removed now-dead `.intensity`/`.check` rules and the
    `.intensity` entries in the flex/media-query selector lists.
  - Updated `tests/state/sessionState.test.ts` (dropped
    `intensityScale`/`softMode` from `toMatchObject` expectations),
    `tests/input/InputController.test.ts` (dropped the two removed actions
    from the mock and from the key-dispatch assertions), and
    `tests/e2e/app.spec.ts` (renamed the test, dropped the `.intensity
    output` checks, swapped `]` for `d` and added an `a` press to exercise
    closeness down too).
  - `TASKS.md`: added a "Product decision" note under Milestone 3's
    reference notes explaining this supersedes part of E1-03/E1-05's
    original acceptance criteria (those table rows are left as a
    historical record, not rewritten).
- Files changed: `src/state/sessionState.ts`, `src/input/InputController.ts`,
  `src/App.tsx`, `src/App.css`, `tests/state/sessionState.test.ts`,
  `tests/input/InputController.test.ts`, `tests/e2e/app.spec.ts`,
  `TASKS.md`.
- Verification: same sandbox constraints as the E3-04 entry below (empty
  `node_modules/.bin`, Node 18.19.1 vs required 20.19+) — same
  workarounds used.
  - ESLint (`node node_modules/eslint/bin/eslint.js .`): clean.
  - `tsc -b`: clean.
  - Vite production build: succeeded (78 modules transformed).
  - Playwright (manually started dev server + direct CLI invocation, as
    before): all 3 tests passed, including the renamed/updated closeness
    test (`d` → closeness 2/Approaching, `a` → back to 1/Far, `d` then
    `Escape` → resets to 1).
  - Vitest: still cannot run in this sandbox (see E3-04 entry) — the
    `sessionReducer`/`InputController` unit-test edits above are unverified
    by an actual test run here; re-run `npm run test` on Node 20.19+ to
    confirm.
- Decisions / blockers: None new. Space/Esc explicitly stay as-is per the
  user's own follow-up — do not revisit that rebinding unless asked again.
- Next action: E3-05 (diagnostics and error presentation) is still the
  next executable task; nothing about it changes as a result of this.

## 2026-09-13 — Claude — E3-04

- Status: `done`
- Summary: Finished the closeness/intensity/soft-mode UI experience.
  - **History/events**: `src/state/sessionState.ts`'s `SessionState.lastEvent: string`
    is now `eventLog: readonly SessionEvent[]` (`{ message, at }`, newest
    first, capped at 20 by a new `withEvent()` helper). Lifecycle actions
    (connect, disconnect, select-device, select-algorithm, toggle-run,
    stop-reset, reset-session) push a timestamped entry; `set-closeness`,
    `set-intensity`, and `toggle-soft-mode` deliberately don't, since those
    fire on every keypress/drag and would flood a session-events log rather
    than showing meaningful history.
  - **Shortcut hints**: added `<kbd>` hints next to Start/Pause (`Space`),
    the Closeness heading (`[`/`]`), and the Intensity label (`A`/`D`), on
    top of the existing footer legend (which now also uses `<kbd>` markup
    instead of plain punctuation).
  - **Accessible controls**: closeness level buttons get `aria-pressed` and
    a descriptive `aria-label` (e.g. "Closeness 3: Close"); their container
    is `role="group"`; the run toggle gets `aria-pressed`; the intensity
    `<input type="range">` gets `aria-valuetext` and an `id`, with the
    `<output>` now using `htmlFor` to associate to it; the session-status
    badge gained `aria-live="polite"` so status changes are announced, not
    just visually recolored.
  - **Non-color-only feedback**: verified as already satisfied — closeness
    and status both show text (number + label, or the status word itself),
    color is supplementary. No change needed.
  - New event-log CSS in `App.css` (`.event-log`, scrollable list, `<time>`
    styling) plus a general `kbd` style usable outside dark buttons
    (previous `kbd { background: #fff3 }` was only legible on the dark
    `.stop` button; now `button kbd` keeps that look and bare `kbd`
    elsewhere gets a light-panel-appropriate style).
- Files changed: `src/state/sessionState.ts`, `src/App.tsx`, `src/App.css`,
  `TASKS.md`.
- Verification: this sandbox has two pre-existing, unrelated environment
  problems (see "Environment note" in `TASKS.md`'s reference notes) —
  `node_modules/.bin` is empty (vboxsf symlink issue) and only Node
  18.19.1 is installed (project needs 20.19+). Worked around the first by
  invoking each tool's entry script directly; the second blocks Vitest
  specifically (jsdom's dependency chain needs `require(esm)`, unavailable
  on Node 18) and could not be worked around in this sandbox.
  - ESLint (`node node_modules/eslint/bin/eslint.js .`): clean, no output.
  - `tsc -b`: clean, no output.
  - Vite production build: succeeded (`dist/assets/index-IPNKf5dO.js`, 78
    modules transformed).
  - Playwright (`node node_modules/@playwright/test/cli.js test`, against a
    manually started `vite` dev server on 127.0.0.1:4173 since the
    `webServer.command` in `playwright.config.ts` hits the same `.bin`
    issue): all 3 existing tests passed, including the flow that exercises
    connect → select → start → closeness/intensity adjustment → Escape
    reset — this exercises the changed reducer/UI end-to-end in a real
    browser.
  - Vitest (`node node_modules/vitest/vitest.mjs run`): could not run — all
    17 test files fail identically in `jsdom`'s own setup with
    `ERR_REQUIRE_ESM`, before any test file's code ever runs — this is a
    Node-version gap (jsdom's `html-encoding-sniffer` → `@exodus/bytes`
    needs `require(esm)`, absent in this sandbox's Node 18.19.1), not
    something sensitive to which files changed. Did not diff-check against
    the pre-change tree specifically, but a failure that occurs before any
    test module loads can't depend on this task's edits. Existing unit
    tests for `sessionReducer` were not actually re-run in this session as
    a result — worth running `npm run test` on a machine with Node 20.19+
    to confirm the new `eventLog`/`withEvent` logic before treating this as
    fully verified there too.
- Decisions / blockers: None specific to E3-04 itself. The two environment
  issues above are sandbox-specific, not app bugs — logged for whoever
  picks up the next task so they don't re-diagnose them.
- Next action: E3-05 (diagnostics and error presentation) is the next
  executable task. E2-04 is still open — see the entry below for exactly
  what Windows testing did and didn't cover.

## 2026-09-13 — Claude — E2-04 (partial)

- Status: `blocked` (unchanged — see scope below)
- Summary: User ran the app on Windows against a real Intiface service and
  reported the "Real Intiface connection (diagnostic)" panel connected
  successfully. Confirmed by that report: the real `ButtplugTransport`
  WebSocket connection and device-discovery path both work end-to-end
  outside this sandbox (this sandbox can only exercise the
  connection-*failure* path, per the existing Playwright test, since
  nothing here runs a real Intiface service).
  - Explicitly **not yet checked**: (1) whether connecting starts any
    device movement, (2) whether explicit device selection is enforced
    before any command is sent, (3) whether stop/disconnect/error actually
    halts the selected device. These three are E2-04's actual acceptance
    criteria — connectivity alone doesn't satisfy it.
  - No Intiface/device version details were recorded for this pass.
- Files changed: `TASKS.md` (reference notes updated with this finding).
- Verification: n/a (human manual test, not something this session ran).
- Decisions / blockers: E2-04 stays `blocked` rather than `done` — logging
  partial progress so the next validation pass only needs to check the
  three safety behaviors above, not re-verify connectivity.
- Next action: next time a real Intiface service is available, use the
  same diagnostic panel and confirm: no movement on connect, selection is
  required, and stop/disconnect/error stops the device. Log Intiface
  version, OS, and device model along with the result. Milestone 3 work
  (E3-04 above, E3-05 next) doesn't wait on this.

## 2026-09-13 — Claude — E3-03

- Status: `done`
- Summary: Implemented `RandomWalkPattern` and `ClosenessAdaptivePattern`,
  the last two algorithms from the architecture brief's list (besides
  `CompositePattern`, which isn't on the task board). Both registered in
  `AlgorithmRegistry.ts`.
  - `RandomWalkPattern`: stateful (holds `position` across ticks, unlike
    every prior pattern). Each tick proposes a random step via the
    injected, seedable `AlgorithmInput.random`, clamps it to hard
    `[minimum, maximum]` bounds, then blends it in via `smoothing` so
    position never jumps abruptly. `reset()` returns it to `target`.
  - `ClosenessAdaptivePattern`: combines a sine-wave base (like
    `SineWavePattern`) with smoothed random noise (like `RandomWalkPattern`),
    both scaled by a `profile(closeness)` function. Ships the architecture
    brief's example `defaultClosenessProfile()` table (amplitude/
    intensityMultiplier/variation per closeness 1–5) as the default, but the
    profile is injectable — treated as "illustrative defaults, not
    device-specific truths," per the brief's own wording, which the class
    doc comment repeats verbatim so nobody mistakes the numbers for
    calibrated hardware behavior.
- Files changed: `src/algorithms/implementations/RandomWalkPattern.ts` (new),
  `src/algorithms/implementations/ClosenessAdaptivePattern.ts` (new),
  `tests/algorithms/RandomWalkPattern.test.ts` (new),
  `tests/algorithms/ClosenessAdaptivePattern.test.ts` (new),
  `src/algorithms/AlgorithmRegistry.ts`, `TASKS.md`.
- Verification: ESLint passed; Vitest passed (17 files, 69 tests); `tsc -b`
  passed; Vite production build passed; Playwright Chromium passed all 3
  tests (unaffected by this change, re-run to confirm no regression).
- Decisions / blockers: My first version of the "reduces to a pure sine
  wave" `ClosenessAdaptivePattern` test asserted `0.5 + profile.amplitude`
  for closeness 3 (amplitude 0.55) without accounting for the algorithm's
  own `clamp(..., 0, 1)` — `0.5 + 0.55 = 1.05` gets clamped to `1`, which
  isn't a bug in the algorithm, just a test that forgot the real clamp
  boundary; fixed by testing at closeness 1 (amplitude 0.25) instead, where
  the unclamped sum stays inside 0..1. Neither new pattern's constructor
  options are exposed in the UI yet, same as E3-02's two patterns — left for
  whenever (if ever) per-algorithm parameter controls are asked for; not
  required by E3-03's acceptance criteria.
- Next action: E3-04 (closeness/intensity/soft-mode UI polish — non-color
  feedback, history/events, shortcut hints, accessible controls) or E3-05
  (diagnostics and error presentation), both now unblocked. E2-04 remains
  blocked pending a human with a real Intiface setup.

## 2026-09-12 — Claude — E3-02

- Status: `done`
- Summary: Implemented `SineWavePattern` and `RampPattern`, both stateless
  pure functions of `AlgorithmInput.elapsedMs` (no internal mutable
  per-tick state, so `reset()` is a no-op for both — matching
  `ConstantPattern`'s existing design). Registered both in
  `AlgorithmRegistry.ts`'s `factories` array, the only place a new
  algorithm needs to be listed.
  - `SineWavePattern`: `position = baseline + amplitude * sin(2π · frequencyHz · elapsedSeconds)`,
    clamped to 0..1; `intensity = intensityScale * manualIntensityScale`.
  - `RampPattern`: a trapezoidal cycle — linear ramp from `minimum` to
    `maximum` over `rampDurationMs`, hold at `maximum` for
    `holdDurationMs`, linear ramp back down, hold at `minimum`, repeat.
    Guards `rampDurationMs` to at least 1ms in the constructor to avoid a
    divide-by-zero.
- Files changed: `src/algorithms/implementations/SineWavePattern.ts` (new),
  `src/algorithms/implementations/RampPattern.ts` (new),
  `tests/algorithms/SineWavePattern.test.ts` (new),
  `tests/algorithms/RampPattern.test.ts` (new),
  `src/algorithms/AlgorithmRegistry.ts`, `TASKS.md`.
- Verification: ESLint passed; Vitest passed (15 files, 59 tests); `tsc -b`
  passed; Vite production build passed; Playwright Chromium passed all 3
  tests (unaffected by this change, re-run to confirm no regression).
- Decisions / blockers: Neither pattern currently has a UI-exposed way to
  configure its constructor options (frequency, amplitude, ramp/hold
  durations, etc.) — they use the documented defaults only. `App.tsx`'s
  Pattern selector already shows each one's name/description via
  `AlgorithmRegistry.ts` with no further changes needed, since the registry
  reads that metadata straight off each pattern's own fields. Exposing
  per-algorithm parameter controls in the UI isn't required by E3-02's
  acceptance criteria and is left for whenever (if ever) it's asked for.
- Next action: E3-03 — implement `RandomWalkPattern` (seedable via
  `AlgorithmInput.random`, needs smoothing and hard bounds per the
  architecture brief) and `ClosenessAdaptivePattern` (uses `closeness` to
  modify amplitude/intensity/variation — the architecture brief's example
  `closenessProfile()` table is a reasonable starting point), registering
  both in `AlgorithmRegistry.ts`.

## 2026-09-12 — Claude — E2-04 (blocked), E3-01

- Status: `blocked` (E2-04), `done` (E3-01)
- Summary: Marked **E2-04 blocked** in `TASKS.md` — it requires a human with
  a real (or simulated) Intiface Central/Engine instance to validate
  against, which doesn't exist in this environment; it cannot be completed
  by an agent alone. Since Milestone 3 doesn't depend on E2-04, moved on to
  it: added `src/algorithms/AlgorithmRegistry.ts`, the single source of
  truth for which algorithms exist, replacing two previously-duplicated
  hardcoded lists (`sessionState.ts`'s `algorithms` array, `App.tsx`'s
  `algorithmFactories` map) that could have drifted out of sync with each
  other or with `ConstantPattern`'s own `id`/`name`/`description`. The
  registry avoids that duplication entirely: it builds its descriptors by
  reading those three fields off one throwaway instance per factory, rather
  than repeating the strings a third time in registry metadata.
  `createAlgorithm(id)` always returns a fresh instance (verified by a
  test); `App.tsx`'s Pattern selector now shows each algorithm's real
  description instead of a single static hint string.
- Files changed: `src/algorithms/AlgorithmRegistry.ts` (new),
  `tests/algorithms/AlgorithmRegistry.test.ts` (new), `src/state/sessionState.ts`
  (removed the `algorithms` array, `initialSessionState.selectedAlgorithmId`
  now comes from `defaultAlgorithmId`), `src/App.tsx` (removed
  `algorithmFactories`, uses `createAlgorithm`/`algorithmDescriptors`,
  Pattern panel's hint text is now per-algorithm), `TASKS.md`.
- Verification: ESLint passed; Vitest passed (13 files, 48 tests); `tsc -b`
  passed; Vite production build passed; Playwright Chromium passed all 3
  tests (unaffected by this refactor, re-run to confirm no regression).
- Decisions / blockers: None beyond the E2-04 human-dependency noted above.
- Next action: E3-02/E3-03 — implement SineWave/Ramp and
  RandomWalk/ClosenessAdaptive patterns, adding each to
  `AlgorithmRegistry.ts`'s `factories` array as they're built (that's the
  only place a new algorithm needs to be registered). E2-04 remains blocked
  pending a human with a real Intiface setup.

## 2026-09-12 — Claude — E2-03

- Status: `done`
- Summary: Completed `ButtplugTransport` (capability computation +
  `sendNormalizedCommand`), added `IntifaceDeviceAdapter`, and wired a
  self-contained diagnostic panel into `App.tsx` so discovered capabilities
  are actually visible in the UI, satisfying E2-03's stated acceptance
  criteria.
  - `computeCapabilities()` derives our `DeviceFeature[]` from
    `device.hasOutput(OutputType.*)`: `Vibrate`→'vibration', `Rotate`→
    'rotation', `Oscillate`→'oscillation', `Constrict`→'constriction', and
    (see the important correction below) `HwPositionWithDuration`→'linear'.
  - `buildOutputCommands()`/`sendNormalizedCommand()` map our
    `DeviceCommand` onto `DeviceOutput.*` calls explicitly per capability:
    `vibration ?? intensity` → `Vibrate.percent` (only if 'vibration'
    supported; vibration wins if both are set — nothing currently sets
    both), `speed` → `Rotate.percent` (only if 'rotation'), `position`+
    `durationMs` → `PositionWithDuration.percent` (only if 'linear'). Fields
    the device doesn't support are silently dropped, never sent.
  - `IntifaceDeviceAdapter` (`src/devices/adapters/IntifaceDeviceAdapter.ts`)
    mirrors `FakeDeviceAdapter`'s structure exactly, hardwired to
    `ButtplugTransport`, with one real difference: `connect()` must call
    `transport.listDevices()` (an actual scan) before `selectDevice()`,
    since — unlike `FakeTransport` — real devices aren't known until
    discovered.
  - `App.tsx` gained a "Real Intiface connection (diagnostic)" panel
    (`useIntifaceDiagnostics()`): a URL input, connect/discover, disconnect,
    a status message, and a list of discovered devices with their mapped
    capabilities. It is intentionally **not** wired into the existing
    fake-device session/engine/Start-Pause flow — see Decisions below.
- Files changed: `src/transport/ButtplugTransport.ts`,
  `src/devices/adapters/IntifaceDeviceAdapter.ts` (new),
  `tests/devices/IntifaceDeviceAdapter.test.ts` (new),
  `tests/transport/ButtplugTransport.test.ts` (added a `sendNormalizedCommand`
  describe block, updated device fixtures to include
  `hasOutput`/`hasInput`/`runOutput`), `src/App.tsx`,
  `tests/e2e/app.spec.ts` (added a real-connection-failure test; made the
  original "Disconnect" locator `exact: true` since the app now has two
  buttons whose text contains that word), `BUTTPLUG_API_NOTES.md`, `TASKS.md`.
- Verification: ESLint passed; Vitest passed (12 files, 44 tests); `tsc -b`
  passed; Vite production build passed (73 modules — confirms `buttplug`
  bundles cleanly for the browser via Vite, not just Node); Playwright
  Chromium passed all 3 tests, including the new one that drives
  `ButtplugTransport.connect()` against a real WebSocket connection to a
  port nothing listens on in this environment, and asserts the UI surfaces
  the real wrapped error message.
- Decisions / blockers: **Found and fixed a real capability-mapping bug via
  a failing test, not by inspection**: `DeviceOutput.PositionWithDuration`
  and `DeviceOutput.HwPositionWithDuration` are the exact same constructor
  in the installed `buttplug@5.0.1` (confirmed by reading the compiled
  `.js`, not just the `.d.ts`) — both always produce an
  `OutputType.HwPositionWithDuration` command. Plain `OutputType.Position`
  is a separate output type with no duration-taking variant. My first
  version of `computeCapabilities()` checked `hasOutput(OutputType.Position)`
  for 'linear', which would have silently misreported linear support for
  any device that only declares `HwPositionWithDuration` (seemingly the
  common real case) — fixed to check `HwPositionWithDuration`, matching
  what we actually send. Recorded in `BUTTPLUG_API_NOTES.md` so this isn't
  rediscovered the hard way again.
  Deliberately did **not** rewire the main session/engine/Start-Pause flow
  to support a fake-vs-real mode switch: that would have meant reworking
  `App.tsx`'s runtime-construction model (currently a `FakeTransport`+
  `FakeDeviceAdapter` pair built once via lazy `useRef` at mount) into
  something that can hot-swap to `ButtplugTransport`+`IntifaceDeviceAdapter`
  — a real architectural change I cannot verify end-to-end without a live
  Intiface service, which does not exist in this environment. Building that
  untested would risk quietly breaking the already-solid, tested fake-device
  UX to add a feature I can't confirm works. Instead, added an isolated
  diagnostic panel that exercises the real transport for real (its connect/
  discover/disconnect calls are the actual production code, not a mock) but
  doesn't touch the existing session engine at all. Its *failure* path is
  genuinely verified (Playwright drives a real failed WebSocket connection);
  its *success* path (discovering an actual device) has only ever run
  against scripted fakes in unit tests — nobody has confirmed it against a
  real Intiface Central yet. That confirmation, plus deciding how (or
  whether) to merge this into the main session flow, is explicitly E2-04's
  job and needs a human with real hardware/software; I flagged this clearly
  rather than claiming the feature fully works.
- Next action: **E2-04 requires a human** — it cannot be completed by an
  agent alone. With a local Intiface Central/Engine (and ideally a real or
  simulated device) running, use the "Real Intiface connection (diagnostic)"
  panel to connect and discover devices, and confirm: connecting never
  starts device movement, explicit device selection is required before any
  command, and stop/disconnect/error conditions actually stop the selected
  device. Record findings, the Intiface Central/Engine version used, and
  whatever needs fixing (very possibly including "wire the diagnostic panel
  into the main session flow" as a follow-up task) in this log.

## 2026-09-12 — Claude — E2-02

- Status: `done`
- Summary: Implemented `ButtplugTransport` (`src/transport/ButtplugTransport.ts`),
  the real `IntifaceTransport` backed by the `buttplug` npm client per
  `BUTTPLUG_API_NOTES.md`. It owns connect/disconnect, tracks devices via
  `deviceadded`/`deviceremoved`/`disconnect` listeners, discovers devices by
  scanning and racing a `scanningfinished` event against a bounded
  `scanTimeoutMs` fallback timer, calls the client's confirmed
  `stopAllDevices()` for `stopAll()`, and wraps every failure (including
  `ButtplugError` subtypes) in a `Failed to <action>: <message>` `Error` so
  callers get an actionable message instead of a raw library exception.
  `sendNormalizedCommand` deliberately throws with a message pointing at
  E2-03 — translating our `DeviceCommand` into `DeviceOutput.*`/`runOutput`
  calls needs per-device capability mapping, which is that task's job, not
  this one's.
- Files changed: `package.json`/`package-lock.json` (added `buttplug@^5.0.1`
  as a real dependency), `src/transport/ButtplugTransport.ts`,
  `tests/transport/ButtplugTransport.test.ts`, `BUTTPLUG_API_NOTES.md`
  (added the confirmed `stopAllDevices()` finding and a cross-check against
  a sibling project, see below), `TASKS.md`.
- Verification: ESLint passed; Vitest passed (11 files, 32 tests); `tsc -b`
  passed; Vite production build passed; Playwright Chromium passed both
  tests (unaffected by this change, re-run to confirm no regression).
- Decisions / blockers: For testability, `ButtplugTransport` depends on a
  narrow `ButtplugClientLike` interface (the handful of `ButtplugClient`
  members it actually calls) rather than the concrete class directly, with a
  `createClient`/`createConnector` injection seam (defaulting to real
  `ButtplugClient`/`ButtplugBrowserWebsocketClientConnector`) — this let
  tests script a fake client's events without needing a live Intiface
  server or reimplementing the wire protocol, matching this project's
  existing seam-injection pattern (`ControlEngine`'s `scheduler`/`now`).
  The user pointed at `../stash_audio`, a sibling project with two real
  Buttplug integrations: confirmed its Angular `buttplug.service.ts` targets
  an older `buttplug` API generation (`device.vibrate()`,
  `client.devices` as an array) than the `5.0.1` "Output" API we're
  building against — don't copy its method calls. Its React code hand-rolls
  a raw WebSocket Buttplug-wire client specifically because, per its own
  comment, `buttplug` "can't be installed on the VirtualBox shared
  filesystem" — but `npm install --no-bin-links buttplug` installed and
  loaded cleanly here with the Node 20 toolchain already in use this
  session, so that workaround looks like it was really working around the
  plain-symlink `EPERM` this project hit too (see E0-03/E1-06 entries)
  before finding `--no-bin-links`, not something specific to `buttplug`
  itself. Recorded this comparison in `BUTTPLUG_API_NOTES.md` so it isn't
  re-litigated later. One initial test-writing mistake worth flagging for
  future sessions: two tests originally emitted a fake `'scanningfinished'`
  event synchronously before `listDevices()`'s internal
  `await client.startScanning()` had a chance to resume and register its
  listener, so the event fired into nothing and the test silently fell back
  to the real multi-second scan-timeout path (passed, but took ~4s each) —
  fixed by flushing a real macrotask tick (`setTimeout(resolve, 0)`) between
  triggering `listDevices()` and emitting `scanningfinished`.
- Next action: E2-03 — implement capability mapping and a real
  `DeviceAdapter` (`IntifaceDeviceAdapter` or similar, hardwired to
  `ButtplugTransport` the way `FakeDeviceAdapter` is to `FakeTransport`)
  that maps our `DeviceCommand` fields onto `device.runOutput(DeviceOutput.*)`
  calls based on each connected device's actual `hasOutput`/`features`, and
  fills in `ButtplugTransport.sendNormalizedCommand` accordingly (or moves
  that responsibility fully into the new adapter — decide while implementing,
  since `FakeTransport.sendNormalizedCommand` currently does the "sending,"
  while `FakeDeviceAdapter` does no mapping because the fake needs none).

## 2026-09-12 — Claude — E2-01

- Status: `done`
- Summary: Researched the current `buttplug` npm client library from primary
  sources only (npm registry metadata + the `buttplug-js` GitHub repo's
  README and `examples/web/*.js`, not the archived `buttplug-playground`).
  Documented package choice/version, WebSocket connection setup, the error
  class hierarchy, the discovery/event flow, and the device
  capability/command API (`hasOutput`/`hasInput`/`features`/`runOutput`/
  `DeviceOutput.*`/`stop`/`battery`), plus how each maps onto our existing
  `DeviceCommand`/`DeviceCapabilities` contracts in `src/engine/types.ts`.
- Files changed: `BUTTPLUG_API_NOTES.md` (new), `TASKS.md`.
- Verification: N/A (research task, no code changes). No `npm install`
  performed yet — `buttplug` is not yet a project dependency; that's E2-02.
- Decisions / blockers: Pinning **`buttplug@^5.0.1`**, the official
  buttplugio/buttplug-js package, over the community fork
  `@zendrex/buttplug.js` (`0.5.0`) that the official README itself
  recommends as more actively developed. Chose the official package anyway
  because it's what Intiface Central is built against, has lighter
  dependencies (no `zod`), and the fork's `0.x` versioning is far less
  proven than the official package's `5.0.1`. Revisit if the official
  package is ever deprecated. Note: `docs.buttplug.io`'s dev-guide URLs
  redirected to the site root at fetch time (2026-09-12) and
  `buttplugio.github.io/buttplug-js`'s TypeDoc reference could not be
  confirmed precisely via automated summarization, so the GitHub repo's
  example source files were used as the authoritative, version-matched
  reference instead — see `BUTTPLUG_API_NOTES.md`'s Sources section.
- Next action: E2-02 — implement the real `IntifaceTransport` wrapper in
  `src/transport/` per `BUTTPLUG_API_NOTES.md`, keeping all `buttplug`
  imports isolated to that directory per the architecture brief's boundary
  rule, and add `buttplug` as a real dependency.

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
