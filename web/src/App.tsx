import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Tag, Theme } from '@carbon/react';
import type { Cluster, PodItem } from './types/api';
import { SEVERITY_ORDER } from './constants/status';
import { useClusters } from './hooks/useClusters';
import { useWebSocket } from './hooks/useWebSocket';
import ClusterSidebar from './components/ClusterSidebar';
import SummaryStrip from './components/SummaryStrip';
import FilterBar from './components/FilterBar';
import NamespaceGrid from './components/NamespaceGrid';
import './App.scss';

const ClusterFormModal = lazy(() => import('./components/ClusterFormModal'));
const RemoveClusterModal = lazy(() => import('./components/RemoveClusterModal'));
const PodDetailPanel = lazy(() => import('./components/PodDetailPanel'));

export default function App() {
  const { addCluster, updateCluster, removeCluster } = useClusters();
  const { groups, connected } = useWebSocket();

  // Existing modal state
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

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<Record<string, boolean>>({
    Idle: true,
    Busy: true,
    Changing: true,
    Failed: true,
  });
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
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) {
        e.preventDefault();
        (document.querySelector('#ns-search input') as HTMLElement)?.focus();
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

  // Header stats
  const clusterCount = new Set(groups.map((g) => g.cluster)).size;
  const totalPods = groups.reduce((n, g) => n + g.totalPods, 0);
  const failedCount = groups.reduce((n, g) => n + (g.statusCounts.Failed ?? 0), 0);

  // Groups for summary strip (respects cluster filter)
  const summaryGroups = selectedCluster ? groups.filter((g) => g.cluster === selectedCluster) : groups;

  return (
    <Theme theme="g100">
      <div className="ksl-shell">
        {/* ── Header ── */}
        <header className="ksl-header">
          <span className="ksl-header__title">kubestoplight</span>
          {failedCount > 0 && (
            <Tag type="red" size="sm" className="ksl-header__failed-tag">
              {failedCount} failed
            </Tag>
          )}
          <div style={{ flex: 1 }} />
          <span className="ksl-header__stats">
            {clusterCount} cluster{clusterCount !== 1 ? 's' : ''} &middot; {totalPods} pods
          </span>
        </header>

        {/* ── Body ── */}
        <div className="ksl-body">
          {/* Sidebar */}
          <aside className="ksl-body__sidebar">
            <ClusterSidebar
              groups={groups}
              selectedCluster={selectedCluster}
              onSelect={setSelectedCluster}
              connected={connected}
            />
          </aside>

          {/* Main content */}
          <main className="ksl-body__main">
            <div className="ksl-content">
              <div className="ksl-content__summary">
                <SummaryStrip groups={summaryGroups} />
              </div>

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
                expandedCards={expandedCards}
                onToggleCard={toggleCard}
                hasSearch={!!searchQuery}
                onPodDescribe={onPodDescribe}
                onPodLogs={onPodLogs}
              />
            </div>
          </main>
        </div>
      </div>

      {/* ── Modals ── */}
      <Suspense fallback={null}>
        <ClusterFormModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSubmit={async (c) => {
            await addCluster(c);
            setAddOpen(false);
          }}
        />
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
    </Theme>
  );
}
