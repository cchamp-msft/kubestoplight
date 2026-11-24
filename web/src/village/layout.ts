import type { Dweller, Plot, Role, Settlement, Street, Terrain } from './types';

// ---------------------------------------------------------------------------
// The point of this file
//
// k9s and kubestoplight's own grid both re-sort pods as their numbers move, so
// the pod you were watching is somewhere else on the next tick. A map is only
// useful if things stay where you left them.
//
// So: a pod claims a plot the first time it is seen and holds it until it dies.
// Nothing re-flows. Plots are never renumbered. The only movement on screen is
// a pod appearing, changing state, or imploding.
// ---------------------------------------------------------------------------

/** How long a plot stays visibly ruined, and reserved for its lineage, after a pod dies. */
export const RUBBLE_MS = 45_000;

/**
 * Plot 0 is the centre of the settlement and each new plot rings outward, so
 * long-lived system pods end up in the old town centre and newcomers build on
 * the outskirts — a free and accurate reading of age.
 *
 * Order is by distance from the centre with a fixed per-cell wobble added, not
 * by square ring. A square spiral fills a square, and no amount of drawing makes
 * a square block of houses look like anything but a housing estate; ordering by
 * a noisy radius gives a settlement a ragged coastline for free, because the
 * outline of the land simply *is* wherever the buildings got to.
 *
 * The table is built once for a fixed radius so index i always means the same
 * cell no matter how large the settlement grows.
 */
const ORDER_RADIUS = 40;
let order: Array<{ gx: number; gy: number }> | null = null;

function plotOrder(): Array<{ gx: number; gy: number }> {
  if (order) return order;
  const pts: Array<{ gx: number; gy: number; k: number }> = [];
  for (let y = -ORDER_RADIUS; y <= ORDER_RADIUS; y++) {
    for (let x = -ORDER_RADIUS; x <= ORDER_RADIUS; x++) {
      const wobble = (hash32(`plot:${x},${y}`) & 0xffff) / 0xffff;
      pts.push({ gx: x, gy: y, k: Math.hypot(x, y) + wobble * 0.9 });
    }
  }
  pts.sort((a, b) => a.k - b.k || a.gx - b.gx || a.gy - b.gy);
  order = pts.map(({ gx, gy }) => ({ gx, gy }));
  return order;
}

export function spiralCoord(i: number): { gx: number; gy: number } {
  if (i <= 0) return { gx: 0, gy: 0 };
  const table = plotOrder();
  if (i < table.length) return table[i];
  // Past the table a square ring is fine — nothing has 5000 pods on one node.
  const r = Math.ceil((Math.sqrt(i + 1) - 1) / 2);
  const side = 2 * r;
  const p = i - (2 * r - 1) ** 2;
  const leg = Math.floor(p / side);
  const step = p % side;
  switch (leg) {
    case 0:
      return { gx: r, gy: -r + 1 + step };
    case 1:
      return { gx: r - 1 - step, gy: r };
    case 2:
      return { gx: -r, gy: r - 1 - step };
    default:
      return { gx: -r + 1 + step, gy: -r };
  }
}

// Kubernetes generates pod name suffixes from a vowel-free alphabet so they
// cannot spell words. That makes them easy to recognise and strip.
const K8S_ALPHABET = 'bcdfghjklmnpqrstvwxz2456789';
const POD_SUFFIX = new RegExp(`^[${K8S_ALPHABET}]{5}$`);
const RS_HASH = new RegExp(`^[${K8S_ALPHABET}]{6,10}$`);

/**
 * The name a pod's replacement will share — what "the same household" means.
 *
 *   frs-obs-grafana-65ddcd85b9-b8q45  -> frs-obs-grafana      (Deployment)
 *   frs-obs-alloy-k2jwn               -> frs-obs-alloy        (DaemonSet)
 *   frs-obs-loki-0                    -> frs-obs-loki-0       (StatefulSet, ordinal is identity)
 *
 * A heuristic, because the snapshot carries no ownerReferences. Getting it wrong
 * only means a replacement pod builds on different land — cosmetic, not a bug.
 */
