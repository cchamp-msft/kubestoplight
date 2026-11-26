package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	tea "charm.land/bubbletea/v2"
	"kubestoplight/clusters"
	"kubestoplight/config"
	"kubestoplight/model"
	"kubestoplight/poller"
	"kubestoplight/polling"
	"kubestoplight/webserver"
)

var defaultConfigPath = func() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".kubestoplight/config.yaml"
	}
	return filepath.Join(home, ".kubestoplight", "config.yaml")
}()

func main() {
	var (
		configPath string
		webMode    bool
		addr       string
		readOnly   bool
		authKey    string
		authTTL    time.Duration
	)
	flag.StringVar(&configPath, "config", defaultConfigPath, "path to config file")
	flag.BoolVar(&webMode, "web", false, "start web server instead of TUI")
	flag.StringVar(&addr, "addr", "127.0.0.1:8080", "web server listen address (only used with --web)")
	flag.BoolVar(&readOnly, "read-only", false, "web: disable cluster add/edit/remove and redact cluster config (use when exposing the UI)")
	flag.StringVar(&authKey, "auth-key", os.Getenv("KUBESTOPLIGHT_AUTH_KEY"), "web: access key the browser must enter before any data loads (default $KUBESTOPLIGHT_AUTH_KEY; empty = no key)")
	flag.DurationVar(&authTTL, "auth-ttl", 24*time.Hour, "web: how long a browser stays signed in after entering the access key")
	flag.Parse()

	cfg, err := config.Load(configPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			if webMode {
				// Web mode can start with an empty config — create a blank one.
				cfg = &config.Config{PollingInterval: "3s"}
				if mkErr := os.MkdirAll(filepath.Dir(configPath), 0o755); mkErr == nil {
					_ = config.Save(configPath, cfg)
				}
			} else {
				fmt.Fprintf(os.Stderr, "No config found at %s\nCreate one and try again.\n", configPath)
				os.Exit(1)
			}
		} else {
			log.Fatalf("Failed to load config: %v", err)
		}
	}

	man, err := clusters.NewManager(cfg.Clusters)
	if err != nil {
		log.Fatalf("Failed to initialize cluster manager: %v", err)
	}

	if webMode {
		runWeb(cfg, man, configPath, addr, readOnly, authKey, authTTL)
		return
	}

	// TUI mode — unchanged from original.
	interval := polling.DurationFromString(cfg.PollingInterval)
	m := model.NewModel(man, interval)
	if _, err := tea.NewProgram(m).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v\n", err)
		os.Exit(1)
	}
}

func runWeb(cfg *config.Config, man *clusters.ClusterManager, configPath, addr string, readOnly bool, authKey string, authTTL time.Duration) {
	interval := polling.DurationFromString(cfg.PollingInterval)

	p := poller.NewPoller(man, interval)
	p.Start()

	// Expose only the web/dist subdirectory to the file server.
	distFS, err := fs.Sub(webDist, "web/dist")
	if err != nil {
		log.Fatalf("Failed to open embedded web/dist: %v", err)
	}

	srv := webserver.New(man, p, configPath, distFS)
	srv.SetReadOnly(readOnly)
	if readOnly {
		log.Printf("webserver: read-only mode")
	}

	srv.SetAuth(authKey, authTTL)
	if authKey != "" {
		log.Printf("webserver: access key required; sessions last %s", authTTL)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := srv.Start(ctx, addr); err != nil {
		log.Fatalf("Web server error: %v", err)
	}
}
