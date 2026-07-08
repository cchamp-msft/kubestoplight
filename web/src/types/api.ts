// -------------------------------------------------------------------------
// Mirrors config.Cluster from config/config.go
// -------------------------------------------------------------------------
export type AuthType = 'kubeconfig' | 'bearer' | 'tls' | 'oidc' | 'serviceaccount';

export interface KubeCfg {
  path: string;
  context?: string;
}

export interface TLSAuth {
  cert_file?: string;
  key_file?: string;
  ca_file?: string;
  insecure_skip_verify?: boolean;
}

export interface Cluster {
  name: string;
  server?: string;
  auth: AuthType;
  kubeconfig?: KubeCfg;
  bearer_token?: string;
  tls?: TLSAuth;
  namespace?: string;
  enabled: boolean;
  color?: string;
}

// -------------------------------------------------------------------------
// Mirrors model.PodStatus / model.Pod from model/pod.go
// -------------------------------------------------------------------------
export type PodStatusKind = 'Idle' | 'Busy' | 'Changing' | 'Failed' | 'Empty' | 'Unknown';
export type NamespaceStatusKind = 'Idle' | 'Busy' | 'Changing' | 'Failed' | 'Unknown';

export interface PodItem {
  name: string;
  namespace: string;
  cluster: string;
  node: string;
  status: PodStatusKind;
  phase: string;
  ready: number;
  total: number;
  age: string;
  qos: string;
}

// -------------------------------------------------------------------------
// Mirrors webserver.nsGroupJSON — the shape pushed over WebSocket and REST
// -------------------------------------------------------------------------
export interface NamespaceGroup {
  namespace: string;
  cluster: string;
  totalPods: number;
  activePods: number;
  readyPods: number;
  status: NamespaceStatusKind;
  statusCounts: Record<NamespaceStatusKind, number>;
  pods: PodItem[];
}

// -------------------------------------------------------------------------
// WebSocket message shape (webserver.wsMessage)
// -------------------------------------------------------------------------
export interface WebSocketMessage {
  type: 'snapshot';
  groups: NamespaceGroup[];
}
