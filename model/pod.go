package model

import (
	"fmt"
	"time"

	v1 "k8s.io/api/core/v1"
)

// PodStatus represents the operational state of a pod.
type PodStatus int

const (
	StatusIdle PodStatus = iota
	StatusBusy
	StatusChanging
	StatusFailed
	StatusEmpty
)

func (s PodStatus) String() string {
	switch s {
	case StatusIdle:
		return "Idle"
	case StatusBusy:
		return "Busy"
	case StatusChanging:
		return "Changing"
	case StatusFailed:
		return "Failed"
	case StatusEmpty:
		return "Empty"
	default:
		return "Unknown"
	}
}

// Pod holds the full state of a Kubernetes pod for display in the TUI.
type Pod struct {
	Name       string
	Namespace  string
	Cluster    string
	Node       string
	Status     PodStatus
	Phase      v1.PodPhase
	Containers []Container
	Ready      int
	Total      int
	Age        time.Duration
	QOS        string
}

// Container holds the state of a single container within a pod.
type Container struct {
	Name       string
	Ready      bool
	Restarting bool
}

// PodGroup groups pods with the same name across clusters.
type PodGroup struct {
	Name    string
	Pods    []Pod
	Cluster string // primary cluster name
}

// DetermineStatus computes the PodStatus from raw K8s pod data.
func DetermineStatus(pod v1.Pod) PodStatus {
	if len(pod.Status.ContainerStatuses) == 0 {
		return StatusEmpty
	}

	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && isFatalWaitingState(cs.State.Waiting.Reason) {
			return StatusFailed
		}
		if cs.State.Terminated != nil && isFailureTerminated(cs.State.Terminated.Reason) {
			return StatusFailed
		}
	}

	switch pod.Status.Phase {
	case v1.PodRunning:
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.RestartCount > 0 {
				return StatusBusy
			}
		}
		if !pod.DeletionTimestamp.IsZero() {
			return StatusChanging
		}
		return StatusIdle

	case v1.PodPending:
		return StatusChanging

	case v1.PodSucceeded:
		return StatusIdle

	case v1.PodFailed:
		return StatusFailed

	default:
		return StatusChanging
	}
}

func isFatalWaitingState(reason string) bool {
	switch reason {
	case "CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull",
		"CreateContainerConfigError", "InvalidImageName":
		return true
	}
	return false
}

func isFailureTerminated(reason string) bool {
	return reason == "Error" || reason == "OOMKilled"
}

// ExtractPod builds a domain Pod from a K8s v1.Pod.
func ExtractPod(raw v1.Pod, clusterName string) Pod {
	ready := 0
	var containers []Container
	for _, cs := range raw.Status.ContainerStatuses {
		containers = append(containers, Container{
			Name:       cs.Name,
			Ready:      cs.Ready,
			Restarting: cs.RestartCount > 0,
		})
		if cs.Ready {
			ready++
		}
	}

	age := time.Since(raw.CreationTimestamp.Time)
	if raw.CreationTimestamp.Time.After(time.Now()) {
		age = 0
	}

	return Pod{
		Name:       raw.Name,
		Namespace:  raw.Namespace,
		Cluster:    clusterName,
		Node:       raw.Spec.NodeName,
		Status:     DetermineStatus(raw),
		Phase:      raw.Status.Phase,
		Containers: containers,
		Ready:      ready,
		Total:      len(containers),
		Age:        age,
		QOS:        string(raw.Status.QOSClass),
	}
}

// GroupPods groups pods by (namespace, name) across clusters.
func GroupPods(pods []Pod) []PodGroup {
	groups := make(map[string]*PodGroup)
	var order []string

	for _, p := range pods {
		key := fmt.Sprintf("%s/%s", p.Namespace, p.Name)
		if g, ok := groups[key]; ok {
			g.Pods = append(g.Pods, p)
		} else {
			groups[key] = &PodGroup{
				Name:    p.Name,
				Pods:    []Pod{p},
				Cluster: p.Cluster,
			}
			order = append(order, key)
		}
	}

	result := make([]PodGroup, len(order))
	for i, key := range order {
		result[i] = *groups[key]
	}
	return result
}

