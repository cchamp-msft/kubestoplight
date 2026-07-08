import { useState, lazy, Suspense } from 'react';
import {
  Content,
  Header,
  HeaderName,
  SideNav,
  SkipToContent,
  Theme,
} from '@carbon/react';
import type { Cluster } from './types/api';
import { useClusters } from './hooks/useClusters';
import { useWebSocket } from './hooks/useWebSocket';
import ClusterSidebar from './components/ClusterSidebar';
import NamespaceGrid from './components/NamespaceGrid';
import './App.scss';

// Modals are created in Sub-Task 6 and lazy-loaded so the build passes
// before they exist. The Suspense fallback is null (modals have no visible
// placeholder before they open).
const ClusterFormModal = lazy(() => import('./components/ClusterFormModal'));
const RemoveClusterModal = lazy(() => import('./components/RemoveClusterModal'));

export default function App() {
  const { clusters, addCluster, updateCluster, removeCluster } = useClusters();
  const { groups, connected } = useWebSocket();

  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Cluster | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const totalPods = groups.reduce((n, g) => n + g.totalPods, 0);
  const titleSuffix = clusters.length > 0
    ? ` — ${clusters.length} cluster${clusters.length !== 1 ? 's' : ''}, ${totalPods} pods`
    : '';

  return (
    <Theme theme="g100">
      <Header aria-label="kubestoplight">
        <SkipToContent />
        <HeaderName href="#" prefix="">
          kubestoplight{titleSuffix}
        </HeaderName>
      </Header>

      <div className="app-layout">
        <SideNav
          aria-label="Clusters"
          isFixedNav
          expanded
          isPersistent
          className="app-sidenav"
        >
          <ClusterSidebar
            clusters={clusters}
            groups={groups}
            selected={selectedCluster}
            connected={connected}
            onSelect={setSelectedCluster}
            onAddCluster={() => setAddOpen(true)}
            onEditCluster={(c) => setEditTarget(c)}
            onRemoveCluster={(name) => setRemoveTarget(name)}
          />
        </SideNav>

        <Content className="app-content">
          <NamespaceGrid
            groups={groups}
            selectedCluster={selectedCluster}
          />
        </Content>
      </div>

      {/* ---- Modals (Sub-Task 6) ---- */}
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
    </Theme>
  );
}
