# Handoff: Kubestoplight Web UI — Carbon G100 Redesign

## Overview

Redesign of the kubestoplight web dashboard to fully embrace Carbon Design System (G100 dark theme). Replaces the current TUI-influenced layout with a proper enterprise monitoring dashboard featuring summary statistics, smart filtering, expandable namespace cards with pod-level detail, and a stacked status bar visualization.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the existing Vite + React + TypeScript + `@carbon/react` codebase** using its established patterns (SCSS modules, Carbon component imports, WebSocket data hooks).

The prototype uses a standalone Carbon DS bundle (`window.CarbonDesignSystem_496640`); your implementation should use standard `@carbon/react` imports instead.

## Fidelity

**High-fidelity.** Colors, spacing, typography, and interactions are finalized using Carbon G100 design tokens. Recreate pixel-perfectly using `@carbon/react` components and `--cds-*` CSS custom properties.

---

## Architecture Changes

### Current structure (replace)
```
App.tsx               → Header + SideNav + Content wrapper
ClusterSidebar.tsx    → Cluster list in sidebar
NamespaceGrid.tsx     → Grid of NamespaceCard components
NamespaceCard.tsx     → Individual namespace card
```

### New structure
```
App.tsx               → Simplified shell: header + sidebar + main
ClusterSidebar.tsx    → Rewritten: cluster nav with status dots + pod counts
SummaryStrip.tsx      → NEW: 4 stat tiles across top
FilterBar.tsx         → NEW: Search + status checkboxes + toggles
NamespaceGrid.tsx     → Updated: adds filtering, sorting, expandable cards
NamespaceCard.tsx     → Rewritten: pod grid, stacked status bar, expand/collapse
PodGrid.tsx           → NEW: visual heatmap of pod squares
StatusBar.tsx         → NEW: stacked horizontal bar by status
PodRow.tsx            → NEW: single pod row in expanded card view
```

### Existing files to keep unchanged
```
types/api.ts          → NamespaceGroup, PodItem, etc. — no changes needed
hooks/useWebSocket.ts → Provides groups[] — no changes needed
hooks/useClusters.ts  → Cluster CRUD — no changes needed
ClusterFormModal.tsx  → Keep as-is
RemoveClusterModal.tsx→ Keep as-is
styles/index.scss     → Keep as-is (already sets G100 theme)
```

---

## Screens / Views

### 1. Header Bar (48px)

- **Height:** 48px, fixed at top, `z-index: 8000`
- **Background:** `#161616` (Carbon G100 background)
- **Border bottom:** `1px solid var(--cds-border-subtle-01)`
- **Left:** App name "kubestoplight" — `0.875rem`, weight 600, color `#fff`
- **Left (conditional):** When failed pods > 0, show `<Tag type="red" size="sm">{count} failed</Tag>` with `margin-left: 12px`
- **Right:** Cluster count + pod count — `0.75rem`, color `var(--cds-text-secondary)`, `font-variant-numeric: tabular-nums`
  - Format: `{n} clusters · {n} pods`

### 2. Sidebar (240px)

