// Village domain model.
//
// Deliberately free of any Kubernetes types — everything k8s-aware lives in
// adapter.ts. If this view ever breaks off into its own repo, this file, layout.ts
// and render.ts come along unchanged and only the adapter gets rewritten.

/**
 * Health only. Activity is a separate channel (`load`) and history is a third
 * (`restarts`) — conflating them is what makes a 100-day-old cluster look like
 * it is entirely on fire.
 */
export type DwellerState =
  | 'settled' // running
  | 'raising' // pending / creating — a foundation, not yet a building
  | 'collapsing' // CrashLoopBackOff, ImagePull, OOMKilled — falling down in public
  | 'fading' // terminating or completed
  | 'derelict'; // unknown, or no containers reporting

/**
 * What a dweller does, which is what its building looks like — see roleOf().
 * The first four come from the shape of the controller; `store` and `spent`
 * come from what the pod is actually for, and override it.
 */
export type Role =
  | 'tower' // StatefulSet member
  | 'cottage' // Deployment replica
  | 'vault' // DaemonSet pod
  | 'hall' // static / control plane
  | 'store' // a database or object store — it holds things
  | 'gate' // an ingress, proxy or load balancer — traffic enters through it
  | 'mill' // a CronJob pod — it works on a schedule, like a mill works the wind
  | 'spent'; // finished its work; what is left is the pile in the yard

/** One pod, in village terms. `source` carries whatever the adapter put in. */
export interface Dweller<T = unknown> {
  /** Stable for the pod's whole life. Pod names are immutable, so this is enough. */
  key: string;
  name: string;
  namespace: string;
  cluster: string;
  /** Node name. Pods do not move between nodes, so this never changes mid-life. */
  settlement: string;
  /** Controller name with generated suffixes stripped — see lineageOf(). */
  lineage: string;
  role: Role;
  state: DwellerState;
  ready: number;
  total: number;
  age: string;
  /**
   * CPU intensity, 0..1, from metrics-server. `null` means genuinely unknown —
   * an unlit village is "no metrics", not "nothing happening".
   */
  load: number | null;
  /** Memory as a fraction of the pod's limit, 0..1, or null. */
  fill: number | null;
  cpuMilli: number | null;
  memBytes: number | null;
  /** Lifetime restarts. Scar tissue, not current activity — rendered as soot. */
  restarts: number;
  source: T;
}

/** A fixed piece of land. Its coordinates never change once handed out. */
export interface Plot {
  id: number;
  gx: number;
  gy: number;
  /**
   * How far the building stands off its plot centre, in plot units, so that it
   * fronts onto the street rather than sitting on it. Recomputed with the street
   * network — see buildStreets(). Zero for a plot with no paved seam near it.
   */
  sx: number;
  sy: number;
  /** Dweller key currently standing here, or null if empty. */
  occupant: string | null;
  /** Lineage of the last dweller to hold this plot — lets a replacement rebuild here. */
  lineage: string | null;
  /** Namespace of the last dweller, for neighbourhood affinity. */
  livery: string | null;
  /** ms timestamp the plot emptied, or null if never / currently occupied. */
  vacatedAt: number | null;
}

/**
 * Ground a settlement is built on, by how much it has to carry: cobbles under
 * a settlement holding most of its group, bare earth under one holding almost
 * none, plain paving between.
 */
export type Terrain = 'firm' | 'plain' | 'dirt';

/**
 * A street, as a polyline in *plot* units. Whole numbers are plot centres, so a
 * street running along the boundary between two plots sits on half-integers —
 * roads go between buildings, never through them.
 */
export type Street = Array<[number, number]>;

export interface Settlement {
  name: string;
  terrain: Terrain;
  plots: Plot[];
  /**
   * The street network, recomputed on each reconcile rather than each frame.
   * Streets run along the seams between districts — see buildStreets().
   */
  roads: Street[];
  /** dweller key -> plot id */
  byDweller: Map<string, number>;
  /** "gx,gy" -> plot id */
  byCoord: Map<string, number>;
}

export interface VillageSnapshot<T = unknown> {
  settlements: Settlement[];
  dwellers: Map<string, Dweller<T>>;
}
