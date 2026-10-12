package model

import (
	"fmt"
	"time"

	v1 "k8s.io/api/core/v1"
)

// PodStatus represents the operational state of a pod.
//
// The names predate their current meanings; what each one means now:
//
//	Idle      healthy: running and ready, or succeeded
//	Busy      in progress (blue): a restart in the last RecentRestartWindow,
//	          or pending / terminating / not ready for less than StuckAfter
//	Changing  warning (amber): pending, terminating or not ready for longer
//	          than StuckAfter
//	Failed    error: crash loops, image pull errors, OOM, phase Failed
//	Empty     no container statuses and not pending
type PodStatus int

const (
	StatusIdle PodStatus = iota
	StatusBusy
	StatusChanging
	StatusFailed
	StatusEmpty
)

const (
	// RecentRestartWindow is how long a container restart keeps a pod Busy.
	// RestartCount never goes down, so an old restart (a node reboot months
	// ago) must not mark a pod as busy forever.
	RecentRestartWindow = 15 * time.Minute
	// StuckAfter is how long a pod may be pending, terminating or not ready
	// before that counts as a warning rather than normal churn.
	StuckAfter = 5 * time.Minute
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
	// CPU is nil unless the cluster serves metrics (see WithCPU).
	CPU *CPU

	cpuRequest, cpuLimit int64
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
	return determineStatusAt(pod, time.Now())
}

func determineStatusAt(pod v1.Pod, now time.Time) PodStatus {
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && isFatalWaitingState(cs.State.Waiting.Reason) {
			return StatusFailed
		}
		if cs.State.Terminated != nil && isFailureTerminated(cs.State.Terminated.Reason) {
			return StatusFailed
		}
	}

	// In progress while young, a warning once it has taken too long.
	progress := func(since time.Time) PodStatus {
		if !since.IsZero() && now.Sub(since) > StuckAfter {
			return StatusChanging
		}
		return StatusBusy
	}

	// Terminating: the deletion timestamp is the end of the grace period.
	if pod.DeletionTimestamp != nil {
		return progress(pod.DeletionTimestamp.Time)
	}

	switch pod.Status.Phase {
	case v1.PodPending:
		return progress(pod.CreationTimestamp.Time)

	case v1.PodRunning:
		if len(pod.Status.ContainerStatuses) == 0 {
			return StatusEmpty
		}
		recentRestart := false
		var notReadySince time.Time
		for _, cs := range pod.Status.ContainerStatuses {
			if last := cs.LastTerminationState.Terminated; cs.RestartCount > 0 && last != nil &&
				now.Sub(last.FinishedAt.Time) < RecentRestartWindow {
				recentRestart = true
			}
			if cs.Ready || (cs.State.Terminated != nil && cs.State.Terminated.ExitCode == 0) {
				continue // ready, or a sidecar/init-style container that finished cleanly
			}
			since := pod.CreationTimestamp.Time
			if cs.State.Running != nil {
				since = cs.State.Running.StartedAt.Time
			}
			if notReadySince.IsZero() || since.Before(notReadySince) {
				notReadySince = since
			}
		}
		if !notReadySince.IsZero() {
			return progress(notReadySince)
		}
		if recentRestart {
			return StatusBusy
		}
		return StatusIdle

	case v1.PodSucceeded:
		return StatusIdle

	case v1.PodFailed:
		if len(pod.Status.ContainerStatuses) == 0 {
			return StatusEmpty // e.g. an evicted pod left behind
		}
		return StatusFailed

	default:
		if len(pod.Status.ContainerStatuses) == 0 {
			return StatusEmpty
		}
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

	request, limit := cpuSpec(raw.Spec)

	return Pod{
		cpuRequest: request,
		cpuLimit:   limit,
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
	// HotPods counts pods whose CPU.Hot() is true. It never affects Status.
	HotPods int
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
		if p.CPU != nil && p.CPU.Hot() {
			ng.HotPods++
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
	// A warning outranks work in progress.
	if counts[NsStatusChanging] > 0 {
		return NsStatusChanging
	}
	if counts[NsStatusBusy] > 0 {
		return NsStatusBusy
	}
	return NsStatusIdle
}
