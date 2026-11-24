import { describe, expect, it } from 'vitest';
import type { NamespaceGroup, PodItem } from '../types/api';
import { toDwellers } from './adapter';
import { reconcile, roleOf } from './layout';
import type { Settlement, Terrain } from './types';

// Ground is not what these tests are about.
const terrainOf = (): Terrain => 'plain';
import { gridWorld, hitTest, placeSettlements, plotWorld, settlementAngle, TILE } from './render';
import { PACK_NAMES, PACKS, packOf, resetPacks, variantOf } from './sprites';

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

function town(pods: PodItem[]) {
  const settlements = new Map<string, Settlement>();
  reconcile(settlements, toDwellers(groupsOf(pods)), 1_000_000, terrainOf);
  const ordered = [...settlements.values()];
  return { ordered, placements: placeSettlements(ordered, 2) };
}

describe('settlementAngle', () => {
  it('never lands square, because a square village is the one that reads as a grid', () => {
    for (const name of ['lab/node-a', 'prod/worker-1', 'edge/worker-1', 'a/b', 'x/y']) {
      const deg = Math.abs((settlementAngle(name) * 180) / Math.PI);
      expect(deg).toBeGreaterThan(5);
      expect(deg).toBeLessThan(17);
    }
  });

  it('is stable for a given settlement', () => {
    expect(settlementAngle('prod/worker-1')).toBe(settlementAngle('prod/worker-1'));
  });
});

describe('hitTest', () => {
  it('finds the pod under the cursor even though the settlement is tilted', () => {
    const pods = Array.from({ length: 24 }, (_, i) => pod(`svc-${i}-aaaaa`));
    const { ordered, placements } = town(pods);
    const s = ordered[0];
    const pl = placements.get(s.name)!;
    expect(pl.rot).not.toBe(0);

    const camera = { x: 0, y: 0, scale: 1 };
    for (const plot of s.plots) {
      if (plot.occupant === null) continue;
      // Aim at the plot centre, not the jittered building, because the grid cell
      // is what picking works off.
      const at = gridWorld(pl, plot.gx, plot.gy);
      expect(hitTest(at.x, at.y, ordered, placements, camera)).toBe(plot.occupant);
    }
  });

  it('keeps a jittered building inside the cell that picks it', () => {
    const pods = Array.from({ length: 40 }, (_, i) => pod(`svc-${i}-aaaaa`));
    const { ordered, placements } = town(pods);
    const s = ordered[0];
    const pl = placements.get(s.name)!;
    for (const plot of s.plots) {
      const centre = gridWorld(pl, plot.gx, plot.gy);
      const drawn = plotWorld(pl, plot);
      expect(Math.hypot(drawn.x - centre.x, drawn.y - centre.y)).toBeLessThan(TILE / 2);
    }
  });
});

