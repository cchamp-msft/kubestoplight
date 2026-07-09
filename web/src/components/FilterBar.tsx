import { Search, Checkbox, Toggle } from '@carbon/react';
import type { NamespaceStatusKind } from '../types/api';

interface Props {
  searchQuery: string;
  onSearch: (q: string) => void;
  statusFilters: Record<string, boolean>;
  onStatusFilter: (status: string, checked: boolean) => void;
  hideIdle: boolean;
  onHideIdle: (v: boolean) => void;
  hideEmpty: boolean;
  onHideEmpty: (v: boolean) => void;
  nsCounts: Record<string, number>;
}

const STATUSES: NamespaceStatusKind[] = ['Failed', 'Changing', 'Busy', 'Idle'];

export default function FilterBar({
  searchQuery,
  onSearch,
  statusFilters,
  onStatusFilter,
  hideIdle,
  onHideIdle,
  hideEmpty,
  onHideEmpty,
  nsCounts,
}: Props) {
  return (
    <div className="ksl-filter">
      <div className="ksl-filter__search">
        <Search
          id="ns-search"
          size="sm"
          labelText="Filter namespaces"
          placeholder="Filter namespaces"
          value={searchQuery}
          onChange={(e: any) => onSearch(e.target.value)}
          onClear={() => onSearch('')}
        />
      </div>

      <div className="ksl-filter__statuses">
        <span className="ksl-filter__label">Status</span>
        {STATUSES.map((s) => (
          <Checkbox
            key={s}
            id={`filter-${s}`}
            labelText={`${s} (${nsCounts[s] ?? 0})`}
            checked={statusFilters[s]}
            onChange={(_: any, { checked }: { checked: boolean }) => onStatusFilter(s, checked)}
          />
        ))}
      </div>

      <div className="ksl-filter__toggles">
        <Toggle
          id="hide-idle"
          size="sm"
          labelText="Hide all-idle"
          labelA=""
          labelB=""
          toggled={hideIdle}
          onToggle={onHideIdle}
        />
        <Toggle
          id="hide-empty"
          size="sm"
          labelText="Hide empty"
          labelA=""
          labelB=""
          toggled={hideEmpty}
          onToggle={onHideEmpty}
        />
      </div>
    </div>
  );
}
