import type { Dweller, DwellerState, Plot, Settlement } from './types';
import { RUBBLE_MS, hash32, settlementBounds } from './layout';
import { liveryHue } from './adapter';
import {
  makeCanvas,
  variantOf,
  TERRAIN_SIZE,
  type Atlas,
  type Sprite,
} from './sprites';

export const TILE = 64;
export const SETTLEMENT_PAD = 0.75; // in tiles
/**
 * Open country between villages, in tiles. Two figures: settlements of one
 * cluster really are wired together — the trunk road says so — and belong
 * within hailing distance; a foreign cluster is a different landmass and gets
 * more water between, but not so much that fitting everyone in frame means
 * zooming out past the point of reading anything.
 */
export const SETTLEMENT_GAP = 1.1;
export const CLUSTER_GAP = 2.6;
/** How far a building may sit off its plot centre. Enough to break the lattice. */
const PLOT_JITTER = 10;

const TAU = Math.PI * 2;

// Carbon g100 palette, so the map sits inside the existing dashboard rather
// than next to it.
const C = {
  ground: { firm: '#1e2620', dirt: '#2a2318', plain: '#212121' },
  wild: '#181c13',
  text: '#c6c6c6',
  textDim: '#6f6f6f',
  settled: '#42be65',
  working: '#4589ff',
  raising: '#f1c21b',
  collapsing: '#fa4d56',
  fading: '#6f6f6f',
  derelict: '#525252',
  rubble: '#4c4c4c',
} as const;

export const STATE_COLOR: Record<DwellerState, string> = {
  settled: C.settled,
  raising: C.raising,
  collapsing: C.collapsing,
  fading: C.fading,
  derelict: C.derelict,
};

export const STATE_LABEL: Record<DwellerState, string> = {
  settled: 'settled',
  raising: 'under construction',
  collapsing: 'collapsing',
  fading: 'fading out',
  derelict: 'derelict',
};

export const WORKING_COLOR = C.working;

/**
 * Where a settlement sits in the world, and at what angle.
 *
 * Plots live on a square lattice because that is what makes pinning cheap and
 * exact — but a square lattice drawn square reads as a street plan. Each
 * settlement is therefore rotated a few degrees of its own, which costs nothing
 * and means no two villages share a horizon line. The *sprites* stay upright:
 * they are lit from a fixed direction, so rotating them would look wrong.
 */
export interface Placement {
  ox: number; // world px of the unrotated grid origin
  oy: number;
  px: number; // pivot the grid is rotated about
  py: number;
  rot: number; // radians
  x: number; // axis-aligned bounds of the placed settlement
  y: number;
  w: number;
  h: number;
}

/**
 * Deterministic tilt for a settlement: 6 to 16 degrees, either way.
 *
 * Bounded away from zero on purpose — a settlement that lands near square is
 * exactly the one that reads as a grid, so there is no point leaving it to luck.
 */
export function settlementAngle(name: string): number {
  const h = hash32(`tilt:${name}`);
  const mag = 0.105 + ((h >>> 4) % 1000) / 1000 * 0.175;
  return (h & 1) === 0 ? mag : -mag;
}

/** World position of a point given in plot units — whole numbers are plot centres. */
export function gridWorld(pl: Placement, gx: number, gy: number): { x: number; y: number } {
  const lx = pl.ox + gx * TILE + TILE / 2;
  const ly = pl.oy + gy * TILE + TILE / 2;
  const dx = lx - pl.px;
  const dy = ly - pl.py;
  const c = Math.cos(pl.rot);
  const s = Math.sin(pl.rot);
  return { x: pl.px + dx * c - dy * s, y: pl.py + dx * s + dy * c };
}

/**
 * Where a building actually stands: its plot centre, stepped back from any
 * street on its boundary, then nudged by a fixed amount.
 *
 * Buildings sit on a lattice because that is what makes a plot claim cheap and
 * permanent, but a visible lattice is the single thing that makes this read as a
 * street plan rather than a village. The nudge is derived from the plot id, so it
 * never changes and hit testing can still work off the plain grid cell. The
 * setback comes from layout.ts and is what gives a road its verge — the land
 * mask is drawn from these positions too, so the ground opens up along with the
 * buildings rather than the road being cut into a solid block.
 */
export function plotWorld(
  pl: Placement,
  p: { id: number; gx: number; gy: number; sx?: number; sy?: number },
) {
  const h = hash32(`plot:${p.id}`);
  const jx = (((h & 0xff) / 255) * 2 - 1) * PLOT_JITTER;
  const jy = ((((h >>> 8) & 0xff) / 255) * 2 - 1) * PLOT_JITTER;
  const w = gridWorld(pl, p.gx + (p.sx ?? 0), p.gy + (p.sy ?? 0));
  return { x: w.x + jx, y: w.y + jy };
}

/** Inverse of gridWorld, in the unrotated local frame. */
function worldLocal(pl: Placement, wx: number, wy: number): { x: number; y: number } {
  const dx = wx - pl.px;
  const dy = wy - pl.py;
  const c = Math.cos(-pl.rot);
  const s = Math.sin(-pl.rot);
  return { x: pl.px + dx * c - dy * s, y: pl.py + dx * s + dy * c };
}

/**
 * Pack settlements largest-first into rows shaped like the viewport, so a tall
 * window does not get one long strip of villages shrunk to fit its width.
 *
 * `aspect` is the width/height of the space this will be drawn into.
 */
export function placeSettlements(settlements: Settlement[], aspect = 2.2): Map<string, Placement> {
  const boxes = settlements.map((s) => {
    const b = settlementBounds(s);
    const rot = settlementAngle(s.name);
    const bw = (b.maxX - b.minX + 1 + SETTLEMENT_PAD * 2) * TILE;
    const bh = (b.maxY - b.minY + 1 + SETTLEMENT_PAD * 2) * TILE;
    const c = Math.abs(Math.cos(rot));
    const sn = Math.abs(Math.sin(rot));
    const cluster = s.name.slice(0, Math.max(0, s.name.indexOf('/')));
    // A tilted box needs a bigger slot than its own footprint.
    return { s, b, rot, bw, bh, cluster, w: bw * c + bh * sn, h: bw * sn + bh * c };
  });
  if (boxes.length === 0) return new Map();

  const gap = SETTLEMENT_GAP * TILE;
  /** Ground between two boxes side by side: near for kin, a strait for strangers. */
  const gapAfter = (i: number) =>
    i + 1 < boxes.length && boxes[i + 1].cluster !== boxes[i].cluster ? CLUSTER_GAP * TILE : gap;

  const pack = (targetW: number) => {
    const out = new Map<string, Placement>();
    let x = 0;
    let y = 0;
    let rowH = 0;
    let maxX = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      // Epsilon, not a plain >. The candidate widths are summed in a different
      // order from x, so the widest candidate came out a rounding step under the
      // row it was derived from and wrapped anyway — the packer could never
      // actually use its own widest row.
      if (x > 0 && x + box.w > targetW + 0.5) {
        x = 0;
        y += rowH + gap;
        rowH = 0;
      }
      const px = x + box.w / 2;
      const py = y + box.h / 2;
      out.set(box.s.name, {
        // Chosen so the unrotated content box is centred on the pivot, which is
        // in turn the centre of the axis-aligned slot.
        ox: px - box.bw / 2 - (box.b.minX - SETTLEMENT_PAD) * TILE,
        oy: py - box.bh / 2 - (box.b.minY - SETTLEMENT_PAD) * TILE,
        px,
        py,
        rot: box.rot,
        x,
        y,
        w: box.w,
        h: box.h,
      });
      x += box.w + gapAfter(i);
      maxX = Math.max(maxX, x - gapAfter(i));
      rowH = Math.max(rowH, box.h);
    }
    return { out, w: maxX, h: y + rowH };
  };

  // Try every row width a wrap could actually produce and keep whichever result
  // is closest in shape to the space it has to sit in. Estimating a target from
  // total area alone wraps three settlements into a column when two of them
  // would happily sit side by side.
  const candidates = new Set<number>();
  let run = 0;
  for (let i = 0; i < boxes.length; i++) {
    run += boxes[i].w + gapAfter(i);
    candidates.add(run - gapAfter(i));
  }

  let best = pack(Math.max(...candidates));
  let bestScore = Infinity;
  for (const targetW of candidates) {
    const attempt = pack(targetW);
    if (attempt.h <= 0 || attempt.w <= 0) continue;
    const score = Math.abs(Math.log(attempt.w / attempt.h / Math.max(0.2, aspect)));
    if (score < bestScore) {
      bestScore = score;
      best = attempt;
    }
  }
  return best.out;
}

