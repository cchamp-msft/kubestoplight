import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/backgrounds.scss';

// Background options for reviewing Jewel's sky. "hot" is Jewel's default.
// Palettes restyle the CSS gradient; media options are Grok Imagine renders
// in public/bg/ layered over it.
interface BgOption {
  id: string;
  label: string;
  swatch: string;
  kind: 'palette' | 'still' | 'video';
  src?: string;
  poster?: string;
}

const OPTIONS: BgOption[] = [
  { id: 'hot', label: 'Jewel (hot)', kind: 'palette', swatch: 'linear-gradient(135deg,#6d28d9,#c026d3,#dc2626,#ea580c)' },
  { id: 'glacier', label: 'Glacier', kind: 'palette', swatch: 'linear-gradient(135deg,#0ea5e9,#22d3ee,#4f46e5)' },
  { id: 'aurora', label: 'Aurora', kind: 'palette', swatch: 'linear-gradient(135deg,#10b981,#8b5cf6,#06b6d4)' },
  { id: 'deepsea', label: 'Deep Sea', kind: 'palette', swatch: 'linear-gradient(135deg,#0369a1,#0e7490,#1d4ed8)' },
  { id: 'polar', label: 'Polar Night', kind: 'palette', swatch: 'linear-gradient(135deg,#4338ca,#6d28d9,#0284c7)' },
  { id: 'aurora-still', label: 'Aurora', kind: 'still', src: 'bg/aurora.webp', swatch: 'url(bg/aurora.webp) center/cover' },
  { id: 'glacier-still', label: 'Ice', kind: 'still', src: 'bg/glacier.webp', swatch: 'url(bg/glacier.webp) center/cover' },
  { id: 'deepsea-still', label: 'Deep light', kind: 'still', src: 'bg/deepsea.webp', swatch: 'url(bg/deepsea.webp) center/cover' },
  { id: 'aurora-loop', label: 'Aurora loop', kind: 'video', src: 'bg/aurora.mp4', poster: 'bg/aurora-poster.jpg', swatch: 'url(bg/aurora-poster.jpg) center/cover' },
];

const STORAGE_KEY = 'ksl-bg';
const DEFAULT_BG = import.meta.env.VITE_DEFAULT_BG || 'hot';
// Shown in dev and review builds; ?picker=0 hides it (the screenshot script uses that).
const SHOW_PICKER = (import.meta.env.DEV || import.meta.env.VITE_BG_PICKER === '1')
  && new URLSearchParams(window.location.search).get('picker') !== '0';

function initialBg(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('bg');
  if (fromUrl && OPTIONS.some((o) => o.id === fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && OPTIONS.some((o) => o.id === saved)) return saved;
  } catch { /* storage blocked */ }
  return DEFAULT_BG;
}

// Motion for the gradient palettes. "jewel" is Jewel's own lava lamp
// animation (the drifting gradient, named upstream in 383649b); "wax" adds
// rising wax blobs on top of it.
type Motion = 'jewel' | 'wax';
const MOTIONS: { id: Motion; label: string }[] = [
  { id: 'jewel', label: 'Lava lamp (Jewel)' },
  { id: 'wax', label: 'Wax blobs' },
];
const MOTION_KEY = 'ksl-motion';
// Old names from before Jewel named its animation, so shared links keep working.
const MOTION_ALIASES: Record<string, Motion> = { jewel: 'jewel', drift: 'jewel', wax: 'wax', lava: 'wax' };
const DEFAULT_MOTION: Motion = MOTION_ALIASES[import.meta.env.VITE_DEFAULT_MOTION ?? ''] ?? 'jewel';

function initialMotion(): Motion {
  const fromUrl = MOTION_ALIASES[new URLSearchParams(window.location.search).get('motion') ?? ''];
  if (fromUrl) return fromUrl;
  try {
    const saved = MOTION_ALIASES[localStorage.getItem(MOTION_KEY) ?? ''];
    if (saved) return saved;
  } catch { /* storage blocked */ }
  return DEFAULT_MOTION;
}

// Wax blobs: position (vw/vh), size, travel, period and phase. Out-of-phase
// periods keep the lamp from ever visibly repeating.
const BLOBS = [
  { x: '18vw', y: '62vh', s: '62vmax', dx: '14vw', t: '34s', d: '-6s', c: 'var(--blob-1)' },
  { x: '78vw', y: '70vh', s: '54vmax', dx: '-18vw', t: '28s', d: '-19s', c: 'var(--blob-2)' },
  { x: '42vw', y: '88vh', s: '46vmax', dx: '22vw', t: '41s', d: '-31s', c: 'var(--blob-3)' },
  { x: '88vw', y: '22vh', s: '40vmax', dx: '-24vw', t: '25s', d: '-11s', c: 'var(--blob-4)' },
  { x: '6vw', y: '18vh', s: '36vmax', dx: '18vw', t: '47s', d: '-38s', c: 'var(--blob-5)' },
];

