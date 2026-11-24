import { describe, expect, it } from 'vitest';
import type { NamespaceGroup, PodItem } from '../types/api';
import { groundFor, toDwellers } from './adapter';
import { lineageOf, RUBBLE_MS, reconcile, spiralCoord } from './layout';
import type { Settlement, Terrain } from './types';

// Ground is not what these tests are about.
const terrainOf = (): Terrain => 'plain';

// ---------------------------------------------------------------------------
// The village is only worth building if things stay where you left them. k9s and
// kubestoplight's own grid both re-sort as numbers move, which is the thing this
// view exists to fix — so that property gets tested, not assumed.
// ---------------------------------------------------------------------------

function pod(name: string, over: Partial<PodItem> = {}): PodItem {
  return {
    name,
    namespace: 'observability',
    cluster: 'lab',
    node: 'node-a',
    status: 'Idle',
    phase: 'Running',
    ready: 1,
    total: 1,
    age: '3d',
    qos: 'Burstable',
    restarts: 0,
    hasMetrics: false,
    ...over,
  };
}

function groupsOf(pods: PodItem[]): NamespaceGroup[] {
  const byKey = new Map<string, NamespaceGroup>();
  for (const p of pods) {
    const key = `${p.cluster}/${p.namespace}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        namespace: p.namespace,
        cluster: p.cluster,
        totalPods: 0,
        activePods: 0,
        readyPods: 0,
        status: 'Idle',
        statusCounts: {} as NamespaceGroup['statusCounts'],
        pods: [],
        jobs: [],
        totalJobs: 0,
        jobStatusCounts: {} as NamespaceGroup['jobStatusCounts'],
      });
    }
    byKey.get(key)!.pods.push(p);
  }
  return [...byKey.values()];
}

/** dweller key -> "settlement#plotId" */
function plotsOf(settlements: Map<string, Settlement>): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of settlements.values()) {
    for (const [key, id] of s.byDweller) m.set(key, `${s.name}#${id}`);
  }
  return m;
}

const POPULATION = [
  pod('frs-obs-grafana-65ddcd85b9-b8q45'),
  pod('frs-obs-alloy-k2jwn', { node: 'node-b' }),
  pod('frs-obs-loki-0'),
  pod('prometheus-kube-prometheus-stack-frs-prometheus-0'),
  pod('etcd-fedora', { namespace: 'kube-system' }),
  pod('frs-obs-kube-state-metrics-6b6dcd74bd-d94mm', { node: 'node-b' }),
];

describe('lineageOf', () => {
  it.each([
    ['frs-obs-grafana-65ddcd85b9-b8q45', 'frs-obs-grafana'],
    ['frs-obs-kube-state-metrics-6b6dcd74bd-d94mm', 'frs-obs-kube-state-metrics'],
    ['frs-obs-alloy-k2jwn', 'frs-obs-alloy'],
    // StatefulSet ordinals are stable identity, so the whole name is the lineage.
    ['frs-obs-loki-0', 'frs-obs-loki-0'],
    ['prometheus-kube-prometheus-stack-frs-prometheus-0', 'prometheus-kube-prometheus-stack-frs-prometheus-0'],
    // Static/mirror pods carry the node name and no generated suffix.
    ['etcd-fedora', 'etcd-fedora'],
  ])('%s -> %s', (name, want) => {
    expect(lineageOf(name)).toBe(want);
  });
});

describe('spiralCoord', () => {
  it('starts at the centre and grows outward without repeating a cell', () => {
    expect(spiralCoord(0)).toEqual({ gx: 0, gy: 0 });
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const { gx, gy } = spiralCoord(i);
      expect(seen.has(`${gx},${gy}`)).toBe(false);
      seen.add(`${gx},${gy}`);
      // Cells are handed out by noisy radius, so i of them fill roughly a disc.
      // The slack covers the wobble that makes the coastline ragged.
      expect(Math.hypot(gx, gy)).toBeLessThanOrEqual(Math.sqrt((i + 1) / Math.PI) + 2.2);
    }
  });

  it('hands out the same cell for an index however far the table is walked', () => {
    // Plot ids are permanent. If the order depended on how many plots had been
    // asked for, every settlement would reshuffle the moment it grew.
    const first = Array.from({ length: 50 }, (_, i) => spiralCoord(i));
    for (let i = 0; i < 900; i++) spiralCoord(i);
    expect(Array.from({ length: 50 }, (_, i) => spiralCoord(i))).toEqual(first);
  });
});

