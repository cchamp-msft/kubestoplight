package polling

import (
	"context"
	"io"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// K8sClient wraps a Kubernetes client for pod listing.
type K8sClient struct {
	client *kubernetes.Clientset
}

// NewClient creates a new K8sClient from a rest.Config.
func NewClient(cfg *rest.Config) (*K8sClient, error) {
	c, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	return &K8sClient{client: c}, nil
}

// ListPods fetches all pods across all namespaces.
func (c *K8sClient) ListPods() ([]v1.Pod, error) {
	result, err := c.client.CoreV1().Pods("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}

// ListPodsInNamespace fetches pods in a specific namespace.
func (c *K8sClient) ListPodsInNamespace(ns string) ([]v1.Pod, error) {
	result, err := c.client.CoreV1().Pods(ns).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}

// DeletePod deletes a pod by name in the given namespace.
func (c *K8sClient) DeletePod(ns, name string) error {
	return c.client.CoreV1().Pods(ns).Delete(context.Background(), name, metav1.DeleteOptions{})
}

// RestartPod deletes a pod to trigger a restart (lets the controller recreate it).
func (c *K8sClient) RestartPod(ns, name string) error {
	return c.client.CoreV1().Pods(ns).Delete(context.Background(), name, metav1.DeleteOptions{})
}

// GetPod fetches a single pod by namespace and name.
func (c *K8sClient) GetPod(ctx context.Context, ns, name string) (*v1.Pod, error) {
	return c.client.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
}

// GetPodLogs returns a stream of log output for a container in a pod.
func (c *K8sClient) GetPodLogs(ctx context.Context, ns, name, container string, tailLines int64, follow bool) (io.ReadCloser, error) {
	opts := &v1.PodLogOptions{
		Container:  container,
		Follow:     follow,
		Timestamps: true,
	}
	if tailLines > 0 {
		opts.TailLines = &tailLines
	}
	return c.client.CoreV1().Pods(ns).GetLogs(name, opts).Stream(ctx)
}

// GetEvents fetches events matching the given field selector.
func (c *K8sClient) GetEvents(ctx context.Context, ns, fieldSelector string) ([]v1.Event, error) {
	result, err := c.client.CoreV1().Events(ns).List(ctx, metav1.ListOptions{FieldSelector: fieldSelector})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}

// ListJobs fetches all jobs across all namespaces.
func (c *K8sClient) ListJobs() ([]batchv1.Job, error) {
	result, err := c.client.BatchV1().Jobs("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}

// RefreshAllMsg is fired every polling interval.
type RefreshAllMsg struct {
	Time time.Time
}

// ClusterRefreshMsg is fired per-cluster when a refresh completes.
type ClusterRefreshMsg struct {
	Cluster string
	Pods    []v1.Pod
	Err     error
}
