package polling

import (
	"context"
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
