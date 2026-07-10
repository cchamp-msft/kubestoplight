import { useState, useEffect, useRef, useCallback } from 'react';
import { Select, SelectItem, Toggle, IconButton, InlineLoading, InlineNotification } from '@carbon/react';
import { ArrowUp, ArrowDown, Copy, TrashCan, StopFilled, PlayFilledAlt } from '@carbon/icons-react';
import { usePodDescribe } from '../hooks/usePodDescribe';
import { usePodLogs } from '../hooks/usePodLogs';
import './PodLogsTab.scss';

interface Props {
  cluster: string;
  namespace: string;
  pod: string;
}

const ISO_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s/;
const ERROR_RE = /\b(error|fatal|panic|exception)\b/i;
const WARN_RE = /\bwarn(ing)?\b/i;

function LogLine({ line }: { line: string }) {
  const match = line.match(ISO_RE);
  const isError = ERROR_RE.test(line);
  const isWarn = !isError && WARN_RE.test(line);

  let className = 'ksl-log-line';
  if (isError) className += ' ksl-log-line--error';
  else if (isWarn) className += ' ksl-log-line--warn';

  if (match) {
    return (
      <div className={className}>
        <span className="ksl-log-line__ts">{match[1]} </span>
        <span>{line.slice(match[0].length)}</span>
      </div>
    );
  }

  return <div className={className}>{line}</div>;
}

export default function PodLogsTab({ cluster, namespace, pod }: Props) {
  const { data: describe } = usePodDescribe(cluster, namespace, pod);
  const containers = describe?.containers ?? [];

  const [container, setContainer] = useState('');
  const [follow, setFollow] = useState(true);
  const [active, setActive] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);

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
      <div className="ksl-logs__toolbar">
        {containers.length > 1 && (
          <Select
            id="container-select"
            labelText=""
            size="sm"
            value={container}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setContainer(e.target.value)}
            className="ksl-logs__container-select"
          >
            {containers.map((c) => (
              <SelectItem key={c.name} value={c.name} text={c.name} />
            ))}
          </Select>
        )}
        {containers.length <= 1 && container && (
          <span className="ksl-logs__container-label">{container}</span>
        )}
        <div style={{ flex: 1 }} />
        <Toggle
          id="follow-toggle"
          size="sm"
          labelText=""
          labelA="Follow"
          labelB="Follow"
          toggled={follow}
          onToggle={() => setFollow(!follow)}
        />
        <IconButton kind="ghost" size="sm" label="Scroll to top" onClick={scrollToTop}>
          <ArrowUp />
        </IconButton>
        <IconButton kind="ghost" size="sm" label="Scroll to bottom" onClick={scrollToBottom}>
          <ArrowDown />
        </IconButton>
        <IconButton kind="ghost" size="sm" label="Copy logs" onClick={handleCopy}>
          <Copy />
        </IconButton>
        <IconButton kind="ghost" size="sm" label="Clear" onClick={clear}>
          <TrashCan />
        </IconButton>
        <IconButton kind="ghost" size="sm" label={active ? 'Stop' : 'Resume'} onClick={toggleActive}>
          {active ? <StopFilled /> : <PlayFilledAlt />}
        </IconButton>
      </div>

      {error && (
        <div className="ksl-logs__error">
          <InlineNotification kind="error" title="Log error" subtitle={error} hideCloseButton />
        </div>
      )}

      {loading && (
        <div className="ksl-logs__loading">
          <InlineLoading description="Connecting to log stream..." />
        </div>
      )}

      <div className="ksl-logs__viewport" ref={viewportRef} onScroll={handleScroll}>
        <pre className="ksl-logs__output">
          {lines.map((line, i) => (
            <LogLine key={i} line={line} />
          ))}
          {lines.length === 0 && !loading && !error && (
            <span className="ksl-logs__empty">No log output</span>
          )}
        </pre>
      </div>

      <div className="ksl-logs__status-bar">
        <span>{lines.length.toLocaleString()} lines</span>
        <span className={`ksl-logs__status-dot ${connected ? 'ksl-logs__status-dot--on' : ''}`} />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </div>
  );
}
