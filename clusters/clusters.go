package clusters

import (
	"fmt"

	"k8s.io/client-go/rest"

	"kubestoplight/config"
)

// ClusterManager manages a set of Kubernetes clusters, resolving their configs.
type ClusterManager struct {
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

// ListClusters returns the cluster configurations.
func (cm *ClusterManager) ListClusters() []config.Cluster {
	return cm.clusters
}

// GetConfig returns the resolved *rest.Config for a cluster by name.
func (cm *ClusterManager) GetConfig(name string) (*rest.Config, error) {
	cfg, ok := cm.cache[name]
	if !ok {
		return nil, fmt.Errorf("cluster %q not found", name)
	}
	return cfg, nil
}

// ClusterNames returns the names of all managed clusters.
func (cm *ClusterManager) ClusterNames() []string {
	names := make([]string, len(cm.clusters))
	for i, c := range cm.clusters {
		names[i] = c.Name
	}
	return names
}

// GetClusterColor returns the user-configured color for a cluster.
// Returns empty string if no color is configured.
func (cm *ClusterManager) GetClusterColor(name string) string {
	for _, c := range cm.clusters {
		if c.Name == name {
			return c.Color
		}
	}
	return ""
}
