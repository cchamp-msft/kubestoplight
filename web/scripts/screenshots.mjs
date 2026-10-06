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

import { mkdir, writeFile } from 'node:fs/promises';
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

/**
 * query: extra URL params (e.g. bg=glacier); viewport: override size;
 * out: path relative to web/ instead of docs/screenshots/<name>.png.
 * @type {Record<string, { scenario: string, query?: string, viewport?: {width: number, height: number}, out?: string,
 *   run: (page: import('playwright-core').Page) => Promise<void> }>}
 */
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
  // Link-preview card (og:image) for shared URLs. Mock data, never a real cluster.
  social: { scenario: 'mixed', query: 'bg=aurora', viewport: { width: 1200, height: 630 }, out: 'public/og-image.png', run: async () => {} },
  // Background options for the Jewel "cool" review (see components/BgPicker.tsx).
  'bg-glacier': { scenario: 'mixed', query: 'bg=glacier', run: async () => {} },
  'bg-aurora': { scenario: 'mixed', query: 'bg=aurora', run: async () => {} },
  'bg-deepsea': { scenario: 'mixed', query: 'bg=deepsea', run: async () => {} },
  'bg-polar': { scenario: 'mixed', query: 'bg=polar', run: async () => {} },
  'bg-aurora-still': { scenario: 'mixed', query: 'bg=aurora-still', run: async () => {} },
  'bg-glacier-still': { scenario: 'mixed', query: 'bg=glacier-still', run: async () => {} },
  'bg-deepsea-still': { scenario: 'mixed', query: 'bg=deepsea-still', run: async () => {} },
  'bg-lava-hot': { scenario: 'mixed', query: 'motion=lava', run: async () => {} },
  'bg-lava-glacier': { scenario: 'mixed', query: 'bg=glacier&motion=lava', run: async () => {} },
  'bg-aurora-loop': { scenario: 'mixed', query: 'bg=aurora-loop', run: async () => {} },
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

// Software rendering and a fixed color profile keep pixels stable run to run.
const browser = await chromium.launch({
  ...(process.env.SCREENSHOT_CHROME ? { executablePath: process.env.SCREENSHOT_CHROME } : { channel: 'chrome' }),
  args: ['--disable-gpu', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
await mkdir(outDir, { recursive: true });

let failed = 0;
try {
  for (const name of names) {
    const shot = SHOTS[name];
    await fetch(new URL(`__mock/scenario?name=${shot.scenario}`, base), { method: 'POST' });

    const context = await browser.newContext({
      viewport: shot.viewport ?? VIEWPORT,
      colorScheme: 'dark',
      reducedMotion: 'reduce', // stills any animated background and transitions
      timezoneId: 'UTC',
      locale: 'en-US',
    });
    const page = await context.newPage();
    try {
      // picker=0 hides the background picker; no bg means Jewel's default.
      await page.goto(`${base}?picker=0${shot.query ? `&${shot.query}` : ''}`);
      // The first WebSocket snapshot fills the dashboard; fonts load alongside.
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      await shot.run(page);
      // Capture until two frames in a row match, so a late paint can't sneak in.
      let prev = await page.screenshot();
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(300);
        const next = await page.screenshot();
        if (next.equals(prev)) break;
        prev = next;
      }
      await writeFile(shot.out ? resolve(webRoot, shot.out) : resolve(outDir, `${name}.png`), prev);
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
