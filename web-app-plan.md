# kubestoplight — Web Application Plan

## Overview

Convert kubestoplight from a terminal-only TUI into a dual-mode application: the existing Bubble Tea TUI remains intact, and a new `--web` flag launches an HTTP server that serves a React + TypeScript single-page application (SPA) with live pod monitoring and cluster management.

**Approach:**
- Single Go binary — `--web` flag selects web mode; no flag = existing TUI mode
- React + TypeScript SPA bundled with Vite, embedded in the Go binary via `go:embed`
- IBM Carbon Design System (`@carbon/react`, `@carbon/styles`, `@carbon/icons-react`) for UI
- Gray 100 (darkest) Carbon theme — matches the terminal aesthetic
- WebSocket pushes live pod state snapshots from the Go polling engine
- REST API handles cluster CRUD, writing back to `~/.kubestoplight/config.yaml`
- Hot-reload: adding/removing a cluster immediately starts/stops polling without restart

**Scope boundaries (non-goals):**
- No authentication on the web server (localhost-only by default)
- Auth methods exposed in the UI: kubeconfig (path + context) and bearer token only
- The TUI code is not modified — it remains fully functional

---

## Sub-Tasks

---

### Sub-Task 1 — Add Config Save + Hot-Reload to the Config & Cluster Layers

**Intent:**
The web server needs to write cluster changes back to the config file and apply them live. Today `config.Load` reads YAML but there is no `Save` function, and `ClusterManager` is immutable after construction. This sub-task adds those capabilities without touching the TUI path.

**Expected Outcomes:**
- `config.Save(path, *Config) error` writes a `Config` struct back to YAML at the given path
- `ClusterManager.AddCluster(cluster)` resolves auth config and begins tracking the new cluster
- `ClusterManager.RemoveCluster(name)` removes the cluster and its cached config
- `ClusterManager.UpdateCluster(cluster)` replaces an existing entry and re-resolves its config
- All three mutating methods are safe to call concurrently (protected by a mutex)

**Todo List:**
1. Add `Save(path string, cfg *Config) error` to `config/config.go` — marshal `Config` to YAML and write to path atomically (write to temp file, then rename)
2. Add a `sync.RWMutex` to `ClusterManager` in `clusters/clusters.go`
3. Add `AddCluster`, `RemoveCluster`, `UpdateCluster` methods to `ClusterManager`, each acquiring the write lock and updating both `cm.clusters` and `cm.cache`
4. Promote `ListClusters` and `GetConfig` to acquire the read lock so they are safe to call from concurrent goroutines

**Relevant Context:**
- `config/config.go` — `Config`, `Cluster`, `Load`
- `clusters/clusters.go` — `ClusterManager`, `NewManager`, `GetConfig`
- `clusters/auth.go` — `Resolver.Resolve` (used when adding a new cluster)

**Status:** [x] done

---

### Sub-Task 2 — Refactor Polling Engine to Support Hot-Reload

**Intent:**
The existing polling loop in `model/model.go` is tightly coupled to the Bubble Tea message loop. The web server needs to drive the same polling logic from a plain goroutine (no Bubble Tea). This sub-task extracts a standalone `Poller` that any consumer — TUI or web server — can use.

**Expected Outcomes:**
- A new `polling/poller.go` contains a `Poller` struct that runs a background goroutine, polls all enabled clusters at the configured interval, and delivers `[]model.NamespaceGroup` snapshots via a channel or callback
- `Poller.AddCluster(name)` starts polling a newly registered cluster immediately
- `Poller.RemoveCluster(name)` stops polling a removed cluster
- The TUI `model.go` is updated to use the new `Poller` instead of its own ticker logic (or keeps its own loop if the refactor is too invasive — see note below)

**Note:** If extracting the poller from Bubble Tea proves too invasive, the web server can instantiate its own independent poller that shares only the `ClusterManager` and `K8sClient` layers. The TUI continues using its internal ticker unchanged. Prefer the simpler path.

**Todo List:**
1. Create `polling/poller.go` with `Poller` struct: holds `*ClusterManager`, interval, per-cluster cancel functions, and an output channel `chan []model.NamespaceGroup`
2. Implement `Poller.Start()` — launches a goroutine per cluster that lists pods and sends aggregated `NamespaceGroup` snapshots; aggregates results from all clusters before sending
3. Implement `Poller.AddCluster(name string)` and `Poller.RemoveCluster(name string)` to dynamically manage per-cluster goroutines
4. Implement `Poller.Stop()` — cancels all goroutines and closes the output channel
5. Wire the web server to use `Poller` (see Sub-Task 4); TUI continues using its existing internal polling

