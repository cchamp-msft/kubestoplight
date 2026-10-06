// Fake data for `npm run dev:mock`. Shapes mirror src/types/api.ts, which in
// turn mirrors the Go JSON in webserver/server.go — if those change, change
// these too (fixtures.test.ts checks the invariants the UI relies on).

import type {
  Cluster,
  JobItem,
  JobStatusKind,
  NamespaceGroup,
  NamespaceStatusKind,
  PodDescribe,
  PodItem,
  PodStatusKind,
} from '../src/types/api.ts';

export type Scenario = 'mixed' | 'healthy' | 'failing' | 'empty' | 'large';
export const SCENARIOS: Scenario[] = ['mixed', 'healthy', 'failing', 'empty', 'large'];

// Small deterministic PRNG so every run of a scenario looks the same — handy
// for before/after screenshots when swapping design systems.
// Wall clock for timestamps. The mock plugin pins it when MOCK_NOW is set so
// screenshots render identically on every run.
export const clock = { now: () => Date.now() };

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

// Weights per pod status, per scenario.
const STATUS_WEIGHTS: Record<Scenario, [PodStatusKind, number][]> = {
  mixed: [['Idle', 70], ['Busy', 10], ['Changing', 10], ['Failed', 7], ['Empty', 3]],
  healthy: [['Idle', 100]],
  failing: [['Idle', 35], ['Busy', 10], ['Changing', 15], ['Failed', 40]],
  empty: [],
  large: [['Idle', 75], ['Busy', 8], ['Changing', 8], ['Failed', 6], ['Empty', 3]],
};

function weighted(r: () => number, weights: [PodStatusKind, number][]): PodStatusKind {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [k, w] of weights) {
    if ((x -= w) < 0) return k;
  }
  return weights[0][0];
}

const NAMESPACES = [
  'default', 'kube-system', 'monitoring', 'ingress-nginx', 'cert-manager',
  'payments', 'checkout', 'search', 'auth', 'data-pipeline', 'ml-inference',
  'longhorn-system', 'argocd', 'logging',
];
// Long names exist to stress truncation and wrapping in cards.
const LONG_NAMESPACES = [
  'customer-notifications-email-and-sms-fanout',
  'platform-observability-opentelemetry-collector',
];
const APPS = ['api', 'web', 'worker', 'redis', 'postgres', 'gateway', 'scheduler', 'exporter', 'controller'];
const NODES = ['node-a1', 'node-a2', 'node-b1', 'node-b2', 'node-c1'];

export interface MockState {
  scenario: Scenario;
  clusters: Cluster[];
  pods: PodItem[];
  jobs: JobItem[];
}

function clustersFor(scenario: Scenario): Cluster[] {
  const base: Cluster[] = [
    { name: 'prod-east', server: 'https://10.0.0.10:6443', auth: 'bearer', enabled: true, color: '#4589ff' },
    { name: 'staging', auth: 'kubeconfig', kubeconfig: { path: '~/.kube/staging.yaml' }, enabled: true, color: '#42be65' },
  ];
  switch (scenario) {
    case 'empty':
      return [];
    case 'healthy':
    case 'failing':
      return base;
    case 'mixed':
      return [...base, { name: 'dev-laptop', auth: 'kubeconfig', kubeconfig: { path: '~/.kube/config', context: 'kind-dev' }, enabled: false }];
    case 'large':
      return [
        ...base,
        { name: 'prod-west', server: 'https://10.1.0.10:6443', auth: 'bearer', enabled: true, color: '#be95ff' },
        { name: 'edge-eu-central-1', server: 'https://10.2.0.10:6443', auth: 'bearer', enabled: true, color: '#ff7eb6' },
      ];
  }
}

function podName(r: () => number, app: string): string {
  const hex = () => Math.floor(r() * 0xfffff).toString(16).padStart(5, '0');
  return `${app}-${hex()}${Math.floor(r() * 9)}d-${hex()}`;
}

function makePod(r: () => number, cluster: string, namespace: string, status: PodStatusKind): PodItem {
  const app = pick(r, APPS);
  const total = status === 'Empty' ? 0 : 1 + Math.floor(r() * 3);
  const ready = status === 'Idle' || status === 'Busy' ? total : Math.floor(r() * total);
  return {
    name: podName(r, app),
    namespace,
    cluster,
    node: status === 'Empty' && r() < 0.5 ? '' : pick(r, NODES),
    status,
    phase: status === 'Failed' ? pick(r, ['Running', 'Failed']) : status === 'Empty' ? 'Pending' : 'Running',
    ready,
    total,
    age: pick(r, ['<1m', '4m', '37m', '2h15m', '6h', '3d4h', '19d', '112d']),
    qos: pick(r, ['Guaranteed', 'Burstable', 'BestEffort']),
  };
}

