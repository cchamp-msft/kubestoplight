// Package webserver provides an HTTP + WebSocket server that exposes
// kubestoplight's cluster management and live pod data to a browser.
package webserver

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"

	v1 "k8s.io/api/core/v1"

	"kubestoplight/clusters"
	"kubestoplight/config"
	"kubestoplight/model"
	"kubestoplight/poller"
	"kubestoplight/polling"
)

// nsGroupJSON is the JSON-serialisable form of model.NamespaceGroup.
type nsGroupJSON struct {
	Namespace       string         `json:"namespace"`
	Cluster         string         `json:"cluster"`
	TotalPods       int            `json:"totalPods"`
	ActivePods      int            `json:"activePods"`
	ReadyPods       int            `json:"readyPods"`
	Status          string         `json:"status"`
	StatusCounts    map[string]int `json:"statusCounts"`
	Pods            []podJSON      `json:"pods"`
	Jobs            []jobJSON      `json:"jobs"`
	TotalJobs       int            `json:"totalJobs"`
	JobStatusCounts map[string]int `json:"jobStatusCounts"`
}

// jobJSON is the JSON-serialisable form of model.Job.
type jobJSON struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Cluster     string `json:"cluster"`
	Status      string `json:"status"`
	Completions int    `json:"completions"`
	Succeeded   int    `json:"succeeded"`
	Failed      int    `json:"failed"`
	Active      int    `json:"active"`
	Age         string `json:"age"`
}

// podJSON is the JSON-serialisable form of model.Pod.
type podJSON struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Node      string `json:"node"`
	Status    string `json:"status"`
	Phase     string `json:"phase"`
	Ready     int    `json:"ready"`
	Total     int    `json:"total"`
	Age       string `json:"age"`
	QOS       string `json:"qos"`
}

// wsMessage is the shape pushed to WebSocket clients.
type wsMessage struct {
	Type   string        `json:"type"`
	Groups []nsGroupJSON `json:"groups"`
}

// errorJSON is the shape of all API error responses.
type errorJSON struct {
	Error string `json:"error"`
}

// subscriber is a single connected WebSocket client.
type subscriber struct {
	ch chan []model.NamespaceGroup
}

// Server is the web server for kubestoplight.
type Server struct {
	cm         *clusters.ClusterManager
	p          *poller.Poller
	configPath string
	staticFS   fs.FS
	readOnly   bool

	mu          sync.RWMutex
	subscribers map[*subscriber]struct{}
	latest      []model.NamespaceGroup
}

// New creates a Server. staticFS should be the embedded web/dist filesystem.
func New(cm *clusters.ClusterManager, p *poller.Poller, configPath string, staticFS fs.FS) *Server {
	return &Server{
		cm:          cm,
		p:           p,
		configPath:  configPath,
		staticFS:    staticFS,
		subscribers: make(map[*subscriber]struct{}),
	}
}

// SetReadOnly turns off cluster add/edit/remove and redacts cluster config
// (paths, tokens) from GET /api/clusters. Use it whenever the UI is exposed
// beyond your own machine.
func (s *Server) SetReadOnly(v bool) { s.readOnly = v }

// Start registers all routes, launches the broadcast loop, and blocks until ctx
// is cancelled (triggering graceful shutdown).
func (s *Server) Start(ctx context.Context, addr string) error {
	mux := http.NewServeMux()

	// REST API
	mux.HandleFunc("/api/info", s.handleInfo)
	mux.HandleFunc("/api/clusters", s.handleClusters)
	mux.HandleFunc("/api/clusters/", s.handleClusterByName)
	mux.HandleFunc("/api/pods/", s.handlePodAPI)

	// WebSocket
	mux.HandleFunc("/ws/pods", s.handleWebSocket)

	// SPA static files — all other paths fall through to index.html
	mux.Handle("/", s.spaHandler())

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // disabled for WebSocket connections
	}

	// Fan-out loop: read from poller and broadcast to all subscribers.
	go s.broadcastLoop(ctx)

	// Shutdown when context is cancelled.
	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutCtx); err != nil {
			log.Printf("webserver: shutdown error: %v", err)
		}
	}()

	log.Printf("webserver: listening on http://%s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// broadcastLoop fans the poller output channel out to all WebSocket subscribers.
func (s *Server) broadcastLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case groups, ok := <-s.p.C:
			if !ok {
				return
			}
			s.mu.Lock()
			s.latest = groups
			subs := make([]*subscriber, 0, len(s.subscribers))
			for sub := range s.subscribers {
				subs = append(subs, sub)
			}
			s.mu.Unlock()

			for _, sub := range subs {
				select {
				case sub.ch <- groups:
				default:
					// Slow consumer — drop the frame.
				}
			}
		}
	}
}

