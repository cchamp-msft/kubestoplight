import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Icon from '../components/ui/Icon';
import Tooltip from '../components/ui/Tooltip';
import type { NamespaceGroup, PodItem } from '../types/api';
import type { Dweller, Settlement } from './types';
import { reconcile } from './layout';
import { groundFor, liveryHue, toDwellers } from './adapter';
import {
  drawVillage,
  emitImplosion,
  plotWorld,
  hitTest,
  placeSettlements,
  worldBounds,
  STATE_COLOR,
  STATE_LABEL,
  WORKING_COLOR,
  type ParticleStore,
  type Placement,
} from './render';
import { loadAtlas, type Atlas } from './sprites';
import './VillageView.scss';

interface Props {
  groups: NamespaceGroup[];
  onPodSelect: (pod: PodItem) => void;
  selectedKey: string | null;
}

interface Hover {
  key: string;
  x: number;
  y: number;
}

interface Stats {
  byState: Record<string, number>;
  namespaces: string[];
  nsCounts: Record<string, number>;
  anyLoad: boolean;
  hot: number;
  scarred: number;
}

function summarise(dwellers: Dweller<PodItem>[]): Stats {
  const byState: Record<string, number> = {};
  const nsCounts: Record<string, number> = {};
  let anyLoad = false;
  let hot = 0;
  let scarred = 0;
  for (const d of dwellers) {
    byState[d.state] = (byState[d.state] ?? 0) + 1;
    nsCounts[d.namespace] = (nsCounts[d.namespace] ?? 0) + 1;
    if (d.load !== null) anyLoad = true;
    if ((d.load ?? 0) > 0.8 && d.state === 'settled') hot++;
    if (d.restarts > 0) scarred++;
  }
  return {
    byState,
    namespaces: Object.keys(nsCounts).sort(),
    nsCounts,
    anyLoad,
    hot,
    scarred,
  };
}

/** What the silhouette is saying, for the tooltip — the legend you learn from. */
const ROLE_WORD: Record<Dweller['role'], string> = {
  tower: 'tower · stateful member',
  cottage: 'cottage · deployment replica',
  vault: 'vault · daemonset',
  hall: 'hall · control plane',
  store: 'storehouse · holds data',
  gate: 'gatehouse · takes traffic',
  mill: 'mill · scheduled work',
  spent: 'spent · work done',
};

function formatBytes(b: number): string {
  if (b >= 1 << 30) return `${(b / (1 << 30)).toFixed(1)}Gi`;
  if (b >= 1 << 20) return `${Math.round(b / (1 << 20))}Mi`;
  return `${Math.round(b / 1024)}Ki`;
}

