# kubestoplight

A TUI for monitoring Kubernetes pods across multiple cluster endpoints.

## Design Considerations
- Accepts an array of clusters with different auth methods (kubeconfig, bearer, TLS, OIDC, service account)
- Views pods grouped on the same view cross-cluster
- Color-coded status:
  - Green: up and idle pods
  - Yellow: up and changing pods
  - Orange: up and busy pods
  - Red: down and failed pods
  - Gray: empty pods

## Usage

```bash
go build -o kubestoplight .
./kubestoplight                     # uses ~/.kubestoplight/config.yaml
./kubestoplight -config myconfig.yaml
```

## Configuration

Clusters are defined in a YAML config file:

```yaml
clusters:
  - name: production
    server: https://prod-k8s:6443
    auth: kubeconfig
    kubeconfig:
      path: ~/.kube/prod-config
      context: prod-cluster
    enabled: true
    namespace: ""  # empty = all namespaces

  - name: staging
    server: https://staging.k8s.internal:6443
    auth: bearer
    bearer_token: "{{ env:K8S_PROD_TOKEN }}"
    tls:
      insecure_skip_verify: true

polling_interval: 3s
```

Supports `~` expansion in paths and `{{ env:VAR }}` interpolation for secrets.

### Auth Methods

- `kubeconfig` — uses client-go's kubeconfig loader (supports custom path/context)
- `bearer` — sets a bearer token directly on the rest.Config
- `tls` — uses client cert/key + CA file
- `oidc` — uses OIDC tokens
- `serviceaccount` — reads from in-cluster service account mount

## Key Bindings

- `q` — quit
- `tab` — toggle sidebar/table focus
- `j`/`k` — navigate table rows
- `pgup`/`pgdn` — page navigate
- `home`/`end` — jump to top/bottom

## Testing

A local RKE2 cluster is available. Configure the kubeconfig path in your config file.