**Relevant Context:**
- `polling/refresh.go` — `K8sClient`, `ListPods` (reused as-is)
- `polling/polling.go` — `DurationFromString`
- `model/pod.go` — `ExtractPod`, `GroupByNamespace`, `DetermineStatus` (reused as data processing)
- `model/model.go` — existing TUI polling ticker for reference

**Status:** [x] done

---

### Sub-Task 3 — Scaffold the React + TypeScript Frontend

**Intent:**
Create the `web/` directory containing the Vite + React + TypeScript project, wired to Carbon Design System (Gray 100 theme), with the shell layout matching the TUI's two-panel design: a left sidebar listing clusters and a main content area showing namespace cards.

**Expected Outcomes:**
- `web/` directory contains a working Vite project (`package.json`, `vite.config.ts`, `tsconfig.json`)
- Dependencies: `@carbon/react`, `@carbon/styles`, `@carbon/icons-react`, `react`, `react-dom`, TypeScript
- Carbon Gray 100 theme applied globally via SCSS import
- App shell renders: Carbon `Header` with app name, Carbon `SideNav` listing clusters with status icons, main content area (placeholder tiles)
- `npm run build` in `web/` produces `web/dist/` with the bundled SPA

**Todo List:**
1. Run `npm create vite@latest web -- --template react-ts` to scaffold the project inside `web/`
2. Install Carbon packages: `@carbon/react`, `@carbon/styles`, `@carbon/icons-react`, `sass`
3. Configure `vite.config.ts`: set `base: './'` (relative paths for `go:embed`), set build output to `web/dist`
4. Create `web/src/styles/index.scss` importing Carbon Gray 100 theme: `@use '@carbon/styles' with ($theme: carbon.$g100)`
5. Create top-level `App.tsx` with Carbon `Theme` wrapper (g100), `Header` (app title), `SideNav` (placeholder cluster list), and `<main>` content area
6. Create `web/src/types/api.ts` — TypeScript interfaces mirroring the Go API shapes: `Cluster`, `NamespaceGroup`, `PodStatus`, `WebSocketMessage`
7. Verify `npm run build` succeeds and `web/dist/` contains `index.html` + assets

**Relevant Context:**
- Carbon UIShell components: `Header`, `HeaderName`, `SideNav`, `SideNavItems`, `SideNavLink`
- Carbon theme: `g100` (darkest, closest to the TUI palette)
- `view/style.go` — existing TUI status colors and icons to reference when mapping to Carbon `Tag` colors

**Status:** [x] done

---

### Sub-Task 4 — Build the Go HTTP + WebSocket Server

**Intent:**
Add the web server to the Go binary. When launched with `--web`, it serves the embedded React SPA, exposes a REST API for cluster management, and streams live pod state over a WebSocket. The TUI path in `main.go` is unchanged.

**Expected Outcomes:**
- `main.go` gains a `--web` flag and an `--addr` flag (default `127.0.0.1:8080`)
- `web/server.go` (new package `webserver`) implements the HTTP server using only Go stdlib `net/http`
- Static assets served from embedded `web/dist/` via `go:embed`
- REST endpoints:
  - `GET /api/clusters` — returns all clusters as JSON
  - `POST /api/clusters` — adds a new cluster, saves config, triggers hot-reload
  - `PUT /api/clusters/{name}` — updates a cluster, saves config, triggers hot-reload
  - `DELETE /api/clusters/{name}` — removes a cluster, saves config, triggers hot-reload
- `GET /ws/pods` — WebSocket; on connect, immediately sends current state snapshot; then sends updated snapshots whenever the `Poller` emits a new result
- All `/api/*` endpoints return JSON; errors returned as `{"error": "..."}` with appropriate HTTP status codes
- Server shutdown is graceful (handles `context.Context` cancellation from main)

**Todo List:**
1. Create `webserver/server.go` — define `Server` struct holding `*ClusterManager`, `*Poller`, config path, and `*http.ServeMux`
2. Implement `Server.Start(ctx context.Context, addr string) error` — registers all routes, starts HTTP server, returns on context cancellation
3. Implement `GET /api/clusters` handler — calls `cm.ListClusters()`, JSON-encodes result
4. Implement `POST /api/clusters` handler — decodes `Cluster` from request body, calls `cm.AddCluster`, calls `config.Save`, returns 201
5. Implement `PUT /api/clusters/{name}` handler — decodes `Cluster`, calls `cm.UpdateCluster`, saves config
6. Implement `DELETE /api/clusters/{name}` handler — calls `cm.RemoveCluster`, saves config
7. Implement `GET /ws/pods` WebSocket handler using `golang.org/x/net/websocket` (already a transitive dependency) or upgrade manually using `net/http` — broadcast latest `NamespaceGroup` JSON on each poller tick; manage a subscriber list
8. Embed `web/dist` with `//go:embed all:web/dist` directive; serve from `http.FileServer` with SPA fallback (all unknown paths serve `index.html`)
9. Update `main.go`: add `--web` and `--addr` flags; when `--web` is set, construct `Poller` + `Server` and call `server.Start` instead of launching Bubble Tea

