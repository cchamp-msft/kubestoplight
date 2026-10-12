package model

import (
	"testing"

	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func TestCPUHot(t *testing.T) {
	tests := []struct {
		name string
		cpu  CPU
		want bool
	}{
		{"near its limit", CPU{Used: 850, Request: 250, Limit: 1000}, true},
		{"well under its limit", CPU{Used: 600, Request: 250, Limit: 4000}, false},
		{"no limit, near its request", CPU{Used: 450, Request: 500}, true},
		{"tiny pod at its limit is below the floor", CPU{Used: 95, Limit: 100}, false},
		{"unbounded, half a core", CPU{Used: 500}, true},
		{"unbounded, quiet", CPU{Used: 300}, false},
		{"over 999m, which the awk one-liner misses", CPU{Used: 1500, Limit: 1500}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cpu.Hot(); got != tt.want {
				t.Errorf("Hot() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCPUSpec(t *testing.T) {
	cpu := func(req, lim string) v1.ResourceRequirements {
		r := v1.ResourceRequirements{Requests: v1.ResourceList{}, Limits: v1.ResourceList{}}
		if req != "" {
			r.Requests[v1.ResourceCPU] = resource.MustParse(req)
		}
		if lim != "" {
			r.Limits[v1.ResourceCPU] = resource.MustParse(lim)
		}
		return r
	}
	always := v1.ContainerRestartPolicyAlways

	spec := v1.PodSpec{
		InitContainers: []v1.Container{
			{Name: "migrate", Resources: cpu("2", "4")},                         // runs once: ignored
			{Name: "proxy", Resources: cpu("100m", ""), RestartPolicy: &always}, // sidecar: counted
		},
		Containers: []v1.Container{
			{Name: "app", Resources: cpu("250m", "1")},
		},
	}
	req, lim := cpuSpec(spec)
	if req != 350 {
		t.Errorf("request = %dm, want 350m", req)
	}
	if lim != 0 {
		t.Errorf("limit = %dm, want 0 (the sidecar sets none, so the pod has no total)", lim)
	}
}

func TestHotPodsDontChangeStatus(t *testing.T) {
	hot := Pod{Name: "a", Namespace: "ns", Cluster: "c", Status: StatusIdle, Phase: v1.PodRunning, Ready: 1, Total: 1,
		CPU: &CPU{Used: 900, Limit: 1000}}
	groups := GroupByNamespace([]Pod{hot}, nil)
	if groups[0].HotPods != 1 {
		t.Errorf("HotPods = %d, want 1", groups[0].HotPods)
	}
	if groups[0].Status != NsStatusIdle {
		t.Errorf("Status = %v, want Idle: load is not a warning", groups[0].Status)
	}
}
