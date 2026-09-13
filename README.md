# Edger

Local-first control application for devices exposed through a local Intiface
service. See `TASKS.md` and `WORK_LOG.md` for the implementation sequence and
handoff context.

## Requirements

- Node.js 20.19 or newer
- npm

## Commands

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
```

The browser smoke test uses Playwright. Install its Chromium binary once, then
run it with:

```bash
npx playwright install chromium
npm run test:e2e
```

No real Intiface or device connection is implemented at this stage.
