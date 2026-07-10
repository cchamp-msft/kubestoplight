package model

import (
	"time"

	batchv1 "k8s.io/api/batch/v1"
)

type JobStatus int

const (
	JobActive JobStatus = iota
	JobSucceeded
	JobFailed
	JobSuspended
)

func (s JobStatus) String() string {
	switch s {
	case JobActive:
		return "Active"
	case JobSucceeded:
		return "Succeeded"
	case JobFailed:
		return "Failed"
	case JobSuspended:
		return "Suspended"
	default:
		return "Unknown"
	}
}

type Job struct {
	Name        string
	Namespace   string
	Cluster     string
	Status      JobStatus
	Completions int
	Succeeded   int
	Failed      int
	Active      int
	Age         time.Duration
}

func DetermineJobStatus(job batchv1.Job) JobStatus {
	if job.Spec.Suspend != nil && *job.Spec.Suspend {
		return JobSuspended
	}

	for _, c := range job.Status.Conditions {
		if c.Type == batchv1.JobFailed && c.Status == "True" {
			return JobFailed
		}
		if c.Type == batchv1.JobComplete && c.Status == "True" {
			return JobSucceeded
		}
	}

	if job.Status.Active > 0 {
		return JobActive
	}

	return JobSucceeded
}

func ExtractJob(raw batchv1.Job, clusterName string) Job {
	completions := 0
	if raw.Spec.Completions != nil {
		completions = int(*raw.Spec.Completions)
	}

	age := time.Since(raw.CreationTimestamp.Time)
	if raw.CreationTimestamp.Time.After(time.Now()) {
		age = 0
	}

	return Job{
		Name:        raw.Name,
		Namespace:   raw.Namespace,
		Cluster:     clusterName,
		Status:      DetermineJobStatus(raw),
		Completions: completions,
		Succeeded:   int(raw.Status.Succeeded),
		Failed:      int(raw.Status.Failed),
		Active:      int(raw.Status.Active),
		Age:         age,
	}
}