export default function VillageView({ groups, onPodSelect, selectedKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // These three survive every render on purpose. The persistence *is* the
  // pinning — rebuild them and every pod jumps to a new plot.
  const settlementsRef = useRef(new Map<string, Settlement>());
  const particlesRef = useRef<ParticleStore>([]);
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });

  const dwellersRef = useRef(new Map<string, Dweller<PodItem>>());
  const placementsRef = useRef(new Map<string, Placement>());
  const orderedRef = useRef<Settlement[]>([]);
  const selectedRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const userMovedRef = useRef(false);
  const aspectRef = useRef<number | null>(null);
  const atlasRef = useRef<Atlas | null>(null);

  // Art arrives asynchronously; the map draws itself with vector shapes until
  // it does, and keeps doing so if the files are missing.
  useEffect(() => {
    let live = true;
    loadAtlas().then((a) => {
      if (live) atlasRef.current = a;
    });
    return () => {
      live = false;
    };
  }, []);

  const [hover, setHover] = useState<Hover | null>(null);
  // Open where there is room for it; on a phone it would cover half the map.
  const [liveryOpen, setLiveryOpen] = useState(() => window.matchMedia('(min-width: 40rem)').matches);
  const liveryOpenRef = useRef(liveryOpen);
  liveryOpenRef.current = liveryOpen;

  // Picking a namespace from the livery panel lights its district and pushes
  // everything else back. Read by the render loop through a ref.
  const [highlightNs, setHighlightNs] = useState<string | null>(null);
  const highlightRef = useRef<string | null>(null);
  highlightRef.current = highlightNs;
  const [stats, setStats] = useState<Stats>({
    byState: {},
    namespaces: [],
    nsCounts: {},
    anyLoad: false,
    hot: 0,
    scarred: 0,
  });

  selectedRef.current = selectedKey;

  /** Width of the stage the map may actually use, once the livery panel is out. */
  const usableWidth = () => {
    const wrap = wrapRef.current;
    if (!wrap) return 0;
    return wrap.clientWidth - 96 - (liveryOpenRef.current ? 190 : 0);
  };

  /** Re-pack the settlements for the current stage shape. */
  const relayout = useCallback(() => {
    const wrap = wrapRef.current;
    const h = wrap ? wrap.clientHeight - 96 : 0;
    // The packing follows the stage's shape, but only while the camera is still
    // ours. Once someone has panned or zoomed, a resize must not move the
    // villages under them, and a phone resizes the stage every time its
    // toolbar slides in or out. "Fit map" hands the camera back.
    if (!userMovedRef.current || aspectRef.current === null) {
      aspectRef.current = h > 0 ? usableWidth() / h : 2.2;
    }
    placementsRef.current = placeSettlements(orderedRef.current, aspectRef.current);
  }, []);

  // ── Fold each snapshot into the standing map ──────────────────────────────
  useEffect(() => {
    const now = Date.now();
    const dwellers = toDwellers(groups);
    const settlements = settlementsRef.current;

    // Note who is leaving before reconcile clears them, so the implosion can be
    // thrown from the plot they actually occupied.
    const present = new Set(dwellers.map((d) => d.key));
    const departing: { s: Settlement; plotId: number }[] = [];
    for (const s of settlements.values()) {
      for (const [key, plotId] of s.byDweller) {
        if (!present.has(key)) departing.push({ s, plotId });
      }
    }

    reconcile(settlements, dwellers, now, groundFor(dwellers));

    dwellersRef.current = new Map(dwellers.map((d) => [d.key, d]));
    // Cluster first, then size. Trunk roads only join settlements of the same
    // cluster, so those settlements have to be packed next to each other —
    // otherwise a road drawn between two of them passes straight through a
    // third belonging to a different cluster, and reads as connecting it.
    const clusterSize = new Map<string, number>();
    for (const s of settlements.values()) {
      const cluster = s.name.slice(0, Math.max(0, s.name.indexOf('/')));
      clusterSize.set(cluster, (clusterSize.get(cluster) ?? 0) + s.plots.length);
    }
    const clusterOf = (s: Settlement) => s.name.slice(0, Math.max(0, s.name.indexOf('/')));
    orderedRef.current = [...settlements.values()].sort((a, b) => {
      const ca = clusterOf(a);
      const cb = clusterOf(b);
      if (ca !== cb) {
        return (clusterSize.get(cb) ?? 0) - (clusterSize.get(ca) ?? 0) || ca.localeCompare(cb);
      }
      return b.plots.length - a.plots.length || a.name.localeCompare(b.name);
    });
    relayout();

    for (const { s, plotId } of departing) {
      const pl = placementsRef.current.get(s.name);
      if (!pl) continue;
      const plot = s.plots[plotId];
      const at = plotWorld(pl, plot);
      emitImplosion(particlesRef.current, at.x, at.y);
    }

    setStats(summarise(dwellers));
  }, [groups, relayout]);

  // ── Fit the whole map in view ─────────────────────────────────────────────
  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const b = worldBounds(placementsRef.current);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    if (w <= 0 || h <= 0) return;
    const pad = 48;
    // Keep the map clear of the livery panel rather than framing buildings
    // underneath it.
    const usable = usableWidth();
    const scale = Math.min(usable / w, (wrap.clientHeight - pad * 2) / h, 1.6);
    cameraRef.current = {
      scale,
      x: (usable - w * scale) / 2 + pad - b.minX * scale,
      y: (wrap.clientHeight - h * scale) / 2 - b.minY * scale,
    };
    userMovedRef.current = false;
  }, []);

  // The render loop mounts once and must not restart, so it reaches fit through
  // a ref rather than closing over it.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const relayoutRef = useRef(relayout);
  relayoutRef.current = relayout;

  // First real data lands, or the window resizes: reframe unless the user has
  // taken control of the camera.
  useEffect(() => {
    if (!userMovedRef.current) fit();
  }, [groups, fit]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      relayout();
      if (!userMovedRef.current) fit();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, relayout]);

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const frame = (t: number) => {
      const dt = Math.min(64, t - last); // clamp so a backgrounded tab does not lurch
      last = t;

      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        // The stage's real size is not known until the browser has laid out the
        // view switch, so any fit before this frame framed the wrong rectangle.
        // Refitting here is what stops the map sitting in a half-viewport until
        // the window is manually resized.
        relayoutRef.current();
        if (!userMovedRef.current) fitRef.current();
      }

      drawVillage({
        ctx,
        settlements: orderedRef.current,
        placements: placementsRef.current,
        dwellers: dwellersRef.current,
        particles: particlesRef.current,
        camera: cameraRef.current,
        size: { w, h },
        dpr,
        t,
        dt,
        now: Date.now(),
        selectedKey: selectedRef.current,
        hoveredKey: hoverRef.current,
        atlas: atlasRef.current,
        highlightNs: highlightRef.current,
      });

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Camera + picking ──────────────────────────────────────────────────────
  // Every pointer that is down, by id. One drags the map; two pinch it. Mouse,
  // pen and touch all come through here, so there is no separate touch path.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  /** False until a gesture has moved or gone multi-touch: only then is it not a tap. */
  const gestureMovedRef = useRef(false);

  /** Scale about a stage point, so what is under the cursor or fingers stays there. */
  const zoomAbout = (sx: number, sy: number, factor: number) => {
    const cam = cameraRef.current;
    const next = Math.min(4, Math.max(0.25, cam.scale * factor));
    cam.x = sx - ((sx - cam.x) / cam.scale) * next;
    cam.y = sy - ((sy - cam.y) / cam.scale) * next;
    cam.scale = next;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pointers = pointersRef.current;
    if (pointers.size === 0) gestureMovedRef.current = false;
    else gestureMovedRef.current = true; // a second finger is never a tap
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);

    if (prev) {
      const cam = cameraRef.current;
      if (pointers.size === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) gestureMovedRef.current = true;
        // Until it has moved, leave the finger's start point alone, so a slow
        // drag still adds up to more than the tap threshold.
        if (!gestureMovedRef.current) return;
        cam.x += dx;
        cam.y += dy;
        prev.x = e.clientX;
        prev.y = e.clientY;
      } else {
        // Pinch: the other finger is the anchor. The midpoint carries the pan
        // and the spread carries the zoom, both from this one finger's move.
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const before = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
        const after = { x: (e.clientX + other.x) / 2, y: (e.clientY + other.y) / 2 };
        const spreadBefore = Math.hypot(prev.x - other.x, prev.y - other.y);
        const spreadAfter = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        cam.x += after.x - before.x;
        cam.y += after.y - before.y;
        if (spreadBefore > 0 && spreadAfter > 0) {
          zoomAbout(after.x - rect.left, after.y - rect.top, spreadAfter / spreadBefore);
        }
        prev.x = e.clientX;
        prev.y = e.clientY;
      }
      userMovedRef.current = true;
      hoverRef.current = null;
      setHover(null);
      return;
    }

    // Hover is a mouse idea: a finger has no "over" before it is "down".
    if (e.pointerType === 'touch') return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const key = hitTest(sx, sy, orderedRef.current, placementsRef.current, cameraRef.current);
    hoverRef.current = key;
    setHover(key ? { key, x: sx, y: sy } : null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const pointers = pointersRef.current;
    if (!pointers.delete(e.pointerId)) return;
    if (e.type === 'pointercancel' || pointers.size > 0 || gestureMovedRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const key = hitTest(
      e.clientX - rect.left,
      e.clientY - rect.top,
      orderedRef.current,
      placementsRef.current,
      cameraRef.current,
    );
    if (!key) return;
    const d = dwellersRef.current.get(key);
    if (d) onPodSelect(d.source);
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    zoomAbout(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    userMovedRef.current = true;
  };

  const hovered = hover ? dwellersRef.current.get(hover.key) : null;

  return (
    <div className="ksl-village">
      <div className="ksl-village__bar">
        {(['collapsing', 'raising', 'settled', 'fading', 'derelict'] as const).map((s) =>
          stats.byState[s] ? (
            <span key={s} className="ksl-village__legend-item">
              <i className="ksl-dot" style={{ '--tone': STATE_COLOR[s] } as CSSProperties} />
              {stats.byState[s]} {STATE_LABEL[s]}
            </span>
          ) : null,
        )}
        {stats.hot > 0 && (
          <span className="ksl-village__legend-item">
            <i className="ksl-dot" style={{ '--tone': WORKING_COLOR } as CSSProperties} />
            {stats.hot} running hot
          </span>
        )}
        {stats.scarred > 0 && (
          <span
            className="ksl-village__legend-item"
            title="Buildings carrying soot: pods that have restarted at least once in their life."
          >
            <i className="ksl-dot ksl-village__soot" />
            {stats.scarred} sooted
          </span>
        )}
        <span className="ksl-village__spacer" />
        {!stats.anyLoad && (
          <span
            className="ksl-village__note"
            title="No metrics-server readings in this snapshot, so nothing is smoking."
          >
            <Icon name="info" size="xs" /> no load data
          </span>
        )}
        <Tooltip label="Fit map">
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Fit map"
            onClick={() => {
              // Hand the camera back first, so the villages re-pack for the
              // stage as it is now before being framed.
              userMovedRef.current = false;
              relayout();
              fit();
            }}
          >
            <Icon name="fit" />
          </button>
        </Tooltip>
      </div>

      <div className="ksl-village__stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="ksl-village__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            hoverRef.current = null;
            setHover(null);
          }}
          onWheel={onWheel}
        />

        {hover && hovered && (
          <div
            className="ksl-village__tip"
            style={{
              left: hover.x + 14,
              top: hover.y + 14,
              borderLeftColor: `hsl(${liveryHue(hovered.namespace)} 45% 45%)`,
            }}
          >
            <div className="ksl-village__tip-name">{hovered.name}</div>
            <div className="ksl-village__tip-meta">
              {hovered.namespace} · {hovered.settlement.replace('/', ' / ')}
            </div>
            <div className="ksl-village__tip-meta">{ROLE_WORD[hovered.role]}</div>
            <div className="ksl-village__tip-row">
              <span className="ksl-village__tip-state">
                <i className="ksl-dot" style={{ '--tone': STATE_COLOR[hovered.state] } as CSSProperties} />
                {STATE_LABEL[hovered.state]}
              </span>
              <span>
                {hovered.ready}/{hovered.total} ready · {hovered.age}
              </span>
            </div>
            <div className="ksl-village__tip-row">
              {hovered.cpuMilli !== null ? (
                <span>
                  {hovered.cpuMilli}m cpu
                  {hovered.load !== null && ` · ${Math.round(hovered.load * 100)}% intensity`}
                  {hovered.memBytes !== null && ` · ${formatBytes(hovered.memBytes)}`}
                  {hovered.fill !== null && ` (${Math.round(hovered.fill * 100)}% of limit)`}
                </span>
              ) : (
                <span>no usage data</span>
              )}
            </div>
            {hovered.restarts > 0 && (
              <div className="ksl-village__tip-row">
                <span>
                  sooted · {hovered.restarts} restart{hovered.restarts === 1 ? '' : 's'} in its life
                </span>
              </div>
            )}
          </div>
        )}

        {stats.namespaces.length > 0 && (
          <div className={`ksl-village__livery${liveryOpen ? '' : ' ksl-village__livery--closed'}`}>
            <button
              type="button"
              className="ksl-village__livery-title"
              onClick={() => {
                setLiveryOpen((v) => !v);
                requestAnimationFrame(fit);
              }}
            >
              livery · {stats.namespaces.length} {liveryOpen ? '▾' : '▴'}
            </button>
            {liveryOpen &&
              stats.namespaces.map((ns) => (
                <button
                  key={ns}
                  type="button"
                  aria-pressed={highlightNs === ns}
                  className={`ksl-village__livery-row${
                    highlightNs === ns ? ' ksl-village__livery-row--on' : ''
                  }`}
                  onClick={() => setHighlightNs((cur) => (cur === ns ? null : ns))}
                >
                  <i style={{ background: `hsl(${liveryHue(ns)} 42% 40%)` }} />
                  {ns}
                  <span className="ksl-village__livery-count">{stats.nsCounts[ns]}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
