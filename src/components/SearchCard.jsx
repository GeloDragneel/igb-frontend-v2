import Icon from "./Icons";
import PageTabs from "./PageTabs";

/*
  actions: [{ label, onClick, icon?, variant?, disabled? }]
    variant: "primary" (blue), "default" (white), "danger" (red outline)
*/
export default function SearchCard({
  query, setQuery, placeholder = "Search...",
  statusOptions, status, setStatus,
  dateRange, setDateRange,
  extra,
  addLabel, onAdd,     // single Add button (still works)
  actions,             // multiple buttons
  actionsLead,   // shown before the action buttons
  tabs, tab, setTab,   // tabs: [{ key, label, count? }]
  navTabs,             // page tabs: [{ to, label, end? }]
  sticky = false,
}) {
  const buttons = [
    ...(actions || []),
    ...(onAdd ? [{ label: addLabel, onClick: onAdd, icon: "plus", variant: "primary" }] : []),
  ];

  return (
    <div className={`card search-card ${sticky ? "sticky" : ""} ${tabs || navTabs ? "has-tabs" : ""}`}>
      {navTabs && <PageTabs tabs={navTabs} />}

      {tabs && (
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`tab ${tab === t.key ? "on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.count !== undefined && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="search-row">
        <div className="search-left">
          {setQuery && (
            <div className="pill-search">
              <Icon name="search" size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label="Search" />
            </div>
          )}

          {statusOptions && (
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">All status</option>
              {statusOptions.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}

          {dateRange && (
            <div className="date-range">
              <input type="date" className="input" value={dateRange.from} onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })} aria-label="From date" />
              <span>to</span>
              <input type="date" className="input" value={dateRange.to} onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })} aria-label="To date" />
            </div>
          )}

          {extra}
        </div>

        {buttons.length > 0 && (
          <div className="search-actions">
            {actionsLead}
            {buttons.map((b) => (
              <button
                key={b.label}
                className={`btn btn-lg ${b.variant === "primary" ? "btn-primary" : b.variant === "danger" ? "btn-danger-soft" : ""}`}
                onClick={b.onClick}
                disabled={b.disabled}
              >
                {b.icon && <Icon name={b.icon} size={17} />} {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}