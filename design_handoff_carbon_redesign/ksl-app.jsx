/* ksl-app.jsx — Kubestoplight main App + mock data */

const { useState, useEffect, useMemo, useCallback } = React;
const { Tag, InlineNotification, Button } = window.CarbonDesignSystem_496640;
const {
  KSLSummaryStrip, KSLFilterBar, KSLNamespaceCard, KSLEmptyState,
  KSL_STATUS_COLORS, KSL_SEVERITY,
} = window;

/* ═══════════════════════════════════════════
   Mock Data
   ═══════════════════════════════════════════ */

function makePod(name, ns, cluster, status, ready, total, age, node) {
  return {
    name, namespace: ns, cluster, node: node || 'node-1', status,
    phase: status === 'Failed' ? 'Failed' : 'Running',
    ready, total, age, qos: 'BestEffort',
  };
}

function makeNs(ns, cluster, pods) {
  const sc = { Idle: 0, Busy: 0, Changing: 0, Failed: 0, Unknown: 0 };
  pods.forEach(p => { sc[p.status] = (sc[p.status] || 0) + 1; });
  const active = pods.filter(p => p.phase !== 'Succeeded').length;
  const ready = pods.filter(p => p.phase !== 'Succeeded' && p.ready === p.total && p.total > 0).length;
  const order = ['Failed', 'Changing', 'Busy', 'Idle'];
  let st = 'Idle';
  for (const s of order) { if (sc[s] > 0) { st = s; break; } }
  return { namespace: ns, cluster, totalPods: pods.length, activePods: active, readyPods: ready, status: st, statusCounts: sc, pods };
}

const C1 = 'rke2-prod', C2 = 'rke2-staging';

