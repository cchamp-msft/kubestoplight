import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import type { Cluster, PodItem } from './types/api';
import { SEVERITY_ORDER, worstStatus, lensFor } from './constants/status';
import { useClusters } from './hooks/useClusters';
import { useWebSocket } from './hooks/useWebSocket';
import { useServerInfo } from './hooks/useServerInfo';
import { useTabStatus } from './hooks/useTabStatus';
import { useBumpOnRise } from './hooks/useFlashOnChange';
import { usePath } from './hooks/usePath';
import ClusterCards from './components/ClusterCards';
import SummaryStrip from './components/SummaryStrip';
import FilterBar from './components/FilterBar';
import NamespaceGrid from './components/NamespaceGrid';
import BgPicker from './components/BgPicker';
import Beacon from './components/ui/Beacon';
import Icon from './components/ui/Icon';
import Sheet from './components/ui/Sheet';
import './App.scss';

/** The app's pages: the header links, the phone menu and each page's heading. */
const VIEWS = [
  {
    path: '/',
    name: 'Grid',
    title: 'Grid',
    lede: 'Every namespace as a card, worst status first. Pick a cluster to show only its namespaces.',
  },
  {
    path: '/village',
    name: 'Village',
    title: 'Village',
    lede: 'The same clusters as a map. Each node is a settlement and each pod a building that keeps its plot.',
  },
] as const;

const ClusterFormModal = lazy(() => import('./components/ClusterFormModal'));
const RemoveClusterModal = lazy(() => import('./components/RemoveClusterModal'));
const PodDetailPanel = lazy(() => import('./components/PodDetailPanel'));
const VillageView = lazy(() => import('./village/VillageView'));

const ALL_STATUSES = { Idle: true, Busy: true, Changing: true, Failed: true };