describe('streets', () => {
  const corner = (v: number) => Math.abs(v - Math.round(v) - 0.5) < 1e-9 || Math.abs(v - Math.round(v) + 0.5) < 1e-9;

  it('runs between plots, never through one', () => {
    const pods = [
      ...Array.from({ length: 10 }, (_, i) => pod(`a-${i}-aaaaa`, { namespace: 'alpha' })),
      ...Array.from({ length: 10 }, (_, i) => pod(`b-${i}-aaaaa`, { namespace: 'beta' })),
      ...Array.from({ length: 10 }, (_, i) => pod(`c-${i}-aaaaa`, { namespace: 'gamma' })),
    ];
    const { ordered } = town(pods);
    const s = ordered[0];
    expect(s.roads.length).toBeGreaterThan(0);
    for (const street of s.roads) {
      expect(street.length).toBeGreaterThanOrEqual(2);
      for (const [gx, gy] of street) {
        // Every vertex sits on a lattice corner. A whole-number pair would be a
        // plot centre, which is exactly where a road must not be.
        expect(corner(gx) && corner(gy)).toBe(true);
      }
    }
  });

  it('makes the buildings either side give ground to the road', () => {
    const pods = [
      ...Array.from({ length: 10 }, (_, i) => pod(`a-${i}-aaaaa`, { namespace: 'alpha' })),
      ...Array.from({ length: 10 }, (_, i) => pod(`b-${i}-aaaaa`, { namespace: 'beta' })),
      ...Array.from({ length: 10 }, (_, i) => pod(`c-${i}-aaaaa`, { namespace: 'gamma' })),
    ];
    const { ordered } = town(pods);
    const s = ordered[0];
    const shifted = s.plots.filter((p) => p.sx !== 0 || p.sy !== 0);
    expect(shifted.length).toBeGreaterThan(0);
    for (const p of s.plots) {
      // Never so far that a building leaves the cell that picks it, even once
      // the per-plot jitter is added on top.
      expect(Math.hypot(p.sx, p.sy)).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it('leaves a single-namespace settlement with no streets at all', () => {
    // Streets are namespace seams. One namespace means no seams, and inventing
    // some would be drawing a road network that means nothing.
    const { ordered } = town(Array.from({ length: 16 }, (_, i) => pod(`solo-${i}-aaaaa`)));
    expect(ordered[0].roads).toEqual([]);
  });
});

describe('roleOf', () => {
  it('reads a database as a storehouse whatever shape its controller is', () => {
    expect(roleOf('frs-obs-loki-0', false)).toBe('store');
    expect(roleOf('longhorn-csi-plugin-k2jwn', false)).toBe('store');
    expect(roleOf('postgres-primary-7d9f8b6c4-xk2mn', false)).toBe('store');
  });

  it('does not file every word containing a database as a database', () => {
    // Whole words only: `dbus` is not `db`, `restic-backup` is.
    expect(roleOf('dbus-daemon-5f7c9-b8q45', false)).not.toBe('store');
    expect(roleOf('restic-backup-4f8d9c7b6-b8q45', false)).toBe('store');
  });

  it('turns a finished pod into what its work left behind', () => {
    // Succeeded beats every other reading — a completed job is not a house.
    expect(roleOf('frs-obs-loki-0', true)).toBe('spent');
    expect(roleOf('backup-cron-29384-b8q45', true)).toBe('spent');
  });

  it('still reads controller shape when nothing else applies', () => {
    expect(roleOf('frs-obs-grafana-65ddcd85b9-b8q45', false)).toBe('cottage');
    expect(roleOf('frs-obs-alloy-k2jwn', false)).toBe('vault');
    expect(roleOf('kube-apiserver-fedora', false)).toBe('hall');
  });

  it('reads traffic pods as the gatehouse the outside world comes in through', () => {
    expect(roleOf('ingress-nginx-controller-6b6dcd74bd-d94mm', false)).toBe('gate');
    expect(roleOf('metallb-speaker-k2jwn', false)).toBe('gate');
    expect(roleOf('traefik-7d9f8b6c4-xk2mn', false)).toBe('gate');
  });

  it('reads a CronJob pod as a mill, by the schedule stamp in its name', () => {
    expect(roleOf('cert-rotate-29384920-b8q45', false)).toBe('mill');
    // A plain Job pod carries no stamp and keeps its controller shape...
    expect(roleOf('migrate-once-b8q45', false)).toBe('vault');
    // ...and a mill that has finished grinding is spent like anything else.
    expect(roleOf('cert-rotate-29384920-b8q45', true)).toBe('spent');
  });
});

describe('packs', () => {
  it('holds a namespace to one pack once it has claimed it', () => {
    resetPacks();
    const first = packOf('longhorn');
    for (let i = 0; i < 50; i++) packOf(`filler-${i}`);
    expect(packOf('longhorn')).toBe(first);
  });

  it('spreads across the packs rather than piling into the likeliest', () => {
    // Two re-rolls against what is already taken, so a handful of namespaces
    // should not all end up in the village pack just because it is heaviest.
    // Not a guarantee of uniqueness: the third roll stands whatever it lands on.
    resetPacks();
    const used = new Set(
      ['kube-system', 'longhorn-system', 'monitoring', 'default', 'cert-manager'].map(packOf),
    );
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  it('lets packs be shared once every one of them is in use', () => {
    resetPacks();
    for (let i = 0; i < 40; i++) packOf(`ns-${i}`);
    // Nothing is left to find, so the roll simply stands.
    expect(new Set(Array.from({ length: 40 }, (_, i) => packOf(`ns-${i}`))).size).toBe(
      PACK_NAMES.length,
    );
  });
});

describe('variantOf', () => {
  it('gives a pod the same silhouette for its whole life', () => {
    const key = 'lab/observability/frs-obs-grafana-65ddcd85b9-b8q45';
    expect(variantOf(key, 'cottage', 'observability', null)).toBe(
      variantOf(key, 'cottage', 'observability', null),
    );
  });

  it('draws a whole namespace from one pack', () => {
    resetPacks();
    const stems = PACKS[packOf('longhorn')].art;
    const allowed = new Set<string>(Object.values(stems).flat());
    for (let i = 0; i < 300; i++) {
      const v = variantOf(`k/longhorn/pod-${i}-aaaaa`, 'cottage', 'longhorn', null);
      // A landmark is the one sanctioned exception, and only the village pack
      // has any — everywhere else every building comes out of the pack.
      const rare = (PACKS[packOf('longhorn')].rare ?? []).some(([n]) => n === v);
      expect(allowed.has(v) || rare).toBe(true);
    }
  });

  it('keeps landmarks rare and spreads the rest across the pack', () => {
    // Landmarks only exist in the village pack, so find a namespace that holds
    // it rather than assuming one does.
    let ns = '';
    for (let i = 0; ; i++) {
      resetPacks();
      ns = `tenant-${i}`;
      if (packOf(ns) === 'village') break;
    }
    const common = new Set<string>(PACKS.village.art.cottage);
    const seen = new Map<string, number>();
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const v = variantOf(`ns/pod-${i}-aaaaa`, 'cottage', ns, null);
      seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    let rare = 0;
    for (const [name, n] of seen) if (!common.has(name)) rare += n;
    expect(rare / N).toBeGreaterThan(0.03);
    expect(rare / N).toBeLessThan(0.16);
    // All four everyday silhouettes get used, so a district is not a row of clones.
    for (const name of common) expect(seen.get(name) ?? 0).toBeGreaterThan(N * 0.1);
  });

  it('borrows the village pack when its own art is missing', () => {
    resetPacks();
    const atlas = { building: { cottage: {} }, wild: {}, ground: {} } as never;
    for (let i = 0; i < 200; i++) {
      expect(variantOf(`ns/pod-${i}-aaaaa`, 'cottage', `ns-${i % 9}`, atlas)).toBe('cottage');
    }
  });

  it('has art on disk for every stem every pack can name', () => {
    // The pack tables are written by hand against the contact sheets, so this is
    // the check that stops a typo becoming an invisible building.
    const have = new Set(
      Object.keys(import.meta.glob('../../public/village-art/*.png')).map((p) =>
        p.slice(p.lastIndexOf('/') + 1, -4),
      ),
    );
    expect(have.size).toBeGreaterThan(0);
    for (const pack of PACK_NAMES) {
      const stems = [
        ...Object.values(PACKS[pack].art).flat(),
        ...(PACKS[pack].rare ?? []).map(([n]) => n),
      ];
      for (const stem of stems) expect(have, `${pack}/${stem}`).toContain(stem);
    }
  });
});