func (s *Server) subscribe() *subscriber {
	sub := &subscriber{ch: make(chan []model.NamespaceGroup, 4)}
	s.mu.Lock()
	s.subscribers[sub] = struct{}{}
	s.mu.Unlock()
	return sub
}

func (s *Server) unsubscribe(sub *subscriber) {
	s.mu.Lock()
	delete(s.subscribers, sub)
	s.mu.Unlock()
}

// -------------------------------------------------------------------------
// HTTP Handlers
// -------------------------------------------------------------------------

// handleInfo tells the UI what this server allows.
func (s *Server) handleInfo(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"readOnly": s.readOnly})
}

// denyWrite answers 403 for mutating requests in read-only mode.
func (s *Server) denyWrite(w http.ResponseWriter, r *http.Request) bool {
	if s.readOnly && r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusForbidden, "server is in read-only mode")
		return true
	}
	return false
}

func (s *Server) handleClusters(w http.ResponseWriter, r *http.Request) {
	if s.denyWrite(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.listClusters(w, r)
	case http.MethodPost:
		s.addCluster(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleClusterByName(w http.ResponseWriter, r *http.Request) {
	// Strip "/api/clusters/" prefix to get the name.
	if s.denyWrite(w, r) {
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/clusters/")
	if name == "" {
		writeError(w, http.StatusBadRequest, "missing cluster name")
		return
	}
	switch r.Method {
	case http.MethodPut:
		s.updateCluster(w, r, name)
	case http.MethodDelete:
		s.deleteCluster(w, r, name)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) listClusters(w http.ResponseWriter, _ *http.Request) {
	cls := s.cm.ListClusters()
	if s.readOnly {
		// Names and state only: no server URLs, kubeconfig paths or tokens.
		redacted := make([]config.Cluster, 0, len(cls))
		for _, c := range cls {
			redacted = append(redacted, config.Cluster{Name: c.Name, AuthType: c.AuthType, Enabled: c.Enabled})
		}
		writeJSON(w, http.StatusOK, redacted)
		return
	}
	writeJSON(w, http.StatusOK, cls)
}

func (s *Server) addCluster(w http.ResponseWriter, r *http.Request) {
	var c config.Cluster
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	expanded := c.Expand()
	if err := s.cm.AddCluster(*expanded); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if err := s.saveConfig(); err != nil {
		log.Printf("webserver: save config: %v", err)
	}
	// Start polling the new cluster immediately.
	s.p.AddCluster(expanded.Name)
	writeJSON(w, http.StatusCreated, expanded)
}

func (s *Server) updateCluster(w http.ResponseWriter, r *http.Request, name string) {
	var c config.Cluster
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	c.Name = name // ensure name matches URL path
	expanded := c.Expand()
	if err := s.cm.UpdateCluster(*expanded); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := s.saveConfig(); err != nil {
		log.Printf("webserver: save config: %v", err)
	}
	// Re-add so the poller picks up the updated config.
	s.p.RemoveCluster(name)
	if expanded.Enabled {
		s.p.AddCluster(expanded.Name)
	}
	writeJSON(w, http.StatusOK, expanded)
}

func (s *Server) deleteCluster(w http.ResponseWriter, r *http.Request, name string) {
	s.p.RemoveCluster(name)
	if err := s.cm.RemoveCluster(name); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := s.saveConfig(); err != nil {
		log.Printf("webserver: save config: %v", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

// -------------------------------------------------------------------------
// Pod API types
// -------------------------------------------------------------------------

type podDescribeJSON struct {
	Name           string            `json:"name"`
	Namespace      string            `json:"namespace"`
	Cluster        string            `json:"cluster"`
	Node           string            `json:"node"`
	Status         string            `json:"status"`
	Phase          string            `json:"phase"`
	QOS            string            `json:"qos"`
	Age            string            `json:"age"`
	CreatedAt      string            `json:"createdAt"`
	Labels         map[string]string `json:"labels"`
	Annotations    map[string]string `json:"annotations"`
	Containers     []containerJSON   `json:"containers"`
	InitContainers []containerJSON   `json:"initContainers"`
	Conditions     []conditionJSON   `json:"conditions"`
	Events         []eventJSON       `json:"events"`
	Volumes        []volumeJSON      `json:"volumes"`
	OwnerRefs      []ownerRefJSON    `json:"ownerReferences"`
	ServiceAccount string            `json:"serviceAccount"`
	PodIP          string            `json:"podIP"`
	HostIP         string            `json:"hostIP"`
	NodeSelector   map[string]string `json:"nodeSelector,omitempty"`
	DeploymentName string            `json:"deploymentName,omitempty"`
}

type containerJSON struct {
	Name         string            `json:"name"`
	Image        string            `json:"image"`
	Ready        bool              `json:"ready"`
	RestartCount int32             `json:"restartCount"`
	State        string            `json:"state"`
	StateReason  string            `json:"stateReason"`
	StartedAt    string            `json:"startedAt,omitempty"`
	Ports        []portJSON        `json:"ports"`
	Resources    resourcesJSON     `json:"resources"`
	VolumeMounts []volumeMountJSON `json:"volumeMounts"`
}

type portJSON struct {
	ContainerPort int32  `json:"containerPort"`
	Protocol      string `json:"protocol"`
}

type resourcesJSON struct {
	Requests map[string]string `json:"requests"`
	Limits   map[string]string `json:"limits"`
}

type volumeMountJSON struct {
	Name      string `json:"name"`
	MountPath string `json:"mountPath"`
	ReadOnly  bool   `json:"readOnly"`
}

type conditionJSON struct {
	Type           string `json:"type"`
	Status         string `json:"status"`
	LastTransition string `json:"lastTransition"`
	Reason         string `json:"reason,omitempty"`
	Message        string `json:"message,omitempty"`
}

type eventJSON struct {
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Count     int32  `json:"count"`
	LastSeen  string `json:"lastSeen"`
	FirstSeen string `json:"firstSeen"`
}

type volumeJSON struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Source string `json:"source"`
}

type ownerRefJSON struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

// -------------------------------------------------------------------------
// Pod API handlers
// -------------------------------------------------------------------------

func (s *Server) handlePodAPI(w http.ResponseWriter, r *http.Request) {
	// Parse: /api/pods/{cluster}/{namespace}/{pod}[/logs]
	path := strings.TrimPrefix(r.URL.Path, "/api/pods/")
	parts := strings.SplitN(path, "/", 4)
	if len(parts) < 3 {
		writeError(w, http.StatusBadRequest, "expected /api/pods/{cluster}/{namespace}/{pod}")
		return
	}
	cluster, ns, pod := parts[0], parts[1], parts[2]

	suffix := ""
	if len(parts) == 4 {
		suffix = parts[3]
	}

	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	switch suffix {
	case "":
		s.describePod(w, r, cluster, ns, pod)
	case "logs":
		s.streamPodLogs(w, r, cluster, ns, pod)
	default:
		writeError(w, http.StatusNotFound, "unknown sub-resource: "+suffix)
	}
}

func (s *Server) newK8sClient(clusterName string) (*polling.K8sClient, error) {
	cfg, err := s.cm.GetConfig(clusterName)
	if err != nil {
		return nil, fmt.Errorf("cluster %q: %w", clusterName, err)
	}
	return polling.NewClient(cfg)
}

func (s *Server) describePod(w http.ResponseWriter, r *http.Request, cluster, ns, podName string) {
	ctx := r.Context()

	kc, err := s.newK8sClient(cluster)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	pod, err := kc.GetPod(ctx, ns, podName)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("pod %s/%s: %v", ns, podName, err))
		return
	}

	events, _ := kc.GetEvents(ctx, ns, "involvedObject.name="+podName)

	desc := buildPodDescribe(pod, events, cluster)
	writeJSON(w, http.StatusOK, desc)
}

func buildPodDescribe(pod *v1.Pod, events []v1.Event, cluster string) podDescribeJSON {
	age := time.Since(pod.CreationTimestamp.Time)
	if pod.CreationTimestamp.Time.After(time.Now()) {
		age = 0
	}

	desc := podDescribeJSON{
		Name:           pod.Name,
		Namespace:      pod.Namespace,
		Cluster:        cluster,
		Node:           pod.Spec.NodeName,
		Status:         model.DetermineStatus(*pod).String(),
		Phase:          string(pod.Status.Phase),
		QOS:            string(pod.Status.QOSClass),
		Age:            formatAge(age),
		CreatedAt:      pod.CreationTimestamp.Format(time.RFC3339),
		Labels:         pod.Labels,
		Annotations:    pod.Annotations,
		ServiceAccount: pod.Spec.ServiceAccountName,
		PodIP:          pod.Status.PodIP,
		HostIP:         pod.Status.HostIP,
		NodeSelector:   pod.Spec.NodeSelector,
	}

	if desc.Labels == nil {
		desc.Labels = map[string]string{}
	}
	if desc.Annotations == nil {
		desc.Annotations = map[string]string{}
	}

	desc.Containers = buildContainers(pod.Spec.Containers, pod.Status.ContainerStatuses)
	desc.InitContainers = buildContainers(pod.Spec.InitContainers, pod.Status.InitContainerStatuses)

	for _, c := range pod.Status.Conditions {
		desc.Conditions = append(desc.Conditions, conditionJSON{
			Type:           string(c.Type),
			Status:         string(c.Status),
			LastTransition: c.LastTransitionTime.Format(time.RFC3339),
			Reason:         c.Reason,
			Message:        c.Message,
		})
	}
	if desc.Conditions == nil {
		desc.Conditions = []conditionJSON{}
	}

	for _, e := range events {
		desc.Events = append(desc.Events, eventJSON{
			Type:      e.Type,
			Reason:    e.Reason,
			Message:   e.Message,
			Count:     e.Count,
			LastSeen:  e.LastTimestamp.Format(time.RFC3339),
			FirstSeen: e.FirstTimestamp.Format(time.RFC3339),
		})
	}
	if desc.Events == nil {
		desc.Events = []eventJSON{}
	}

	for _, v := range pod.Spec.Volumes {
		vj := volumeJSON{Name: v.Name}
		switch {
		case v.ConfigMap != nil:
			vj.Type, vj.Source = "ConfigMap", v.ConfigMap.Name
		case v.Secret != nil:
			vj.Type, vj.Source = "Secret", v.Secret.SecretName
		case v.PersistentVolumeClaim != nil:
			vj.Type, vj.Source = "PVC", v.PersistentVolumeClaim.ClaimName
		case v.EmptyDir != nil:
			vj.Type, vj.Source = "EmptyDir", ""
		case v.HostPath != nil:
			vj.Type, vj.Source = "HostPath", v.HostPath.Path
		case v.Projected != nil:
			vj.Type, vj.Source = "Projected", ""
		case v.DownwardAPI != nil:
			vj.Type, vj.Source = "DownwardAPI", ""
		default:
			vj.Type = "Other"
		}
		desc.Volumes = append(desc.Volumes, vj)
	}
	if desc.Volumes == nil {
		desc.Volumes = []volumeJSON{}
	}

	for _, ref := range pod.OwnerReferences {
		desc.OwnerRefs = append(desc.OwnerRefs, ownerRefJSON{Kind: ref.Kind, Name: ref.Name})
		if ref.Kind == "ReplicaSet" {
			// Infer deployment name: ReplicaSet names are typically {deployment}-{hash}
			parts := strings.Split(ref.Name, "-")
			if len(parts) > 1 {
				desc.DeploymentName = strings.Join(parts[:len(parts)-1], "-")
			}
		}
	}
	if desc.OwnerRefs == nil {
		desc.OwnerRefs = []ownerRefJSON{}
	}

	return desc
}

func buildContainers(specs []v1.Container, statuses []v1.ContainerStatus) []containerJSON {
	statusMap := make(map[string]v1.ContainerStatus, len(statuses))
	for _, cs := range statuses {
		statusMap[cs.Name] = cs
	}

	out := make([]containerJSON, 0, len(specs))
	for _, spec := range specs {
		cj := containerJSON{
			Name:  spec.Name,
			Image: spec.Image,
		}

		for _, p := range spec.Ports {
			cj.Ports = append(cj.Ports, portJSON{
				ContainerPort: p.ContainerPort,
				Protocol:      string(p.Protocol),
			})
		}
		if cj.Ports == nil {
			cj.Ports = []portJSON{}
		}

		cj.Resources = resourcesJSON{
			Requests: resourceMapToStrings(spec.Resources.Requests),
			Limits:   resourceMapToStrings(spec.Resources.Limits),
		}

		for _, vm := range spec.VolumeMounts {
			cj.VolumeMounts = append(cj.VolumeMounts, volumeMountJSON{
				Name:      vm.Name,
				MountPath: vm.MountPath,
				ReadOnly:  vm.ReadOnly,
			})
		}
		if cj.VolumeMounts == nil {
			cj.VolumeMounts = []volumeMountJSON{}
		}

		if cs, ok := statusMap[spec.Name]; ok {
			cj.Ready = cs.Ready
			cj.RestartCount = cs.RestartCount
			switch {
			case cs.State.Running != nil:
				cj.State = "running"
				cj.StartedAt = cs.State.Running.StartedAt.Format(time.RFC3339)
			case cs.State.Waiting != nil:
				cj.State = "waiting"
				cj.StateReason = cs.State.Waiting.Reason
			case cs.State.Terminated != nil:
				cj.State = "terminated"
				cj.StateReason = cs.State.Terminated.Reason
			}
		}

		out = append(out, cj)
	}
	return out
}

func resourceMapToStrings(rl v1.ResourceList) map[string]string {
	if rl == nil {
		return map[string]string{}
	}
	m := make(map[string]string, len(rl))
	for k, v := range rl {
		m[string(k)] = v.String()
	}
	return m
}

func (s *Server) streamPodLogs(w http.ResponseWriter, r *http.Request, cluster, ns, podName string) {
	ctx := r.Context()

	kc, err := s.newK8sClient(cluster)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	container := r.URL.Query().Get("container")
	tailStr := r.URL.Query().Get("tail")
	followStr := r.URL.Query().Get("follow")

	var tailLines int64 = 500
	if tailStr != "" {
		if n, err := strconv.ParseInt(tailStr, 10, 64); err == nil && n > 0 {
			tailLines = n
		}
	}
	follow := followStr == "true"

	stream, err := kc.GetPodLogs(ctx, ns, podName, container, tailLines, follow)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("logs: %v", err))
		return
	}
	defer stream.Close()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	flusher, canFlush := w.(http.Flusher)

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		if _, err := io.WriteString(w, scanner.Text()+"\n"); err != nil {
			return
		}
		if canFlush {
			flusher.Flush()
		}
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Allow any Origin for local use
	})
	if err != nil {
		log.Printf("webserver: ws accept: %v", err)
		return
	}
	defer conn.CloseNow()

	ctx := conn.CloseRead(r.Context())

	sub := s.subscribe()
	defer s.unsubscribe(sub)

	// Send the current snapshot immediately on connect.
	s.mu.RLock()
	latest := s.latest
	s.mu.RUnlock()
	if latest != nil {
		msg := wsMessage{Type: "snapshot", Groups: toGroupsJSON(latest)}
		if err := wsjson.Write(ctx, conn, msg); err != nil {
			return
		}
	}

	// Stream subsequent snapshots.
	for {
		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "")
			return
		case groups, ok := <-sub.ch:
			if !ok {
				return
			}
			msg := wsMessage{Type: "snapshot", Groups: toGroupsJSON(groups)}
			if err := wsjson.Write(ctx, conn, msg); err != nil {
				return
			}
		}
	}
}