export function worldBounds(placements: Map<string, Placement>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placements.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// Particles — the only part of the scene that is not a pure function of state.
// Kept in a store the caller owns so it survives re-renders.
// ---------------------------------------------------------------------------

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: 'fire' | 'smoke' | 'spark' | 'dust';
}

export type ParticleStore = Particle[];

const MAX_PARTICLES = 900;

function spawn(store: ParticleStore, p: Particle) {
  if (store.length >= MAX_PARTICLES) return;
  store.push(p);
}

export function stepParticles(store: ParticleStore, dt: number) {
  for (let i = store.length - 1; i >= 0; i--) {
    const p = store[i];
    p.life -= dt;
    if (p.life <= 0) {
      store[i] = store[store.length - 1];
      store.pop();
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'smoke') {
      p.vx *= 0.999;
      p.size += 0.008 * dt;
    }
    if (p.kind === 'fire') p.size *= 1 - 0.0008 * dt;
    if (p.kind === 'spark') p.vy += 0.00012 * dt; // gravity, so sparks arc
  }
}

function emit(store: ParticleStore, d: Dweller, cx: number, cy: number, dt: number, load: number) {
  const rate = (n: number) => Math.random() < (n * dt) / 1000;

  if (d.state === 'collapsing') {
    if (rate(26)) {
      spawn(store, {
        x: cx + (Math.random() - 0.5) * 18,
        y: cy + 4,
        vx: (Math.random() - 0.5) * 0.012,
        vy: -0.035 - Math.random() * 0.03,
        life: 620,
        max: 620,
        size: 2.4 + Math.random() * 2.2,
        kind: 'fire',
      });
    }
    if (rate(7)) {
      spawn(store, {
        x: cx + (Math.random() - 0.5) * 14,
        y: cy,
        vx: (Math.random() - 0.5) * 0.02,
        vy: -0.05,
        life: 1500,
        max: 1500,
        size: 3.5,
        kind: 'smoke',
      });
    }
    return;
  }

  // Chimney smoke is real CPU. A building that never smokes is genuinely idle;
  // an unmeasured cluster produces no smoke anywhere, which is honest. The
  // slight wind bias means every plume leans the same way, which is what makes
  // them read as weather rather than as debris.
  if (d.state === 'settled' && load > 0.15 && rate(2 + load * 14)) {
    spawn(store, {
      x: cx + (Math.random() - 0.5) * 6,
      y: cy - 9,
      vx: 0.004 + (Math.random() - 0.5) * 0.008,
      vy: -0.02 - load * 0.025,
      life: 1200 + load * 600,
      max: 1200 + load * 600,
      size: 1.8 + load * 1.4,
      kind: 'smoke',
    });
  }

  // Working flat out — and only flat out. This used to fire from half load at
  // twice the rate, and a merely busy building read as a small explosion; busy
  // is carried by smoke, lit windows and foot traffic now, and the sparks are
  // kept for the handful of buildings genuinely at the forge.
  if (d.state === 'settled' && load > 0.8 && rate(load * 5)) {
    spawn(store, {
      x: cx + (Math.random() - 0.5) * 8,
      y: cy - 8,
      vx: (Math.random() - 0.5) * 0.03,
      vy: -0.05 - Math.random() * 0.02,
      life: 700,
      max: 700,
      size: 1.1,
      kind: 'spark',
    });
  }

  if (d.state === 'raising' && rate(9)) {
    spawn(store, {
      x: cx + (Math.random() - 0.5) * 22,
      y: cy + 8,
      vx: (Math.random() - 0.5) * 0.01,
      vy: -0.008,
      life: 800,
      max: 800,
      size: 1.6,
      kind: 'dust',
    });
  }
}

/** A pod that vanished throws debris once, so you catch the implosion mid-glance. */
export function emitImplosion(store: ParticleStore, cx: number, cy: number) {
  for (let i = 0; i < 14; i++) {
    const a = (TAU * i) / 14 + Math.random() * 0.4;
    spawn(store, {
      x: cx,
      y: cy,
      vx: Math.cos(a) * (0.05 + Math.random() * 0.05),
      vy: Math.sin(a) * (0.05 + Math.random() * 0.05) - 0.03,
      life: 700,
      max: 700,
      size: 2 + Math.random() * 1.5,
      kind: 'spark',
    });
  }
}

// ---------------------------------------------------------------------------
// Open country
//
// The space between villages used to be the page background, which read as a
// void the map floated in. It is scenery now: mottled ground, canopy, and
// watercourses on a fixed lattice. All of it is a pure function of
// world position, so it never crawls when the camera moves — and all of it is
// culled wherever a settlement's land reaches, which is what makes a growing
// village look like it is clearing ground rather than being pasted on top.
// ---------------------------------------------------------------------------

interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const patternCache = new WeakMap<CanvasImageSource, CanvasPattern>();

function tilePattern(ctx: CanvasRenderingContext2D, img: CanvasImageSource): CanvasPattern | null {
  const hit = patternCache.get(img);
  if (hit) return hit;
  const p = ctx.createPattern(img, 'repeat');
  if (p) patternCache.set(img, p);
  return p;
}

/** Fill the whole visible world with a tile, snapped so the texture is world-locked. */
function fillView(ctx: CanvasRenderingContext2D, view: View, tile: number) {
  const x0 = Math.floor(view.x0 / tile) * tile - tile;
  const y0 = Math.floor(view.y0 / tile) * tile - tile;
  ctx.fillRect(x0, y0, view.x1 - x0 + tile * 2, view.y1 - y0 + tile * 2);
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return (h ^ (h >>> 13)) >>> 0;
}

const RIVER_SPACING = 900;
const RIVER_STEP = 70;

/** Watercourses on a fixed world lattice, so panning uncovers more of the same river. */
function rivers(view: View): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  const k0 = Math.floor(view.y0 / RIVER_SPACING) - 1;
  const k1 = Math.ceil(view.y1 / RIVER_SPACING) + 1;
  for (let k = k0; k <= k1; k++) {
    const seed = hash2(k, 7717);
    if ((seed & 7) < 3) continue; // not every lane carries water
    const base = k * RIVER_SPACING + (((seed >>> 4) & 0xff) / 255) * RIVER_SPACING * 0.6;
    // Each course also runs downhill at its own angle. Without that they come
    // out as a set of parallel horizontal bands, which reads as infrastructure.
    const slope = ((((seed >>> 12) & 0xff) / 255) - 0.5) * 0.6;
    const pts: Array<[number, number]> = [];
    const x0 = Math.floor(view.x0 / RIVER_STEP) * RIVER_STEP - RIVER_STEP * 2;
    for (let x = x0; x <= view.x1 + RIVER_STEP * 2; x += RIVER_STEP) {
      pts.push([
        x,
        base +
          x * slope +
          Math.sin(x * 0.0011 + k * 2.3) * 200 +
          Math.sin(x * 0.0037 + k) * 58 +
          Math.sin(x * 0.011 + k * 5) * 13,
      ]);
    }
    out.push(pts);
  }
  return out;
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