export function lineageOf(name: string): string {
  const parts = name.split('-');
  if (parts.length < 2) return name;

  // StatefulSet: trailing ordinal is stable identity, so the whole name is the lineage.
  if (/^\d+$/.test(parts[parts.length - 1])) return name;

  if (POD_SUFFIX.test(parts[parts.length - 1])) {
    parts.pop();
    // Deployments insert a ReplicaSet hash, which rolls on every update. Strip it
    // too, so a rollout rebuilds the household on the land it already held.
    if (parts.length > 1 && RS_HASH.test(parts[parts.length - 1])) parts.pop();
    return parts.join('-');
  }
  return name;
}

/** What sort of building a pod gets, inferred from how its controller names it. */
export type Household = 'tower' | 'cottage' | 'vault' | 'hall';

/**
 * Same reading as lineageOf(), used for silhouette instead of identity.
 *
 *   StatefulSet member   -> tower    (it has a name and an ordinal of its own)
 *   Deployment replica   -> cottage  (one of many, interchangeable)
 *   DaemonSet pod        -> vault    (one per node, part of the plumbing)
 *   static / mirror pod  -> hall     (the control plane, and it should look it)
 */
export function householdOf(name: string): Household {
  const parts = name.split('-');
  if (parts.length < 2) return 'hall';
  if (/^\d+$/.test(parts[parts.length - 1])) return 'tower';
  if (POD_SUFFIX.test(parts[parts.length - 1])) {
    parts.pop();
    return parts.length > 1 && RS_HASH.test(parts[parts.length - 1]) ? 'cottage' : 'vault';
  }
  return 'hall';
}

/**
 * Pods whose job is to hold data, by the only evidence available: what they are
 * called. Matched on whole dash- or underscore-separated words so `dbus-daemon`
 * is not filed as a database.
 *
 * A heuristic, and it will occasionally be wrong. Being wrong costs a silo where
 * a cottage should stand — worth it, because "which of these is the database"
 * is the first question anyone asks of a node they do not know.
 */
const STORAGE_WORD = new RegExp(
  '(^|[-_])(' +
    [
      'postgres|postgresql|pgsql|pgbouncer|patroni|mysql|mariadb|percona',
      'mongo|mongodb|redis|valkey|memcache|memcached|etcd|consul',
      'cassandra|scylla|couch|couchdb|neo4j|dgraph|cockroach|timescale|duckdb',
      'elastic|elasticsearch|opensearch|solr|clickhouse|druid',
      'influx|influxdb|victoria|victoriametrics|prometheus|thanos|mimir|loki|tempo',
      'kafka|pulsar|rabbitmq|nats|zookeeper|zk',
      'minio|ceph|rook|longhorn|garage|seaweedfs|nfs|smb|samba|iscsi',
      'vault|db|database|sql|storage|store|bucket|blob|volume|pvc|registry',
      'backup|restic|velero|snapshot|wal|archive',
    ].join('|') +
    ')([-_]|$)',
  'i',
);

/**
 * Pods whose job is to take traffic in from outside — ingress controllers,
 * proxies, load balancers. The village's gatehouse: everything arriving from
 * the wider world passes through it, which is exactly what these pods do.
 */
const GATE_WORD = new RegExp(
  '(^|[-_])(' +
    [
      'ingress|traefik|nginx|envoy|gateway|kong|haproxy|apisix|caddy',
      'metallb|istio|linkerd|proxy|loadbalancer',
    ].join('|') +
    ')([-_]|$)',
  'i',
);

/**
 * A CronJob pod. The job a CronJob spawns carries the scheduled time as a
 * minutes-since-epoch stamp — eight or more digits by now — and the pod adds
 * its usual suffix after that. Plain Jobs do not match: their pods look like
 * `name-xxxxx`, which is the DaemonSet shape.
 */
const CRON_STAMP = new RegExp(`-\\d{8,}-[${K8S_ALPHABET}]{5}$`);

/**
 * What a pod's building is, which is a different question from what shape its
 * controller has. A finished pod is not a house at all — it is the pile of work
 * it left behind, sitting in the yard until something clears it away.
 */
export function roleOf(name: string, finished: boolean): Role {
  if (finished) return 'spent';
  const lineage = lineageOf(name);
  if (STORAGE_WORD.test(lineage)) return 'store';
  if (GATE_WORD.test(lineage)) return 'gate';
  // A mill grinds on a schedule. Matched on the raw name: the stamp is the tell.
  if (CRON_STAMP.test(name)) return 'mill';
  return householdOf(name);
}