**Relevant Context:**
- `main.go` — current bootstrap; TUI path must remain unchanged
- `clusters/clusters.go` — `ClusterManager` (extended in Sub-Task 1)
- `polling/poller.go` — `Poller` (created in Sub-Task 2)
- `config/config.go` — `Save` (added in Sub-Task 1)
- Go stdlib `net/http` used exclusively — no third-party HTTP framework
- `golang.org/x/net` is already in `go.sum` as a transitive dep

**Status:** [x] done

---

### Sub-Task 5 — Build the Cluster Sidebar and Live Status Panel in React

**Intent:**
Connect the React SPA to the Go WebSocket and REST API, rendering the cluster sidebar and the namespace card grid — the direct web equivalent of the TUI's two-panel layout.

**Expected Outcomes:**
- `useWebSocket` hook connects to `ws://[host]/ws/pods`, maintains latest `NamespaceGroup[]` state, and reconnects automatically on disconnect
- `useClusters` hook fetches `GET /api/clusters` and exposes cluster list + CRUD actions
- `ClusterSidebar` component renders Carbon `SideNav` with one entry per cluster; each entry shows cluster name + a status icon (CheckmarkFilled=healthy, InlineLoading=polling, ErrorFilled=error) using `@carbon/icons-react`
- `NamespaceGrid` component renders Carbon `Tile` cards in a responsive CSS grid — one card per `NamespaceGroup`; each card shows namespace name, cluster badge, a progress bar (ready/total pods), and Carbon `Tag` components for pod status counts (Failed=red, Busy=blue, Changing=yellow, Idle=green)
- Clicking a cluster in the sidebar filters the namespace grid to that cluster only
- Page title updates with the count of clusters and total pods

**Todo List:**
1. Create `web/src/hooks/useWebSocket.ts` — connects to `/ws/pods`, parses JSON messages into `NamespaceGroup[]`, exposes `{ groups, connected }`, auto-reconnects with 3s back-off
2. Create `web/src/hooks/useClusters.ts` — fetches `/api/clusters` on mount, exposes `{ clusters, addCluster, removeCluster, updateCluster }`
3. Create `web/src/components/ClusterSidebar.tsx` — Carbon `SideNavItems` with per-cluster `SideNavLink`; derive cluster status from whether any `NamespaceGroup` for that cluster has a failed/loading state
4. Create `web/src/components/NamespaceCard.tsx` — Carbon `Tile` with namespace name, cluster `Tag`, pod progress bar (native HTML `<progress>` or Carbon `ProgressBar`), and status count `Tag` row
5. Create `web/src/components/NamespaceGrid.tsx` — renders a CSS grid of `NamespaceCard` components filtered by selected cluster
6. Wire everything in `App.tsx` — compose sidebar + grid, pass selected cluster state down

**Relevant Context:**
- Carbon components: `Tile`, `Tag`, `ProgressBar`, `SideNavLink`, `InlineLoading`
- Carbon icons: `CheckmarkFilled`, `ErrorFilled`, `WarningFilled` from `@carbon/icons-react`
- `model/pod.go` — `NamespaceStatus` values (Idle, Busy, Changing, Failed) map to Carbon Tag types (green, blue, yellow, red)
- `view/namespace.go` — existing TUI namespace card layout for reference

**Status:** [x] done

---

### Sub-Task 6 — Build the Add / Edit / Remove Cluster UI

**Intent:**
Provide a Carbon `Modal` form for adding and editing clusters, and a confirmation dialog for removal. The form exposes the two supported auth methods (kubeconfig path+context and bearer token), submits to the REST API, and reflects changes live in the sidebar.

**Expected Outcomes:**
- A floating action button (Carbon `Button` with `Add` icon) in the sidebar header opens the "Add Cluster" modal
- `ClusterFormModal` renders a Carbon `ComposedModal` with:
  - Name field (`TextInput`, required)
  - Server URL field (`TextInput`, optional — used with bearer auth)
  - Auth type selector (`Select` with options: kubeconfig, bearer)
  - Conditional fields:
    - If kubeconfig: kubeconfig path (`TextInput`) + context (`TextInput`)
    - If bearer: server URL (`TextInput`, required) + bearer token (`PasswordInput`) + insecure TLS toggle (`Toggle`)
  - Namespace filter (`TextInput`, optional)
  - Enabled toggle (`Toggle`, defaults on)
  - Submit calls `POST /api/clusters`; on success, closes modal and refreshes cluster list
  - Validation: name required, no duplicate names, bearer requires server URL
