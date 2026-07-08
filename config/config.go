package config

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

var envVarRe = regexp.MustCompile(`\{\{\s*env:([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`)

// Config is the top-level application configuration.
type Config struct {
	Clusters        []Cluster `yaml:"clusters"`
	PollingInterval string    `yaml:"polling_interval"`
	DefaultNS       string    `yaml:"default_namespace"`
}

// Cluster defines a single Kubernetes cluster connection.
type Cluster struct {
	Name      string      `yaml:"name"`
	Server    string      `yaml:"server"`
	AuthType  AuthType    `yaml:"auth"`
	KubeCfg   *KubeCfg    `yaml:"kubeconfig,omitempty"`
	Bearer    string      `yaml:"bearer_token,omitempty"`
	TLS       *TLSAuth    `yaml:"tls,omitempty"`
	OIDC      *OIDCAuth   `yaml:"oidc,omitempty"`
	Namespace string      `yaml:"namespace"`
	Enabled   bool        `yaml:"enabled"`
	Color     string      `yaml:"color,omitempty"`
}

// AuthType identifies the authentication method.
type AuthType string

const (
	AuthKubeconfig    AuthType = "kubeconfig"
	AuthBearer        AuthType = "bearer"
	AuthTLS           AuthType = "tls"
	AuthOIDC          AuthType = "oidc"
	AuthServiceAccount AuthType = "serviceaccount"
)

// KubeCfg holds kubeconfig-specific options.
type KubeCfg struct {
	Path     string `yaml:"path"`
	Context  string `yaml:"context"`
}

// TLSAuth holds TLS certificate options.
type TLSAuth struct {
	CertFile string `yaml:"cert_file"`
	KeyFile  string `yaml:"key_file"`
	CAFile   string `yaml:"ca_file"`
	Skip     bool   `yaml:"insecure_skip_verify"`
}

// OIDCAuth holds OpenID Connect options.
type OIDCAuth struct {
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	AccessToken  string `yaml:"access_token"`
	IDToken      string `yaml:"id_token"`
	IssuerURL    string `yaml:"issuer_url"`
}

// ResolveEnabled returns only clusters with Enabled set to true (or unset, defaulting to true).
func (c *Config) ResolveEnabled() []Cluster {
	var enabled []Cluster
	for _, cl := range c.Clusters {
		if cl.Enabled {
			enabled = append(enabled, cl)
		}
	}
	return enabled
}

// ExpandTilde expands ~ to the home directory in string paths.
func expandTilde(s string) string {
	if strings.HasPrefix(s, "~") {
		home, _ := os.UserHomeDir()
		if home != "" {
			return filepath.Join(home, s[2:])
		}
	}
	return s
}

// expandEnvVars replaces {{ env:VAR_NAME }} with the value of the environment variable.
func expandEnvVars(s string) string {
	return envVarRe.ReplaceAllStringFunc(s, func(match string) string {
		matches := envVarRe.FindStringSubmatch(match)
		if len(matches) < 2 {
			return match
		}
		return os.Getenv(matches[1])
	})
}

// expandAll expands tilde paths and environment variable references.
func expandAll(s string) string {
	s = expandTilde(s)
	s = expandEnvVars(s)
	return s
}

// Expand interpolates all string fields in Cluster config.
func (c *Cluster) Expand() *Cluster {
	out := *c
	out.Server = expandAll(c.Server)
	if out.KubeCfg != nil {
		k := *c.KubeCfg
		k.Path = expandTilde(k.Path)
		out.KubeCfg = &k
	}
	out.Bearer = expandEnvVars(c.Bearer)
	if out.TLS != nil {
		t := *c.TLS
		t.CertFile = expandTilde(t.CertFile)
		t.KeyFile = expandTilde(t.KeyFile)
		t.CAFile = expandTilde(t.CAFile)
		out.TLS = &t
	}
	if out.OIDC != nil {
		o := *c.OIDC
		out.OIDC = &o
	}
	return &out
}

// Load reads and parses a YAML config file from the given path.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}

	// Default enabled clusters to enabled if not specified.
	for i := range cfg.Clusters {
		if cfg.Clusters[i].Enabled {
			cfg.Clusters[i].Enabled = true
		}
	}

	return &cfg, nil
}