describe('reconcile', () => {
  it('keeps every pod on its plot across repeated polls', () => {
    const settlements = new Map<string, Settlement>();
    let t = 1_000_000;
    reconcile(settlements, toDwellers(groupsOf(POPULATION)), t, terrainOf);
    const before = plotsOf(settlements);

    for (let i = 0; i < 10; i++) {
      t += 3000;
      reconcile(settlements, toDwellers(groupsOf(POPULATION)), t, terrainOf);
    }
    expect(plotsOf(settlements)).toEqual(before);
  });

  it('ignores snapshot ordering — a re-sorted poll must not move anything', () => {
    const settlements = new Map<string, Settlement>();
    reconcile(settlements, toDwellers(groupsOf(POPULATION)), 1_000_000, terrainOf);
    const before = plotsOf(settlements);

    reconcile(settlements, toDwellers(groupsOf([...POPULATION].reverse())), 1_003_000, terrainOf);
    expect(plotsOf(settlements)).toEqual(before);
  });

  it('builds the same town whatever order the first snapshot arrived in', () => {
    // Claims are made in civic order, not snapshot order, so even the very
    // first poll — where every pod breaks ground at once — is deterministic.
    const a = new Map<string, Settlement>();
    const b = new Map<string, Settlement>();
    reconcile(a, toDwellers(groupsOf(POPULATION)), 1_000_000, terrainOf);
    reconcile(b, toDwellers(groupsOf([...POPULATION].reverse())), 1_000_000, terrainOf);
    expect(plotsOf(a)).toEqual(plotsOf(b));
  });

  it('grows each namespace as one contiguous ward, not a patchwork', () => {
    const pods = [
      ...Array.from({ length: 14 }, (_, i) => pod(`web-${i}-aaaaa`, { namespace: 'frontend' })),
      ...Array.from({ length: 14 }, (_, i) => pod(`api-${i}-aaaaa`, { namespace: 'backend' })),
      ...Array.from({ length: 14 }, (_, i) => pod(`obs-${i}-aaaaa`, { namespace: 'monitoring' })),
    ];
    const settlements = new Map<string, Settlement>();
    reconcile(settlements, toDwellers(groupsOf(pods)), 1_000_000, terrainOf);
    const s = [...settlements.values()][0];

    // Flood-fill each namespace's plots 8-way: one district, one component.
    for (const ns of ['frontend', 'backend', 'monitoring']) {
      const mine = s.plots.filter((p) => p.occupant !== null && p.livery === ns);
      const cells = new Set(mine.map((p) => `${p.gx},${p.gy}`));
      const queue = [mine[0]];
      const seen = new Set([`${mine[0].gx},${mine[0].gy}`]);
      while (queue.length > 0) {
        const p = queue.pop()!;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const k = `${p.gx + dx},${p.gy + dy}`;
            if (!cells.has(k) || seen.has(k)) continue;
            seen.add(k);
            const id = s.byCoord.get(k)!;
            queue.push(s.plots[id]);
          }
        }
      }
      expect(seen.size, `${ns} split into islands`).toBe(mine.length);
    }
  });

  it('separates identically-named nodes in different clusters', () => {
    const settlements = new Map<string, Settlement>();
    reconcile(
      settlements,
      toDwellers(groupsOf([pod('a-xxxxx'), pod('b-xxxxx', { cluster: 'other' })])),
      1_000_000,
      terrainOf,
    );
    // Both pods claim node-a, but in different clusters — two settlements, not one.
    expect([...settlements.keys()].sort()).toEqual(['lab/node-a', 'other/node-a']);
  });

  it('gives a rollout replacement the plot its predecessor held', () => {
    const settlements = new Map<string, Settlement>();
    let t = 1_000_000;
    reconcile(settlements, toDwellers(groupsOf(POPULATION)), t, terrainOf);
    const before = plotsOf(settlements);
    const victim = 'lab/observability/frs-obs-grafana-65ddcd85b9-b8q45';
    const victimPlot = before.get(victim)!;

    // The old pod goes away...
    const without = POPULATION.filter((p) => p.name !== 'frs-obs-grafana-65ddcd85b9-b8q45');
    t += 3000;
    reconcile(settlements, toDwellers(groupsOf(without)), t, terrainOf);
    expect(plotsOf(settlements).has(victim)).toBe(false);

    // ...and the ReplicaSet brings up a new one.
    t += 3000;
    reconcile(
      settlements,
      toDwellers(groupsOf([...without, pod('frs-obs-grafana-65ddcd85b9-zz9q4')])),
      t,
      terrainOf,
    );
    const after = plotsOf(settlements);
    expect(after.get('lab/observability/frs-obs-grafana-65ddcd85b9-zz9q4')).toBe(victimPlot);

    // And nobody else shuffled while that happened.
    for (const [key, plot] of before) {
      if (key === victim) continue;
      expect(after.get(key)).toBe(plot);
    }
  });

  it('leaves visible ruins, then frees the land once the rubble window passes', () => {
    const settlements = new Map<string, Settlement>();
    let t = 1_000_000;
    reconcile(settlements, toDwellers(groupsOf(POPULATION)), t, terrainOf);

    t += 3000;
    reconcile(settlements, [], t, terrainOf);
    const ruins = () => [...settlements.values()].flatMap((s) => s.plots).filter((p) => p.vacatedAt !== null);
    expect(ruins().length).toBe(POPULATION.length);

    t += RUBBLE_MS + 1000;
    reconcile(settlements, [], t, terrainOf);
    expect(ruins().length).toBe(0);
  });
});

