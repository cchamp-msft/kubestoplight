// Package webserver provides an HTTP + WebSocket server that exposes
// kubestoplight's cluster management and live pod data to a browser.
package webserver

import (
	"context"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"

	"kubestoplight/clusters"
	"kubestoplight/config"
	"kubestoplight/model"
	"kubestoplight/poller"
)

// nsGroupJSON is the JSON-serialisable form of model.NamespaceGroup.
type nsGroupJSON struct {
	Namespace    string         `json:"namespace"`
	Cluster      string         `json:"cluster"`
	TotalPods    int            `json:"totalPods"`
	ActivePods   int            `json:"activePods"`
	ReadyPods    int            `json:"readyPods"`
	Status       string         `json:"status"`
	StatusCounts map[string]int `json:"statusCounts"`
	Pods         []podJSON      `json:"pods"`
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

// Start registers all routes, launches the broadcast loop, and blocks until ctx
// is cancelled (triggering graceful shutdown).
func (s *Server) Start(ctx context.Context, addr string) error {
	mux := http.NewServeMux()

	// REST API
	mux.HandleFunc("/api/clusters", s.handleClusters)
	mux.HandleFunc("/api/clusters/", s.handleClusterByName)

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

func (s *Server) handleClusters(w http.ResponseWriter, r *http.Request) {
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
		out = append(out, nsGroupJSON{
			Namespace:    g.Name,
			Cluster:      g.Cluster,
			TotalPods:    g.TotalPods,
			ActivePods:   g.ActivePods,
			ReadyPods:    g.ReadyPods,
			Status:       g.Status.String(),
			StatusCounts: sc,
			Pods:         pods,
		})
	}
	return out
}

func formatAge(d time.Duration) string {
	if d < time.Minute {
		return d.Round(time.Second).String()
	}
	if d < time.Hour {
		return d.Round(time.Minute).String()
	}
	return d.Round(time.Hour).String()
}
