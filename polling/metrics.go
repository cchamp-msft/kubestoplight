package polling

import (
	"context"
	"encoding/json"

	"k8s.io/apimachinery/pkg/api/resource"
)

// PodMetrics is live resource usage for one pod, summed across its containers.
type PodMetrics struct {
	Namespace string
	Name      string
	CPUMilli  int64
	MemBytes  int64
}

// metricsList mirrors just enough of metrics.k8s.io/v1beta1 PodMetricsList to
// avoid pulling in k8s.io/metrics for four fields. The API is long-stable at
// v1beta1, and everything below is required by the schema.
type metricsList struct {
	Items []struct {
		Metadata struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
		} `json:"metadata"`
		Containers []struct {
			Usage struct {
				CPU    string `json:"cpu"`
				Memory string `json:"memory"`
			} `json:"usage"`
		} `json:"containers"`
	} `json:"items"`
}

// ListPodMetrics returns per-pod usage from metrics-server.
//
// Callers should treat an error as "no usage data", not as a failure: plenty of
// clusters run without metrics-server, and the rest of the snapshot is still
// valid without it.
func (c *K8sClient) ListPodMetrics(ctx context.Context) ([]PodMetrics, error) {
	raw, err := c.client.RESTClient().
		Get().
		AbsPath("/apis/metrics.k8s.io/v1beta1/pods").
		DoRaw(ctx)
	if err != nil {
		return nil, err
	}

	var list metricsList
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, err
	}

	out := make([]PodMetrics, 0, len(list.Items))
	for _, item := range list.Items {
		pm := PodMetrics{Namespace: item.Metadata.Namespace, Name: item.Metadata.Name}
		for _, ctr := range item.Containers {
			// metrics-server reports CPU in nanocores ("123456789n") as often as
			// millicores, so parse as a Quantity rather than trimming a suffix.
			if q, err := resource.ParseQuantity(ctr.Usage.CPU); err == nil {
				pm.CPUMilli += q.MilliValue()
			}
			if q, err := resource.ParseQuantity(ctr.Usage.Memory); err == nil {
				pm.MemBytes += q.Value()
			}
		}
		out = append(out, pm)
	}
	return out, nil
}
