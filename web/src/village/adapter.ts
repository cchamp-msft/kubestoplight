import type { NamespaceGroup, PodItem } from '../types/api';
import type { Dweller, DwellerState, Terrain } from './types';
import { lineageOf, roleOf } from './layout';
import { assignPacks } from './sprites';

// ---------------------------------------------------------------------------
// The only Kubernetes-aware file in this directory. Everything else speaks
// villages. Point a different adapter at layout.ts + render.ts and the same
// map draws something else entirely.
// ---------------------------------------------------------------------------

/**
 * The ground under a node is whatever it takes to carry what stands on it: a
 * node holding most of its cluster's pods gets cobbles, one holding almost
 * none is left as bare earth, and everything between is ordinary paving.
 *
 * Shares are of the node's own cluster, counted in live pods. `slack` is how
 * far past a threshold a settlement must go before its ground changes back, so
 * a node sitting on the line does not repave itself with every poll.
 */
export const TERRAIN_SHARE = { firm: 0.8, dirt: 0.1, slack: 0.03 };

const UNSCHEDULED = '(unscheduled)';

/**
 * The ground each settlement stands on, for this population. Returns a lookup
 * keyed by `cluster/node` (node names are only unique within a cluster) that
 * also takes the ground the settlement has now.
 */
export function groundFor(dwellers: Dweller[]): (settlement: string, current?: Terrain) => Terrain {
  const onNode = new Map<string, number>();
  const inCluster = new Map<string, number>();
  for (const d of dwellers) {
    // A finished pod is a pile in the yard, and a pod with no node is nobody's
    // load yet. Neither is weight a node is carrying.
    if (d.state === 'fading' || d.settlement.endsWith(`/${UNSCHEDULED}`)) continue;
    onNode.set(d.settlement, (onNode.get(d.settlement) ?? 0) + 1);
    inCluster.set(d.cluster, (inCluster.get(d.cluster) ?? 0) + 1);
  }

  const { firm, dirt, slack } = TERRAIN_SHARE;
  return (settlement, current) => {
    const cluster = settlement.slice(0, settlement.indexOf('/'));
    const total = inCluster.get(cluster) ?? 0;
    const share = total > 0 ? (onNode.get(settlement) ?? 0) / total : 0;
    if (share >= (current === 'firm' ? firm - slack : firm)) return 'firm';
    if (share < (current === 'dirt' ? dirt + slack : dirt)) return 'dirt';
    return 'plain';
  };
}

function stateOf(pod: PodItem): DwellerState {
  if (pod.phase === 'Succeeded') return 'fading';
  switch (pod.status) {
    case 'Failed':
      return 'collapsing';
    case 'Busy':
    case 'Changing':
      // Both mean "in progress": Busy while it is young, Changing once it has
      // been stuck past five minutes (model/pod.go#determineStatusAt). What is
      // in progress is told apart by the pod itself.
      if (pod.phase === 'Pending' || pod.ready < pod.total) return 'raising';
      // Everything ready, so it is either a recent restart, which is history
      // and shows as soot, or a deletion that has outlived its grace period.
      return pod.status === 'Changing' ? 'fading' : 'settled';
    case 'Idle':
      return 'settled';
    default:
      return 'derelict';
  }
}

/**
 * Reference CPU for pods with no limit set. Without it, an unlimited pod pinning
 * a core would look exactly as calm as one doing nothing.
 *
 * p95 rather than the max, so a single runaway does not flatten everyone else,
 * and floored at 100m so a genuinely quiet cluster stays quiet instead of
 * promoting its sleepiest pod to "running hot".
 */
function cpuReference(pods: PodItem[]): number {
  const draws = pods
    .map((p) => p.cpuMilli ?? 0)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  if (draws.length === 0) return 0;
  return Math.max(100, draws[Math.floor(draws.length * 0.95)]);
}

/** Flatten the namespace-grouped snapshot into a flat population. */
export function toDwellers(groups: NamespaceGroup[]): Dweller<PodItem>[] {
  const all = groups.flatMap((g) => g.pods);
  const ref = cpuReference(all);

  // Settle the architecture before anything asks for a silhouette, so the packs
  // fall out of the namespace names rather than out of paint order.
  assignPacks(all.map((p) => p.namespace));

  return all.map((pod) => {
    let load: number | null = null;
    if (pod.hasMetrics) {
      const cpu = pod.cpuMilli ?? 0;
      // Against its own ceiling if it has one, and against the rest of the
      // cluster regardless. The louder of the two wins, so neither a generous
      // limit nor a missing one can hide a pod that is working hard.
      const vsLimit = pod.cpuLimit ? cpu / pod.cpuLimit : 0;
      const vsPeers = ref > 0 ? cpu / ref : 0;
      load = Math.min(1, Math.max(vsLimit, vsPeers));
    }

    const fill =
      pod.hasMetrics && pod.memLimit ? Math.min(1, (pod.memBytes ?? 0) / pod.memLimit) : null;

    return {
      key: `${pod.cluster}/${pod.namespace}/${pod.name}`,
      name: pod.name,
      namespace: pod.namespace,
      cluster: pod.cluster,
      // Two clusters in this lab both have a node called `fedora`, so the node
      // name alone would merge them into one impossible settlement.
      settlement: `${pod.cluster}/${pod.node || UNSCHEDULED}`,
      lineage: `${pod.namespace}/${lineageOf(pod.name)}`,
      // A finished pod is not a house any more: it is the hayrick or the woodpile
      // its work left in the yard, waiting for something to clear it.
      role: roleOf(pod.name, pod.phase === 'Succeeded'),
      state: stateOf(pod),
      ready: pod.ready,
      total: pod.total,
      age: pod.age,
      load,
      fill,
      cpuMilli: pod.hasMetrics ? (pod.cpuMilli ?? 0) : null,
      memBytes: pod.hasMetrics ? (pod.memBytes ?? 0) : null,
      restarts: pod.restarts ?? 0,
      source: pod,
    };
  });
}

/**
 * Stable hue per namespace — the livery a building flies. Namespaces span nodes,
 * so this travels with the building rather than the ground it stands on.
 */
export function liveryHue(namespace: string): number {
  let h = 2166136261;
  for (let i = 0; i < namespace.length; i++) {
    h ^= namespace.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}
