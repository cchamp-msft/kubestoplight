// Package poller provides a standalone background polling engine for
// Kubernetes pod data. It is independent of the Bubble Tea TUI; any consumer
// (web server, CLI, etc.) can use it via the Poller type.
package poller

import (
	"context"
	"sync"
	"time"

	v1 "k8s.io/api/core/v1"

	"kubestoplight/clusters"
	"kubestoplight/model"
	"kubestoplight/polling"
)

// clusterResult carries raw pod data from a single cluster poll cycle.
type clusterResult struct {
	cluster string
	pods    []v1.Pod
	err     error
}

// Poller runs a background polling loop per cluster and emits aggregated
// []model.NamespaceGroup snapshots on the C channel whenever a round-trip
// completes for any cluster.
type Poller struct {
	cm       *clusters.ClusterManager
	interval time.Duration

	mu      sync.Mutex
	cancels map[string]context.CancelFunc

	// resultCh carries per-cluster pod snapshots into the merge goroutine.
	resultCh chan clusterResult

	// C is the output channel; consumers read []model.NamespaceGroup from it.
	C chan []model.NamespaceGroup

	stopOnce sync.Once
	stopCh   chan struct{}
}

// NewPoller creates a Poller backed by the given ClusterManager and interval.
// Call Start() to begin polling.
func NewPoller(cm *clusters.ClusterManager, interval time.Duration) *Poller {
	return &Poller{
		cm:       cm,
		interval: interval,
		cancels:  make(map[string]context.CancelFunc),
		resultCh: make(chan clusterResult, 64),
		C:        make(chan []model.NamespaceGroup, 4),
		stopCh:   make(chan struct{}),
	}
}

// Start launches per-cluster goroutines for all currently enabled clusters and
// begins the merge loop. It is safe to call only once.
func (p *Poller) Start() {
	cls := p.cm.ListClusters()
	for _, c := range cls {
		if c.Enabled {
			p.startCluster(c.Name)
		}
	}
	go p.mergeLoop()
}

// AddCluster starts polling a cluster that was just registered. If a goroutine
// already exists for this name it is a no-op.
func (p *Poller) AddCluster(name string) {
	p.mu.Lock()
	_, exists := p.cancels[name]
	p.mu.Unlock()
	if !exists {
		p.startCluster(name)
	}
}

// RemoveCluster stops the polling goroutine for the named cluster. The cluster
// will no longer contribute to future snapshots.
func (p *Poller) RemoveCluster(name string) {
	p.mu.Lock()
	cancel, ok := p.cancels[name]
	if ok {
		delete(p.cancels, name)
	}
	p.mu.Unlock()
	if ok {
		cancel()
	}
}

// Stop cancels all goroutines, signals the merge loop to exit, and closes C.
func (p *Poller) Stop() {
	p.stopOnce.Do(func() {
		p.mu.Lock()
		for name, cancel := range p.cancels {
			cancel()
			delete(p.cancels, name)
		}
		p.mu.Unlock()

		close(p.stopCh)
	})
}

// startCluster spawns the polling goroutine for a single cluster.
func (p *Poller) startCluster(name string) {
	ctx, cancel := context.WithCancel(context.Background())

	p.mu.Lock()
	// If another goroutine snuck in, cancel the new one and bail.
	if _, exists := p.cancels[name]; exists {
		p.mu.Unlock()
		cancel()
		return
	}
	p.cancels[name] = cancel
	p.mu.Unlock()

	go func() {
		ticker := time.NewTicker(p.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-p.stopCh:
				return
			case <-ticker.C:
				p.pollCluster(ctx, name)
			}
		}
	}()
}

// pollCluster performs one poll for the named cluster and sends the result.
func (p *Poller) pollCluster(ctx context.Context, name string) {
	cfg, err := p.cm.GetConfig(name)
	if err != nil {
		select {
		case p.resultCh <- clusterResult{cluster: name, err: err}:
		case <-ctx.Done():
		case <-p.stopCh:
		}
		return
	}
	client, err := polling.NewClient(cfg)
	if err != nil {
		select {
		case p.resultCh <- clusterResult{cluster: name, err: err}:
		case <-ctx.Done():
		case <-p.stopCh:
		}
		return
	}
	pods, err := client.ListPods()
	select {
	case p.resultCh <- clusterResult{cluster: name, pods: pods, err: err}:
	case <-ctx.Done():
	case <-p.stopCh:
	}
}

// mergeLoop accumulates per-cluster pod caches and emits updated snapshots.
func (p *Poller) mergeLoop() {
	defer close(p.C)

	podCache := make(map[string][]model.Pod)

	for {
		select {
		case <-p.stopCh:
			return
		case res, ok := <-p.resultCh:
			if !ok {
				return
			}
			if res.err != nil {
				// Remove stale data for this cluster on error.
				delete(podCache, res.cluster)
			} else {
				pods := make([]model.Pod, 0, len(res.pods))
				for _, raw := range res.pods {
					pods = append(pods, model.ExtractPod(raw, res.cluster))
				}
				podCache[res.cluster] = pods
			}

			// Flatten all cached pods and group by namespace.
			var all []model.Pod
			for _, clPods := range podCache {
				all = append(all, clPods...)
			}
			snapshot := model.GroupByNamespace(all)

			// Non-blocking send: drop if consumer is behind.
			select {
			case p.C <- snapshot:
			default:
			}
		}
	}
}
