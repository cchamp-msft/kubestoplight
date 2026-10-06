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
npm run screenshots -- overview  # or just some: overview failing large empty describe logs add-cluster
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

The UI is built on [Jewel](https://github.com/willchambers/jewel-design-system),
a CSS-only dark design system (glass panels over an animated gradient). Before
this it was IBM Carbon; `git log` has the swap if you need to compare.

- **Where it lives:** `web/src/vendor/jewel/css/` is upstream's CSS, vendored
  as-is (see its README for the pinned commit and how to update). It's
  imported once in `web/src/main.tsx`. Don't edit it.
- **App layer:** `web/src/styles/index.scss` overrides Jewel tokens (page
  width, panel padding, Inter from `@fontsource-variable/inter`) and adds what
  Jewel lacks: `--status-*` colors, `.btn--danger`, `.sheet--end` (right
  drawer), `.ksl-dot`. App CSS is unlayered, so it always beats Jewel's layers.
- **Status colors:** `web/src/constants/status.ts` maps pod/job status →
  `--status-*` tokens, which sit on Jewel's chart palette: Idle=teal,
  Busy=purple, Changing=orange, Failed=red, Empty/Unknown=gray. The meanings
  (healthy / restarting / pending / error / no data) are the semantic core;
  keep them. Following Jewel, status color goes on dots, ring segments and
  2px tone edges, not on text (except log lines, via `--status-*-text`).
- **Components:** use Jewel's classes on plain elements (`.btn`, `.tag`,
  `.badge`, `.stats`, `.search`, `.choice`, `.field`/`.input`, `.table`,
  `.accordion`, `.tabs`, `.code`, `.notice`, `.empty-state`, `.side-nav`,
  `.sheet`). Jewel's `js/` isn't used, because it mutates the DOM. The React
  equivalents are `components/ui/Sheet.tsx` (native `<dialog>`), the tabs in
  `PodDetailPanel.tsx`, `components/ui/Icon.tsx` (hairline icons, since Jewel
  ships none), `components/ui/Loading.tsx`, and `ResourceDonut.tsx` (SVG drawn
  to Jewel's chart spec).
- **Tokens only:** use Jewel's resolved tokens (`--text-*`, `--panel-*`,
  `--field-*`, `--state-*`, `--space-*`, `--text-*` sizes, …) and the
  `--status-*` set. No hex values in component styles.

`design_handoff_carbon_redesign/README.md` is the original layout and
interaction spec (it predates Jewel). It's still a checklist of what each
screen must do: summary, filters, cards, auto-expand of failed namespaces,
drill-down tabs, and the cluster add/edit/remove flow.

## Conventions

- Frontend: React 19 + TypeScript + Vite, SCSS per component, hooks in
  `web/src/hooks/` own all network I/O (components never `fetch` directly).
- Don't commit `*.yaml` at the repo root (real configs hold credentials;
  `.gitignore` excludes them), built binaries, or `web/dist/`.
- The `village` branch is an experimental map view; ignore it unless asked.