function generateMockData() {
  return [
    makeNs('kube-system', C1, [
      makePod('coredns-7c4f8-abc12', 'kube-system', C1, 'Idle', 2, 2, '14d', 'node-1'),
      makePod('coredns-7c4f8-def34', 'kube-system', C1, 'Idle', 2, 2, '14d', 'node-2'),
      makePod('etcd-node-1', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-1'),
      makePod('etcd-node-2', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-2'),
      makePod('etcd-node-3', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-3'),
      makePod('kube-apiserver-node-1', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-1'),
      makePod('kube-apiserver-node-2', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-2'),
      makePod('kube-controller-mgr-1', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-1'),
      makePod('kube-scheduler-node-1', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-1'),
      makePod('kube-proxy-w2x1k', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-1'),
      makePod('kube-proxy-y3z2l', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-2'),
      makePod('kube-proxy-a4b3m', 'kube-system', C1, 'Idle', 1, 1, '32d', 'node-3'),
    ]),
    makeNs('monitoring', C1, [
      makePod('prometheus-k8s-0', 'monitoring', C1, 'Idle', 2, 2, '7d', 'node-1'),
      makePod('prometheus-k8s-1', 'monitoring', C1, 'Idle', 2, 2, '7d', 'node-2'),
      makePod('grafana-5f8c7-x1y2z', 'monitoring', C1, 'Idle', 1, 1, '7d', 'node-1'),
      makePod('alertmanager-main-0', 'monitoring', C1, 'Failed', 0, 2, '47m', 'node-1'),
      makePod('alertmanager-main-1', 'monitoring', C1, 'Busy', 2, 2, '7d', 'node-2'),
      makePod('node-exporter-abc12', 'monitoring', C1, 'Idle', 1, 1, '7d', 'node-1'),
      makePod('node-exporter-def34', 'monitoring', C1, 'Idle', 1, 1, '7d', 'node-2'),
      makePod('node-exporter-ghi56', 'monitoring', C1, 'Idle', 1, 1, '7d', 'node-3'),
    ]),
    makeNs('cattle-system', C1, [
      makePod('rancher-7d9f8-abc12', 'cattle-system', C1, 'Idle', 2, 2, '21d', 'node-1'),
      makePod('rancher-7d9f8-def34', 'cattle-system', C1, 'Idle', 2, 2, '21d', 'node-2'),
      makePod('rancher-7d9f8-ghi56', 'cattle-system', C1, 'Idle', 2, 2, '21d', 'node-3'),
      makePod('rancher-webhook-abc1', 'cattle-system', C1, 'Idle', 1, 1, '21d', 'node-1'),
    ]),
    makeNs('ingress-nginx', C1, [
      makePod('controller-abc12', 'ingress-nginx', C1, 'Idle', 1, 1, '14d', 'node-1'),
      makePod('controller-def34', 'ingress-nginx', C1, 'Idle', 1, 1, '14d', 'node-2'),
      makePod('controller-ghi56', 'ingress-nginx', C1, 'Idle', 1, 1, '14d', 'node-3'),
    ]),
    makeNs('cert-manager', C1, [
      makePod('cert-manager-84c9-xyz', 'cert-manager', C1, 'Idle', 1, 1, '14d', 'node-1'),
      makePod('cainjector-5b7d-abc', 'cert-manager', C1, 'Idle', 1, 1, '14d', 'node-2'),
      makePod('webhook-7f8c-def', 'cert-manager', C1, 'Idle', 1, 1, '14d', 'node-1'),
    ]),
    makeNs('longhorn-system', C1, [
      makePod('longhorn-mgr-abc12', 'longhorn-system', C1, 'Idle', 1, 1, '21d', 'node-1'),
      makePod('longhorn-mgr-def34', 'longhorn-system', C1, 'Idle', 1, 1, '21d', 'node-2'),
      makePod('longhorn-mgr-ghi56', 'longhorn-system', C1, 'Idle', 1, 1, '21d', 'node-3'),
      makePod('longhorn-driver-abc', 'longhorn-system', C1, 'Idle', 1, 1, '21d', 'node-1'),
      makePod('csi-attacher-xyz12', 'longhorn-system', C1, 'Idle', 1, 1, '21d', 'node-1'),
    ]),
    makeNs('app-production', C1, [
      makePod('api-7d8f9-abc12', 'app-production', C1, 'Idle', 2, 2, '3d', 'node-1'),
      makePod('api-7d8f9-def34', 'app-production', C1, 'Idle', 2, 2, '3d', 'node-2'),
      makePod('api-b3c2a-xyz99', 'app-production', C1, 'Changing', 0, 2, '12s', 'node-3'),
      makePod('worker-4e5f6-abc12', 'app-production', C1, 'Idle', 1, 1, '3d', 'node-1'),
      makePod('worker-4e5f6-def34', 'app-production', C1, 'Idle', 1, 1, '3d', 'node-2'),
      makePod('scheduler-1a2b3-abc', 'app-production', C1, 'Idle', 1, 1, '3d', 'node-1'),
    ]),
    makeNs('logging', C1, [
      makePod('fluentbit-w2x1k', 'logging', C1, 'Idle', 1, 1, '14d', 'node-1'),
      makePod('fluentbit-y3z2l', 'logging', C1, 'Idle', 1, 1, '14d', 'node-2'),
      makePod('fluentbit-a4b3m', 'logging', C1, 'Idle', 1, 1, '14d', 'node-3'),
    ]),
    /* ── rke2-staging ── */
    makeNs('kube-system', C2, [
      makePod('coredns-8d5g9-jkl45', 'kube-system', C2, 'Idle', 2, 2, '10d', 'stg-1'),
      makePod('coredns-8d5g9-mno67', 'kube-system', C2, 'Idle', 2, 2, '10d', 'stg-2'),
      makePod('etcd-stg-1', 'kube-system', C2, 'Idle', 1, 1, '28d', 'stg-1'),
      makePod('kube-apiserver-stg-1', 'kube-system', C2, 'Idle', 1, 1, '28d', 'stg-1'),
      makePod('kube-controller-stg', 'kube-system', C2, 'Idle', 1, 1, '28d', 'stg-1'),
      makePod('kube-scheduler-stg', 'kube-system', C2, 'Idle', 1, 1, '28d', 'stg-1'),
      makePod('kube-proxy-stg-p1q2', 'kube-system', C2, 'Idle', 1, 1, '28d', 'stg-1'),
      makePod('kube-proxy-stg-r3s4', 'kube-system', C2, 'Idle', 1, 1, '28d', 'stg-2'),
    ]),
    makeNs('app-staging', C2, [
      makePod('api-a1b2c-jkl45', 'app-staging', C2, 'Failed', 0, 2, '2h', 'stg-1'),
      makePod('api-a1b2c-mno67', 'app-staging', C2, 'Failed', 0, 2, '2h', 'stg-2'),
      makePod('worker-d3e4f-jkl45', 'app-staging', C2, 'Busy', 1, 1, '1d', 'stg-1'),
      makePod('scheduler-g5h6i-jk', 'app-staging', C2, 'Idle', 1, 1, '1d', 'stg-1'),
    ]),
    makeNs('monitoring', C2, [
      makePod('prometheus-stg-0', 'monitoring', C2, 'Idle', 2, 2, '10d', 'stg-1'),
      makePod('grafana-stg-abc12', 'monitoring', C2, 'Idle', 1, 1, '10d', 'stg-1'),
      makePod('node-exporter-stg-1', 'monitoring', C2, 'Idle', 1, 1, '10d', 'stg-1'),
    ]),
    makeNs('default', C2, [
      makePod('test-deploy-x7y8z', 'default', C2, 'Changing', 0, 1, '5m', 'stg-1'),
      makePod('debug-pod-abc12', 'default', C2, 'Idle', 1, 1, '6h', 'stg-2'),
    ]),
  ];
}

/* ─── Simulation ─── */

function recalcNs(ns) {
  const sc = { Idle: 0, Busy: 0, Changing: 0, Failed: 0, Unknown: 0 };
  ns.pods.forEach(p => { sc[p.status] = (sc[p.status] || 0) + 1; });
  ns.statusCounts = sc;
  ns.activePods = ns.pods.filter(p => p.phase !== 'Succeeded').length;
  ns.readyPods = ns.pods.filter(p => p.phase !== 'Succeeded' && p.ready === p.total && p.total > 0).length;
  ns.totalPods = ns.pods.length;
  const order = ['Failed', 'Changing', 'Busy', 'Idle'];
  ns.status = 'Idle';
  for (const s of order) { if (sc[s] > 0) { ns.status = s; break; } }
}

function simulateUpdate(groups) {
  const g = JSON.parse(JSON.stringify(groups));
  const ni = Math.floor(Math.random() * g.length);
  const ns = g[ni];
  if (!ns.pods.length) return g;
  const pi = Math.floor(Math.random() * ns.pods.length);
  const pod = ns.pods[pi];
  const tx = {
    Idle:     ['Idle','Idle','Idle','Idle','Changing','Busy'],
    Busy:     ['Busy','Idle','Idle','Changing'],
    Changing: ['Changing','Idle','Idle','Idle'],
    Failed:   ['Failed','Failed','Changing','Idle'],
  };
  const opts = tx[pod.status] || ['Idle'];
  const next = opts[Math.floor(Math.random() * opts.length)];
  pod.status = next;
  pod.ready = next === 'Failed' ? 0 : pod.total;
  pod.phase = next === 'Failed' ? 'Failed' : 'Running';
  recalcNs(ns);
  return g;
}

/* ═══════════════════════════════════════════
   Sidebar
   ═══════════════════════════════════════════ */

function ClusterSidebar({ groups, selectedCluster, onSelect, connected }) {
  const clusters = useMemo(() => {
    const map = new Map();
    groups.forEach(g => {
      if (!map.has(g.cluster)) map.set(g.cluster, { pods: 0, worst: 'Idle' });
      const c = map.get(g.cluster);
      c.pods += g.totalPods;
      const sev = ['Failed', 'Changing', 'Busy', 'Idle'];
      if (sev.indexOf(g.status) < sev.indexOf(c.worst)) c.worst = g.status;
    });
    return map;
  }, [groups]);

  const totalPods = groups.reduce((n, g) => n + g.totalPods, 0);

  const navItemStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0 16px', height: 32, cursor: 'pointer',
    backgroundColor: active ? 'var(--cds-layer-selected-01)' : 'transparent',
    borderLeft: active ? '3px solid var(--cds-interactive)' : '3px solid transparent',
    transition: 'background-color 110ms',
    fontSize: '0.875rem', color: 'var(--cds-text-primary)',
    letterSpacing: '0.16px', lineHeight: 1.29,
  });

  return (
    <nav style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: 'var(--cds-layer-01)',
    }}>
      {/* Section label */}
      <div style={{
        padding: '12px 16px 8px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--cds-border-subtle-01)',
      }}>
        <span style={{
          fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--cds-text-helper)',
        }}>Clusters</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8,
            backgroundColor: connected ? 'var(--cds-support-success)' : 'var(--cds-support-error)',
          }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-helper)' }}>
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* All clusters */}
      <div style={navItemStyle(!selectedCluster)}
        onClick={() => onSelect(null)}
        onMouseEnter={e => { if (!selectedCluster) return; e.currentTarget.style.backgroundColor = 'var(--cds-layer-hover-01)'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = !selectedCluster ? 'var(--cds-layer-selected-01)' : 'transparent'; }}>
        <span style={{ flex: 1 }}>All clusters</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-helper)', fontVariantNumeric: 'tabular-nums' }}>
          {totalPods}
        </span>
      </div>

      {/* Individual clusters */}
      {[...clusters.entries()].map(([name, info]) => (
        <div key={name} style={navItemStyle(selectedCluster === name)}
          onClick={() => onSelect(name)}
          onMouseEnter={e => { if (selectedCluster === name) return; e.currentTarget.style.backgroundColor = 'var(--cds-layer-hover-01)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = selectedCluster === name ? 'var(--cds-layer-selected-01)' : 'transparent'; }}>
          <span style={{
            width: 8, height: 8, flexShrink: 0,
            backgroundColor: KSL_STATUS_COLORS[info.worst],
          }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-helper)', fontVariantNumeric: 'tabular-nums' }}>
            {info.pods}
          </span>
        </div>
      ))}

      {/* Footer */}
      <div style={{ flex: 1 }} />
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--cds-border-subtle-01)',
        fontSize: '0.75rem', color: 'var(--cds-text-helper)',
        letterSpacing: '0.32px',
      }}>
        kubestoplight <span style={{ opacity: 0.6 }}>v0.2.0</span>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════ */

const initialData = generateMockData();

function KubestoplightApp() {
  const [groups, setGroups] = useState(initialData);
  const [connected] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState({ Idle: true, Busy: true, Changing: true, Failed: true });
  const [hideIdle, setHideIdle] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [expandedCards, setExpandedCards] = useState(() => {
    const set = new Set();
    initialData.forEach(g => { if (g.status === 'Failed') set.add(`${g.cluster}/${g.namespace}`); });
    return set;
  });

  /* Live simulation */
  useEffect(() => {
    const id = setInterval(() => setGroups(prev => simulateUpdate(prev)), 5000);
    return () => clearInterval(id);
  }, []);

  /* Keyboard: / focuses search */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        document.querySelector('#ns-search input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* Filtering + sorting */
  const filtered = useMemo(() => {
    return groups
      .filter(g => !selectedCluster || g.cluster === selectedCluster)
      .filter(g => !searchQuery || g.namespace.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(g => statusFilters[g.status])
      .filter(g => !hideIdle || g.status !== 'Idle')
      .filter(g => !hideEmpty || g.activePods > 0)
      .sort((a, b) => (KSL_SEVERITY[a.status] ?? 5) - (KSL_SEVERITY[b.status] ?? 5));
  }, [groups, selectedCluster, searchQuery, statusFilters, hideIdle, hideEmpty]);

  /* Namespace status counts (for filter badges) */
  const nsCounts = useMemo(() => {
    const c = { Failed: 0, Changing: 0, Busy: 0, Idle: 0 };
    const base = groups.filter(g => !selectedCluster || g.cluster === selectedCluster);
    base.forEach(g => { if (c[g.status] != null) c[g.status]++; });
    return c;
  }, [groups, selectedCluster]);

  const toggleCard = useCallback((key) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const onStatusFilter = useCallback((status, checked) => {
    setStatusFilters(prev => ({ ...prev, [status]: checked }));
  }, []);

  const failedCount = useMemo(() =>
    groups.reduce((n, g) => n + (g.statusCounts.Failed || 0), 0),
  [groups]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--cds-font-sans)' }}>
      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', height: 48,
        backgroundColor: '#161616', padding: '0 16px', flexShrink: 0,
        borderBottom: '1px solid var(--cds-border-subtle-01)',
        zIndex: 8000,
      }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff' }}>
          kubestoplight
        </span>
        {failedCount > 0 && (
          <Tag type="red" size="sm" style={{ marginLeft: 12 }}>
            {failedCount} failed
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: '0.75rem', color: 'var(--cds-text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {[...new Set(groups.map(g => g.cluster))].length} clusters · {groups.reduce((n, g) => n + g.totalPods, 0)} pods
        </span>
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{
          width: 240, flexShrink: 0, overflow: 'hidden',
          borderRight: '1px solid var(--cds-border-subtle-01)',
        }}>
          <ClusterSidebar
            groups={groups}
            selectedCluster={selectedCluster}
            onSelect={setSelectedCluster}
            connected={connected}
          />
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--cds-background)' }}>
          <div style={{ padding: '0 24px 24px', maxWidth: 1440 }}>
            {/* Summary */}
            <div style={{ paddingTop: 24 }}>
              <KSLSummaryStrip groups={
                selectedCluster ? groups.filter(g => g.cluster === selectedCluster) : groups
              } />
            </div>

            {/* Filters */}
            <KSLFilterBar
              searchQuery={searchQuery} onSearch={setSearchQuery}
              statusFilters={statusFilters} onStatusFilter={onStatusFilter}
              hideIdle={hideIdle} onHideIdle={setHideIdle}
              hideEmpty={hideEmpty} onHideEmpty={setHideEmpty}
              nsCounts={nsCounts}
            />

            {/* Namespace grid */}
            {filtered.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 8, marginTop: 16,
                backgroundColor: 'var(--cds-background)',
              }}>
                {filtered.map(g => {
                  const key = `${g.cluster}/${g.namespace}`;
                  return (
                    <KSLNamespaceCard key={key} group={g}
                      expanded={expandedCards.has(key)}
                      onToggle={() => toggleCard(key)} />
                  );
                })}
              </div>
            ) : (
              <KSLEmptyState
                title={searchQuery ? 'No matches' : 'All filtered out'}
                message={searchQuery
                  ? `No namespaces match "${searchQuery}".`
                  : 'Adjust status filters or toggle "Hide all-idle" to see namespaces.'}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<KubestoplightApp />);
