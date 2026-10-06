import { describe, expect, it } from 'vitest';
import { SCENARIOS, churn, createState, describePod, rng, toGroups } from './fixtures.ts';

describe('mock fixtures', () => {
  it.each(SCENARIOS)('%s: groups are internally consistent', (scenario) => {
    const groups = toGroups(createState(scenario));
    for (const g of groups) {
      const counted = Object.values(g.statusCounts).reduce((a, b) => a + b, 0);
      expect(counted).toBe(g.totalPods);
      expect(g.pods).toHaveLength(g.totalPods);
      expect(g.jobs).toHaveLength(g.totalJobs);
      expect(g.readyPods).toBeLessThanOrEqual(g.activePods);
    }
  });

  it('is deterministic per seed so screenshots are comparable', () => {
    expect(toGroups(createState('mixed', 1))).toEqual(toGroups(createState('mixed', 1)));
  });

  it('empty scenario has no clusters and no groups', () => {
    const s = createState('empty');
    expect(s.clusters).toHaveLength(0);
    expect(toGroups(s)).toHaveLength(0);
  });

  it('covers every pod status in the mixed scenario', () => {
    const statuses = new Set(createState('mixed').pods.map((p) => p.status));
    expect([...statuses].sort()).toEqual(['Busy', 'Changing', 'Empty', 'Failed', 'Idle']);
  });

  it('describe resolves every pod and churn keeps names stable', () => {
    const s = createState('mixed');
    const names = s.pods.map((p) => p.name);
    churn(s, rng(3), 20);
    expect(s.pods.map((p) => p.name)).toEqual(names);
    for (const p of s.pods) expect(describePod(s, p.cluster, p.namespace, p.name)?.name).toBe(p.name);
  });
});
