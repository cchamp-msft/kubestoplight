import { hash32 } from './layout';
import type { Role, Terrain } from './types';

// ---------------------------------------------------------------------------
// Generated art, loaded once at runtime. Everything here is optional: if a file
// is missing the renderer falls back to the village pack's sprite for that role,
// and if the whole atlas is missing render.ts falls back to the procedural
// shapes it drew before there was any art at all.
// ---------------------------------------------------------------------------

/**
 * An architecture pack — one people's way of building.
 *
 * Silhouette alone was too loose. A district drawn from four unrelated cottages
 * and the odd windmill reads as noise, because nothing about the variation means
 * anything: it is just the seed the pod was born with. A namespace holding a
 * whole pack instead makes the variation load-bearing. Everything `longhorn`
 * owns is poured concrete; everything `kube-system` owns is a castle. You learn
 * to find a district by its architecture long before you can read its label.
 *
 * Within a pack, which building you get *is* what the pod does — see roleOf().
 */
export interface Pack {
  /** Relative odds a namespace lands on this one. */
  weight: number;
  /**
   * Sprite stems per role. Missing files simply drop out of the pool, and a
   * role a pack has no art for at all borrows the village pack's — a gatehouse
   * is a gatehouse in any town, so only the village pack carries `gate` and
   * `mill` art and the rest inherit it.
   */
  art: Partial<Record<Role, string[]>>;
  /**
   * Landmarks any building in the pack may roll instead of its usual silhouette.
   * Only the village pack has folklore in it; the other packs are eccentric
   * enough already, and a windmill in a brutalist district is not a surprise, it
   * is a mistake.
   */
  rare?: Array<readonly [string, number]>;
}

export const ROLES = ['cottage', 'tower', 'hall', 'vault', 'store', 'spent'] as const;

/**
 * Stems for a generated pack sheet: `castle-cottage-a`, `castle-tower-b`, and
 * so on. The counts are the number of pieces that actually came off each sheet
 * and have to be kept honest by hand — a pack asked for twelve buildings in a
 * 3x4 grid and came back with fourteen in five rows as often as not, so what is
 * on disk is whatever the naming pass found, not what the prompt requested.
 */
function sheet(p: string, n: Record<(typeof ROLES)[number], number>): Partial<Record<Role, string[]>> {
  const out: Partial<Record<Role, string[]>> = {};
  for (const role of ROLES) {
    out[role] = Array.from({ length: n[role] }, (_, i) => `${p}-${role}-${'abcd'[i]}`);
  }
  return out;
}

export type PackName = 'village' | 'castle' | 'urban' | 'brutalist' | 'golden' | 'sky' | 'galaxy';

export const PACKS: Record<PackName, Pack> = {
  // The house style, and deliberately the most likely roll: the odd namespace
  // going brutalist is a surprise, every namespace going somewhere different is
  // a costume box.
  village: {
    weight: 34,
    art: {
      cottage: ['cottage', 'cottage-b', 'cottage-c', 'cottage-d'],
      tower: ['tower', 'tower-b', 'tower-c', 'tower-d'],
      vault: ['vault', 'vault-b', 'vault-c', 'vault-d'],
      hall: ['hall', 'hall-b', 'hall-c', 'hall-d'],
      store: ['granary', 'silo', 'cistern'],
      // The gatehouse: ingresses and proxies, where traffic enters the town.
      gate: ['gatehouse'],
      // The windmill used to be folklore. It means something now — scheduled
      // work — so it left the rare table and became the CronJob's building.
      mill: ['windmill'],
      spent: ['hayrick', 'woodpile', 'stonepile', 'sheaves'],
    },
    rare: [
      ['tavern', 11],
      ['belltower', 10],
      ['forge', 9],
      ['well', 8],
      ['wizard', 7],
      ['menhirs', 7],
      ['dovecote', 6],
      ['shrine', 6],
      ['skeps', 5],
      ['observatory', 5],
      ['lighthouse', 5],
      ['hollowtree', 3],
      ['toadstool', 2],
    ],
  },
  castle: {
    weight: 14,
    art: sheet('castle', { cottage: 3, tower: 2, hall: 2, vault: 2, store: 2, spent: 2 }),
  },
  urban: {
    weight: 13,
    art: sheet('urban', { cottage: 3, tower: 2, hall: 1, vault: 2, store: 2, spent: 2 }),
  },
  brutalist: {
    weight: 12,
    art: sheet('brutalist', { cottage: 3, tower: 3, hall: 1, vault: 2, store: 2, spent: 3 }),
  },
  golden: {
    weight: 10,
    art: sheet('golden', { cottage: 3, tower: 2, hall: 1, vault: 2, store: 2, spent: 2 }),
  },
  sky: {
    weight: 9,
    art: sheet('sky', { cottage: 3, tower: 3, hall: 1, vault: 2, store: 2, spent: 2 }),
  },
  galaxy: {
    weight: 8,
    art: sheet('galaxy', { cottage: 3, tower: 3, hall: 1, vault: 2, store: 2, spent: 2 }),
  },
};

