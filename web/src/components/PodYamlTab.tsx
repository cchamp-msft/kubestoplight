import { useMemo, useCallback } from 'react';
import { IconButton, InlineLoading, InlineNotification } from '@carbon/react';
import { Copy, Renew } from '@carbon/icons-react';
import { usePodDescribe } from '../hooks/usePodDescribe';
import './PodYamlTab.scss';

interface Props {
  cluster: string;
  namespace: string;
  pod: string;
}

function highlightJSON(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;

    // Match leading whitespace
    const indent = remaining.match(/^(\s*)/)?.[1] ?? '';
    remaining = remaining.slice(indent.length);

    if (indent) parts.push(indent);

    // Match key: "key":
    const keyMatch = remaining.match(/^("(?:[^"\\]|\\.)*")\s*:/);
    if (keyMatch) {
      parts.push(<span key={`k${i}`} className="ksl-yaml__key">{keyMatch[1]}</span>);
      parts.push(': ');
      remaining = remaining.slice(keyMatch[0].length).trimStart();
    }

    // Match value
    if (remaining) {
      const trimmed = remaining.replace(/,\s*$/, '');
      const comma = remaining.endsWith(',') ? ',' : '';

      if (/^"/.test(trimmed)) {
        parts.push(<span key={`v${i}`} className="ksl-yaml__string">{trimmed}</span>);
      } else if (/^-?\d/.test(trimmed)) {
        parts.push(<span key={`v${i}`} className="ksl-yaml__number">{trimmed}</span>);
      } else if (/^(true|false)$/.test(trimmed)) {
        parts.push(<span key={`v${i}`} className="ksl-yaml__bool">{trimmed}</span>);
      } else if (/^null$/.test(trimmed)) {
        parts.push(<span key={`v${i}`} className="ksl-yaml__null">{trimmed}</span>);
      } else {
        parts.push(trimmed);
      }
      if (comma) parts.push(comma);
    }

    return <div key={i} className="ksl-yaml__line">{parts}</div>;
  });
}

export default function PodYamlTab({ cluster, namespace, pod }: Props) {
  const { data, loading, error, refetch } = usePodDescribe(cluster, namespace, pod);

  const highlighted = useMemo(() => {
    if (!data) return null;
    return highlightJSON(JSON.stringify(data, null, 2));
  }, [data]);

  const handleCopy = useCallback(() => {
    if (data) navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="ksl-yaml__loading">
        <InlineLoading description="Loading pod data..." />
      </div>
    );
  }

  if (error) {
    return (
      <InlineNotification kind="error" title="Failed to load" subtitle={error} hideCloseButton />
    );
  }

  if (!highlighted) return null;

  return (
    <div className="ksl-yaml">
      <div className="ksl-yaml__toolbar">
        <div style={{ flex: 1 }} />
        <IconButton kind="ghost" size="sm" label="Copy JSON" onClick={handleCopy}>
          <Copy />
        </IconButton>
        <IconButton kind="ghost" size="sm" label="Refresh" onClick={refetch}>
          <Renew />
        </IconButton>
      </div>
      <div className="ksl-yaml__viewport">
        <pre className="ksl-yaml__output">{highlighted}</pre>
      </div>
    </div>
  );
}
