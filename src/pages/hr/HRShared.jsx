// Shared pieces for the HR + Lending pages (HRManagmentController)
import { useEffect, useMemo, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { apiFetch } from "../../context/AuthContext";
import "./HR.css";

export const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const n0 = (v) => (Number(v) || 0).toLocaleString("en-PH");
export const pct = (rate, digits = 2) => `${((Number(rate) || 0) * 100).toFixed(digits).replace(/\.?0+$/, "")}%`;

// Philippine date / time
const TZ = "Asia/Manila";
export const todayPH = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const fmtDate = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const fmtTime = (v) => (v ? new Date(String(v).replace(" ", "T")).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ }) : "—");
export const fmtDateTime = (v) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : "—");
export const mins = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : "—");

export const api = {
  get: (url) => apiFetch(url),
  post: (url, body) => apiFetch(url, { method: "POST", body: JSON.stringify(body || {}) }),
  put: (url, body) => apiFetch(url, { method: "PUT", body: JSON.stringify(body || {}) }),
  del: (url) => apiFetch(url, { method: "DELETE" }),
};

/** form state + a setter for one field: const [f, set] = useForm({...}); set("name")(e) or set("name", value) */
export function useForm(initial) {
  const [f, setF] = useState(initial);
  const set = (key, value) => {
    if (value !== undefined) return setF((p) => ({ ...p, [key]: value }));
    return (e) => {
      const t = e?.target;
      const v = t ? (t.type === "checkbox" ? t.checked : t.value) : e;
      setF((p) => ({ ...p, [key]: v }));
    };
  };
  return [f, set, setF];
}

/* ---------- employees (loaded once, kept for the session) ---------- */
let employeesCache = null;
export function useEmployees() {
  const [list, setList] = useState(employeesCache || []);
  const [error, setError] = useState("");
  useEffect(() => {
    if (employeesCache) return;
    api.get("/hr/employees")
      .then((r) => { employeesCache = r; setList(r); })
      .catch((e) => setError(e.message || "Couldn't load the employees (GET /hr/employees)."));
  }, []);
  return { list, error };
}

export function EmployeeSelect({ value, onChange, allowAll = false, placeholder = "Search employee..." }) {
  const { list, error } = useEmployees();
  const options = [...(allowAll ? [{ value: "", label: "All employees" }] : []), ...list.map((e) => ({ value: String(e.id), label: e.name }))];
  return (
    <>
      <SearchSelect value={value ? String(value) : ""} onChange={(v) => onChange(v ? String(v) : "")} options={options} searchPlaceholder={placeholder} aria-label="Employee" />
      {error && <small className="hr-error">{error}</small>}
    </>
  );
}

/* ---------- layout ---------- */
export function PageHead({ title, sub, children }) {
  return (
    <section className="card hr-head">
      <div className="hr-title">
        <h4>{title}</h4>
        {sub && <span>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <nav className="card hr-tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "is-on" : ""} onClick={() => onChange(k)}>{label}</button>
      ))}
    </nav>
  );
}

export function Field({ label, children, wide = false, hint }) {
  return (
    <label className={`hr-field${wide ? " is-wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="hr-hint">{hint}</small>}
    </label>
  );
}

export function Badge({ status }) {
  return <span className={`hr-badge is-${status || "none"}`}>{String(status || "—").replace(/_/g, " ")}</span>;
}

export function Stat({ label, value, sub, tone = "" }) {
  return (
    <div className={`card hr-stat ${tone}`}>
      <small>{label}</small>
      <b>{value}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

/**
 * cols: [{ key, label, cls?, money?, render?(row) }] · totals: keys to sum in the footer
 */
export function DataTable({ cols, rows, loading = false, empty = "No record found.", rowKey = "id", totals = [], onRow }) {
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return (
    <div className="hr-scroll">
      <table className="hr-table">
        <thead>
          <tr>{cols.map((c) => <th key={c.key} className={c.cls}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {loading && <tr><td className="hr-empty" colSpan={cols.length}>Loading…</td></tr>}
          {!loading && !rows.length && <tr><td className="hr-empty" colSpan={cols.length}>{empty}</td></tr>}
          {!loading && rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} className={onRow ? "is-click" : ""} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => <td key={c.key} className={c.cls}>{c.render ? c.render(r) : c.money ? n2(r[c.key]) : (r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
        {totals.length > 0 && rows.length > 0 && (
          <tfoot>
            <tr>{cols.map((c, i) => <th key={c.key} className={c.cls}>{i === 0 ? `Total (${rows.length})` : totals.includes(c.key) ? n2(sum(c.key)) : ""}</th>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ---------- pagination (client side) ---------- */
/** const { page, setPage, perPage, setPerPage, pageRows, pages, from } = usePaged(rows, resetKey) */
export function usePaged(rows, resetKey = "", initialPerPage = 25) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  useEffect(() => { setPage(1); }, [resetKey, perPage]);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages);
  const pageRows = useMemo(() => rows.slice((current - 1) * perPage, current * perPage), [rows, current, perPage]);
  return { page: current, setPage, perPage, setPerPage, pageRows, pages, from: (current - 1) * perPage, total: rows.length };
}

/* 1 … 4 5 [6] 7 8 … 20 */
export function Pager({ page, pages, setPage, perPage, setPerPage, from, total, label = "record(s)" }) {
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <footer className="hr-pager">
      <span className="hr-muted">{total ? `${from + 1}–${Math.min(from + perPage, total)} of ${total}` : "0"} {label}</span>
      <nav className="hr-pager-nav" aria-label="Pagination">
        <label className="hr-pager-per">
          Rows
          <select className="input" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} aria-label="Rows per page">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" className="hr-pg" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
        {nums.map((n, i) => (n === "…"
          ? <span key={`g${i}`} className="hr-pg-gap">…</span>
          : <button type="button" key={n} className={`hr-pg${n === page ? " is-on" : ""}`} onClick={() => setPage(n)} aria-current={n === page ? "page" : undefined}>{n}</button>))}
        <button type="button" className="hr-pg" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Next page">›</button>
      </nav>
    </footer>
  );
}