/** Who breaks ground first — the civic order a new district is built in. */
const ROLE_RANK: Record<Role, number> = {
  hall: 0,
  store: 1,
  gate: 2,
  tower: 3,
  vault: 4,
  mill: 5,
  cottage: 6,
  spent: 7,
};

function makePlot(id: number): Plot {
  const { gx, gy } = spiralCoord(id);
  return { id, gx, gy, sx: 0, sy: 0, occupant: null, lineage: null, livery: null, vacatedAt: null };
}

export function newSettlement(name: string, terrain: Terrain = 'plain'): Settlement {
  return { name, terrain, plots: [], roads: [], byDweller: new Map(), byCoord: new Map() };
}

/** FNV-1a. Used wherever something has to look arbitrary but never move. */
export function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Whether two namespaces are separated by a street or share a party wall.
 *
 * Not every seam gets paved — a village where every district is ringed by road
 * is a street plan, not a village. Stable per pair, so `kube-system` and
 * `monitoring` are always across the street from each other and always will be.
 */
function pavedBetween(a: string, b: string): boolean {
  return hash32(a < b ? `${a}|${b}` : `${b}|${a}`) % 100 < 62;
}

/**
 * Streets, as polylines running along the seams *between* plots rather than
 * through their centres.
 *
 * The earlier version was a minimum spanning tree over plot centres, which drew
 * a line from door to door — a network diagram, not a street. Here a street
 * appears where two districts meet, so the road is the thing that separates
 * namespaces and buildings front onto it. Which seams get paved is fixed per
 * namespace pair, so some districts butt up against each other and others sit
 * across the road.
 *
 * Coordinates are in plot units on half-integers: a street between column gx and
 * gx+1 runs along x = gx + 0.5.
 *
 * Also sets each plot's `sx`/`sy`, which is what gives the road room: a building
 * with a street down one side steps back from it. Without that the carriageway
 * is exactly as wide as the gap the lattice happened to leave, and the road ends
 * up looking like a line ruled between two rows of houses.
 */
const STREET_SETBACK = 0.3; // plot units, per paved side
const MAX_SETBACK = 0.3;

function buildStreets(s: Settlement): Street[] {
  // boundary key -> the run of cells it spans, collected then merged so a long
  // district edge becomes one continuous road rather than a stack of stubs.
  const vertical = new Map<number, number[]>();
  const horizontal = new Map<number, number[]>();

  const add = (m: Map<number, number[]>, key: number, at: number) => {
    const list = m.get(key);
    if (list) list.push(at);
    else m.set(key, [at]);
  };

  for (const p of s.plots) {
    p.sx = 0;
    p.sy = 0;
  }

  for (const p of s.plots) {
    if (p.occupant === null || p.livery === null) continue;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const id = s.byCoord.get(`${p.gx + dx},${p.gy + dy}`);
      if (id === undefined) continue;
      const q = s.plots[id];
      if (q.occupant === null || q.livery === null) continue;
      if (q.livery === p.livery || !pavedBetween(p.livery, q.livery)) continue;
      if (dx === 1) add(vertical, p.gx, p.gy);
      else add(horizontal, p.gy, p.gx);
      // Both neighbours give ground to the street between them. A plot with a
      // road on either side nets out to nothing and stays where it is, which is
      // right: it is hemmed in, not free to move.
      p.sx -= dx * STREET_SETBACK;
      p.sy -= dy * STREET_SETBACK;
      q.sx += dx * STREET_SETBACK;
      q.sy += dy * STREET_SETBACK;
    }
  }

  for (const p of s.plots) {
    const len = Math.hypot(p.sx, p.sy);
    if (len > MAX_SETBACK) {
      p.sx = (p.sx / len) * MAX_SETBACK;
      p.sy = (p.sy / len) * MAX_SETBACK;
    }
  }

  const streets: Street[] = [];
  const emit = (m: Map<number, number[]>, vert: boolean) => {
    for (const [key, cells] of m) {
      cells.sort((a, b) => a - b);
      let start = cells[0];
      let prev = cells[0];
      const flush = () => {
        // One point per cell edge, so the renderer has vertices to meander with.
        const pts: Street = [];
        for (let i = start - 0.5; i <= prev + 0.5 + 1e-9; i++) {
          pts.push(vert ? [key + 0.5, i] : [i, key + 0.5]);
        }
        streets.push(pts);
      };
      for (let i = 1; i < cells.length; i++) {
        if (cells[i] === prev + 1) {
          prev = cells[i];
          continue;
        }
        flush();
        start = cells[i];
        prev = cells[i];
      }
      flush();
    }
  };
  emit(vertical, true);
  emit(horizontal, false);
  return streets;
}