// NamespaceStatus represents the aggregate status of a namespace.
type NamespaceStatus int

const (
	NsStatusIdle NamespaceStatus = iota
	NsStatusBusy
	NsStatusChanging
	NsStatusFailed
)

func (s NamespaceStatus) String() string {
	switch s {
	case NsStatusIdle:
		return "Idle"
	case NsStatusBusy:
		return "Busy"
	case NsStatusChanging:
		return "Changing"
	case NsStatusFailed:
		return "Failed"
	default:
		return "Unknown"
	}
}

// NamespaceGroup holds aggregated pod and job data for a single namespace in a single cluster.
type NamespaceGroup struct {
	Name            string
	Cluster         string
	Pods            []Pod
	TotalPods       int
	ActivePods      int
	ReadyPods       int
	Status          NamespaceStatus
	StatusCounts    map[NamespaceStatus]int
	FailedPods      []Pod
	Jobs            []Job
	TotalJobs       int
	JobStatusCounts map[JobStatus]int
}

// GroupByNamespace groups all pods and jobs by namespace and cluster, computing status per group.
func GroupByNamespace(pods []Pod, jobs []Job) []NamespaceGroup {
	type nsClusterKey struct {
		namespace string
		cluster   string
	}

	groups := make(map[nsClusterKey]*NamespaceGroup)
	var order []nsClusterKey

	ensureGroup := func(key nsClusterKey) *NamespaceGroup {
		if ng, ok := groups[key]; ok {
			return ng
		}
		ng := &NamespaceGroup{
			Name:            key.namespace,
			Cluster:         key.cluster,
			StatusCounts:    map[NamespaceStatus]int{0: 0, 1: 0, 2: 0, 3: 0},
			JobStatusCounts: map[JobStatus]int{0: 0, 1: 0, 2: 0, 3: 0},
		}
		groups[key] = ng
		order = append(order, key)
		return ng
	}

	for _, p := range pods {
		key := nsClusterKey{namespace: p.Namespace, cluster: p.Cluster}
		ng := ensureGroup(key)
		ng.Pods = append(ng.Pods, p)
		ng.TotalPods++

		if p.Phase != v1.PodSucceeded {
			ng.ActivePods++
		}

		nsStatus := podToNSStatus(p)
		ng.StatusCounts[nsStatus]++
		if nsStatus == NsStatusFailed {
			ng.FailedPods = append(ng.FailedPods, p)
		}

		if p.Phase != v1.PodSucceeded && p.Ready == p.Total && p.Total > 0 {
			ng.ReadyPods++
		}
	}

	for _, j := range jobs {
		key := nsClusterKey{namespace: j.Namespace, cluster: j.Cluster}
		ng := ensureGroup(key)
		ng.Jobs = append(ng.Jobs, j)
		ng.TotalJobs++
		ng.JobStatusCounts[j.Status]++
	}

	result := make([]NamespaceGroup, 0, len(order))
	for _, key := range order {
		ng := groups[key]
		ng.Status = worstStatus(ng.StatusCounts)
		result = append(result, *ng)
	}

	return result
}

func podToNSStatus(p Pod) NamespaceStatus {
	switch p.Status {
	case StatusFailed:
		return NsStatusFailed
	case StatusBusy:
		return NsStatusBusy
	case StatusChanging:
		return NsStatusChanging
	case StatusIdle:
		return NsStatusIdle
	default:
		return NsStatusChanging
	}
}

func worstStatus(counts map[NamespaceStatus]int) NamespaceStatus {
	if counts[NsStatusFailed] > 0 {
		return NsStatusFailed
	}
	if counts[NsStatusBusy] > 0 {
		return NsStatusBusy
	}
	if counts[NsStatusChanging] > 0 {
		return NsStatusChanging
	}
	return NsStatusIdle
}
