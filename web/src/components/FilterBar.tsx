import type { NamespaceStatusKind } from '../types/api';
import { STATUS_COLORS } from '../constants/status';

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
  allExpanded: boolean;
  onToggleAll: () => void;
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
  allExpanded,
  onToggleAll,
}: Props) {
  return (
    <div className="ksl-filter">
      {/* Jewel search box; "/" focuses it (App.tsx). No form submit. */}
      <div className="search ksl-filter__search" role="search">
        <label className="visually-hidden" htmlFor="ns-search">Filter namespaces</label>
        <svg className="search__icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.5-4.5" />
        </svg>
        <input
          className="search__input"
          id="ns-search"
          type="search"
          placeholder="Filter namespaces"
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onSearch(''); }}
        />
        <button
          className="search__clear"
          type="button"
          aria-label="Clear search"
          hidden={!searchQuery}
          onClick={() => onSearch('')}
        >
          ×
        </button>
        <kbd className="search__key" aria-hidden="true">/</kbd>
      </div>

      {/* Status filters: pressable Jewel tags, multi-select. */}
      <div className="cluster ksl-filter__statuses" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className="tag tag--button ksl-status-filter"
            aria-pressed={statusFilters[s]}
            onClick={() => onStatusFilter(s, !statusFilters[s])}
          >
            <span className="ksl-dot" style={{ '--tone': STATUS_COLORS[s] } as React.CSSProperties} aria-hidden="true" />
            {s}
            <span className="ksl-filter__count">{nsCounts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="ksl-filter__toggles">
        <label className="choice">
          <input type="checkbox" role="switch" checked={hideIdle} onChange={(e) => onHideIdle(e.target.checked)} />
          Hide all-idle
        </label>
        <label className="choice">
          <input type="checkbox" role="switch" checked={hideEmpty} onChange={(e) => onHideEmpty(e.target.checked)} />
          Hide empty
        </label>
        <button className="btn btn--ghost" type="button" onClick={onToggleAll}>
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
    </div>
  );
}