function grow(s: Settlement, count: number): void {
  while (s.plots.length < count) {
    const plot = makePlot(s.plots.length);
    s.plots.push(plot);
    s.byCoord.set(`${plot.gx},${plot.gy}`, plot.id);
  }
}

const TAU = Math.PI * 2;

/**
 * The direction a namespace's ward lies from the town centre.
 *
 * Neighbour affinity alone grows districts as a patchwork: the first pod of a
 * namespace lands on whatever plot happens to be next, and everything after it
 * huddles round that accident. Giving each namespace a fixed compass bearing
 * turns the accident into a plan — districts grow outward as contiguous wedges,
 * the way a town that zoned its wards would actually look. Existing buildings
 * never move; the bearing only steers where newcomers break ground.
 */
export function wardAngle(namespace: string): number {
  return (hash32(`ward:${namespace}`) / 0x100000000) * TAU;
}

function angleDist(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/** Occupied 8-way neighbours: same namespace, and same household within it. */
function neighbourAffinity(
  s: Settlement,
  plot: Plot,
  livery: string,
  lineage: string,
): { ns: number; kin: number } {
  let ns = 0;
  let kin = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const id = s.byCoord.get(`${plot.gx + dx},${plot.gy + dy}`);
      if (id === undefined) continue;
      const nb = s.plots[id];
      if (!nb.occupant) continue;
      if (nb.livery === livery) ns++;
      if (nb.lineage === lineage) kin++;
    }
  }
  return { ns, kin };
}

/**
 * How well a plot suits a newcomer from this namespace. Two readings, and the
 * order between them is the whole design:
 *
 * `aff` — build beside your own: kin (a controller's replicas end up a terrace,
 * not scattered through the district) counts more than mere neighbours in the
 * same colours. Affinity is compared first, so an adjacent plot *always* beats
 * a detached one — which is the guarantee that a district stays one piece.
 *
 * `wedge` — the arc distance from the ward's centreline, comparing second: it
 * steers *which* adjacent plot gets built on, so the district grows outward in
 * its own direction instead of wherever the plot table happened to point. Were
 * it weighed against affinity instead, a perfectly-aligned but detached plot
 * would out-bid the district's own edge, and wards would come out as islands.
 */
function plotScore(s: Settlement, p: Plot, d: Dweller, ward: number): { aff: number; wedge: number } {
  const { ns, kin } = neighbourAffinity(s, p, d.namespace, d.lineage);
  const r = Math.hypot(p.gx, p.gy);
  const wedge = r < 0.75 ? 0 : angleDist(Math.atan2(p.gy, p.gx), ward) * Math.min(r, 6);
  return { aff: kin * 3 + ns, wedge };
}

function claim(s: Settlement, d: Dweller, now: number): number {
  // Open a frontier of unclaimed land, not just the single next plot. This is
  // what makes the ward scoring real: with one free plot the "choice" is
  // forced and every district comes out as the patchwork the forced picks
  // happened to make. Roughly half a ring's worth of cells means every ward
  // has somewhere in its own direction to build.
  const n = s.byDweller.size;
  grow(s, n + Math.max(10, Math.ceil(Math.sqrt(n) * 2)));

  const free = s.plots.filter((p) => p.occupant === null);
  if (free.length === 0) {
    grow(s, s.plots.length + 1);
    free.push(s.plots[s.plots.length - 1]);
  }

  // 1. Rebuild on the household's own land if it is still standing empty.
  const inherited = free
    .filter((p) => p.lineage === d.lineage && p.vacatedAt !== null)
    .sort((a, b) => (b.vacatedAt ?? 0) - (a.vacatedAt ?? 0))[0];

  let target = inherited;

  if (!target) {
    // 2. Otherwise settle in the namespace's ward, next to kin if any stand.
    //    Skip plots still showing rubble — let the ruin be seen.
    const cold = free.filter((p) => p.vacatedAt === null || now - p.vacatedAt > RUBBLE_MS);
    const pool = cold.length > 0 ? cold : free;
    const ward = wardAngle(d.namespace);
    // The pool arrives in plot id order, so on a full tie the lower id — the
    // plot nearer the town centre — stands.
    let best: { aff: number; wedge: number } | null = null;
    for (const p of pool) {
      const score = plotScore(s, p, d, ward);
      if (
        !best ||
        score.aff > best.aff + 1e-9 ||
        (score.aff > best.aff - 1e-9 && score.wedge < best.wedge - 1e-9)
      ) {
        target = p;
        best = score;
      }
    }
  }

  target.occupant = d.key;
  target.lineage = d.lineage;
  target.livery = d.namespace;
  target.vacatedAt = null;
  s.byDweller.set(d.key, target.id);
  return target.id;
}

