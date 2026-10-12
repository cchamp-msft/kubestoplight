# AGENTS.md — kubestoplight

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in
this repo. `CLAUDE.md` just points here, so keep this file the source of truth.

## What this is

A Kubernetes pod monitor with two front ends in one Go binary:

- **TUI** (`./kubestoplight`) — Bubble Tea terminal UI. Code: `model/`, `view/`, `polling/`.
- **Web** (`./kubestoplight --web`) — React SPA in `web/`, embedded into the
  binary via `go:embed` (`embed.go`) and served by `webserver/server.go`.

Data flow (web): `poller/` polls each cluster → `model.GroupByNamespace` →
`webserver` pushes `{type:'snapshot', groups}` over `/ws/pods` every polling
interval. Cluster CRUD is REST at `/api/clusters`; pod drill-down is
`/api/pods/{cluster}/{ns}/{pod}` (describe) and `.../logs` (streamed text).

## No cluster? Use mock mode (this is the normal path for UI work)

You do **not** need Go, a kubeconfig, or a Kubernetes cluster to work on the UI.

```bash
cd web
npm install
npm run dev:mock          # http://localhost:5173 with fake clusters/pods/logs
```

`web/mock/plugin.ts` is a Vite plugin that serves every route the Go server
does, from deterministic fake data in `web/mock/fixtures.ts`. Pick a scenario
to exercise different UI states:

| Scenario | What it shows | Use it to check |
|----------|---------------|-----------------|
| `mixed` (default) | 2 enabled clusters + 1 disabled, every pod status, jobs in every state | general look, all status colors/tags |
| `healthy` | all pods Idle | the "all green" resting state |
| `failing` | ~40% Failed | error colors, auto-expanded cards, failure density |
| `empty` | no clusters at all | empty state + "add cluster" flow |
| `large` | 4 clusters, long namespace names, up to 40 pods/ns | truncation, wrapping, overflow, performance |

```bash
# bash / Git Bash / macOS / Linux
MOCK_SCENARIO=failing npm run dev:mock
MOCK_CHURN=0 npm run dev:mock      # freeze data (no live status flips) for screenshots

# PowerShell
$env:MOCK_SCENARIO='failing'; npm run dev:mock

# switch scenario on a running server, no restart:
curl -X POST "http://localhost:5173/__mock/scenario?name=large"
```

Data is seeded, so the same scenario renders identically each run — take
before/after screenshots per scenario when changing the design system.
Cluster add/edit/delete works in-memory (resets on restart). Logs stream a
new line every second when "follow" is on; Failed pods emit panics/errors.

`npm run build && npm run preview:mock` does the same against the production
bundle.

### Keeping the mock honest

The mock mirrors `web/src/types/api.ts`, which mirrors the Go JSON structs in
`webserver/server.go` (`podJSON`, `nsGroupJSON`, `podDescribeJSON`, `wsMessage`).
If you change an API shape, update all three. Namespace status roll-up in
`fixtures.ts#toGroups` mirrors `model/pod.go` (`podToNSStatus`, `worstStatus`).

## Verify before calling a change done

```bash
cd web
npx tsc -b        # typecheck (app + vite config + mock)
npm test          # vitest — mock fixture invariants
npm run lint      # oxlint (one pre-existing warning in PodLogsTab.tsx)
npm run build     # production build must succeed; Go embeds web/dist
```

Then run `npm run dev:mock` and actually look at the UI in each scenario —
typecheck passing does not mean the design swap worked. If you have a browser
automation tool, screenshot `mixed`, `failing`, `empty`, and `large`, and open
a pod's Describe / Logs / YAML tabs.

### Screenshots

```bash
cd web
npm run screenshots              # all → docs/screenshots/*.png
npm run screenshots -- overview  # or just some: overview failing large empty describe logs load add-cluster social bg-* (palettes incl. bg-ember/lagoon/dusk, bg-wax-*)
```

`web/scripts/screenshots.mjs` boots its own mock server with frozen data and a
pinned clock (`MOCK_CHURN=0`, `MOCK_NOW`), drives the installed Google Chrome
via `playwright-core`, and writes PNGs the README links to. Same code → same
pixels, so a PNG diff means the UI changed. Selectors use roles and visible
text only (`button "Describe"`, `button "Add cluster"`, label "Cluster name"),
so keep those names when swapping components.

CI (`.github/workflows/screenshots.yml`) regenerates them on every PR that
touches `web/` and commits them back to the branch — pull before pushing
again. Local renders can differ slightly from CI's Linux fonts; CI's copy is
the one that lands.

Go side (only if you touched Go): `go build ./... && go vet ./...`. Note
`go build` of the root package requires `web/dist/` to exist.

## Design system: Jewel

