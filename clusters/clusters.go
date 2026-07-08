package clusters

import (
	"fmt"
	"sync"

	"k8s.io/client-go/rest"

	"kubestoplight/config"
)

// ClusterManager manages a set of Kubernetes clusters, resolving their configs.
type ClusterManager struct {
	mu       sync.RWMutex
	clusters []config.Cluster
	resolver Resolver
	cache    map[string]*rest.Config
}

// NewManager creates a new ClusterManager and resolves all cluster configs.
func NewManager(clusters []config.Cluster) (*ClusterManager, error) {
	cm := &ClusterManager{
		clusters: clusters,
		resolver: NewResolver(),
		cache:    make(map[string]*rest.Config),
	}

	for _, c := range cm.clusters {
		cfg, err := cm.resolver.Resolve(c)
		if err != nil {
			return nil, fmt.Errorf("resolve cluster %q: %w", c.Name, err)
		}
		cm.cache[c.Name] = cfg
	}

	return cm, nil
}

// ListClusters returns a snapshot of the cluster configurations.
func (cm *ClusterManager) ListClusters() []config.Cluster {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	out := make([]config.Cluster, len(cm.clusters))
	copy(out, cm.clusters)
	return out
}

// GetConfig returns the resolved *rest.Config for a cluster by name.
func (cm *ClusterManager) GetConfig(name string) (*rest.Config, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	cfg, ok := cm.cache[name]
	if !ok {
		return nil, fmt.Errorf("cluster %q not found", name)
	}
	return cfg, nil
}

// AddCluster resolves the new cluster's auth config and adds it to the manager.
// Returns an error if a cluster with the same name already exists.
func (cm *ClusterManager) AddCluster(c config.Cluster) error {
	resolved, err := cm.resolver.Resolve(c)
	if err != nil {
		return fmt.Errorf("resolve cluster %q: %w", c.Name, err)
	}
	cm.mu.Lock()
	defer cm.mu.Unlock()
	for _, existing := range cm.clusters {
		if existing.Name == c.Name {
			return fmt.Errorf("cluster %q already exists", c.Name)
		}
	}
	cm.clusters = append(cm.clusters, c)
	cm.cache[c.Name] = resolved
	return nil
}

// RemoveCluster removes a cluster by name. Returns an error if not found.
func (cm *ClusterManager) RemoveCluster(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	for i, c := range cm.clusters {
		if c.Name == name {
			cm.clusters = append(cm.clusters[:i], cm.clusters[i+1:]...)
			delete(cm.cache, name)
			return nil
		}
	}
	return fmt.Errorf("cluster %q not found", name)
}

// UpdateCluster replaces an existing cluster entry and re-resolves its auth config.
// Returns an error if the cluster does not exist.
func (cm *ClusterManager) UpdateCluster(c config.Cluster) error {
	resolved, err := cm.resolver.Resolve(c)
	if err != nil {
		return fmt.Errorf("resolve cluster %q: %w", c.Name, err)
	}
	cm.mu.Lock()
	defer cm.mu.Unlock()
	for i, existing := range cm.clusters {
		if existing.Name == c.Name {
			cm.clusters[i] = c
			cm.cache[c.Name] = resolved
			return nil
		}
	}
	return fmt.Errorf("cluster %q not found", c.Name)
}

// ClusterNames returns the names of all managed clusters.
func (cm *ClusterManager) ClusterNames() []string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	names := make([]string, len(cm.clusters))
	for i, c := range cm.clusters {
		names[i] = c.Name
	}
	return names
}

// GetClusterColor returns the user-configured color for a cluster.
// Returns empty string if no color is configured.
func (cm *ClusterManager) GetClusterColor(name string) string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	for _, c := range cm.clusters {
		if c.Name == name {
			return c.Color
		}
	}
	return ""
}
