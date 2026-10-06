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

Go side (only if you touched Go): `go build ./... && go vet ./...`. Note
`go build` of the root package requires `web/dist/` to exist.

## Swapping the design system (Carbon → something else)

The UI is built on IBM Carbon (`@carbon/react`, `@carbon/styles`, g100 dark
theme). Carbon touches these places:

- **Global styles / theme:** `web/src/styles/index.scss` (`@use '@carbon/styles/...'`),
  `web/src/main.tsx`, `<Theme theme="g100">` in `web/src/App.tsx`.
- **Design tokens in SCSS:** every `*.scss` under `web/src/` uses `var(--cds-*)`
  custom properties (spacing, colors, type). Heaviest: `PodDescribeTab.scss`,
  `App.scss`, `PodLogsTab.scss`, `NamespaceCard.scss`, `ClusterSidebar.scss`.
- **Status colors:** `web/src/constants/status.ts` maps pod/job status →
  `--cds-support-*` vars, Carbon Tag types, and hard-coded hex for charts.
  This is the semantic core — Idle=success, Busy=info, Changing=warning,
  Failed=error, Empty/Unknown=neutral. Preserve those meanings.
- **Components:** `@carbon/react` imports in `App.tsx` and `web/src/components/*.tsx`
  (Modal/ComposedModal, TextInput, PasswordInput, Select, Toggle, Tag, Tabs,
  Checkbox, Search, OverflowMenu, InlineNotification, ...).
- **Charts:** `ResourceDonut.tsx` uses `@carbon/charts-react`.
- **Icons:** `@carbon/icons-react`.

`design_handoff_carbon_redesign/README.md` is the original design spec the
current UI was built from (layout, states, interactions). It's a useful
checklist of what each screen must still do after a swap. The `.html`/`.jsx`
prototypes there reference a design-system bundle that isn't in the repo, so
they won't render standalone — read them, don't run them.

Suggested approach: swap tokens/theme first (so everything still renders), then
`status.ts`, then components one at a time, checking each in `dev:mock`.

## Conventions

- Frontend: React 19 + TypeScript + Vite, SCSS per component, hooks in
  `web/src/hooks/` own all network I/O (components never `fetch` directly).
- Don't commit `*.yaml` at the repo root (real configs hold credentials;
  `.gitignore` excludes them), built binaries, or `web/dist/`.
- The `village` branch is an experimental map view; ignore it unless asked.