The UI is built on [Jewel](https://github.com/willchambers/jewel-design-system)
1.0 (MIT), a CSS-only dark design system (glass panels over an animated
gradient). Before this it was IBM Carbon; `git log` has the swap if you need
to compare. Jewel 1.0 filled the gaps this app found, so prefer a Jewel
component or token over a new `ksl-` one.

- **Where it lives:** `web/src/vendor/jewel/` holds upstream's `css/` and
  icon sprite (`media/icons.svg`), vendored as-is with its LICENSE (see its
  README for the pinned commit and how to update). The CSS is imported once
  in `web/src/main.tsx`. Don't edit it.
- **App layer:** `web/src/styles/index.scss` overrides a few Jewel tokens
  (page width, Inter from `@fontsource-variable/inter`, a wider `.sheet--end`)
  and names the app's status set. `data-density="compact"` on `<html>`
  (`web/index.html`) gives the dashboard Jewel's tighter panels and 32px
  controls. App CSS is unlayered, so it always beats Jewel's layers.
- **Status colors:** Jewel's traffic light. `--status-idle|busy|changing|failed|empty`
  in `index.scss` map onto Jewel's `--status-success|info|warning|error|neutral-mark`
  (green, blue, amber, red, gray: the TUI's colors too), and
  `constants/status.ts` maps pod/job status to those tokens (`STATUS_COLORS`,
  for dots and chart marks), to `.status` tones (`STATUS_TONES`) and to
  display words (`STATUS_LABELS`). The keys come from Go and predate their
  meanings: Busy is *in progress* (blue; a recent restart or brief
  pending/terminating/not-ready) and Changing is a *warning* (amber; the
  same, stuck past 5 minutes). `model/pod.go#determineStatusAt` decides,
  with tests in `model/pod_test.go`. Amber means something needs a look;
  normal churn is never amber.
- **CPU load is not status.** `model/load.go` (`CPU.Hot`) marks pods busy on
  CPU; the poller attaches readings from metrics-server (`ListPodCPU`,
  refreshed every 15s, absent when the cluster has none). The UI shows it in
  `CpuCell`, `HotTag` and a "Hot pods" stat, colored `--load-hot` (Jewel's
  violet accent, never a `--status-*`), and it never feeds the Beacon, tab,
  card status or filters. The mock mirrors `CPU.Hot` as `cpuHot` in
  `fixtures.ts`; its `staging` cluster has no metrics on purpose. Show `STATUS_LABELS`, not raw keys. A state with its word uses Jewel's `.status`
  (`components/ui/Status.tsx`); a lone dot uses `.ksl-dot`. Never use the
  `--chart-*` colors for status.
- **Components:** use Jewel's classes on plain elements (`.btn`,
  `.btn--danger`, `.tag`, `.badge`, `.status`, `.stats`, `.search`, `.choice`,
  `.field`/`.input`, `.password`, `.table`, `.accordion`, `.tabs`, `.code`,
  `.notice`, `.meta`, `.empty-state`, `.side-nav`, `.sheet` incl. `--end`
  and `.sheet__eyebrow`, `.spinner`/`.loading`, `.icon`). Jewel's `js/`
  isn't used, because it mutates the DOM; each Jewel component page has a
  "Without Jewel's JS" section for this case. The React equivalents are
  `components/ui/Sheet.tsx` (native `<dialog>`), `ui/Tooltip.tsx` (popover,
  like `tooltip.js`), `ui/Icon.tsx` (draws from the sprite), `ui/Status.tsx`,
  `ui/Loading.tsx`, the tabs in `PodDetailPanel.tsx`, the token toggle in
  `ClusterFormModal.tsx`, and `ResourceDonut.tsx` (SVG drawn to Jewel's
  chart spec). Icon buttons get a `Tooltip`, not `title=`.
- **Tokens only:** use Jewel's resolved tokens (`--text-*`, `--panel-*`,
  `--field-*`, `--state-*`, `--status-*`, `--space-*`, `--text-*` sizes, …)
  and the app's `--status-idle…` set. No hex values in component styles.

- **Signature touches** (kept deliberately small, all on status tokens):
  the header `ui/Beacon.tsx` (a traffic light whose lit lens is the worst
  status; `useTabStatus` mirrors it into the favicon and tab title), the
  health spectrum bar under the overview, a status-tinted glow on cards,
  one-shot flashes when a pod or namespace changes status
  (`useFlashOnChange`), a LIVE dot that ticks per snapshot and reads
  "Stale" when updates stop, and donuts and stats that sweep and count
  in (`useCountUp`). Every animation is off under
  `prefers-reduced-motion`, which the screenshot script sets, so PNGs
  stay deterministic. Status color still means status: don't use it for
  decoration elsewhere.

`design_handoff_carbon_redesign/README.md` is the original layout and
interaction spec (it predates Jewel). It's still a checklist of what each
screen must do: summary, filters, cards, auto-expand of failed namespaces,
drill-down tabs, and the cluster add/edit/remove flow.

## Backgrounds, link previews, public preview

- `web/src/components/BgPicker.tsx` + `styles/backgrounds.scss`: background
  options for Jewel's sky. "hot" is Jewel's default. Jewel's own palettes
  (`ember`, `lagoon`, `dusk`) set `data-palette`; the app's cool palettes
  (`glacier`, `aurora`, `deepsea`, `polar`) set `data-ksl-bg` and are just
  Jewel's `--bg-1…5` / `--bg-base` tokens. There are also Grok Imagine
  renders in `web/public/bg/` (stills and a looping video). Choose with
  `?bg=<id>`.
  The picker shows in dev and in builds with `VITE_BG_PICKER=1`, and
  `?picker=0` hides it.
- Motion: `?motion=jewel` is Jewel's own *lava lamp animation* (its name for
  the drifting gradient in `background.css`); `?motion=wax` adds rising wax
  blobs on top of it (`.ksl-wax`, tune with `--wax-speed`). Use Jewel's name
  for Jewel's animation.
- `web/index.html` carries the favicon and Open Graph/Twitter tags.
  `og:image` is `web/public/og-image.png`, rendered from mock data by
  `npm run screenshots -- social`; `VITE_PUBLIC_URL` makes its URL absolute.
- `Dockerfile` builds the single binary; `deploy/preview/` runs it
  `--read-only` behind a Cloudflare tunnel. Personal settings live in the
  gitignored `deploy/preview/.local/`.

## Conventions

- Frontend: React 19 + TypeScript + Vite, SCSS per component, hooks in
  `web/src/hooks/` own all network I/O (components never `fetch` directly).
- Don't commit `*.yaml` at the repo root (real configs hold credentials;
  `.gitignore` excludes them), built binaries, or `web/dist/`.
- The `village` branch is an experimental map view; ignore it unless asked.