- **Width:** 240px, fixed left, full height below header
- **Background:** `var(--cds-layer-01)` (#262626 on G100)
- **Border right:** `1px solid var(--cds-border-subtle-01)`

**Section label:**
- Padding: `12px 16px 8px`
- Text "CLUSTERS" — `0.75rem`, weight 600, `letter-spacing: 0.1em`, uppercase, color `var(--cds-text-helper)`
- Right side: connection status dot (8×8px square, green=connected, red=disconnected) + "Live"/"Offline" label

**Nav items (32px height each):**
- Padding: `0 16px`, flex row with `gap: 8px`
- Active state: `background: var(--cds-layer-selected-01)`, `border-left: 3px solid var(--cds-interactive)`
- Inactive: `border-left: 3px solid transparent`
- Hover: `background: var(--cds-layer-hover-01)`
- Font: `0.875rem`, color `var(--cds-text-primary)`, `letter-spacing: 0.16px`

**"All clusters" item:**
- No status dot
- Right-aligned pod count in `0.75rem`, color `var(--cds-text-helper)`, tabular-nums

**Cluster items:**
- 8×8px square status dot (colored by worst namespace status in that cluster)
- Cluster name (ellipsis on overflow)
- Right-aligned pod count

**Footer:**
- `border-top: 1px solid var(--cds-border-subtle-01)`
- Padding: `12px 16px`
- Text: "kubestoplight v0.2.0" — `0.75rem`, color `var(--cds-text-helper)`

### 3. Summary Strip (4 stat tiles)

- **Layout:** CSS Grid, `grid-template-columns: repeat(4, 1fr)`, `gap: 8px`
- **Margin top:** 24px from content area top
- **Each tile:**
  - Background: `var(--cds-layer-01)`
  - Padding: `16px 20px`
  - `border-top: 3px solid {accent-color}`
  - Value: `1.75rem`, weight 400, line-height 1.29, color `var(--cds-text-primary)`, `font-variant-numeric: tabular-nums`
  - Label: `0.75rem`, color `var(--cds-text-helper)`, `letter-spacing: 0.32px`, `margin-top: 4px`
  - Optional subtext: `0.75rem`, color `var(--cds-text-helper)`, `margin-top: 2px`

**Tile definitions:**

| Tile | Label | Value | Accent | Subtext |
|------|-------|-------|--------|---------|
| 1 | Total pods | `{totalPods}` | `var(--cds-border-interactive)` | — |
| 2 | Healthy | `{pct}%` | `var(--cds-support-success)` | `{n} idle` |
| 3 | Failed | `{failedCount}` | red if >0, else `var(--cds-border-subtle-01)` | — |
| 4 | In progress | `{busy+changing}` | `var(--cds-support-info)` | `{n} busy, {n} changing` |

### 4. Filter Bar

- **Layout:** Flex row, `gap: 16px`, `flex-wrap: wrap`
- **Padding:** `16px 0 12px`
- **Border bottom:** `1px solid var(--cds-border-subtle-01)`

**Search:** `<Search size="sm" placeholder="Filter namespaces" />` — flex `1 1 220px`, `min-width: 180px`

**Status checkboxes:** Flex row, `gap: 12px`
- Label prefix "STATUS" — `0.75rem`, weight 600, uppercase, `letter-spacing: 0.32px`, color `var(--cds-text-helper)`
- 4 checkboxes: Failed, Changing, Busy, Idle — all checked by default
- Label format: `{Status} ({count})` where count = number of namespaces with that status
- **Important:** Use `@carbon/react` `Checkbox` component (works correctly in G100 unlike the standalone bundle)

**Toggles:** Flex row, `gap: 16px`, separated by `border-left: 1px solid var(--cds-border-subtle-01)`, `padding-left: 16px`
- `<Toggle size="sm" labelText="Hide all-idle" />` — hides namespaces where ALL pods are Idle
- `<Toggle size="sm" labelText="Hide empty" />` — hides namespaces with 0 active pods (default ON)

### 5. Namespace Card Grid

- **Layout:** CSS Grid, `grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))`, `gap: 8px`
- **Margin top:** 16px below filter bar

### 6. Namespace Card

- **Background:** `var(--cds-layer-01)`
- **Border left:** `3px solid {statusColor}` — status color of the namespace's worst status
- **Hover:** `background: var(--cds-layer-hover-01)`, cursor pointer
- **Transition:** `background-color 150ms cubic-bezier(0.2, 0, 0.38, 0.9)`
- **Click:** toggles expand/collapse

**Card header (padding: `16px 16px 0`):**
- Namespace name: `0.875rem`, weight 600, line-height 1.29, `letter-spacing: 0.16px`, color `var(--cds-text-primary)`, ellipsis overflow
- Right side: `<Tag type="cool-gray" size="sm">{cluster}</Tag>` + chevron icon (16×16, rotates 180° when expanded)

**Pod grid (padding: `12px 16px 0`):**
- Row of 8×8px squares with `gap: 2px`, `flex-wrap: wrap`
- Each square = one pod, colored by status:
  - Idle → `var(--cds-support-success)` (#42be65)
  - Busy → `var(--cds-support-info)` (#4589ff)
  - Changing → `var(--cds-support-warning)` (#f1c21b)
  - Failed → `var(--cds-support-error)` (#fa4d56)
- **Sorted by severity** (failed first, then changing, busy, idle)
- Each square has `title="{podName}: {status}"` for hover tooltip
- Transition: `background-color 240ms cubic-bezier(0.2, 0, 0.38, 0.9)`

**Stacked status bar (padding: `8px 16px 0`):**
- Flex row: bar fills available width, ready label on right
- Bar: 4px height, `background: var(--cds-layer-02)`, segments colored by status (failed → changing → busy → idle, left to right)
- Each segment width = `(count / total) * 100%`
- Transition: `width 400ms cubic-bezier(0.2, 0, 0.38, 0.9)`
- Ready label: `0.75rem`, color `var(--cds-text-helper)`, tabular-nums, format `{ready}/{active} ready`

**Status summary (padding: `8px 16px 16px`):**
- Left: `{n} pods` — `0.75rem`, color `var(--cds-text-helper)`
- Right: status count tags (flex, `gap: 4px`, right-aligned, wrap)
  - `<Tag type="red" size="sm">{n} failed</Tag>` (only if > 0)
  - `<Tag type="teal" size="sm">{n} changing</Tag>` (only if > 0)
  - `<Tag type="blue" size="sm">{n} busy</Tag>` (only if > 0)
  - `<Tag type="green" size="sm">{n} idle</Tag>` (only if > 0)

**Expanded pod detail (conditional, with fade-in animation):**
- `border-top: 1px solid var(--cds-border-subtle-01)`
- Padding: `8px 16px 16px`
- Column headers: grid `1fr auto auto auto`, `gap: 12px` — "NAME", "STATUS", "READY", "AGE"
  - `0.75rem`, weight 600, uppercase, `letter-spacing: 0.32px`, color `var(--cds-text-helper)`
  - `border-bottom: 1px solid var(--cds-border-subtle-01)`

**Pod rows (grid `1fr auto auto auto`, `gap: 12px`):**
- Padding: `6px 0`, `border-bottom: 1px solid var(--cds-border-subtle-01)`
- Name: `font-family: var(--cds-font-mono)`, `0.75rem`, color `var(--cds-text-primary)`, ellipsis
- Status: `<Tag type={statusTagType} size="sm">{status}</Tag>`
- Ready: mono `0.75rem`, color `var(--cds-text-secondary)`, format `{ready}/{total}`
- Age: `0.75rem`, color `var(--cds-text-helper)`

### 7. Empty State

- Centered column, padding `64px 24px`
- Line-art SVG pictogram (64×64px, `opacity: 0.5`, color `var(--cds-text-helper)`)
- Title: `0.875rem`, weight 600, color `var(--cds-text-primary)`
- Message: `0.875rem`, color `var(--cds-text-helper)`, `text-align: center`, `max-width: 320px`
- Two variants: "No matches" (search active) and "All filtered out" (filters too restrictive)

---

## Interactions & Behavior

### Filtering logic (apply in order)
1. **Cluster filter:** if `selectedCluster` is set, show only groups where `g.cluster === selectedCluster`
2. **Search:** case-insensitive match on `g.namespace`
3. **Status filter:** show only groups where `statusFilters[g.status] === true`
4. **Hide all-idle:** if enabled, hide groups where `g.status === 'Idle'`
5. **Hide empty:** if enabled, hide groups where `g.activePods === 0`

### Sorting
Always sort filtered results by severity: Failed (0) → Changing (1) → Busy (2) → Idle (3)

### Auto-expand failed
On initial load, any namespace with `status === 'Failed'` should start expanded (showing pod detail).

### Keyboard
`/` key focuses the search input (unless already in an input/textarea).

### Sidebar cluster selection
- Click "All clusters" → `selectedCluster = null` (show all)
- Click a cluster → `selectedCluster = clusterName` (filter to that cluster)
- Summary strip also respects the cluster filter

### Card expand/collapse
- Click anywhere on the card to toggle
- Chevron rotates 180° with `150ms cubic-bezier(0.2, 0, 0.38, 0.9)` transition
- Pod detail section fades in with a subtle `translateY(-4px) → 0` animation over 150ms

### Worst-status derivation (per cluster in sidebar)
```ts
const severityOrder = ['Failed', 'Changing', 'Busy', 'Idle'];
// Cluster worst = earliest match across all its namespace groups
```

---

## State Management

### New state variables needed in App.tsx
```ts
const [searchQuery, setSearchQuery] = useState('');
const [statusFilters, setStatusFilters] = useState({
  Idle: true, Busy: true, Changing: true, Failed: true
});
const [hideIdle, setHideIdle] = useState(false);
const [hideEmpty, setHideEmpty] = useState(true);  // default ON
const [expandedCards, setExpandedCards] = useState<Set<string>>(() => {
  // Auto-expand failed namespaces on first data load
  const set = new Set<string>();
  groups.forEach(g => {
    if (g.status === 'Failed') set.add(`${g.cluster}/${g.namespace}`);
  });
  return set;
});
```

### Existing state (keep)
```ts
const { clusters, addCluster, updateCluster, removeCluster } = useClusters();
const { groups, connected } = useWebSocket();
const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
// Modal states: addOpen, editTarget, removeTarget
```

---

## Status Color Map

```ts
const STATUS_COLORS: Record<string, string> = {
  Idle:     'var(--cds-support-success)',  // #42be65 on G100
  Busy:     'var(--cds-support-info)',     // #4589ff on G100
  Changing: 'var(--cds-support-warning)',  // #f1c21b on G100
  Failed:   'var(--cds-support-error)',    // #fa4d56 on G100
  Empty:    'var(--cds-text-disabled)',
  Unknown:  'var(--cds-text-helper)',
};

const STATUS_TAG_TYPE: Record<string, string> = {
  Idle: 'green', Busy: 'blue', Changing: 'teal',
  Failed: 'red', Empty: 'gray', Unknown: 'gray',
};

const SEVERITY_ORDER: Record<string, number> = {
  Failed: 0, Changing: 1, Busy: 2, Idle: 3, Empty: 4, Unknown: 5,
};
```

---

## CSS Notes

- **No gradients anywhere.** Pure flat Carbon surfaces.
- **No rounded corners** on cards (Carbon default is 0 border-radius).
- **No box-shadow** on cards or containers.
- **Scrollbar styling** for G100:
  ```css
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--cds-border-subtle-01); }
  ```
- **Card expand keyframe:**
  ```css
  @keyframes kslFadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  ```

---

## Files

Reference these HTML prototype files for visual behavior:

| File | Purpose |
|------|---------|
| `Kubestoplight.html` | Entry point — loads DS tokens + scripts |
| `ksl-components.jsx` | All UI sub-components (PodGrid, StatusBar, SummaryStrip, FilterBar, NamespaceCard, PodRow, EmptyState) |
| `ksl-app.jsx` | App shell, sidebar, mock data generation, filter/sort logic |

The data shape in the prototype matches `types/api.ts` exactly — `NamespaceGroup[]` with `pods: PodItem[]`.
