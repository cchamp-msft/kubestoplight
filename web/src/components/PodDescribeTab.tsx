import type { ReactNode } from 'react';
import { usePodDescribe } from '../hooks/usePodDescribe';
import type { ContainerDetail } from '../types/api';
import StatusTag from './StatusTag';
import Icon from './ui/Icon';
import Loading from './ui/Loading';
import './PodDescribeTab.scss';

interface Props {
  cluster: string;
  namespace: string;
  pod: string;
}

/** Jewel .meta row pair (label/value with hairlines). */
function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="label">{label}</dt>
      <dd>{children === '' || children == null ? '—' : children}</dd>
    </>
  );
}

function Section({ title, count, open, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details className="accordion__item" open={open}>
      <summary className="accordion__head">
        {title}
        {count != null && <span className="accordion__meta">{count}</span>}
      </summary>
      <div className="accordion__body">{children}</div>
    </details>
  );
}

const STATE_TONE: Record<string, string> = {
  running: 'var(--status-idle)',
  waiting: 'var(--status-changing)',
  terminated: 'var(--status-failed)',
};

function ContainerBlock({ c }: { c: ContainerDetail }) {
  const stateLabel = c.state === 'running' ? 'Running' : c.stateReason || (c.state === 'waiting' ? 'Waiting' : c.state === 'terminated' ? 'Terminated' : 'Unknown');
  const req = Object.entries(c.resources.requests);
  const lim = Object.entries(c.resources.limits);

  return (
    <div className="ksl-desc__container">
      <h4 className="ksl-desc__container-name ksl-mono">{c.name}</h4>
      <dl className="meta">
        <KV label="Image"><code>{c.image}</code></KV>
        <KV label="State"><StatusTag tone={STATE_TONE[c.state]}>{stateLabel}</StatusTag></KV>
        <KV label="Ready">{c.ready ? 'Yes' : 'No'}</KV>
        <KV label="Restarts">{c.restartCount}</KV>
        {c.startedAt && <KV label="Started">{new Date(c.startedAt).toLocaleString()}</KV>}
        {c.ports.length > 0 && <KV label="Ports">{c.ports.map((p) => `${p.containerPort}/${p.protocol}`).join(', ')}</KV>}
        {req.length > 0 && <KV label="Requests"><span className="ksl-mono">{req.map(([k, v]) => `${k} ${v}`).join(' · ')}</span></KV>}
        {lim.length > 0 && <KV label="Limits"><span className="ksl-mono">{lim.map(([k, v]) => `${k} ${v}`).join(' · ')}</span></KV>}
        {c.volumeMounts.length > 0 && (
          <KV label="Mounts">
            <ul className="ksl-desc__list">
              {c.volumeMounts.map((vm) => (
                <li key={vm.mountPath}>
                  <span className="ksl-mono">{vm.mountPath}</span>
                  <span className="ksl-desc__muted"> ← {vm.name}</span>
                  {vm.readOnly && <span className="tag ksl-desc__ro">ro</span>}
                </li>
              ))}
            </ul>
          </KV>
        )}
      </dl>
    </div>
  );
}

