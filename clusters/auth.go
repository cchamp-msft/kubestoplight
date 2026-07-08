package clusters

import (
	"fmt"
	"os"
	"path/filepath"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"kubestoplight/config"
)

// Resolver resolves a Cluster config into a *rest.Config for client-go.
type Resolver interface {
	Resolve(c config.Cluster) (*rest.Config, error)
}

type defaultResolver struct{}

// Resolve implements Resolver.
func (d *defaultResolver) Resolve(c config.Cluster) (*rest.Config, error) {
	switch c.AuthType {
	case config.AuthKubeconfig:
		return d.resolveKubeconfig(c)
	case config.AuthBearer:
		return d.resolveBearer(c)
	case config.AuthTLS:
		return d.resolveTLS(c)
	case config.AuthOIDC:
		return d.resolveOIDC(c)
	case config.AuthServiceAccount:
		return d.resolveServiceAccount(c)
	default:
		return nil, fmt.Errorf("unknown auth type: %q", c.AuthType)
	}
}

func (d *defaultResolver) resolveKubeconfig(c config.Cluster) (*rest.Config, error) {
	overrides := &clientcmd.ConfigOverrides{}
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()

	if c.KubeCfg != nil && c.KubeCfg.Path != "" {
		loadingRules.ExplicitPath = c.KubeCfg.Path
	}

	if c.KubeCfg != nil && c.KubeCfg.Context != "" {
		overrides.CurrentContext = c.KubeCfg.Context
	}

	// Override server URL with the cluster config's server field
	if c.Server != "" {
		overrides.ClusterInfo.Server = c.Server
	}

	// Apply TLS settings from the cluster config
	if c.TLS != nil {
		overrides.ClusterInfo.InsecureSkipTLSVerify = c.TLS.Skip
		if c.TLS.CAFile != "" {
			overrides.ClusterInfo.CertificateAuthority = c.TLS.CAFile
		}
		if c.TLS.CertFile != "" && c.TLS.KeyFile != "" {
			overrides.AuthInfo.ClientCertificate = c.TLS.CertFile
			overrides.AuthInfo.ClientKey = c.TLS.KeyFile
		}
	}

	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules, overrides).ClientConfig()
}

func (d *defaultResolver) resolveBearer(c config.Cluster) (*rest.Config, error) {
	cfg := &rest.Config{
		Host:        c.Server,
		BearerToken: c.Bearer,
	}
	if c.TLS != nil && c.TLS.Skip {
		cfg.TLSClientConfig.Insecure = true
	}
	if c.TLS != nil {
		if c.TLS.CAFile != "" {
			cfg.TLSClientConfig.CAFile = c.TLS.CAFile
		}
		if c.TLS.CertFile != "" && c.TLS.KeyFile != "" {
			cfg.TLSClientConfig.CertFile = c.TLS.CertFile
			cfg.TLSClientConfig.KeyFile = c.TLS.KeyFile
		}
	}
	return cfg, nil
}

func (d *defaultResolver) resolveTLS(c config.Cluster) (*rest.Config, error) {
	if c.TLS == nil {
		return nil, fmt.Errorf("cluster %q: TLS auth requires tls block", c.Name)
	}
	cfg := &rest.Config{
		Host: c.Server,
		TLSClientConfig: rest.TLSClientConfig{
			Insecure: c.TLS.Skip,
		},
	}
	if c.TLS.CAFile != "" {
		cfg.TLSClientConfig.CAFile = c.TLS.CAFile
	}
	if c.TLS.CertFile != "" && c.TLS.KeyFile != "" {
		cfg.TLSClientConfig.CertFile = c.TLS.CertFile
		cfg.TLSClientConfig.KeyFile = c.TLS.KeyFile
	}
	return cfg, nil
}

func (d *defaultResolver) resolveOIDC(c config.Cluster) (*rest.Config, error) {
	if c.OIDC == nil {
		return nil, fmt.Errorf("cluster %q: OIDC auth requires oidc block", c.Name)
	}
	cfg := &rest.Config{
		Host: c.Server,
	}
	if c.OIDC.AccessToken != "" {
		cfg.BearerToken = c.OIDC.AccessToken
	} else if c.OIDC.IDToken != "" {
		// For gcloud-style OIDC, use the ID token as bearer
		cfg.BearerToken = c.OIDC.IDToken
	}
	if c.TLS != nil && c.TLS.Skip {
		cfg.TLSClientConfig.Insecure = true
	}
	return cfg, nil
}

func (d *defaultResolver) resolveServiceAccount(c config.Cluster) (*rest.Config, error) {
	saPath := "/var/run/secrets/kubernetes.io/serviceaccount"

	token, err := os.ReadFile(filepath.Join(saPath, "token"))
	if err != nil {
		return nil, fmt.Errorf("read service account token: %w", err)
	}

	cfg := &rest.Config{
		Host:        c.Server,
		BearerToken: string(token),
	}

	ca, err := os.ReadFile(filepath.Join(saPath, "ca.crt"))
	if err == nil {
		cfg.TLSClientConfig.CAData = ca
	}

	ns, err := os.ReadFile(filepath.Join(saPath, "namespace"))
	if err == nil && c.Namespace == "" {
		c.Namespace = string(ns)
	}

	return cfg, nil
}

// NewResolver returns the default resolver.
func NewResolver() Resolver {
	return &defaultResolver{}
}