function makeJob(r: () => number, cluster: string, namespace: string): JobItem {
  const status = pick<JobStatusKind>(r, ['Succeeded', 'Succeeded', 'Succeeded', 'Active', 'Failed', 'Suspended']);
  const completions = 1 + Math.floor(r() * 5);
  return {
    name: `${pick(r, ['backup', 'migrate', 'report', 'reindex', 'cleanup'])}-${Math.floor(r() * 1e8)}`,
    namespace,
    cluster,
    status,
    completions,
    succeeded: status === 'Succeeded' ? completions : Math.floor(r() * completions),
    failed: status === 'Failed' ? 1 + Math.floor(r() * 3) : 0,
    active: status === 'Active' ? 1 : 0,
    age: pick(r, ['3m', '1h', '9h', '2d']),
  };
}

export function createState(scenario: Scenario, seed = 42): MockState {
  const r = rng(seed);
  const clusters = clustersFor(scenario);
  const pods: PodItem[] = [];
  const jobs: JobItem[] = [];
  const weights = STATUS_WEIGHTS[scenario];
  const nsPerCluster = scenario === 'large' ? 14 : 6;
  const podsPerNs = scenario === 'large' ? [4, 40] : [2, 12];

  for (const c of clusters) {
    // Disabled clusters are not polled, so they contribute nothing.
    if (!c.enabled) continue;
    const pool = scenario === 'large' ? [...NAMESPACES, ...LONG_NAMESPACES] : NAMESPACES;
    const nss = [...pool].sort(() => r() - 0.5).slice(0, nsPerCluster);
    for (const ns of nss) {
      const n = podsPerNs[0] + Math.floor(r() * (podsPerNs[1] - podsPerNs[0]));
      for (let i = 0; i < n; i++) pods.push(makePod(r, c.name, ns, weighted(r, weights)));
      if (r() < 0.4) {
        const nj = 1 + Math.floor(r() * 4);
        for (let i = 0; i < nj; i++) jobs.push(makeJob(r, c.name, ns));
      }
    }
  }
  return { scenario, clusters, pods, jobs };
}

/** Flip a few pod statuses so live-update animations and transitions get exercised. */
export function churn(state: MockState, r: () => number, count = 3): void {
  const weights = STATUS_WEIGHTS[state.scenario];
  if (!weights.length || !state.pods.length) return;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(r() * state.pods.length);
    const old = state.pods[idx];
    state.pods[idx] = { ...makePod(r, old.cluster, old.namespace, weighted(r, weights)), name: old.name };
  }
}

// Mirrors podToNSStatus / worstStatus in model/pod.go.
function nsStatusOf(s: PodStatusKind): NamespaceStatusKind {
  return s === 'Empty' || s === 'Unknown' ? 'Changing' : s;
}

