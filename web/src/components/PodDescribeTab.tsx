import { IconButton, Tag, InlineLoading, InlineNotification, Accordion, AccordionItem } from '@carbon/react';
import { Renew } from '@carbon/icons-react';
import { usePodDescribe } from '../hooks/usePodDescribe';
import type { ContainerDetail } from '../types/api';
import './PodDescribeTab.scss';

interface Props {
  cluster: string;
  namespace: string;
  pod: string;
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="ksl-desc__kv">
      <span className="ksl-desc__kv-label">{label}</span>
      <span className="ksl-desc__kv-value">{value || '—'}</span>
    </div>
  );
}

function ContainerSection({ c }: { c: ContainerDetail }) {
  const stateTag = (() => {
    switch (c.state) {
      case 'running':
        return <Tag type="green" size="sm">Running</Tag>;
      case 'waiting':
        return <Tag type="teal" size="sm">{c.stateReason || 'Waiting'}</Tag>;
      case 'terminated':
        return <Tag type="red" size="sm">{c.stateReason || 'Terminated'}</Tag>;
      default:
        return <Tag type="gray" size="sm">Unknown</Tag>;
    }
  })();

  const hasRequests = Object.keys(c.resources.requests).length > 0;
  const hasLimits = Object.keys(c.resources.limits).length > 0;

  return (
    <div className="ksl-desc__container">
      <KVRow label="Image" value={<span className="ksl-desc__mono">{c.image}</span>} />
      <KVRow label="State" value={stateTag} />
      <KVRow label="Ready" value={c.ready ? 'Yes' : 'No'} />
      <KVRow label="Restarts" value={c.restartCount} />
      {c.startedAt && <KVRow label="Started" value={new Date(c.startedAt).toLocaleString()} />}
      {c.ports.length > 0 && (
        <KVRow
          label="Ports"
          value={c.ports.map((p) => `${p.containerPort}/${p.protocol}`).join(', ')}
        />
      )}
      {(hasRequests || hasLimits) && (
        <div className="ksl-desc__resources">
          {hasRequests && (
            <div className="ksl-desc__resource-group">
              <span className="ksl-desc__resource-title">Requests</span>
              {Object.entries(c.resources.requests).map(([k, v]) => (
                <span key={k} className="ksl-desc__resource-item">{k}: {v}</span>
              ))}
            </div>
          )}
          {hasLimits && (
            <div className="ksl-desc__resource-group">
              <span className="ksl-desc__resource-title">Limits</span>
              {Object.entries(c.resources.limits).map(([k, v]) => (
                <span key={k} className="ksl-desc__resource-item">{k}: {v}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {c.volumeMounts.length > 0 && (
        <div className="ksl-desc__mounts">
          <span className="ksl-desc__mounts-title">Volume Mounts</span>
          {c.volumeMounts.map((vm) => (
            <span key={vm.mountPath} className="ksl-desc__mount-item">
              <span className="ksl-desc__mono">{vm.mountPath}</span>
              {' ← '}{vm.name}
              {vm.readOnly && <Tag type="cool-gray" size="sm">ro</Tag>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PodDescribeTab({ cluster, namespace, pod }: Props) {
  const { data, loading, error, refetch } = usePodDescribe(cluster, namespace, pod);

  if (loading && !data) {
    return (
      <div className="ksl-desc__loading">
        <InlineLoading description="Loading pod details..." />
      </div>
    );
  }

  if (error) {
    return (
      <InlineNotification
        kind="error"
        title="Failed to load"
        subtitle={error}
        hideCloseButton
      />
    );
  }

  if (!data) return null;

  return (
    <div className="ksl-desc">
      <div className="ksl-desc__toolbar">
        <IconButton kind="ghost" size="sm" label="Refresh" onClick={refetch}>
          <Renew />
        </IconButton>
      </div>

      {/* Overview */}
      <section className="ksl-desc__section">
        <h4 className="ksl-desc__section-title">Overview</h4>
        <KVRow label="Node" value={data.node} />
        <KVRow label="Pod IP" value={data.podIP} />
        <KVRow label="Host IP" value={data.hostIP} />
        <KVRow label="QoS Class" value={data.qos} />
        <KVRow label="Phase" value={data.phase} />
        <KVRow label="Service Account" value={data.serviceAccount} />
        <KVRow label="Age" value={data.age} />
        <KVRow label="Created" value={new Date(data.createdAt).toLocaleString()} />
        {data.nodeSelector && Object.keys(data.nodeSelector).length > 0 && (
          <KVRow
            label="Node Selector"
            value={Object.entries(data.nodeSelector).map(([k, v]) => `${k}=${v}`).join(', ')}
          />
        )}
      </section>

      {/* Containers */}
      <Accordion>
        {data.containers.length > 0 && (
          <AccordionItem title={`Containers (${data.containers.length})`} open>
            {data.containers.map((c) => (
              <div key={c.name} className="ksl-desc__container-wrapper">
                <span className="ksl-desc__container-name">{c.name}</span>
                <ContainerSection c={c} />
              </div>
            ))}
          </AccordionItem>
        )}

        {data.initContainers.length > 0 && (
          <AccordionItem title={`Init Containers (${data.initContainers.length})`}>
            {data.initContainers.map((c) => (
              <div key={c.name} className="ksl-desc__container-wrapper">
                <span className="ksl-desc__container-name">{c.name}</span>
                <ContainerSection c={c} />
              </div>
            ))}
          </AccordionItem>
        )}

        {/* Conditions */}
        {data.conditions.length > 0 && (
          <AccordionItem title={`Conditions (${data.conditions.length})`}>
            <div className="ksl-desc__table">
              <div className="ksl-desc__table-header">
                <span>Type</span>
                <span>Status</span>
                <span>Last Transition</span>
                <span>Reason</span>
              </div>
              {data.conditions.map((cond) => (
                <div key={cond.type} className="ksl-desc__table-row">
                  <span>{cond.type}</span>
                  <span>
                    <Tag type={cond.status === 'True' ? 'green' : 'red'} size="sm">
                      {cond.status}
                    </Tag>
                  </span>
                  <span className="ksl-desc__time">
                    {new Date(cond.lastTransition).toLocaleString()}
                  </span>
                  <span>{cond.reason || '—'}</span>
                </div>
              ))}
            </div>
          </AccordionItem>
        )}

        {/* Events */}
        {data.events.length > 0 && (
          <AccordionItem title={`Events (${data.events.length})`} open>
            <div className="ksl-desc__events">
              {data.events.map((e, i) => (
                <div key={i} className="ksl-desc__event">
                  <div className="ksl-desc__event-header">
                    <Tag type={e.type === 'Warning' ? 'red' : 'blue'} size="sm">{e.type}</Tag>
                    <span className="ksl-desc__event-reason">{e.reason}</span>
                    {e.count > 1 && (
                      <Tag type="cool-gray" size="sm">×{e.count}</Tag>
                    )}
                    <span className="ksl-desc__time">
                      {new Date(e.lastSeen).toLocaleString()}
                    </span>
                  </div>
                  <span className="ksl-desc__event-message">{e.message}</span>
                </div>
              ))}
            </div>
          </AccordionItem>
        )}

        {/* Labels */}
        {Object.keys(data.labels).length > 0 && (
          <AccordionItem title={`Labels (${Object.keys(data.labels).length})`}>
            <div className="ksl-desc__tags">
              {Object.entries(data.labels).map(([k, v]) => (
                <Tag key={k} type="cool-gray" size="sm">{k}={v}</Tag>
              ))}
            </div>
          </AccordionItem>
        )}

        {/* Annotations */}
        {Object.keys(data.annotations).length > 0 && (
          <AccordionItem title={`Annotations (${Object.keys(data.annotations).length})`}>
            <div className="ksl-desc__tags ksl-desc__tags--wrap">
              {Object.entries(data.annotations).map(([k, v]) => (
                <div key={k} className="ksl-desc__annotation">
                  <span className="ksl-desc__annotation-key">{k}</span>
                  <span className="ksl-desc__annotation-value">{v}</span>
                </div>
              ))}
            </div>
          </AccordionItem>
        )}

        {/* Volumes */}
        {data.volumes.length > 0 && (
          <AccordionItem title={`Volumes (${data.volumes.length})`}>
            <div className="ksl-desc__table">
              <div className="ksl-desc__table-header">
                <span>Name</span>
                <span>Type</span>
                <span>Source</span>
              </div>
              {data.volumes.map((v) => (
                <div key={v.name} className="ksl-desc__table-row ksl-desc__table-row--3col">
                  <span>{v.name}</span>
                  <span><Tag type="cool-gray" size="sm">{v.type}</Tag></span>
                  <span className="ksl-desc__mono">{v.source || '—'}</span>
                </div>
              ))}
            </div>
          </AccordionItem>
        )}

        {/* Owner References */}
        {data.ownerReferences.length > 0 && (
          <AccordionItem title="Owner References">
            {data.ownerReferences.map((ref) => (
              <div key={ref.name} className="ksl-desc__kv">
                <span className="ksl-desc__kv-label">{ref.kind}</span>
                <span className="ksl-desc__kv-value">{ref.name}</span>
              </div>
            ))}
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
