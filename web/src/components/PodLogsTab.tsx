import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { usePodDescribe } from '../hooks/usePodDescribe';
import { usePodLogs } from '../hooks/usePodLogs';
import Icon, { type IconName } from './ui/Icon';
import Tooltip from './ui/Tooltip';
import Loading from './ui/Loading';
import './PodLogsTab.scss';

interface Props {
  cluster: string;
  namespace: string;
  pod: string;
}

const ISO_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s/;
const LEVEL_RE = /^\[?(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|PANIC)\]?(?=\s|:)/i;
const ERROR_RE = /\b(error|fatal|panic|exception)\b/i;
const WARN_RE = /\bwarn(ing)?\b/i;

type Level = 'error' | 'warn' | 'debug' | 'info';

function levelOf(token: string | undefined, text: string): Level {
  const t = token?.toLowerCase();
  if (t) {
    if (t === 'error' || t === 'fatal' || t === 'panic') return 'error';
    if (t.startsWith('warn')) return 'warn';
    if (t === 'debug' || t === 'trace') return 'debug';
    return 'info';
  }
  // No level token: fall back to scanning the text.
  if (ERROR_RE.test(text)) return 'error';
  if (WARN_RE.test(text)) return 'warn';
  return 'info';
}

/** One log line: dim timestamp, the level token in bold, and a colored
 *  edge (plus a faint wash for errors) so the bad lines stand out. */
function LogLine({ line }: { line: string }) {
  const ts = line.match(ISO_RE);
  const rest = ts ? line.slice(ts[0].length) : line;
  const lvl = rest.match(LEVEL_RE);
  const level = levelOf(lvl?.[1], rest);

  return (
    <div className={`ksl-log-line ksl-log-line--${level}`}>
      {ts && <span className="ksl-log-line__ts">{ts[1]} </span>}
      {lvl && <span className="ksl-log-line__level">{lvl[0]}</span>}
      {lvl ? rest.slice(lvl[0].length) : rest}
    </div>
  );
}

function ToolButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <Tooltip label={label}>
      <button className="btn btn--ghost btn--icon" type="button" aria-label={label} onClick={onClick}>
        <Icon name={icon} />
      </button>
    </Tooltip>
  );
}

export default function PodLogsTab({ cluster, namespace, pod }: Props) {
  const { data: describe } = usePodDescribe(cluster, namespace, pod);
  const containers = describe?.containers ?? [];
  const selectId = useId();

  const [container, setContainer] = useState('');
  const [follow, setFollow] = useState(true);
  const [active, setActive] = useState(true);
  const viewportRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (containers.length > 0 && !container) {
      setContainer(containers[0].name);
    }
  }, [containers, container]);

  const { lines, loading, error, connected, clear, stop } = usePodLogs(
    cluster,
    namespace,
    pod,
    container,
    { follow: active && follow, enabled: active && !!container },
  );

  useEffect(() => {
    if (follow && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [lines, follow]);

  const handleScroll = useCallback(() => {
    if (!viewportRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = viewportRef.current;
    if (scrollHeight - scrollTop - clientHeight > 40) {
      setFollow(false);
    }
  }, []);

  const scrollToTop = useCallback(() => {
    viewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setFollow(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
    setFollow(true);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(lines.join('\n'));
  }, [lines]);

  const toggleActive = useCallback(() => {
    if (active) {
      stop();
      setActive(false);
    } else {
      setActive(true);
    }
  }, [active, stop]);

  return (
    <div className="ksl-logs">
      {error && (
        <div className="notice notice--error" role="alert">
          <div className="notice__body">
            <p className="notice__title">Log stream error</p>
            <p className="notice__text">{error}</p>
          </div>
        </div>
      )}

      {/* Solid, not glass: a moving gradient behind dense text hurts reading. */}
      <figure className="code ksl-logs__view" data-panel="solid">
        <figcaption className="code__head ksl-logs__toolbar">
          {containers.length > 1 ? (
            <div className="select ksl-logs__select">
              <label className="visually-hidden" htmlFor={selectId}>Container</label>
              <select
                className="input"
                id={selectId}
                value={container}
                onChange={(e) => setContainer(e.target.value)}
              >
                {containers.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <span className="code__lang">{container || 'Logs'}</span>
          )}
          <span className="ksl-logs__spacer" />
          <label className="choice ksl-logs__follow">
            <input type="checkbox" role="switch" checked={follow} onChange={() => setFollow(!follow)} />
            Follow
          </label>
          <ToolButton icon="arrowUp" label="Scroll to top" onClick={scrollToTop} />
          <ToolButton icon="arrowDown" label="Scroll to bottom" onClick={scrollToBottom} />
          <ToolButton icon="copy" label="Copy logs" onClick={handleCopy} />
          <ToolButton icon="trash" label="Clear" onClick={clear} />
          <ToolButton icon={active ? 'pause' : 'play'} label={active ? 'Stop' : 'Resume'} onClick={toggleActive} />
        </figcaption>

        {loading && <div className="ksl-logs__loading"><Loading label="Connecting to log stream…" /></div>}

        <pre className="code__body ksl-logs__output" ref={viewportRef} onScroll={handleScroll} tabIndex={0}>
          {lines.map((line, i) => (
            <LogLine key={i} line={line} />
          ))}
          {lines.length === 0 && !loading && !error && (
            <span className="code__muted">No log output</span>
          )}
        </pre>

        <div className="ksl-logs__status">
          <span>{lines.length.toLocaleString()} lines</span>
          <span
            className="ksl-dot"
            style={{ '--tone': connected ? 'var(--status-idle)' : undefined } as React.CSSProperties}
            aria-hidden="true"
          />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </figure>
    </div>
  );
}
