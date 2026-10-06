import { useMemo, useState } from 'react';
import { usePodDescribe } from '../hooks/usePodDescribe';
import Icon from './ui/Icon';
import Loading from './ui/Loading';
import './PodYamlTab.scss';

interface Props {
  cluster: string;
  namespace: string;
  pod: string;
}

// Jewel's code rule: highlighters map to --text-default / -muted / -accent
// only, so contrast holds. Keys are accent; literals default; null muted.
function highlightJSON(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;

    const indent = remaining.match(/^(\s*)/)?.[1] ?? '';
    remaining = remaining.slice(indent.length);
    if (indent) parts.push(indent);

    const keyMatch = remaining.match(/^("(?:[^"\\]|\\.)*")\s*:/);
    if (keyMatch) {
      parts.push(<span key={`k${i}`} className="code__mark">{keyMatch[1]}</span>);
      parts.push(': ');
      remaining = remaining.slice(keyMatch[0].length).trimStart();
    }

    if (remaining) {
      const trimmed = remaining.replace(/,\s*$/, '');
      const comma = remaining.endsWith(',') ? ',' : '';
      parts.push(/^null$/.test(trimmed) ? <span key={`v${i}`} className="code__muted">{trimmed}</span> : trimmed);
      if (comma) parts.push(<span key={`c${i}`} className="code__muted">,</span>);
    }

    return <div key={i}>{parts}</div>;
  });
}

export default function PodYamlTab({ cluster, namespace, pod }: Props) {
  const { data, loading, error, refetch } = usePodDescribe(cluster, namespace, pod);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const text = useMemo(() => (data ? JSON.stringify(data, null, 2) : ''), [data]);
  const highlighted = useMemo(() => (text ? highlightJSON(text) : null), [text]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(
      () => setCopyState('copied'),
      () => setCopyState('failed'),
    ).finally(() => setTimeout(() => setCopyState('idle'), 2000));
  };

  if (loading && !data) return <Loading label="Loading pod data…" />;

  if (error) {
    return (
      <div className="notice notice--error" role="alert">
        <div className="notice__body">
          <p className="notice__title">Couldn't load pod</p>
          <p className="notice__text">{error}</p>
        </div>
      </div>
    );
  }

  if (!highlighted) return null;

  return (
    <figure className="code ksl-json" data-panel="solid">
      <figcaption className="code__head">
        <span className="code__lang">JSON</span>
        <span className="ksl-json__actions">
          <button className="code__copy" type="button" data-state={copyState === 'idle' ? undefined : copyState} onClick={handleCopy}>
            <Icon name="copy" />
            <span aria-live="polite">{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}</span>
          </button>
          <button className="code__copy" type="button" onClick={refetch}>
            <Icon name="refresh" />
            Refresh
          </button>
        </span>
      </figcaption>
      <pre className="code__body ksl-json__body" tabIndex={0}><code>{highlighted}</code></pre>
    </figure>
  );
}