- Each cluster entry in the sidebar has an overflow menu (`OverflowMenu`) with "Edit" and "Remove" actions
- "Edit" opens the same modal pre-populated with existing values; submits to `PUT /api/clusters/{name}`
- "Remove" opens a Carbon `Modal` confirmation; on confirm calls `DELETE /api/clusters/{name}`
- API errors are displayed inside the modal as a Carbon `InlineNotification`

**Todo List:**
1. Create `web/src/components/ClusterFormModal.tsx` — controlled form component accepting optional `initialValues` prop; renders Carbon modal with all form fields; calls `onSubmit(cluster)` on valid submit
2. Create `web/src/components/RemoveClusterModal.tsx` — simple confirmation modal calling `onConfirm()` 
3. Add "Add cluster" button to `ClusterSidebar` header area; wire open/close state
4. Add `OverflowMenu` to each `SideNavLink` entry with Edit/Remove items
5. Wire `onSubmit` in Add modal to `useClusters.addCluster`; wire Edit to `useClusters.updateCluster`; wire Remove confirm to `useClusters.removeCluster`
6. Display Carbon `InlineNotification` in modal on API error (non-2xx response)

**Relevant Context:**
- Carbon components: `ComposedModal`, `ModalHeader`, `ModalBody`, `ModalFooter`, `TextInput`, `PasswordInput`, `Select`, `SelectItem`, `Toggle`, `OverflowMenu`, `OverflowMenuItem`, `InlineNotification`
- `config/config.go` — `Cluster`, `KubeCfg`, `TLSAuth` structs define the shape of the POST/PUT body
- `webserver/server.go` — REST handlers from Sub-Task 4

**Status:** [x] done

---

### Sub-Task 7 — Build Integration and Update README

**Intent:**
Wire the full build pipeline so `go build` produces a self-contained binary with the React SPA embedded. Add a `Makefile` target and update the README to document both modes.

**Expected Outcomes:**
- `Makefile` with targets:
  - `make web-build` — runs `npm run build` in `web/`
  - `make build` — runs `web-build` then `go build -o kubestoplight .`
  - `make run-web` — builds and runs `./kubestoplight --web`
  - `make run-tui` — builds and runs `./kubestoplight`
- `README.md` updated with:
  - Web mode usage: `./kubestoplight --web [--addr 127.0.0.1:8080] [--config path]`
  - How to add remote RKE2 clusters via the UI
  - Build prerequisites (Go 1.21+, Node 20+)
  - Note that Carbon design system packages are installed from npm registry

**Todo List:**
1. Create `Makefile` with the four targets listed above
2. Add `.gitignore` entries for `web/node_modules/`, `web/dist/`
3. Update `README.md` — add Web Mode section, prerequisites, and remote cluster setup instructions
4. Verify end-to-end: `make build` succeeds, binary starts with `--web`, browser opens dashboard, cluster can be added, pods appear in real time

**Relevant Context:**
- `go:embed` directive in `webserver/server.go` requires `web/dist/` to exist at compile time — `make web-build` must run before `go build`
- `web/.gitignore` should exclude `node_modules` and `dist`

**Status:** [x] done

---

## Architecture Diagram (textual)

```
main.go
 ├── (no flags)  →  Bubble Tea TUI  →  existing model/view/polling unchanged
 └── --web flag  →  webserver.Server
                      ├── HTTP static  →  go:embed web/dist  →  React SPA (Carbon g100)
                      ├── GET /api/clusters
                      ├── POST|PUT|DELETE /api/clusters  →  ClusterManager (hot-reload)
                      │                                  →  config.Save (write YAML)
                      └── WebSocket /ws/pods  →  Poller  →  K8sClient per cluster
                                                         →  model.GroupByNamespace
                                             broadcast JSON NamespaceGroup[]
React SPA
 ├── useWebSocket  →  live namespace card grid (Carbon Tile + Tag + ProgressBar)
 ├── useClusters   →  cluster sidebar (Carbon SideNav + icons)
 └── ClusterFormModal  →  add/edit/remove clusters (Carbon ComposedModal)
```

## Dependency Additions

| Layer | Package | Reason |
|-------|---------|--------|
| Go | none (stdlib only) | HTTP server uses `net/http`; WebSocket via manual upgrade or `golang.org/x/net/websocket` (already transitive) |
| npm | `@carbon/react` | UI components |
| npm | `@carbon/styles` | SCSS tokens + theme |
| npm | `@carbon/icons-react` | Status icons |
| npm | `sass` | Required by Carbon SCSS |
| npm | `vite`, `@vitejs/plugin-react` | Build tooling |
| npm | `react`, `react-dom`, TypeScript | Runtime |