/**
 * Watercourses, in four passes: cut bank, shadowed shallows, the channel itself
 * stroked with the water tile, and a glint down the middle. Stroking with a
 * pattern is what gives the water ripples and current lines instead of a flat
 * blue ribbon, which at any width reads as a pipe.
 */
function drawRivers(
  ctx: CanvasRenderingContext2D,
  courses: Array<Array<[number, number]>>,
  atlas: Atlas | null,
) {
  if (courses.length === 0) return;
  const water = atlas?.terrain ? tilePattern(ctx, atlas.terrain.water) : null;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes: Array<[number, string | CanvasPattern]> = [
    [30, 'rgba(20,26,15,0.9)'],
    [22, 'rgba(30,36,22,0.85)'],
    [16, water ?? '#1e3540'],
    [3, 'rgba(140,180,196,0.16)'],
  ];
  for (const [width, style] of passes) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    // One stroke per course: strokePolyline opens a fresh path, so batching
    // them behind a single stroke() silently draws only the last one.
    for (const pts of courses) {
      strokePolyline(ctx, pts);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Smooth value noise on a coarse lattice, for anything that should come in patches. */
function fieldNoise(x: number, y: number, cell: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const v = (a: number, b: number) => (hash2(a, b) & 0xffff) / 0xffff;
  return (
    (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) +
    (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy
  );
}

/** Whether world (x, y) falls on a settlement's land, with a clearance margin. */
function onLand(
  x: number,
  y: number,
  settlements: Settlement[],
  placements: Map<string, Placement>,
  margin: number,
): boolean {
  for (const s of settlements) {
    const pl = placements.get(s.name);
    if (!pl) continue;
    if (x < pl.x - margin || x > pl.x + pl.w + margin) continue;
    if (y < pl.y - margin || y > pl.y + pl.h + margin) continue;

    const l = worldLocal(pl, x, y);
    const gx = Math.round((l.x - pl.ox - TILE / 2) / TILE);
    const gy = Math.round((l.y - pl.oy - TILE / 2) / TILE);
    for (let ax = gx - 1; ax <= gx + 1; ax++) {
      for (let ay = gy - 1; ay <= gy + 1; ay++) {
        const id = s.byCoord.get(`${ax},${ay}`);
        if (id === undefined) continue;
        const p = s.plots[id];
        if (p.occupant === null && p.vacatedAt === null) continue;
        const dx = l.x - (pl.ox + ax * TILE + TILE / 2);
        const dy = l.y - (pl.oy + ay * TILE + TILE / 2);
        const r = TILE * 0.98 + margin;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
  }
  return false;
}

const CANOPY_CELL = 150;

/**
 * Where the woods are, as a union of discs over the density field.
 *
 * The canopy is a texture, not ten thousand tree sprites — this path is what
 * decides where that texture shows. Villages get a clearing, because a wall of
 * forest running flush into a settlement wall looks like a mistake rather than
 * a frontier.
 */
function canopyPath(
  ctx: CanvasRenderingContext2D,
  view: View,
  grow: number,
  settlements: Settlement[],
  placements: Map<string, Placement>,
) {
  ctx.beginPath();
  const gx0 = Math.floor(view.x0 / CANOPY_CELL) - 2;
  const gx1 = Math.ceil(view.x1 / CANOPY_CELL) + 2;
  const gy0 = Math.floor(view.y0 / CANOPY_CELL) - 2;
  const gy1 = Math.ceil(view.y1 / CANOPY_CELL) + 2;
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const n = fieldNoise(gx, gy, 3.2);
      if (n < 0.485) continue;
      const h = hash2(gx * 7 + 3, gy * 11 + 5);
      const cx = gx * CANOPY_CELL + ((h & 0xff) / 255) * CANOPY_CELL;
      const cy = gy * CANOPY_CELL + (((h >>> 8) & 0xff) / 255) * CANOPY_CELL;
      if (onLand(cx, cy, settlements, placements, 110)) continue;
      const r = CANOPY_CELL * (0.5 + (n - 0.485) * 1.5) + grow;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, TAU);
    }
  }
}

/**
 * The bottom of the stack: general terrain, then watercourses. No loose
 * scenery: the woods are the canopy texture alone. Everything above this — trunk roads, village ground, village
 * streets, buildings — is drawn over it in that order.
 */
function drawCountry(
  ctx: CanvasRenderingContext2D,
  view: View,
  settlements: Settlement[],
  placements: Map<string, Placement>,
  courses: Array<Array<[number, number]>>,
  atlas: Atlas | null,
) {
  const tiles = atlas?.terrain ?? null;

  if (tiles) {
    const meadow = tilePattern(ctx, tiles.meadow);
    if (meadow) {
      ctx.fillStyle = meadow;
      fillView(ctx, view, TERRAIN_SIZE.meadow);
    }
    const forest = tilePattern(ctx, tiles.forest);
    if (forest) {
      // Two clipped passes: a thinner outer fringe and a solid interior, so the
      // wood has an edge that scatters out rather than a shoreline.
      for (const [grow, alpha] of [
        [34, 0.5],
        [0, 1],
      ] as const) {
        ctx.save();
        canopyPath(ctx, view, grow, settlements, placements);
        ctx.clip();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = forest;
        fillView(ctx, view, TERRAIN_SIZE.forest);
        ctx.restore();
      }
    }
  }

  // Mottling, over whatever the terrain turned out to be: it breaks up the tile
  // repeat as much as it varies the ground.
  const M = 210;
  ctx.save();
  for (let gy = Math.floor(view.y0 / M) - 1; gy <= Math.ceil(view.y1 / M); gy++) {
    for (let gx = Math.floor(view.x0 / M) - 1; gx <= Math.ceil(view.x1 / M); gx++) {
      const h = hash2(gx * 31 + 5, gy * 17 + 11);
      const cx = gx * M + ((h & 0xff) / 255) * M;
      const cy = gy * M + (((h >>> 8) & 0xff) / 255) * M;
      const r = M * (0.5 + ((h >>> 16) & 0x3f) / 63);
      const pick = (h >>> 23) % 3;
      const tint = pick === 0 ? '32,40,24' : pick === 1 ? '44,38,24' : '24,32,32';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${tint},${tiles ? 0.3 : 0.55})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  ctx.restore();

  drawRivers(ctx, courses, atlas);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The settled land, as the union of a disc around every claimed plot.
 *
 * Overlapping subpaths filled with the nonzero rule merge into one shape, so a
 * settlement's outline is whatever its buildings actually cover. Radii are
 * jittered from the plot id, so the edge is irregular but identical every frame.
 */
function landPath(ctx: CanvasRenderingContext2D, s: Settlement, pl: Placement, grow: number) {
  ctx.beginPath();
  for (const p of s.plots) {
    if (p.occupant === null && p.vacatedAt === null) continue;
    const { x, y } = plotWorld(pl, p);
    const j = ((p.id * 2654435761) >>> 0) / 4294967295;
    const r = TILE * (0.74 + j * 0.2) + grow;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
}

/**
 * Streets, drawn between the buildings rather than through them.
 *
 * layout.ts puts these on the seams where two districts meet, so what you are
 * looking at is the boundary between namespaces. Each vertex is nudged off the
 * lattice by a fixed amount and the run is drawn as a smooth curve, because a
 * dead-straight road is the single thing that most makes a village read as a
 * street plan.
 */
/**
 * The fixed jitter a street vertex is drawn with. Shared by the road painter
 * and the walkers, because feet have to follow the road that was actually laid,
 * not the lattice it was derived from.
 */
function streetVertexWorld(pl: Placement, gx: number, gy: number): [number, number] {
  const h = hash2(Math.round(gx * 4), Math.round(gy * 4));
  const jx = ((h & 0xff) / 255 - 0.5) * TILE * 0.55;
  const jy = (((h >>> 8) & 0xff) / 255 - 0.5) * TILE * 0.55;
  const p = gridWorld(pl, gx, gy);
  return [p.x + jx, p.y + jy];
}

function drawStreets(ctx: CanvasRenderingContext2D, s: Settlement, pl: Placement) {
  if (s.roads.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const world = ([gx, gy]: [number, number]): [number, number] =>
    streetVertexWorld(pl, gx, gy);

  // A street stops where two districts stop bordering each other, which is an
  // administrative fact and not something a road does. Fading both ends over
  // about a tile turns the hard stop into a track petering out, and it is also
  // what stops a district ringed by seams from reading as a fenced plot: the
  // corners break, so the circuit becomes a set of lanes.
  for (const [inset, rgb, alpha] of [
    [0, '8,9,6', 0.46],
    [4, '124,110,86', 0.34],
  ] as const) {
    for (const st of s.roads) {
      if (st.length < 2) continue;
      const pts = st.map(world);
      const [ax, ay] = pts[0];
      const [bx, by] = pts[pts.length - 1];
      const span = Math.hypot(bx - ax, by - ay);
      if (span < 1) continue;
      const fade = Math.min(0.46, (TILE * 1.05) / span);
      const grad = ctx.createLinearGradient(ax, ay, bx, by);
      grad.addColorStop(0, `rgba(${rgb},0)`);
      grad.addColorStop(fade, `rgba(${rgb},${alpha})`);
      grad.addColorStop(1 - fade, `rgba(${rgb},${alpha})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      ctx.strokeStyle = grad;
      // Longer seams are busier thoroughfares; a one-tile gap is a back alley.
      ctx.lineWidth = Math.max(6, Math.min(18, 8 + st.length * 1.7) - inset);
      strokePolyline(ctx, pts);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Trunk roads between settlements of the same cluster. Nodes in a cluster really
 * are connected; nodes in different clusters really are not, so separate
 * clusters stay separate landmasses with open ground between them.
 *
 * Returned as sampled polylines so the scenery scatter can keep its trees off
 * the carriageway.
 */
function highways(
  settlements: Settlement[],
  placements: Map<string, Placement>,
): Array<Array<[number, number]>> {
  const byCluster = new Map<string, Placement[]>();
  for (const s of settlements) {
    const pl = placements.get(s.name);
    if (!pl) continue;
    const cluster = s.name.slice(0, Math.max(0, s.name.indexOf('/')));
    if (!byCluster.has(cluster)) byCluster.set(cluster, []);
    byCluster.get(cluster)!.push(pl);
  }

  const out: Array<Array<[number, number]>> = [];
  for (const group of byCluster.values()) {
    for (let i = 1; i < group.length; i++) {
      const a = group[i - 1];
      const b = group[i];
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 + (bx - ax) * 0.09;
      // Wander off the curve, tapering to nothing at each end so the road still
      // arrives where it is meant to. A dead-straight trunk road reads as a pipe.
      const px = -(by - ay);
      const py = bx - ax;
      const plen = Math.hypot(px, py) || 1;
      const seed = ((hash32(`${ax | 0}:${bx | 0}`) & 0xff) / 255) * TAU;
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24;
        const v = 1 - u;
        const off =
          (Math.sin(u * 8.7 + seed) * 9 + Math.sin(u * 3.1 + seed * 2) * 16) * Math.sin(Math.PI * u);
        pts.push([
          v * v * ax + 2 * v * u * mx + u * u * bx + (px / plen) * off,
          v * v * ay + 2 * v * u * my + u * u * by + (py / plen) * off,
        ]);
      }
      out.push(pts);
    }
  }
  return out;
}

/**
 * The roads between nodes of one cluster, drawn wider than a village street
 * because that is what they are: the link between two machines, not the gap
 * between two districts.
 *
 * Four passes stepping in from wide-and-faint to narrow-and-solid. Each stroke
 * composites over the last, so the accumulated alpha ramps from almost nothing
 * at the verge to solid down the middle — a soft edge that costs four strokes
 * over a handful of polylines, rather than a canvas filter on the whole scene.
 */
function drawHighways(ctx: CanvasRenderingContext2D, roads: Array<Array<[number, number]>>) {
  if (roads.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, rgb, alpha] of [
    [31, '8,9,6', 0.12],
    [25, '8,9,6', 0.22],
    [20, '8,9,6', 0.4],
    [11, '112,100,78', 0.3],
  ] as const) {
    ctx.lineWidth = width;
    for (const pts of roads) {
      const [ax, ay] = pts[0];
      const [bx, by] = pts[pts.length - 1];
      const grad = ctx.createLinearGradient(ax, ay, bx, by);
      grad.addColorStop(0, `rgba(${rgb},0)`);
      grad.addColorStop(0.12, `rgba(${rgb},${alpha})`);
      grad.addColorStop(0.88, `rgba(${rgb},${alpha})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      ctx.strokeStyle = grad;
      strokePolyline(ctx, pts);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Foot traffic
//
// The one thing a town has that a diagram does not is people in the street.
// Walkers and carts are stateless: each is a fixed speed and phase hashed from
// its index, evaluated against the clock, so they cost no bookkeeping, survive
// re-renders, and never desynchronise. A busy settlement puts more people out —
// activity you can see from across the map without a single building erupting.
// ---------------------------------------------------------------------------

function polyLengths(pts: Array<[number, number]>): { cum: number[]; len: number } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { cum, len: cum[cum.length - 1] };
}

function pointAlong(
  pts: Array<[number, number]>,
  cum: number[],
  dist: number,
): { x: number; y: number; dx: number; dy: number } {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < dist) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const u = Math.min(1, Math.max(0, (dist - cum[i - 1]) / seg));
  const [ax, ay] = pts[i - 1];
  const [bx, by] = pts[i];
  const dx = (bx - ax) / seg;
  const dy = (by - ay) / seg;
  return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, dx, dy };
}

/** A small figure with a lantern, mid-errand. */
function drawWalker(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number) {
  // Lantern first, additive, so the figure reads as a moving point of light
  // even when the body is a couple of pixels.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flicker = 0.8 + 0.2 * Math.sin(t / 130 + seed);
  const glow = ctx.createRadialGradient(x, y - 2, 0, x, y - 2, 5.5);
  glow.addColorStop(0, `rgba(255,196,110,${0.3 * flicker})`);
  glow.addColorStop(1, 'rgba(255,196,110,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 6, y - 8, 12, 12);
  ctx.restore();

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 0.6, 1.7, 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#241f18';
  ctx.beginPath();
  ctx.ellipse(x, y - 1.6, 1.2, 1.9, 0, 0, TAU);
  ctx.fill();
}

/** Below this zoom a walker is under a pixel, and the draw is pure cost. */
const FOLK_MIN_SCALE = 0.45;

/**
 * Villagers out on the streets. Count scales with how busy the settlement is,
 * so a working town visibly has more people on errands than a sleeping one.
 * Walkers ping-pong rather than loop: someone walking to the far end and back
 * is an errand, someone teleporting to the start is a rendering artefact.
 */
function drawFolk(
  ctx: CanvasRenderingContext2D,
  s: Settlement,
  pl: Placement,
  t: number,
  scale: number,
  busy: number,
  dim: boolean,
) {
  if (scale < FOLK_MIN_SCALE || s.roads.length === 0) return;
  ctx.save();
  if (dim) ctx.globalAlpha = 0.3;
  for (let i = 0; i < s.roads.length; i++) {
    const st = s.roads[i];
    if (st.length < 2) continue;
    const pts = st.map(([gx, gy]) => streetVertexWorld(pl, gx, gy));
    const { cum, len } = polyLengths(pts);
    if (len < TILE) continue;
    const n = Math.min(5, 1 + Math.floor(len / (TILE * 3)) + Math.round(busy * 2));
    for (let k = 0; k < n; k++) {
      const h = hash32(`${s.name}:walk:${i}:${k}`);
      const speed = 9 + (((h >>> 8) & 0xff) / 255) * 8; // world px/s — walking pace
      const phase = ((h >>> 16) & 0xffff) / 0xffff;
      let u = ((t / 1000) * speed) / len + phase;
      u -= Math.floor(u);
      const dist = (1 - Math.abs(2 * u - 1)) * len; // there and back again
      const p = pointAlong(pts, cum, dist);
      drawWalker(ctx, p.x, p.y, t, h & 0xff);
    }
  }
  ctx.restore();
}

/**
 * Carts on the trunk roads — the traffic between two machines of one cluster.
 * These loop rather than ping-pong: through traffic passes, it does not pace.
 * The wrap happens at the road's faded ends, so nobody is seen to appear.
 */
function drawWayfarers(
  ctx: CanvasRenderingContext2D,
  roads: Array<Array<[number, number]>>,
  t: number,
  scale: number,
) {
  if (scale < 0.3 || roads.length === 0) return;
  ctx.save();
  for (let i = 0; i < roads.length; i++) {
    const pts = roads[i];
    const { cum, len } = polyLengths(pts);
    if (len < TILE * 2) continue;
    for (let k = 0; k < 2; k++) {
      const h = hash32(`cart:${i}:${k}`);
      const speed = 20 + (((h >>> 8) & 0xff) / 255) * 10;
      const phase = ((h >>> 16) & 0xffff) / 0xffff;
      let u = ((t / 1000) * speed) / len + phase;
      u -= Math.floor(u);
      // One cart each way — trade runs in both directions.
      const dist = (k % 2 === 0 ? u : 1 - u) * len;
      const p = pointAlong(pts, cum, dist);
      const ang = Math.atan2(p.dy, p.dx) + (k % 2 === 0 ? 0 : Math.PI);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(p.x, p.y - 2, 0, p.x, p.y - 2, 7);
      glow.addColorStop(0, 'rgba(255,196,110,0.26)');
      glow.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 7, p.y - 9, 14, 14);
      ctx.restore();

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 1, 3.4, 1.1, 0, 0, TAU);
      ctx.fill();
      // Cart, then the draught animal a pace ahead.
      ctx.fillStyle = '#2b241a';
      ctx.fillRect(-3.2, -2.6, 4.6, 3);
      ctx.fillStyle = '#3a3226';
      ctx.beginPath();
      ctx.ellipse(3.6, -1, 1.6, 1.1, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The ground layer
//
// A settlement's ground, its puddles and its streets are all fixed between
// polls, so they are rendered once into an offscreen canvas and blitted after
// that. The reason it has to be offscreen is the edge: the land is masked with a
// stack of expanding fills that ramp the alpha up from nothing, which gives a
// shoreline that dissolves into the countryside instead of a card someone could
// pick up. You cannot fade an edge like that by painting darker rings on top,
// because there is scenery underneath that must show through.
// ---------------------------------------------------------------------------

/**
 * Settled ground is earth first and paving second.
 *
 * Filling the land with the stone texture at full strength turns every village
 * into a paved plaza — the texture tiles visibly, out-contrasts the buildings,
 * and the settlement reads as a slab someone dropped on the map. So: a solid
 * earth tone carries the terrain, and the texture goes over it faintly.
 */
const GROUND_BASE: Record<Settlement['terrain'], string> = {
  firm: '#1f2519',
  dirt: '#271d12',
  plain: '#1e211b',
};
const GROUND_TEXTURE_ALPHA = 0.55;

/** World px of blur on the village streets, so their edges dissolve into the town. */
const ROAD_BLUR = 2.6;

const FEATHER = 13; // rings
const FEATHER_STEP = 7; // world px per ring
const LAYER_MARGIN = FEATHER * FEATHER_STEP + 16;
/** Layer resolution relative to world px. Above 1 keeps it crisp when zoomed in. */
const SUPER = 1.5;

interface GroundLayer {
  sig: number;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

const groundCache = new Map<string, GroundLayer>();

function groundSig(s: Settlement, pl: Placement): number {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
  };
  mix(pl.ox);
  mix(pl.oy);
  mix(pl.px);
  mix(pl.py);
  mix(pl.rot * 1e4);
  for (let i = 0; i < s.terrain.length; i++) mix(s.terrain.charCodeAt(i));
  mix(s.roads.length);
  for (const p of s.plots) {
    if (p.occupant === null && p.vacatedAt === null) continue;
    mix(p.id);
    // Setbacks move the buildings and therefore the land under them, and they
    // change whenever a neighbouring district does — without these the layer
    // would keep a stale shoreline after a namespace moved in next door.
    mix(p.sx * 1000);
    mix(p.sy * 1000);
  }
  return h >>> 0;
}

function buildGround(s: Settlement, pl: Placement, atlas: Atlas): GroundLayer | null {
  const x = pl.x - LAYER_MARGIN;
  const y = pl.y - LAYER_MARGIN;
  const w = pl.w + LAYER_MARGIN * 2;
  const h = pl.h + LAYER_MARGIN * 2;
  const canvas = makeCanvas(w * SUPER, h * SUPER);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.setTransform(SUPER, 0, 0, SUPER, -x * SUPER, -y * SUPER);

  // Mask: expanding fills whose alpha accumulates toward the middle.
  const target = (i: number) => ((FEATHER - i) / FEATHER) ** 1.7;
  let acc = 0;
  g.fillStyle = '#fff';
  for (let i = FEATHER - 1; i >= 0; i--) {
    const want = i === 0 ? 1 : target(i);
    g.globalAlpha = acc >= 1 ? 1 : (want - acc) / (1 - acc);
    landPath(g, s, pl, i * FEATHER_STEP);
    g.fill();
    acc = want;
  }
  g.globalAlpha = 1;

  // Cover the layer with the pan taken back out of the transform. A full-canvas
  // fillRect given in world coordinates rasterizes to *nothing* once the
  // translate gets large — the third settlement across the map silently lost its
  // ground while the first two were fine. Scale stays, so the pattern still
  // tiles in world units.
  const cover = () => {
    g.setTransform(SUPER, 0, 0, SUPER, 0, 0);
    g.fillRect(0, 0, w, h);
    g.setTransform(SUPER, 0, 0, SUPER, -x * SUPER, -y * SUPER);
  };

  g.globalCompositeOperation = 'source-in';
  g.fillStyle = GROUND_BASE[s.terrain];
  cover();

  // Everything from here is clipped to what the mask already covers, so it
  // fades out at the shoreline along with the ground.
  g.globalCompositeOperation = 'source-atop';
  const pattern = g.createPattern(atlas.ground[s.terrain], 'repeat');
  if (pattern) {
    g.globalAlpha = GROUND_TEXTURE_ALPHA;
    g.fillStyle = pattern;
    cover();
    g.globalAlpha = 1;
  }

  // Streets go on through a blur, so the metalling bleeds into the ground either
  // side instead of stopping at a stroke edge. A road with a crisp outline reads
  // as a line drawn on top of the town; softening it makes it part of the same
  // surface. Drawn into a scratch canvas first because a filter has to apply to
  // the whole road network at once — blurring stroke by stroke would smear each
  // pass into the one under it and turn the surfacing to mud.
  const scratch = makeCanvas(canvas.width, canvas.height);
  const sg = scratch.getContext('2d');
  if (sg) {
    sg.setTransform(SUPER, 0, 0, SUPER, -x * SUPER, -y * SUPER);
    drawStreets(sg, s, pl);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // source-atop, so the blur cannot push the road out past the shoreline.
    g.globalCompositeOperation = 'source-atop';
    if ('filter' in g) g.filter = `blur(${ROAD_BLUR * SUPER}px)`;
    g.drawImage(scratch, 0, 0);
    if ('filter' in g) g.filter = 'none';
  } else {
    drawStreets(g, s, pl);
  }
  return { sig: 0, canvas, x, y, w, h };
}

function groundLayer(s: Settlement, pl: Placement, atlas: Atlas): GroundLayer | null {
  const sig = groundSig(s, pl);
  const hit = groundCache.get(s.name);
  if (hit && hit.sig === sig) return hit;
  const built = buildGround(s, pl, atlas);
  if (!built) return null;
  built.sig = sig;
  groundCache.set(s.name, built);
  return built;
}

/** Vector fallback for when there is no art at all. */
function drawGroundVector(ctx: CanvasRenderingContext2D, s: Settlement, pl: Placement) {
  landPath(ctx, s, pl, 4);
  ctx.fillStyle = 'rgba(10,11,13,0.85)';
  ctx.fill();
  landPath(ctx, s, pl, 0);
  ctx.fillStyle = C.ground[s.terrain];
  ctx.fill();
  drawStreets(ctx, s, pl);
}

function drawRubble(ctx: CanvasRenderingContext2D, cx: number, cy: number, age: number, hue: number | null) {
  const k = 1 - Math.min(1, age / RUBBLE_MS);
  ctx.globalAlpha = 0.15 + 0.5 * k;
  ctx.fillStyle = hue === null ? C.rubble : `hsl(${hue} 18% 34%)`;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const r = 7 + (i % 3) * 3;
    ctx.beginPath();
    ctx.rect(cx + Math.cos(a) * r - 2, cy + Math.sin(a) * r - 2, 4 + (i % 2), 3 + (i % 2));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Soot
//
// Restarts darken the building itself, which means the stain has to be masked to
// the sprite's silhouette. Painting an ellipse over the top instead — as this
// did at first — reads as a mysterious floating disc, not as scorching.
//
// Five buckets, pre-rendered once per (building, bucket) and cached. Cheap, and
// it keeps the per-frame path down to a single drawImage.
// ---------------------------------------------------------------------------

const SOOT_BUCKETS = 5;
const sootCache = new Map<string, CanvasImageSource>();

function sootBucket(restarts: number): number {
  if (restarts <= 0) return 0;
  // Restart counts here span 1 to 3684, so bucket on a log scale.
  return Math.min(SOOT_BUCKETS - 1, Math.max(1, Math.round(Math.log10(restarts + 1) * 1.5)));
}

function sootedSprite(sprite: Sprite, kind: string, bucket: number): CanvasImageSource {
  if (bucket <= 0) return sprite.img;
  const key = `${kind}:${bucket}`;
  const hit = sootCache.get(key);
  if (hit) return hit;

  const w = 192;
  const h = Math.round(w * sprite.aspect);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.drawImage(sprite.img, 0, 0, w, h);

  // source-atop keeps the stain inside whatever is already opaque — the
  // building — so it never bleeds onto the ground behind it.
  g.globalCompositeOperation = 'source-atop';
  const strength = (bucket / (SOOT_BUCKETS - 1)) * 0.62;
  const grad = g.createLinearGradient(0, 0, w * 0.55, h);
  grad.addColorStop(0, `rgba(4,4,6,${strength})`);
  grad.addColorStop(0.55, `rgba(6,6,8,${strength * 0.55})`);
  grad.addColorStop(1, `rgba(8,8,10,${strength * 0.12})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  sootCache.set(key, c);
  return c;
}

const SPRITE_W = 48;
/** A slender spire is still allowed to be tall, but not unboundedly so. */
const SPRITE_MAX_H = 132;
/** How far below the tile centre a building's footprint sits. */
const SPRITE_BASE = 21;

function spriteSize(sprite: Sprite) {
  const w = Math.min(SPRITE_W, SPRITE_MAX_H / sprite.aspect);
  return { w, h: w * sprite.aspect };
}

/**
 * The generated buildings are stone, and they stay stone — recolouring them
 * twenty-three ways to carry namespace would throw the art away. Livery goes on
 * the plinth underneath instead, health on the ring around it, load in the
 * windows, and restarts as soot. Four channels, none of them fighting.
 */
function drawSpriteBuilding(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  d: Dweller,
  cx: number,
  cy: number,
  t: number,
  selected: boolean,
  hovered: boolean,
  highlight: 'none' | 'match',
) {
  const hue = liveryHue(d.namespace);
  const status = STATE_COLOR[d.state];
  const load = d.load ?? 0;
  const kind = d.state === 'raising' ? 'scaffold' : variantOf(d.key, d.role, d.namespace, atlas);
  const sprite = atlas.building[kind] ?? atlas.building.cottage;
  if (!sprite) return;
  const { w, h } = spriteSize(sprite);
  const baseY = cy + SPRITE_BASE;
  const rx = 21;
  const ry = 9;

  ctx.save();
  if (d.state === 'fading') ctx.globalAlpha = 0.4;
  if (d.state === 'derelict') ctx.globalAlpha = 0.55;
  // Plinth: the namespace's ground. Districts read as coloured pools of land.
  // Deliberately muted — livery is identity, not alarm, and it must not out-shout
  // the health ring drawn on top of it.
  ctx.fillStyle =
    highlight === 'match' ? `hsl(${hue} 70% 48% / 0.72)` : `hsl(${hue} 40% 30% / 0.34)`;
  ctx.beginPath();
  ctx.ellipse(cx, baseY - ry * 0.5, rx, ry, 0, 0, TAU);
  ctx.fill();

  if (highlight === 'match') {
    // A lantern-lit halo on the chosen district, so it reads even where the
    // buildings are packed shoulder to shoulder.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(cx, baseY - ry, 0, cx, baseY - ry, rx * 1.9);
    halo.addColorStop(0, `hsl(${hue} 90% 62% / ${0.34 + 0.1 * Math.sin(t / 380)})`);
    halo.addColorStop(1, `hsl(${hue} 90% 62% / 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(cx - rx * 2, baseY - h - rx, rx * 4, h + rx * 2.4);
    ctx.restore();
  }

  // Ring: health, and how much of the pod is actually ready. A half-drawn ring
  // is a half-ready pod without needing a number.
  const readyFrac = d.total > 0 ? d.ready / d.total : 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - ry * 0.5, rx, ry, 0, 0, TAU);
  ctx.stroke();
  if (readyFrac > 0) {
    ctx.strokeStyle = status;
    ctx.beginPath();
    ctx.ellipse(cx, baseY - ry * 0.5, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * readyFrac);
    ctx.stroke();
  }

  // Soot is baked into the sprite, masked to its silhouette, so the building is
  // scorched rather than wearing a smudge.
  const bucket = d.state === 'derelict' ? 0 : sootBucket(d.restarts);
  ctx.drawImage(sootedSprite(sprite, kind, bucket), cx - w / 2, baseY - h, w, h);

  // Lit windows: real CPU. Additive, and spread wide enough to read as light
  // leaking out of a building rather than a disc parked on top of one. Absent
  // entirely when there are no metrics to draw it from.
  if (d.load !== null && load > 0.08 && d.state !== 'derelict') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.78 + 0.22 * Math.sin(t / 420 + cx);
    const gy = baseY - h * 0.5;
    const glow = ctx.createRadialGradient(cx, gy, 0, cx, gy, w * 0.95);
    glow.addColorStop(0, `rgba(255,190,96,${0.3 * load * pulse})`);
    glow.addColorStop(0.45, `rgba(255,178,80,${0.12 * load * pulse})`);
    glow.addColorStop(1, 'rgba(255,178,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - w, gy - w, w * 2, w * 2);
    ctx.restore();
  }

  if (d.state === 'collapsing') {
    const pulse = 0.5 + 0.5 * Math.sin(t / 180);
    ctx.strokeStyle = C.collapsing;
    ctx.lineWidth = 1.5 + pulse * 2;
    ctx.globalAlpha = 0.4 + pulse * 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, baseY - ry * 0.5, rx + 4, ry + 3, 0, 0, TAU);
    ctx.stroke();
  }

  if (d.state === 'raising') {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = C.raising;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t / 260);
    ctx.beginPath();
    ctx.ellipse(cx, baseY - ry * 0.5, rx + 3, ry + 2, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (selected || hovered) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = selected ? '#f4f4f4' : '#a8a8a8';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, baseY - ry * 0.5, rx + 6, ry + 4, 0, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSpriteRubble(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  cx: number,
  cy: number,
  age: number,
  hue: number | null,
) {
  const k = 1 - Math.min(1, age / RUBBLE_MS);
  const sprite = atlas.building.ruin;
  if (!sprite) return;
  const w = SPRITE_W * 0.9;
  const h = w * sprite.aspect;
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.6 * k;
  if (hue !== null) {
    ctx.fillStyle = `hsl(${hue} 40% 32% / 0.4)`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + TILE * 0.2, TILE * 0.42, TILE * 0.2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.drawImage(sprite.img, cx - w / 2, cy + SPRITE_BASE - h, w, h);
  ctx.restore();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  d: Dweller,
  cx: number,
  cy: number,
  t: number,
  selected: boolean,
  hovered: boolean,
  highlight: 'none' | 'match' = 'none',
) {
  const hue = liveryHue(d.namespace);
  const status = STATE_COLOR[d.state];
  const size = 26;
  const half = size / 2;
  const load = d.load ?? 0;

  ctx.save();
  void highlight; // the fallback renderer has no spotlight treatment

  if (d.state === 'raising') {
    // A foundation, not a building — you can see what should be there.
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = status;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t / 260);
    roundRect(ctx, cx - half, cy - half, size, size, 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = status;
    for (const [sx, sy] of [
      [-half, -half],
      [half, -half],
      [-half, half],
      [half, half],
    ]) {
      ctx.fillRect(cx + sx - 1.5, cy + sy - 1.5, 3, 3);
    }
    ctx.restore();
    return;
  }

  if (d.state === 'fading') {
    ctx.globalAlpha = 0.35;
  }

  // Shadow gives the flat map just enough relief to read as buildings.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, cx - half + 2, cy - half + 3, size, size, 3);
  ctx.fill();

  // Walls in the namespace's livery.
  const lightness = d.state === 'derelict' ? 16 : 34 + load * 12;
  const sat = d.state === 'derelict' ? 6 : 42;
  ctx.fillStyle = `hsl(${hue} ${sat}% ${lightness}%)`;
  roundRect(ctx, cx - half, cy - half, size, size, 3);
  ctx.fill();

  // Roof carries status. Partially-ready pods get a partial roof — an unfinished
  // building, which is exactly what a 1/2-ready pod is.
  const readyFrac = d.total > 0 ? d.ready / d.total : 0;
  if (readyFrac > 0) {
    ctx.fillStyle = status;
    ctx.globalAlpha *= 0.9;
    ctx.fillRect(cx - half, cy - half, size * readyFrac, 6);
    ctx.globalAlpha /= 0.9;
  }
  if (readyFrac < 1) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - half + size * readyFrac, cy - half + 0.5, size * (1 - readyFrac), 5);
  }

  // Soot: lifetime restarts. This is scar tissue, not activity, so it does not
  // move — a building that has burned down before and been put back up.
  if (d.restarts > 0 && d.state !== 'derelict') {
    const soot = Math.min(0.62, 0.12 + Math.log10(d.restarts + 1) * 0.3);
    ctx.fillStyle = `rgba(10,10,10,${soot})`;
    ctx.beginPath();
    ctx.moveTo(cx + half, cy - half + 6);
    ctx.lineTo(cx + half, cy + half);
    ctx.lineTo(cx + half - 13, cy + half);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = d.state === 'derelict' ? '#393939' : `hsl(${hue} 30% 12%)`;
  ctx.lineWidth = 1;
  roundRect(ctx, cx - half, cy - half, size, size, 3);
  ctx.stroke();

  // Running hot. Distinct from collapsing: this is a building doing its job at
  // full tilt, which you want to be able to find without reading a table.
  if (load > 0.8 && d.state === 'settled') {
    ctx.strokeStyle = C.working;
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t / 320);
    ctx.lineWidth = 2;
    roundRect(ctx, cx - half - 3, cy - half - 3, size + 6, size + 6, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (d.state === 'collapsing') {
    // Pulse, plus a crack through the middle. It should be impossible to miss
    // one of these on a map of a hundred buildings.
    const pulse = 0.5 + 0.5 * Math.sin(t / 180);
    ctx.strokeStyle = C.collapsing;
    ctx.lineWidth = 1 + pulse * 1.6;
    ctx.globalAlpha = 0.35 + pulse * 0.5;
    roundRect(ctx, cx - half - 3, cy - half - 3, size + 6, size + 6, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(cx - half + 4, cy - half + 8);
    ctx.lineTo(cx - 2, cy);
    ctx.lineTo(cx + 4, cy - 4);
    ctx.lineTo(cx + half - 3, cy + half - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Lit windows scale with load — a building working late. Flat when load is
  // unknown, so an unlit village means "no metrics", not "nothing happening".
  if (d.load !== null && d.state !== 'derelict') {
    const lit = Math.round(load * 4);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < lit ? `rgba(241,194,27,${0.55 + 0.35 * Math.sin(t / 400 + i)})` : 'rgba(0,0,0,0.35)';
      ctx.fillRect(cx - 8 + (i % 2) * 10, cy - 1 + Math.floor(i / 2) * 8, 6, 5);
    }
  }

  if (selected || hovered) {
    ctx.strokeStyle = selected ? '#f4f4f4' : '#8d8d8d';
    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.globalAlpha = 1;
    roundRect(ctx, cx - half - 5, cy - half - 5, size + 10, size + 10, 6);
    ctx.stroke();
  }

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, store: ParticleStore) {
  for (const p of store) {
    const k = p.life / p.max;
    switch (p.kind) {
      case 'fire':
        ctx.fillStyle = `rgba(${250}, ${Math.round(77 + 140 * (1 - k))}, ${Math.round(30 + 20 * k)}, ${k * 0.9})`;
        break;
      case 'smoke':
        ctx.fillStyle = `rgba(150,150,150,${k * 0.13})`;
        break;
      case 'spark':
        ctx.fillStyle = `rgba(241,194,27,${k})`;
        break;
      default:
        ctx.fillStyle = `rgba(198,198,198,${k * 0.3})`;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
}

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  settlements: Settlement[];
  placements: Map<string, Placement>;
  dwellers: Map<string, Dweller>;
  particles: ParticleStore;
  camera: { x: number; y: number; scale: number };
  size: { w: number; h: number };
  dpr: number;
  t: number;
  dt: number;
  now: number;
  selectedKey: string | null;
  hoveredKey: string | null;
  atlas: Atlas | null;
  /** Namespace picked from the livery panel, or null for the whole map. */
  highlightNs: string | null;
}

/**
 * Painter's order. Sprites are taller than their footprint, so a building must
 * be drawn after everything behind it or towers punch holes in their neighbours.
 * Plot coordinates never change, so this sort is stable and can be cached.
 */
const paintOrderCache = new WeakMap<Settlement, Plot[]>();

function paintOrder(s: Settlement): Plot[] {
  const hit = paintOrderCache.get(s);
  if (hit && hit.length === s.plots.length) return hit;
  const sorted = [...s.plots].sort((a, b) => a.gy - b.gy || a.gx - b.gx);
  paintOrderCache.set(s, sorted);
  return sorted;
}

export function drawVillage(a: DrawArgs) {
  const { ctx, settlements, placements, dwellers, particles, camera, size, dpr, t, dt, now } = a;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.fillStyle = C.wild;
  ctx.fillRect(0, 0, size.w, size.h);

  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);

  const view: View = {
    x0: -camera.x / camera.scale,
    y0: -camera.y / camera.scale,
    x1: (size.w - camera.x) / camera.scale,
    y1: (size.h - camera.y) / camera.scale,
  };

  const courses = rivers(view);
  const roads = highways(settlements, placements);
  drawCountry(ctx, view, settlements, placements, courses, a.atlas);

  // Trunk roads over the countryside but under the settlements they join, so
  // they appear to emerge from the edge of each one.
  drawHighways(ctx, roads);
  drawWayfarers(ctx, roads, t, camera.scale);

  for (const s of settlements) {
    const pl = placements.get(s.name);
    if (!pl) continue;

    const layer = a.atlas ? groundLayer(s, pl, a.atlas) : null;
    if (layer) ctx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
    else drawGroundVector(ctx, s, pl);

    // s.name is `cluster/node` — show the node prominently, cluster as context.
    const slash = s.name.indexOf('/');
    const cluster = slash < 0 ? '' : s.name.slice(0, slash);
    const node = slash < 0 ? s.name : s.name.slice(slash + 1);

    // Anchor the label to the land, not to the padded slot — the land is a blob
    // inside a much larger box now, so a corner-anchored label floats off alone.
    let lx = Infinity;
    let ly = Infinity;
    for (const p of s.plots) {
      if (p.occupant === null && p.vacatedAt === null) continue;
      const w = plotWorld(pl, p);
      if (w.x < lx) lx = w.x;
      if (w.y < ly) ly = w.y;
    }
    if (!isFinite(lx)) {
      lx = pl.x;
      ly = pl.y;
    }
    lx -= TILE * 0.8;
    ly -= TILE * 0.95;

    ctx.textBaseline = 'bottom';
    ctx.font = '600 13px "IBM Plex Sans", system-ui, sans-serif';
    const nodeWidth = ctx.measureText(node).width;
    ctx.fillStyle = C.text;
    ctx.fillText(node, lx, ly);

    const terrainNote =
      s.terrain === 'firm' ? ' · carries most of the cluster' : s.terrain === 'dirt' ? ' · lightly used' : '';
    ctx.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText(
      `${cluster ? cluster + ' · ' : ''}${s.byDweller.size} dwelling${s.byDweller.size === 1 ? '' : 's'}${terrainNote}`,
      lx + 8 + nodeWidth,
      ly,
    );

    // Picking a district is a spotlight, not a filter: draw the whole town,
    // wash it back, then relight the chosen buildings on top. Simply lowering
    // their alpha instead makes already-dark buildings vanish and leaves the
    // road network as the loudest thing on screen.
    const spotlight = a.highlightNs !== null;

    const paint = (only: 'all' | 'others' | 'match') => {
      for (const plot of paintOrder(s)) {
        // plotWorld, not the bare grid cell: the building stands where the land
        // under it was drawn, which is off the lattice and clear of the street.
        const { x: cx, y: cy } = plotWorld(pl, plot);

        if (plot.occupant === null) {
          if (plot.vacatedAt !== null && only !== 'match') {
            const hue = plot.livery ? liveryHue(plot.livery) : null;
            const age = now - plot.vacatedAt;
            if (a.atlas) drawSpriteRubble(ctx, a.atlas, cx, cy, age, hue);
            else drawRubble(ctx, cx, cy, age, hue);
          }
          continue;
        }

        const d = dwellers.get(plot.occupant);
        if (!d) continue;
        const matches = d.namespace === a.highlightNs;
        if (only === 'others' && matches) continue;
        if (only === 'match' && !matches) continue;

        const highlight = only === 'match' ? 'match' : 'none';
        // Buildings outside the chosen district stop smoking, so their plumes
        // do not drift across the one you asked to see.
        if (!spotlight || matches) emit(particles, d, cx, cy, dt, d.load ?? 0);
        const sel = d.key === a.selectedKey;
        const hov = d.key === a.hoveredKey;
        if (a.atlas) drawSpriteBuilding(ctx, a.atlas, d, cx, cy, t, sel, hov, highlight);
        else drawBuilding(ctx, d, cx, cy, t, sel, hov, highlight);
      }
    };

    if (!spotlight) {
      paint('all');
    } else {
      paint('others');
      // The scrim borrows the ground layer's own soft edge — drawing it black
      // through a brightness filter costs nothing and keeps the shoreline soft.
      if (layer && 'filter' in ctx) {
        ctx.save();
        ctx.filter = 'brightness(0)';
        ctx.globalAlpha = 0.44;
        ctx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
        ctx.restore();
      } else {
        landPath(ctx, s, pl, 6);
        ctx.fillStyle = 'rgba(12,13,17,0.52)';
        ctx.fill();
      }
      paint('match');
    }

    // People in the streets. How many is a reading of how hard the settlement
    // is actually working, so a busy node bustles and an idle one turns in.
    let occupied = 0;
    let working = 0;
    for (const key of s.byDweller.keys()) {
      const d = dwellers.get(key);
      if (!d) continue;
      occupied++;
      if ((d.load ?? 0) > 0.3) working++;
    }
    drawFolk(ctx, s, pl, t, camera.scale, occupied > 0 ? working / occupied : 0, spotlight);
  }

  stepParticles(particles, dt);
  drawParticles(ctx, particles);
}

/** Screen px -> the dweller key under the cursor, or null. */
export function hitTest(
  sx: number,
  sy: number,
  settlements: Settlement[],
  placements: Map<string, Placement>,
  camera: { x: number; y: number; scale: number },
): string | null {
  const wx = (sx - camera.x) / camera.scale;
  const wy = (sy - camera.y) / camera.scale;
  for (const s of settlements) {
    const pl = placements.get(s.name);
    if (!pl) continue;
    if (wx < pl.x || wx > pl.x + pl.w || wy < pl.y || wy > pl.y + pl.h) continue;
    const l = worldLocal(pl, wx, wy);
    const gx = Math.floor((l.x - pl.ox) / TILE);
    const gy = Math.floor((l.y - pl.oy) / TILE);
    const id = s.byCoord.get(`${gx},${gy}`);
    if (id === undefined) return null;
    return s.plots[id].occupant;
  }
  return null;
}
