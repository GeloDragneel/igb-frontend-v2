import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons";
import RowMenu from "./RowMenu";
import { downloadCSV } from "../utils/format";

// page / rows per page / sort kept per browser tab (only for tables given a stateKey)
const readState = (key) => {
  if (!key) return {};
  try { return JSON.parse(sessionStorage.getItem(`dt.${key}`) || "{}") || {}; } catch { return {}; }
};
const saveState = (key, v) => {
  if (!key) return;
  try { sessionStorage.setItem(`dt.${key}`, JSON.stringify(v)); } catch { /* ignore */ }
};

/*
  columns: [{ key, label, render?, value?, align?, sortable? }]
  stateKey: e.g. "sales" – remember page, rows per page and sort (refresh, back to list, switch tab)
  resetKey: with stateKey, go back to page 1 when this changes (e.g. the parent's search text)
*/
export default function DataTable({
  title,
  columns,
  rows,
  rowKey,
  onView,
  onEdit,
  onDelete,
  onBulkDelete,
  exportName,
  emptyText = "No records found.",
  onClearFilters,
  showToolbar = true,
  rowActions,          // (row) => [{ label, onClick }]
  onRowClick,          // (row) => void
  selectable = false,  // show checkboxes
  onSelectionChange,   // (keys) => void
  bodyHeight,          // e.g. "calc(100vh - 360px)" – only the rows scroll
  resetSelection,      // change to clear ticks
  stateKey,            // remember page / rows per page / sort under this name
  resetKey,            // with stateKey: back to page 1 when it changes
}) {
  const [saved] = useState(() => readState(stateKey));
  const [pageSize, setPageSize] = useState(() => Number(saved.pageSize) || 10);
  const [page, setPage] = useState(() => Number(saved.page) || 1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(() => saved.sort || { key: null, dir: "asc" });

  useEffect(() => { saveState(stateKey, { page, pageSize, sort }); }, [stateKey, page, pageSize, sort]);
  const [selected, setSelected] = useState([]);

  const showChecks = selectable || !!onBulkDelete;
  const keyOf = (r) => (typeof rowKey === "function" ? rowKey(r) : r[rowKey]);
  const valueOf = (col, r) => (col.value ? col.value(r) : r[col.key]);

  // tell the parent what is ticked
  useEffect(() => { onSelectionChange?.(selected); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  // parent can clear ticks
  useEffect(() => { setSelected([]); }, [resetSelection]);
  // drop ticks for rows that are gone
  useEffect(() => {
    setSelected((sel) => sel.filter((k) => rows.some((r) => keyOf(r) === k)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? rows.filter((r) => columns.some((c) => String(valueOf(c, r) ?? "").toLowerCase().includes(q)))
      : rows;
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key);
      list = [...list].sort((a, b) => {
        const x = valueOf(col, a), y = valueOf(col, b);
        const cmp = typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  // back to page 1 when the search / page size changes – but not on the first render,
  // so a remembered page survives. With stateKey, a quiet data refresh doesn't reset the page
  // (it is only kept inside the last page); the parent's resetKey does.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setPage(1);
  }, [search, pageSize, stateKey ? resetKey : rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // remembered page beyond the end (fewer rows now) → last page
  useEffect(() => { if (rows.length > 0 && page > pages) setPage(pages); }, [page, pages, rows.length]);

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.includes(keyOf(r)));
  const togglePage = () => {
    const keys = pageRows.map(keyOf);
    setSelected(allOnPage ? selected.filter((k) => !keys.includes(k)) : [...new Set([...selected, ...keys])]);
  };
  const toggleOne = (k) => setSelected(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);

  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const exportCSV = () => {
    const cols = columns.filter((c) => c.csv !== false);
    downloadCSV(`${exportName || "export"}.csv`, cols.map((c) => c.label), filtered.map((r) => cols.map((c) => valueOf(c, r))));
  };

  const pageList = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - current) <= 1) pageList.push(n);
    else if (pageList[pageList.length - 1] !== "…") pageList.push("…");
  }

  const hasActions = onView || onEdit || onDelete || rowActions;
  const colCount = columns.length + (showChecks ? 1 : 0) + (hasActions ? 1 : 0);

  return (
    <section className="card table-card">
      {showToolbar && (
        <div className="table-head">
          <div className="table-head-left">
            {title && <h2 className="table-title">{title}</h2>}
            <label className="inline-label">
              Show
              <select className="input input-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </label>
          </div>
          <div className="table-head-right">
            {selected.length > 0 && onBulkDelete && (
              <div className="bulk">
                <span>{selected.length} selected</span>
                <button className="btn btn-sm btn-danger-soft" onClick={() => onBulkDelete(selected)}>
                  <Icon name="trash" size={15} /> Delete
                </button>
              </div>
            )}
            <button className="btn btn-sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Icon name="download" size={15} /> Export CSV
            </button>
            <label className="inline-label">
              Search:
              <input className="input input-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      {!showToolbar && selected.length > 0 && onBulkDelete && (
        <div className="bulk-bar">
          <span>{selected.length} selected</span>
          {onBulkDelete && (
            <button className="btn btn-sm btn-danger-soft" onClick={() => onBulkDelete(selected)}>
              <Icon name="trash" size={15} /> Delete selected
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <div
        className={`table-scroll ${bodyHeight ? "scroll-body" : ""}`}
        style={bodyHeight ? { maxHeight: bodyHeight } : undefined}
      >
        <table className="table">
          <thead>
            <tr>
              {showChecks && (
                <th className="col-check">
                  <input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select all on this page" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={c.align ? `ta-${c.align}` : ""}
                  aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sortable === false ? c.label : (
                    <button className="th-sort" onClick={() => sortBy(c.key)}>
                      {c.label}
                      <span className={`sort-arrow ${sort.key === c.key ? "on" : ""}`} aria-hidden="true">
                        {sort.key === c.key && sort.dir === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  )}
                </th>
              ))}
              {hasActions && <th className="ta-center">Action</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="empty">
                  <div>{search ? `Nothing matches “${search}”.` : emptyText}</div>
                  {(search || onClearFilters) && (
                    <button className="btn btn-sm" onClick={() => { setSearch(""); onClearFilters?.(); }}>
                      Clear search and filters
                    </button>
                  )}
                </td>
              </tr>
            )}
            {pageRows.map((r) => {
              const k = keyOf(r);
              return (
                <tr
                  key={k}
                  className={`${selected.includes(k) ? "selected" : ""} ${onRowClick ? "clickable" : ""}`}
                  onClick={onRowClick ? (e) => {
                    if (e.target.closest("input, button, a, label")) return; // ignore checkbox / menu clicks
                    onRowClick(r);
                  } : undefined}
                >
                  {showChecks && (
                    <td className="col-check">
                      <input type="checkbox" checked={selected.includes(k)} onChange={() => toggleOne(k)} aria-label={`Select ${k}`} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={c.align ? `ta-${c.align}` : ""}>
                      {c.render ? c.render(r) : valueOf(c, r)}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="ta-center">
                      <RowMenu
                        onView={onView && (() => onView(r))}
                        onEdit={onEdit && (() => onEdit(r))}
                        onDelete={onDelete && (() => onDelete(r))}
                        extra={rowActions ? rowActions(r) : []}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="table-foot">
        {!showToolbar && (
          <div className="foot-left">
            <label className="inline-label">
              Results:
              <select className="input input-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {[10, 15, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn btn-sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Icon name="download" size={15} /> Export CSV
            </button>
          </div>
        )}
        <span>
          Showing {filtered.length === 0 ? 0 : start + 1} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} entries
          {filtered.length !== rows.length && ` (filtered from ${rows.length})`}
        </span>
        <nav className="pager" aria-label="Pagination">
          <button onClick={() => setPage(current - 1)} disabled={current === 1}>Previous</button>
          {pageList.map((n, i) => n === "…" ? (
            <span key={`e${i}`} className="pager-gap">…</span>
          ) : (
            <button key={n} className={n === current ? "on" : ""} onClick={() => setPage(n)} aria-current={n === current ? "page" : undefined}>{n}</button>
          ))}
          <button onClick={() => setPage(current + 1)} disabled={current === pages}>Next</button>
        </nav>
      </div>
    </section>
  );
}