describe('toDwellers', () => {
  it('reports load as unknown rather than zero when metrics-server is absent', () => {
    const [d] = toDwellers(groupsOf([pod('a-xxxxx')]));
    expect(d.load).toBeNull();
    expect(d.cpuMilli).toBeNull();
  });

  it('scores a pod against its own limit and against its peers, whichever is louder', () => {
    const ds = toDwellers(
      groupsOf([
        // Well under a generous limit, but far and away the busiest thing running.
        pod('hog-xxxxx', { hasMetrics: true, cpuMilli: 900, cpuLimit: 4000 }),
        pod('quiet-xxxxx', { hasMetrics: true, cpuMilli: 2, cpuLimit: 1000 }),
      ]),
    );
    const hog = ds.find((d) => d.name.startsWith('hog'))!;
    const quiet = ds.find((d) => d.name.startsWith('quiet'))!;
    expect(hog.load).toBe(1);
    expect(quiet.load).toBeLessThan(0.05);
  });

  it('does not treat a long-running restart history as current activity', () => {
    // Status Busy only means "has restarted at least once, ever".
    const [d] = toDwellers(groupsOf([pod('old-xxxxx', { status: 'Busy', restarts: 3684 })]));
    expect(d.state).toBe('settled');
    expect(d.restarts).toBe(3684);
  });
});

describe('ground', () => {
  const on = (node: string, n: number, over: Partial<PodItem> = {}) =>
    Array.from({ length: n }, (_, i) => pod(`${node}-web-${i}`, { node, ...over }));
  const ground = (pods: PodItem[]) => groundFor(toDwellers(groupsOf(pods)));

  it('follows each node’s share of its cluster', () => {
    const of = ground([...on('big', 17), ...on('mid', 2), ...on('small', 1)]);
    expect(of('lab/big')).toBe('firm'); // 85%
    expect(of('lab/mid')).toBe('plain'); // 10%
    expect(of('lab/small')).toBe('dirt'); // 5%
  });

  it('measures a node against its own cluster only', () => {
    const of = ground([...on('solo', 2), ...on('big', 50, { cluster: 'other' })]);
    expect(of('lab/solo')).toBe('firm');
  });

  it('does not count finished pods or pods with no node', () => {
    const of = ground([
      ...on('a', 9),
      ...on('b', 1),
      ...on('b', 30, { phase: 'Succeeded', namespace: 'batch' }),
      ...on('', 30, { phase: 'Pending', status: 'Busy', namespace: 'queue' }),
    ]);
    expect(of('lab/a')).toBe('firm');
    expect(of('lab/b')).toBe('plain');
    expect(of('lab/(unscheduled)')).toBe('dirt');
  });

  it('holds its ground near a threshold', () => {
    const of = ground([...on('a', 78), ...on('b', 11), ...on('c', 11)]);
    expect(of('lab/a')).toBe('plain');
    expect(of('lab/a', 'firm')).toBe('firm');
    expect(of('lab/b')).toBe('plain');
    expect(of('lab/b', 'dirt')).toBe('dirt');
  });

  it('is asked again on every snapshot', () => {
    const settlements = new Map<string, Settlement>();
    const first = toDwellers(groupsOf([...on('a', 9), ...on('b', 1)]));
    reconcile(settlements, first, 1_000_000, groundFor(first));
    expect(settlements.get('lab/a')!.terrain).toBe('firm');
    const second = toDwellers(groupsOf([...on('a', 5), ...on('b', 5)]));
    reconcile(settlements, second, 1_003_000, groundFor(second));
    expect(settlements.get('lab/a')!.terrain).toBe('plain');
  });
});