function WaxLayer() {
  return (
    <div className="ksl-wax" aria-hidden="true">
      {BLOBS.map((b, i) => (
        <span
          key={i}
          className="ksl-wax__blob"
          style={{ '--x': b.x, '--y': b.y, '--s': b.s, '--dx': b.dx, '--t': b.t, '--d': b.d, '--c': b.c } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Renders the media layer for the chosen background and, in review builds, the picker. */
export default function BgPicker() {
  const [bg, setBg] = useState(initialBg);
  const [motion, setMotion] = useState(initialMotion);
  const [open, setOpen] = useState(false);
  const option = OPTIONS.find((o) => o.id === bg) ?? OPTIONS[0];
  const wax = option.kind === 'palette' && motion === 'wax';

  // A second wax layer inside .jewel-cap keeps the strip above the sticky
  // header in step with the page (same viewport-unit positions, same timing).
  const [cap, setCap] = useState<Element | null>(null);
  useEffect(() => setCap(document.querySelector('.jewel-cap')), []);

  useEffect(() => {
    try { localStorage.setItem(MOTION_KEY, motion); } catch { /* storage blocked */ }
    const url = new URL(window.location.href);
    if (motion === DEFAULT_MOTION) url.searchParams.delete('motion');
    else url.searchParams.set('motion', motion);
    window.history.replaceState(null, '', url);
  }, [motion]);

  useEffect(() => {
    const root = document.documentElement;
    // Media options sit over a matching cool palette, which shows while they load.
    const palette = option.kind === 'palette' ? option.id : option.id.startsWith('glacier') ? 'glacier' : option.id.startsWith('deepsea') ? 'deepsea' : 'aurora';
    if (palette === 'hot') root.removeAttribute('data-ksl-bg');
    else root.setAttribute('data-ksl-bg', palette);
    try { localStorage.setItem(STORAGE_KEY, option.id); } catch { /* storage blocked */ }
    const url = new URL(window.location.href);
    url.searchParams.delete('picker');
    if (option.id === DEFAULT_BG) url.searchParams.delete('bg');
    else url.searchParams.set('bg', option.id);
    window.history.replaceState(null, '', url);
  }, [option]);

  const groups: [string, BgOption['kind'][]][] = [
    ['Gradient palettes', ['palette']],
    ['Generated (Grok Imagine)', ['still', 'video']],
  ];

  return (
    <>
      {wax && <WaxLayer />}
      {wax && cap && createPortal(<WaxLayer />, cap)}
      {option.kind === 'still' && (
        <div className="ksl-bg-media" aria-hidden="true">
          <div className="ksl-bg-media__still" style={{ backgroundImage: `url(${option.src})` }} />
        </div>
      )}
      {option.kind === 'video' && (
        <div className="ksl-bg-media" aria-hidden="true">
          <video
            key={option.src}
            src={option.src}
            poster={option.poster}
            autoPlay={!reducedMotion()}
            muted
            loop
            playsInline
            preload={reducedMotion() ? 'none' : 'auto'}
          />
        </div>
      )}

      {SHOW_PICKER && (
        <div className="ksl-bgpicker">
          {open && (
            <div className="panel ksl-bgpicker__panel" role="dialog" aria-label="Background">
              {groups.map(([title, kinds]) => (
                <div key={title} className="ksl-bgpicker__group">
                  <p className="label">{title}</p>
                  <div className="cluster ksl-bgpicker__options" role="group" aria-label={title}>
                    {OPTIONS.filter((o) => kinds.includes(o.kind)).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="tag tag--button ksl-status-filter"
                        aria-pressed={o.id === option.id}
                        onClick={() => setBg(o.id)}
                      >
                        <span className="ksl-bgpicker__swatch" style={{ '--swatch': o.swatch } as React.CSSProperties} aria-hidden="true" />
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {option.kind === 'palette' && (
                <div className="ksl-bgpicker__group">
                  <p className="label">Motion</p>
                  <div className="cluster ksl-bgpicker__options" role="group" aria-label="Motion">
                    {MOTIONS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="tag tag--button"
                        aria-pressed={m.id === motion}
                        onClick={() => setMotion(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="ksl-bgpicker__note">Shareable: kept in the URL (?bg={option.id}{wax ? '&motion=wax' : ''})</p>
            </div>
          )}
          <button
            className="btn btn--ghost ksl-bgpicker__toggle panel"
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="ksl-bgpicker__swatch" style={{ '--swatch': option.swatch } as React.CSSProperties} aria-hidden="true" />
            Background · {option.label}{wax ? ' · Wax' : ''}
          </button>
        </div>
      )}
    </>
  );
}
