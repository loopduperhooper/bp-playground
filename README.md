# Edger

Local-first control application for devices exposed through a local Intiface
service. See `TASKS.md` and `WORK_LOG.md` for the implementation sequence and
handoff context, and `BUTTPLUG_API_NOTES.md` for the Buttplug/Intiface client
API this is built against.

## Requirements

- Node.js 20.19 or newer
- npm

## Install

```bash
npm install
```

## Run (development)

Starts a local dev server with hot reload at http://localhost:5173:

```bash
npm run dev
```

## Build (production)

Type-checks and produces an optimized build in `dist/`:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Test

```bash
npm run lint       # ESLint
npm run test       # Vitest unit tests (single run)
npm run test:watch # Vitest unit tests (watch mode)
```

The browser end-to-end tests use Playwright. Install its Chromium binary once,
then run them with:

```bash
npx playwright install chromium
npm run test:e2e
```

## Status

Fake-device control (keyboard-driven, no real hardware) is fully wired up
end to end. Connecting to a real Intiface/Buttplug service for discovery is
implemented (see the "Real Intiface connection" diagnostic panel in the
app), but is not yet wired into the main session/engine flow, and has not
been validated against a real Intiface service — see `TASKS.md`'s E2-04.