// -------------------------------------------------------------------------
// Static SPA handler
// -------------------------------------------------------------------------

// spaHandler serves files from the embedded FS. Unknown paths fall back to
// index.html so that React Router (or plain hash routing) works correctly.
func (s *Server) spaHandler() http.Handler {
	fsHandler := http.FileServer(http.FS(s.staticFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to open the requested path.
		f, err := s.staticFS.Open(strings.TrimPrefix(r.URL.Path, "/"))
		if err != nil {
			// Not found → serve index.html for SPA routing.
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fsHandler.ServeHTTP(w, r2)
			return
		}
		f.Close()
		fsHandler.ServeHTTP(w, r)
	})
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

// saveConfig writes the current ClusterManager state back to disk.
func (s *Server) saveConfig() error {
	cls := s.cm.ListClusters()
	cfg := &config.Config{Clusters: cls}
	return config.Save(s.configPath, cfg)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("webserver: encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorJSON{Error: msg})
}

func toGroupsJSON(groups []model.NamespaceGroup) []nsGroupJSON {
	out := make([]nsGroupJSON, 0, len(groups))
	for _, g := range groups {
		sc := make(map[string]int, len(g.StatusCounts))
		for k, v := range g.StatusCounts {
			sc[k.String()] = v
		}
		pods := make([]podJSON, 0, len(g.Pods))
		for _, p := range g.Pods {
			pods = append(pods, podJSON{
				Name:      p.Name,
				Namespace: p.Namespace,
				Cluster:   p.Cluster,
				Node:      p.Node,
				Status:    p.Status.String(),
				Phase:     string(p.Phase),
				Ready:     p.Ready,
				Total:     p.Total,
				Age:       formatAge(p.Age),
				QOS:       p.QOS,
			})
		}
		jobs := make([]jobJSON, 0, len(g.Jobs))
		for _, j := range g.Jobs {
			jobs = append(jobs, jobJSON{
				Name:        j.Name,
				Namespace:   j.Namespace,
				Cluster:     j.Cluster,
				Status:      j.Status.String(),
				Completions: j.Completions,
				Succeeded:   j.Succeeded,
				Failed:      j.Failed,
				Active:      j.Active,
				Age:         formatAge(j.Age),
			})
		}
		jsc := make(map[string]int, len(g.JobStatusCounts))
		for k, v := range g.JobStatusCounts {
			jsc[k.String()] = v
		}
		out = append(out, nsGroupJSON{
			Namespace:       g.Name,
			Cluster:         g.Cluster,
			TotalPods:       g.TotalPods,
			ActivePods:      g.ActivePods,
			ReadyPods:       g.ReadyPods,
			Status:          g.Status.String(),
			StatusCounts:    sc,
			Pods:            pods,
			Jobs:            jobs,
			TotalJobs:       g.TotalJobs,
			JobStatusCounts: jsc,
		})
	}
	return out
}

func formatAge(d time.Duration) string {
	totalMin := int(d.Minutes())
	if totalMin < 1 {
		return "<1m"
	}
	days := totalMin / (60 * 24)
	hours := (totalMin % (60 * 24)) / 60
	mins := totalMin % 60

	if days > 0 {
		if hours > 0 {
			return fmt.Sprintf("%dd%dh", days, hours)
		}
		return fmt.Sprintf("%dd", days)
	}
	if hours > 0 {
		if mins > 0 {
			return fmt.Sprintf("%dh%dm", hours, mins)
		}
		return fmt.Sprintf("%dh", hours)
	}
	return fmt.Sprintf("%dm", mins)
}