export default function App() {
  const { clusters, addCluster, updateCluster, removeCluster } = useClusters();
  const { groups, connected, beat, stale } = useWebSocket();
  const { readOnly } = useServerInfo();

  // Cluster modals
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Cluster | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  // Pod detail panel
  const [panelPod, setPanelPod] = useState<PodItem | null>(null);
  const [panelTab, setPanelTab] = useState(0);

  const onPodDescribe = useCallback((pod: PodItem) => {
    setPanelPod(pod);
    setPanelTab(0);
  }, []);

  const onPodLogs = useCallback((pod: PodItem) => {
    setPanelPod(pod);
    setPanelTab(1);
  }, []);

  // Cluster selection
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  // Grid at /, the village map at /village. The map is a map of everything,
  // so it ignores the cluster selection and the namespace filters below:
  // hiding half a settlement makes it a worse map.
  const { path, follow } = usePath();
  const village = path === '/village';
  const view = village ? VIEWS[1] : VIEWS[0];
  const [menuOpen, setMenuOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<Record<string, boolean>>(ALL_STATUSES);
  const [hideIdle, setHideIdle] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);

  // Expanded cards — auto-expand failed namespaces
  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => new Set<string>());
  const [initialExpandDone, setInitialExpandDone] = useState(false);

  useEffect(() => {
    if (!initialExpandDone && groups.length > 0) {
      const failed = new Set<string>();
      for (const g of groups) {
        if (g.status === 'Failed') failed.add(`${g.cluster}/${g.namespace}`);
      }
      if (failed.size > 0) setExpandedCards(failed);
      setInitialExpandDone(true);
    }
  }, [groups, initialExpandDone]);

  // Keyboard: "/" focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName)) {
        e.preventDefault();
        document.getElementById('ns-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Filtering + sorting
  const filtered = useMemo(() => {
    return groups
      .filter((g) => !selectedCluster || g.cluster === selectedCluster)
      .filter((g) => !searchQuery || g.namespace.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((g) => statusFilters[g.status])
      .filter((g) => !hideIdle || g.status !== 'Idle')
      .filter((g) => !hideEmpty || g.activePods > 0)
      .sort((a, b) => (SEVERITY_ORDER[a.status] ?? 5) - (SEVERITY_ORDER[b.status] ?? 5));
  }, [groups, selectedCluster, searchQuery, statusFilters, hideIdle, hideEmpty]);

  // Namespace status counts for filter badges
  const nsCounts = useMemo(() => {
    const c: Record<string, number> = { Failed: 0, Changing: 0, Busy: 0, Idle: 0 };
    const base = groups.filter((g) => !selectedCluster || g.cluster === selectedCluster);
    for (const g of base) {
      if (c[g.status] != null) c[g.status]++;
    }
    return c;
  }, [groups, selectedCluster]);

  const toggleCard = useCallback((key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allExpanded = useMemo(() => {
    if (filtered.length === 0) return false;
    return filtered.every((g) => expandedCards.has(`${g.cluster}/${g.namespace}`));
  }, [filtered, expandedCards]);

  const toggleAll = useCallback(() => {
    setExpandedCards((prev) => {
      if (allExpanded) return new Set<string>();
      const next = new Set(prev);
      for (const g of filtered) next.add(`${g.cluster}/${g.namespace}`);
      return next;
    });
  }, [allExpanded, filtered]);

  const onStatusFilter = useCallback((status: string, checked: boolean) => {
    setStatusFilters((prev) => ({ ...prev, [status]: checked }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilters(ALL_STATUSES);
    setHideIdle(false);
  }, []);

  // Header stats
  const clusterCount = new Set(groups.map((g) => g.cluster)).size;
  const totalPods = groups.reduce((n, g) => n + g.totalPods, 0);
  const failedCount = groups.reduce((n, g) => n + (g.statusCounts.Failed ?? 0), 0);
  const lit = lensFor(groups.length ? worstStatus(groups.map((g) => g.status)) : null);
  useTabStatus(lit, failedCount);
  const failedBumps = useBumpOnRise(failedCount);
  const liveLabel = !connected ? 'Offline' : stale ? 'Stale' : 'Live';

  // Groups for summary strip (respects cluster filter)
  const summaryGroups = selectedCluster ? groups.filter((g) => g.cluster === selectedCluster) : groups;
  const scopeGroups = summaryGroups.filter((g) => !hideEmpty || g.activePods > 0);

  // Matches the Dweller key built in village/adapter.ts.
  const selectedKey = panelPod ? `${panelPod.cluster}/${panelPod.namespace}/${panelPod.name}` : null;

  return (
    <>
      {/* Jewel's animated background and the strip that hides content above the header */}
      <div className="jewel-bg" aria-hidden="true" />
      <div className="jewel-cap" aria-hidden="true" />
      <BgPicker />

      <div className={`page ksl-page${village ? ' ksl-page--map' : ''}`}>
        {/* ── Header ── */}
        <header className="site-header">
          <div className="panel site-header__inner ksl-header">
            <span className="ksl-brand">
              <Beacon
                lit={lit}
                label={!lit ? 'No data yet' : failedCount > 0 ? `${failedCount} pods failing` : lit === 'caution' ? 'Pods need a look' : 'All healthy'}
              />
              <span className="wordmark">kubestoplight</span>
            </span>
            {failedCount > 0 && (
              // Re-keyed when the count rises, so its one-shot pulse replays.
              <span key={failedBumps} className="badge badge--error ksl-failed-badge">{failedCount}<span className="ksl-failed-badge__word"> failed</span></span>
            )}
            <nav className="nav ksl-header__views" aria-label="Views">
              <div className="nav__links">
                {VIEWS.map((v) => (
                  <a key={v.path} href={v.path} onClick={follow} aria-current={view === v ? 'page' : undefined}>{v.name}</a>
                ))}
              </div>
            </nav>
            <span className="ksl-header__spacer" />
            <span className="ksl-header__stats">
              {clusterCount} cluster{clusterCount !== 1 ? 's' : ''} &middot; {totalPods} pods
            </span>
            {/* The dot ticks once per snapshot (re-keyed on each beat). */}
            <span role="status" className={`badge ksl-live ${!connected ? 'badge--error' : stale ? '' : 'badge--accent'}`}>
              <span key={beat} className={`badge__dot${connected && !stale && beat > 0 ? ' ksl-live__beat' : ''}`} />
              {liveLabel}
            </span>
            {/* Phones: Jewel hides the view links below --bp-md and this opens them in a drawer. */}
            <button
              className="btn btn--ghost btn--icon nav__menu"
              type="button"
              aria-label="Menu"
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
          </div>
        </header>

        {/* ── Page head: what this page is ── */}
        <header className="ksl-pagehead">
          <h1 className="ksl-pagehead__title">{view.title}</h1>
          <p className="ksl-pagehead__lede">{view.lede}</p>
        </header>

        {village ? (
          <main className="panel ksl-map">
            <Suspense fallback={null}>
              <VillageView groups={groups} onPodSelect={onPodDescribe} selectedKey={selectedKey} />
            </Suspense>
          </main>
        ) : (
          <main className="panel-stack ksl-main">
            <section className="panel panel--pad ksl-section" aria-labelledby="clusters-title">
              <header className="section-head ksl-section__head">
                <h2 className="label" id="clusters-title">01 — Clusters</h2>
                <span className="label ksl-section__scope">
                  {selectedCluster ? `Showing ${selectedCluster}` : 'Showing all'}
                </span>
              </header>
              <ClusterCards
                clusters={clusters}
                groups={groups}
                selectedCluster={selectedCluster}
                onSelect={setSelectedCluster}
                readOnly={readOnly}
                onAdd={() => setAddOpen(true)}
                onEdit={setEditTarget}
                onRemove={setRemoveTarget}
              />
            </section>

            <section className="panel panel--pad ksl-section" aria-labelledby="overview-title">
              <header className="section-head ksl-section__head">
                <h2 className="label" id="overview-title">02 — Overview</h2>
                <span className="label ksl-section__scope">{selectedCluster ?? 'All clusters'}</span>
              </header>
              <SummaryStrip groups={summaryGroups} />
            </section>

            <section className="panel panel--pad ksl-section" aria-labelledby="ns-title">
              <header className="section-head ksl-section__head">
                <h2 className="label" id="ns-title">03 — Namespaces</h2>
                <span className="label ksl-section__scope">
                  {filtered.length} of {scopeGroups.length}
                </span>
              </header>

              <FilterBar
                searchQuery={searchQuery}
                onSearch={setSearchQuery}
                statusFilters={statusFilters}
                onStatusFilter={onStatusFilter}
                hideIdle={hideIdle}
                onHideIdle={setHideIdle}
                hideEmpty={hideEmpty}
                onHideEmpty={setHideEmpty}
                nsCounts={nsCounts}
                allExpanded={allExpanded}
                onToggleAll={toggleAll}
              />

              <NamespaceGrid
                groups={filtered}
                totalGroups={groups.length}
                hasClusters={clusters.length > 0 || groups.length > 0}
                expandedCards={expandedCards}
                onToggleCard={toggleCard}
                searchQuery={searchQuery}
                onClearFilters={clearFilters}
                onAddCluster={readOnly ? undefined : () => setAddOpen(true)}
                onPodDescribe={onPodDescribe}
                onPodLogs={onPodLogs}
              />
            </section>
            <p className="caption ksl-footer">
              kubestoplight v0.2.0{readOnly ? ' · read-only: clusters are set in the server config' : ''}
            </p>
          </main>
        )}
      </div>

      {/* ── Menu drawer (phones): opens from the right, where its button is ── */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" placement="end" className="ksl-menu">
        <nav className="side-nav" aria-label="Views">
          <ul className="side-nav__list">
            {VIEWS.map((v) => (
              <li key={v.path}>
                <a
                  className="side-nav__link"
                  href={v.path}
                  aria-current={view === v ? 'page' : undefined}
                  onClick={(e) => { follow(e); setMenuOpen(false); }}
                >
                  {v.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Sheet>

      {/* ── Modals ── */}
      <Suspense fallback={null}>
        {addOpen && (
          <ClusterFormModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onSubmit={async (c) => {
              await addCluster(c);
              setAddOpen(false);
            }}
          />
        )}
        {editTarget && (
          <ClusterFormModal
            open={!!editTarget}
            initialValues={editTarget}
            onClose={() => setEditTarget(null)}
            onSubmit={async (c) => {
              await updateCluster(editTarget.name, c);
              setEditTarget(null);
            }}
          />
        )}
        {removeTarget && (
          <RemoveClusterModal
            open={!!removeTarget}
            clusterName={removeTarget}
            onClose={() => setRemoveTarget(null)}
            onConfirm={async () => {
              await removeCluster(removeTarget);
              if (selectedCluster === removeTarget) setSelectedCluster(null);
              setRemoveTarget(null);
            }}
          />
        )}
      </Suspense>

      {/* ── Pod Detail Panel ── */}
      {panelPod && (
        <Suspense fallback={null}>
          <PodDetailPanel
            pod={panelPod}
            initialTab={panelTab}
            onClose={() => setPanelPod(null)}
          />
        </Suspense>
      )}
    </>
  );
}