function release(s: Settlement, key: string, now: number): void {
  const id = s.byDweller.get(key);
  if (id === undefined) return;
  const plot = s.plots[id];
  plot.occupant = null;
  plot.vacatedAt = now;
  // lineage + livery are deliberately kept: they are what lets the replacement
  // pod inherit this land, and what tints the rubble while it is still visible.
  s.byDweller.delete(key);
}

/**
 * Fold a fresh snapshot into the existing map. Mutates `settlements` in place —
 * that persistence *is* the pinning, so this must be held in a ref, not rebuilt
 * on every render.
 */
export function reconcile(
  settlements: Map<string, Settlement>,
  dwellers: Dweller[],
  now: number,
  terrainOf: (node: string, current?: Terrain) => Terrain,
): void {
  const seen = new Map<string, Set<string>>();

  for (const d of dwellers) {
    if (!settlements.has(d.settlement)) {
      settlements.set(d.settlement, newSettlement(d.settlement, terrainOf(d.settlement)));
    }
    if (!seen.has(d.settlement)) seen.set(d.settlement, new Set());
    seen.get(d.settlement)!.add(d.key);
  }

  // Ground follows the population, so it is asked again on every snapshot.
  for (const [node, s] of settlements) s.terrain = terrainOf(node, s.terrain);

  // Evict the departed first, so their land is available to inherit this same tick.
  for (const [node, s] of settlements) {
    const present = seen.get(node) ?? new Set<string>();
    for (const key of [...s.byDweller.keys()]) {
      if (!present.has(key)) release(s, key, now);
    }
  }

  // Newcomers break ground in civic order: halls and storehouses first, then
  // the working buildings, cottages after, and the spent piles last. On a fresh
  // map that is what puts a district's important buildings at its core and the
  // piles on its outskirts — and it makes the claim order a function of the
  // population rather than of whatever order the snapshot arrived in.
  const arriving = dwellers.filter((d) => !settlements.get(d.settlement)!.byDweller.has(d.key));
  arriving.sort(
    (a, b) =>
      a.settlement.localeCompare(b.settlement) ||
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      a.namespace.localeCompare(b.namespace) ||
      a.name.localeCompare(b.name),
  );
  for (const d of arriving) {
    claim(settlements.get(d.settlement)!, d, now);
  }

  // Let old ruins go, and with them the claim their household had on the land.
  for (const s of settlements.values()) {
    for (const p of s.plots) {
      if (p.occupant === null && p.vacatedAt !== null && now - p.vacatedAt > RUBBLE_MS) {
        p.vacatedAt = null;
        p.lineage = null;
        p.livery = null;
      }
    }
    s.roads = buildStreets(s);
  }
}

/**
 * Bounding box in grid units, inclusive — of the *settled* land only. The plot
 * table now runs a frontier of unclaimed cells ahead of the population, and
 * counting those would swell every settlement's slot with empty ground.
 */
export function settlementBounds(s: Settlement) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of s.plots) {
    if (p.occupant === null && p.vacatedAt === null) continue;
    if (p.gx < minX) minX = p.gx;
    if (p.gx > maxX) maxX = p.gx;
    if (p.gy < minY) minY = p.gy;
    if (p.gy > maxY) maxY = p.gy;
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}