/** Insertion order, which is the order the weighted roll walks. */
export const PACK_NAMES = Object.keys(PACKS) as PackName[];
const PACK_TOTAL = PACK_NAMES.reduce((n, k) => n + PACKS[k].weight, 0);

/** How often a building is a landmark rather than one of its role's usual few. */
const RARE_CHANCE = 0.085;

/** Last resort when a pack has no art at all for a role. */
const ROLE_FALLBACK: Record<Role, string> = {
  cottage: 'cottage',
  tower: 'tower',
  vault: 'vault',
  hall: 'hall',
  store: 'vault', // a storehouse is at least a windowless block
  gate: 'tower', // a gate with no art is at least a watchtower
  mill: 'cottage', // a mill with no art is at least a workshop
  spent: 'ruin', // nothing to draw but what the work left behind
};

const STATE_SPRITES = ['ruin', 'scaffold'] as const;

// ---------------------------------------------------------------------------
// Which pack a namespace holds
//
// Assigned once and then held for the session, exactly like a plot claim: a
// district must not re-style itself under you because some unrelated namespace
// was deleted. Assignment is done in sorted order from the adapter, so the same
// set of namespaces always produces the same map.
// ---------------------------------------------------------------------------

const held = new Map<string, PackName>();
const taken = new Set<PackName>();

function rollPack(namespace: string, attempt: number): PackName {
  let r = hash32(`pack:${attempt}:${namespace}`) % PACK_TOTAL;
  for (const name of PACK_NAMES) {
    r -= PACKS[name].weight;
    if (r < 0) return name;
  }
  return PACK_NAMES[0];
}

/**
 * Claim a pack for a namespace.
 *
 * Two namespaces are allowed to share a pack, but only after the roll has tried
 * twice to find one nobody is using — otherwise the weights alone would put half
 * the map in the village pack and leave three of the seven never seen.
 */
export function packOf(namespace: string): PackName {
  const hit = held.get(namespace);
  if (hit) return hit;
  let pick = rollPack(namespace, 0);
  for (let n = 1; n <= 2 && taken.has(pick) && taken.size < PACK_NAMES.length; n++) {
    pick = rollPack(namespace, n);
  }
  held.set(namespace, pick);
  taken.add(pick);
  return pick;
}

/**
 * Claim packs for a whole population at once, in sorted order.
 *
 * Order matters — the re-roll looks at what is already taken — so leaving it to
 * whatever order the renderer happens to walk the plots in would make the map
 * depend on paint order. Sorting makes it depend on the namespace names instead.
 */
export function assignPacks(namespaces: Iterable<string>): void {
  for (const ns of [...new Set(namespaces)].sort()) packOf(ns);
}

/** Test seam: forget every claim, so a case can start from an empty map. */
export function resetPacks(): void {
  held.clear();
  taken.clear();
}

const BUILDING_SPRITES: string[] = [
  ...new Set([
    ...PACK_NAMES.flatMap((p) => Object.values(PACKS[p].art).flat()),
    ...PACK_NAMES.flatMap((p) => (PACKS[p].rare ?? []).map(([n]) => n)),
    ...STATE_SPRITES,
  ]),
];

const GROUND_FILES: Record<Terrain, string> = {
  firm: 'ground-firm',
  dirt: 'ground-dirt',
  plain: 'ground-plain',
};

/**
 * The bottom layer of the map: big seamless plan-view textures that carry the
 * mass of the countryside. Nothing is scattered on top of them: the forest
 * is its texture.
 *
 * Pre-scaled to a world size at load, so patterns can be filled straight into
 * world space without juggling the transform.
 */
export type TerrainTile = 'forest' | 'meadow' | 'water';
const TERRAIN_FILES: Record<TerrainTile, string> = {
  forest: 'terrain-forest',
  meadow: 'terrain-meadow',
  water: 'terrain-water',
};
export const TERRAIN_SIZE: Record<TerrainTile, number> = {
  forest: 300,
  meadow: 260,
  water: 108,
};