/** Mirrors model.GroupByNamespace + webserver.toGroupsJSON. */
export function toGroups(state: MockState): NamespaceGroup[] {
  const groups = new Map<string, NamespaceGroup>();
  const ensure = (cluster: string, namespace: string) => {
    const key = `${cluster}/${namespace}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        namespace, cluster, totalPods: 0, activePods: 0, readyPods: 0, status: 'Idle',
        statusCounts: { Idle: 0, Busy: 0, Changing: 0, Failed: 0 } as NamespaceGroup['statusCounts'],
        pods: [], jobs: [], totalJobs: 0,
        jobStatusCounts: { Active: 0, Succeeded: 0, Failed: 0, Suspended: 0 } as NamespaceGroup['jobStatusCounts'],
      };
      groups.set(key, g);
    }
    return g;
  };

  for (const p of state.pods) {
    const g = ensure(p.cluster, p.namespace);
    g.pods.push(p);
    g.totalPods++;
    if (p.phase !== 'Succeeded') g.activePods++;
    g.statusCounts[nsStatusOf(p.status)]++;
    if (p.phase !== 'Succeeded' && p.total > 0 && p.ready === p.total) g.readyPods++;
  }
  for (const j of state.jobs) {
    const g = ensure(j.cluster, j.namespace);
    g.jobs.push(j);
    g.totalJobs++;
    g.jobStatusCounts[j.status]++;
  }
  for (const g of groups.values()) {
    const c = g.statusCounts;
    g.status = c.Failed ? 'Failed' : c.Busy ? 'Busy' : c.Changing ? 'Changing' : 'Idle';
  }
  return [...groups.values()];
}

export function describePod(state: MockState, cluster: string, namespace: string, name: string): PodDescribe | null {
  const p = state.pods.find((x) => x.cluster === cluster && x.namespace === namespace && x.name === name);
  if (!p) return null;
  const app = p.name.split('-')[0];
  const failed = p.status === 'Failed';
  const now = clock.now();
  const iso = (agoMin: number) => new Date(now - agoMin * 60_000).toISOString();
  const containers = Array.from({ length: p.total }, (_, i) => ({
    name: i === 0 ? app : ['istio-proxy', 'log-shipper'][i - 1] ?? `sidecar-${i}`,
    image: i === 0 ? `registry.example.com/${namespace}/${app}:1.${i + 4}.2` : 'docker.io/istio/proxyv2:1.22.0',
    ready: i < p.ready,
    restartCount: failed ? 14 : p.status === 'Busy' ? 2 : 0,
    state: (failed && i === 0 ? 'waiting' : i < p.ready ? 'running' : 'waiting') as 'running' | 'waiting',
    stateReason: failed && i === 0 ? 'CrashLoopBackOff' : i < p.ready ? '' : 'ContainerCreating',
    startedAt: i < p.ready ? iso(90) : undefined,
    ports: i === 0 ? [{ containerPort: 8080, protocol: 'TCP' }] : [],
    resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
    volumeMounts: [{ name: 'kube-api-access-x7k2p', mountPath: '/var/run/secrets/kubernetes.io/serviceaccount', readOnly: true }],
  }));

  return {
    name: p.name, namespace, cluster, node: p.node, status: p.status, phase: p.phase, qos: p.qos, age: p.age,
    createdAt: iso(600),
    labels: { app, 'pod-template-hash': p.name.split('-')[1] ?? 'abc', 'app.kubernetes.io/part-of': namespace },
    annotations: { 'kubectl.kubernetes.io/restartedAt': iso(600), 'prometheus.io/scrape': 'true' },
    containers,
    initContainers: [],
    conditions: [
      { type: 'PodScheduled', status: p.node ? 'True' : 'False', lastTransition: iso(600), ...(p.node ? {} : { reason: 'Unschedulable', message: '0/5 nodes are available: 5 Insufficient memory.' }) },
      { type: 'Initialized', status: 'True', lastTransition: iso(599) },
      { type: 'ContainersReady', status: p.ready === p.total && p.total > 0 ? 'True' : 'False', lastTransition: iso(30) },
      { type: 'Ready', status: p.ready === p.total && p.total > 0 ? 'True' : 'False', lastTransition: iso(30) },
    ],
    events: failed
      ? [
          { type: 'Warning', reason: 'BackOff', message: `Back-off restarting failed container ${app} in pod ${p.name}`, count: 57, lastSeen: iso(1), firstSeen: iso(120) },
          { type: 'Normal', reason: 'Pulled', message: `Container image "registry.example.com/${namespace}/${app}:1.4.2" already present on machine`, count: 14, lastSeen: iso(6), firstSeen: iso(120) },
        ]
      : [{ type: 'Normal', reason: 'Scheduled', message: `Successfully assigned ${namespace}/${p.name} to ${p.node || 'node-a1'}`, count: 1, lastSeen: iso(600), firstSeen: iso(600) }],
    volumes: [
      { name: 'kube-api-access-x7k2p', type: 'Projected', source: '' },
      { name: 'config', type: 'ConfigMap', source: `${app}-config` },
    ],
    ownerReferences: [{ kind: 'ReplicaSet', name: p.name.split('-').slice(0, 2).join('-') }],
    serviceAccount: 'default',
    podIP: p.node ? '10.42.1.17' : '',
    hostIP: p.node ? '10.0.0.21' : '',
    deploymentName: app,
  };
}

const LOG_TEMPLATES = [
  'INFO  request completed method=GET path=/healthz status=200 duration=2ms',
  'INFO  request completed method=POST path=/api/v1/orders status=201 duration=48ms',
  'DEBUG cache hit key=session:7f3a ttl=287s',
  'WARN  slow query took=1240ms table=orders',
  'INFO  connected to upstream host=postgres.default.svc:5432',
  'ERROR failed to publish event: context deadline exceeded',
];

export function logLine(r: () => number, failing: boolean, at = new Date(clock.now())): string {
  const line = failing && r() < 0.35 ? 'ERROR panic: runtime error: invalid memory address or nil pointer dereference' : pick(r, LOG_TEMPLATES);
  return `${at.toISOString()} ${line}`;
}