export default function PodDescribeTab({ cluster, namespace, pod }: Props) {
  const { data, loading, error, refetch } = usePodDescribe(cluster, namespace, pod);

  if (loading && !data) return <Loading label="Loading pod details…" />;

  if (error) {
    return (
      <div className="notice notice--error" role="alert">
        <div className="notice__body">
          <p className="notice__title">Couldn't load pod</p>
          <p className="notice__text">{error}</p>
        </div>
        <div className="notice__actions">
          <button className="btn btn--ghost" type="button" onClick={refetch}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const labels = Object.entries(data.labels);
  const annotations = Object.entries(data.annotations);

  return (
    <div className="ksl-desc">
      <div className="ksl-desc__toolbar">
        <h3 className="label">Overview</h3>
        <button className="btn btn--ghost btn--icon ksl-btn-sm" type="button" aria-label="Refresh" title="Refresh" onClick={refetch}>
          <Icon name="refresh" />
        </button>
      </div>

      <dl className="meta ksl-desc__overview">
        <KV label="Node">{data.node}</KV>
        <KV label="Pod IP"><span className="ksl-mono">{data.podIP}</span></KV>
        <KV label="Host IP"><span className="ksl-mono">{data.hostIP}</span></KV>
        <KV label="QoS class">{data.qos}</KV>
        <KV label="Phase">{data.phase}</KV>
        <KV label="Service account">{data.serviceAccount}</KV>
        <KV label="Age">{data.age}</KV>
        <KV label="Created">{new Date(data.createdAt).toLocaleString()}</KV>
        {data.nodeSelector && Object.keys(data.nodeSelector).length > 0 && (
          <KV label="Node selector">
            {Object.entries(data.nodeSelector).map(([k, v]) => `${k}=${v}`).join(', ')}
          </KV>
        )}
      </dl>

      <div className="accordion ksl-desc__sections">
        {data.containers.length > 0 && (
          <Section title="Containers" count={data.containers.length} open>
            {data.containers.map((c) => <ContainerBlock key={c.name} c={c} />)}
          </Section>
        )}

        {data.initContainers.length > 0 && (
          <Section title="Init containers" count={data.initContainers.length}>
            {data.initContainers.map((c) => <ContainerBlock key={c.name} c={c} />)}
          </Section>
        )}

        {data.events.length > 0 && (
          <Section title="Events" count={data.events.length} open>
            <ul className="ksl-desc__events">
              {data.events.map((e, i) => (
                <li key={i} className="ksl-desc__event">
                  <div className="ksl-desc__event-head">
                    {e.type === 'Warning'
                      ? <StatusTag status="Failed">Warning</StatusTag>
                      : <span className="tag">{e.type}</span>}
                    <strong className="ksl-desc__event-reason">{e.reason}</strong>
                    {e.count > 1 && <span className="ksl-desc__muted">×{e.count}</span>}
                    <span className="ksl-desc__time">{new Date(e.lastSeen).toLocaleString()}</span>
                  </div>
                  <p className="ksl-desc__event-message">{e.message}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.conditions.length > 0 && (
          <Section title="Conditions" count={data.conditions.length}>
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last transition</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conditions.map((cond) => (
                    <tr key={cond.type}>
                      <th scope="row">{cond.type}</th>
                      <td><StatusTag status={cond.status === 'True' ? 'Idle' : 'Failed'}>{cond.status}</StatusTag></td>
                      <td className="table__muted">{new Date(cond.lastTransition).toLocaleString()}</td>
                      <td>{cond.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {labels.length > 0 && (
          <Section title="Labels" count={labels.length}>
            <div className="cluster ksl-desc__tags">
              {labels.map(([k, v]) => <span key={k} className="tag ksl-mono">{k}={v}</span>)}
            </div>
          </Section>
        )}

        {annotations.length > 0 && (
          <Section title="Annotations" count={annotations.length}>
            <dl className="meta ksl-desc__annotations">
              {annotations.map(([k, v]) => (
                <KV key={k} label={k}><span className="ksl-mono">{v}</span></KV>
              ))}
            </dl>
          </Section>
        )}

        {data.volumes.length > 0 && (
          <Section title="Volumes" count={data.volumes.length}>
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Type</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.volumes.map((v) => (
                    <tr key={v.name}>
                      <th scope="row" className="ksl-mono">{v.name}</th>
                      <td><span className="tag">{v.type}</span></td>
                      <td className="ksl-mono">{v.source || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {data.ownerReferences.length > 0 && (
          <Section title="Owner references" count={data.ownerReferences.length}>
            <dl className="meta">
              {data.ownerReferences.map((ref) => (
                <KV key={ref.name} label={ref.kind}><span className="ksl-mono">{ref.name}</span></KV>
              ))}
            </dl>
          </Section>
        )}
      </div>
    </div>
  );
}