/** Ground textures are pre-scaled to this so the pattern repeats a few times per settlement. */
const GROUND_TILE = 46;

export interface Sprite {
  img: CanvasImageSource;
  /** height / width, so the renderer can size by width and keep proportion. */
  aspect: number;
}

export interface Atlas {
  building: Record<string, Sprite>;
  /** Pre-scaled, ready to hand straight to createPattern. */
  ground: Record<Terrain, CanvasImageSource>;
  /** Pre-scaled to TERRAIN_SIZE, likewise. Absent if the tiles did not load. */
  terrain: Record<TerrainTile, CanvasImageSource> | null;
}

/**
 * Which silhouette a pod gets, fixed for its whole life.
 *
 * The pack comes from the namespace, so a district is architecturally of a
 * piece; the role decides which building in that pack; the pod's own key picks
 * between the few the pack offers for that role, so a row of replicas is not a
 * row of clones. Seeded, so a building never changes shape under you — and a
 * replacement pod from the same ReplicaSet gets a different one, which is a
 * rebuilt house rather than the same house.
 */
export function variantOf(
  key: string,
  role: Role,
  namespace: string,
  atlas: Atlas | null,
): string {
  const pack = PACKS[packOf(namespace)];
  const h = hash32(key);
  const has = (n: string) => atlas === null || n in atlas.building;

  const rare = pack.rare;
  if (rare && ((h >>> 8) & 0xffff) / 0x10000 < RARE_CHANCE) {
    const total = rare.reduce((n, [, w]) => n + w, 0);
    let roll = (h % 0xffff) % total;
    for (const [name, weight] of rare) {
      roll -= weight;
      if (roll < 0 && has(name)) return name;
      if (roll < 0) break;
    }
  }

  const pool = (pack.art[role] ?? []).filter(has);
  if (pool.length > 0) return pool[h % pool.length];
  // A pack with no art for the role — never generated, or failed to load —
  // borrows the village's rather than vanishing.
  const stand = (PACKS.village.art[role] ?? []).filter(has);
  if (stand.length > 0) return stand[h % stand.length];
  return ROLE_FALLBACK[role];
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Offscreen canvas factory, so the headless render harness can shim it. */
export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function rescale(img: CanvasImageSource, size: number): CanvasImageSource {
  const c = makeCanvas(size, size);
  c.getContext('2d')!.drawImage(img, 0, 0, size, size);
  return c;
}

const TERRAIN_TILES = Object.keys(TERRAIN_FILES) as TerrainTile[];

let cached: Promise<Atlas | null> | null = null;

/**
 * Resolve to the atlas, or to null if the ground textures are unavailable.
 * Never rejects, and an individual missing building is skipped rather than fatal
 * — variantOf() only ever picks from what actually loaded.
 */
export function loadAtlas(base = 'village-art/'): Promise<Atlas | null> {
  if (cached) return cached;
  cached = (async () => {
    const collect = async (names: readonly string[]) => {
      const imgs = await Promise.all(names.map((n) => loadImage(`${base}${n}.png`)));
      const out: Record<string, Sprite> = {};
      names.forEach((n, i) => {
        const img = imgs[i];
        if (img) out[n] = { img, aspect: img.height / img.width };
      });
      return out;
    };

    const terrains = Object.keys(GROUND_FILES) as Terrain[];
    const [building, grounds, tiles] = await Promise.all([
      collect(BUILDING_SPRITES),
      Promise.all(terrains.map((t) => loadImage(`${base}${GROUND_FILES[t]}.png`))),
      Promise.all(TERRAIN_TILES.map((t) => loadImage(`${base}${TERRAIN_FILES[t]}.png`))),
    ]);

    // Without ground there is no map, so that one is all-or-nothing.
    if (grounds.some((g) => g === null) || Object.keys(building).length === 0) return null;

    const ground = {} as Record<Terrain, CanvasImageSource>;
    terrains.forEach((t, i) => (ground[t] = rescale(grounds[i]!, GROUND_TILE)));

    let terrain: Record<TerrainTile, CanvasImageSource> | null = null;
    if (tiles.every((t) => t !== null)) {
      terrain = {} as Record<TerrainTile, CanvasImageSource>;
      TERRAIN_TILES.forEach((t, i) => (terrain![t] = rescale(tiles[i]!, TERRAIN_SIZE[t])));
    }
    return { building, ground, terrain };
  })();
  return cached;
}

/** Test seam: lets the headless harness install an atlas it built itself. */
export function primeAtlas(atlas: Atlas | null) {
  cached = Promise.resolve(atlas);
}
