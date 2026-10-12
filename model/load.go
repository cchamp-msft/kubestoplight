package model

import (
	v1 "k8s.io/api/core/v1"
)

// CPU load is a second signal next to PodStatus, not part of it: a pod can
// be healthy and working hard at the same time. A hot pod is never a
// warning and never changes the namespace or overall status.
const (
	// HotShare is how much of its CPU limit (or, without one, its request)
	// a pod must use to count as hot.
	HotShare = 0.8
	// HotFloorMilli is the least CPU a hot pod uses, so a pod that asks for
	// 10m and uses 9m isn't flagged. 200m is the classic
	// `kubectl top pods | awk '$3 ~ /[2-9][0-9][0-9]m/'` cut-off.
	HotFloorMilli = 200
	// HotUnboundedMilli applies to a pod with neither a limit nor a
	// request: it's hot from half a core.
	HotUnboundedMilli = 500
)

// CPU is a pod's CPU use in millicores against what it asked for. Request
// and Limit are 0 when any running container leaves them unset, since the
// pod then has no total of its own.
type CPU struct {
	Used    int64
	Request int64
	Limit   int64
}

// Hot reports whether the pod is busy enough to point out.
func (c CPU) Hot() bool {
	if c.Used < HotFloorMilli {
		return false
	}
	if ref := c.Reference(); ref > 0 {
		return float64(c.Used) >= HotShare*float64(ref)
	}
	return c.Used >= HotUnboundedMilli
}

// Reference is what usage is measured against: the limit, else the request,
// else 0.
func (c CPU) Reference() int64 {
	if c.Limit > 0 {
		return c.Limit
	}
	return c.Request
}

// cpuSpec sums CPU requests and limits over the containers that run for
// the pod's life (app containers and restartable init "sidecars").
func cpuSpec(spec v1.PodSpec) (request, limit int64) {
	running := append([]v1.Container{}, spec.Containers...)
	for _, c := range spec.InitContainers {
		if c.RestartPolicy != nil && *c.RestartPolicy == v1.ContainerRestartPolicyAlways {
			running = append(running, c)
		}
	}
	reqOK, limOK := true, true
	for _, c := range running {
		if q, ok := c.Resources.Requests[v1.ResourceCPU]; ok {
			request += q.MilliValue()
		} else {
			reqOK = false
		}
		if q, ok := c.Resources.Limits[v1.ResourceCPU]; ok {
			limit += q.MilliValue()
		} else {
			limOK = false
		}
	}
	if !reqOK {
		request = 0
	}
	if !limOK {
		limit = 0
	}
	return request, limit
}

// WithCPU fills in p.CPU from a metrics reading of usedMilli millicores.
func (p *Pod) WithCPU(usedMilli int64) {
	p.CPU = &CPU{Used: usedMilli, Request: p.cpuRequest, Limit: p.cpuLimit}
}
