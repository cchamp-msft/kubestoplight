package model

import (
	"testing"
	"time"

	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestDetermineStatusAt(t *testing.T) {
	now := time.Date(2026, 10, 12, 12, 0, 0, 0, time.UTC)
	ago := func(d time.Duration) metav1.Time { return metav1.NewTime(now.Add(-d)) }

	running := func(ready bool, startedAgo time.Duration) v1.ContainerStatus {
		return v1.ContainerStatus{
			Name:  "app",
			Ready: ready,
			State: v1.ContainerState{Running: &v1.ContainerStateRunning{StartedAt: ago(startedAgo)}},
		}
	}
	restarted := func(cs v1.ContainerStatus, finishedAgo time.Duration) v1.ContainerStatus {
		cs.RestartCount = 3
		cs.LastTerminationState = v1.ContainerState{Terminated: &v1.ContainerStateTerminated{FinishedAt: ago(finishedAgo)}}
		return cs
	}
	pod := func(phase v1.PodPhase, createdAgo time.Duration, cs ...v1.ContainerStatus) v1.Pod {
		return v1.Pod{
			ObjectMeta: metav1.ObjectMeta{CreationTimestamp: ago(createdAgo)},
			Status:     v1.PodStatus{Phase: phase, ContainerStatuses: cs},
		}
	}
	terminating := func(graceEndedAgo time.Duration) v1.Pod {
		p := pod(v1.PodRunning, 24*time.Hour, running(true, 24*time.Hour))
		ts := ago(graceEndedAgo)
		p.DeletionTimestamp = &ts
		return p
	}

	tests := []struct {
		name string
		pod  v1.Pod
		want PodStatus
	}{
		{"running and ready", pod(v1.PodRunning, 48*time.Hour, running(true, 48*time.Hour)), StatusIdle},
		{"old restart is healthy", pod(v1.PodRunning, 90*24*time.Hour, restarted(running(true, 30*24*time.Hour), 30*24*time.Hour)), StatusIdle},
		{"recent restart is busy", pod(v1.PodRunning, 90*24*time.Hour, restarted(running(true, 2*time.Minute), 2*time.Minute)), StatusBusy},
		{"just started, not ready yet", pod(v1.PodRunning, time.Minute, running(false, 30*time.Second)), StatusBusy},
		{"not ready for too long", pod(v1.PodRunning, time.Hour, running(false, 20*time.Minute)), StatusChanging},
		{"pending briefly", pod(v1.PodPending, time.Minute), StatusBusy},
		{"pending too long", pod(v1.PodPending, 10*time.Minute), StatusChanging},
		{"terminating within grace", terminating(-20 * time.Second), StatusBusy},
		{"stuck terminating", terminating(10 * time.Minute), StatusChanging},
		{"crash loop", pod(v1.PodRunning, time.Hour, v1.ContainerStatus{
			State: v1.ContainerState{Waiting: &v1.ContainerStateWaiting{Reason: "CrashLoopBackOff"}},
		}), StatusFailed},
		{"succeeded", pod(v1.PodSucceeded, time.Hour, v1.ContainerStatus{
			State: v1.ContainerState{Terminated: &v1.ContainerStateTerminated{Reason: "Completed"}},
		}), StatusIdle},
		{"evicted, no statuses", pod(v1.PodFailed, time.Hour), StatusEmpty},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := determineStatusAt(tt.pod, now); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestWorstStatusWarningOutranksBusy(t *testing.T) {
	got := worstStatus(map[NamespaceStatus]int{NsStatusBusy: 5, NsStatusChanging: 1, NsStatusIdle: 10})
	if got != NsStatusChanging {
		t.Errorf("got %v, want Changing (warning)", got)
	}
}
