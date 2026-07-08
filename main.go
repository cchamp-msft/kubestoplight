package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"charm.land/bubbletea/v2"
	"kubestoplight/clusters"
	"kubestoplight/config"
	"kubestoplight/model"
	"kubestoplight/polling"
)

var defaultConfigPath = func() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".kubestoplight/config.yaml"
	}
	return filepath.Join(home, ".kubestoplight", "config.yaml")
}()

func main() {
	var configPath string
	flag.StringVar(&configPath, "config", defaultConfigPath, "path to config file")
	flag.Parse()

	cfg, err := config.Load(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "No config found at %s\nCreate one and try again.\n", configPath)
			os.Exit(1)
		}
		log.Fatalf("Failed to load config: %v", err)
	}

	man, err := clusters.NewManager(cfg.Clusters)
	if err != nil {
		log.Fatalf("Failed to initialize cluster manager: %v", err)
	}

	interval := polling.DurationFromString(cfg.PollingInterval)
	m := model.NewModel(man, interval)
	if _, err := tea.NewProgram(m).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v\n", err)
		os.Exit(1)
	}
}
