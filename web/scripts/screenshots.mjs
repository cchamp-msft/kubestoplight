// Captures the UI from mock mode into docs/screenshots/ (the README links them).
//
//   npm run screenshots                  # all shots
//   npm run screenshots -- overview logs # just these
//
// Starts its own Vite mock server with frozen, clock-pinned data, so the same
// code renders the same pixels on every run; a diff in the PNGs means the UI
// changed. Uses the installed Google Chrome (channel "chrome"); set
// SCREENSHOT_CHROME=/path/to/chrome to use another Chromium build.
//
// Selectors use roles and visible text only, so the script keeps working when
// the design system underneath changes.

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const outDir = resolve(webRoot, '../docs/screenshots');

// The mock plugin reads these when the server starts.
process.env.MOCK_CHURN = '0';
process.env.MOCK_NOW = '2026-01-01T12:00:00Z';

const { createServer } = await import('vite');
const { chromium } = await import('playwright-core');

const VIEWPORT = { width: 1440, height: 900 };

/** @type {Record<string, { scenario: string, run: (page: import('playwright-core').Page) => Promise<void> }>} */
const SHOTS = {
  overview: { scenario: 'mixed', run: async () => {} },
  failing: { scenario: 'failing', run: async () => {} },
  large: { scenario: 'large', run: async () => {} },
  empty: { scenario: 'empty', run: async () => {} },
  describe: {
    scenario: 'mixed',
    run: async (page) => {
      // Failed namespaces auto-expand and sort first, so this is a failing pod.
      await page.getByRole('button', { name: 'Describe' }).first().click();
      await page.getByText('Overview', { exact: true }).first().waitFor();
    },
  },
  logs: {
    scenario: 'mixed',
    run: async (page) => {
      await page.getByRole('button', { name: 'Logs' }).first().click();
      await page.getByText(/lines$/).first().waitFor();
    },
  },
  'add-cluster': {
    scenario: 'empty',
    run: async (page) => {
      await page.getByRole('button', { name: /add cluster/i }).first().click();
      await page.getByLabel(/cluster name/i).first().waitFor();
    },
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SHOTS);
for (const n of names) if (!SHOTS[n]) throw new Error(`unknown shot "${n}"; one of ${Object.keys(SHOTS).join(', ')}`);

const server = await createServer({
  root: webRoot,
  mode: 'mock',
  logLevel: 'error',
  server: { port: 5199, strictPort: false },
});
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/';

const browser = await chromium.launch(
  process.env.SCREENSHOT_CHROME ? { executablePath: process.env.SCREENSHOT_CHROME } : { channel: 'chrome' },
);
await mkdir(outDir, { recursive: true });

let failed = 0;
try {
  for (const name of names) {
    const shot = SHOTS[name];
    await fetch(new URL(`__mock/scenario?name=${shot.scenario}`, base), { method: 'POST' });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: 'dark',
      reducedMotion: 'reduce', // stills any animated background and transitions
      timezoneId: 'UTC',
      locale: 'en-US',
    });
    const page = await context.newPage();
    try {
      await page.goto(base);
      // The first WebSocket snapshot fills the dashboard; fonts load alongside.
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      await shot.run(page);
      await page.waitForTimeout(400);
      const path = resolve(outDir, `${name}.png`);
      await page.screenshot({ path });
      console.log(`  ✓ ${name} (${shot.scenario})`);
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${name}: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
