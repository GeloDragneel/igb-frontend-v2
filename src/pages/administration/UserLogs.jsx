// Administration → User Logs
// Every INSERT / UPDATE / DELETE done by a staff login (recorded by the LogStaffActivity middleware).
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./UserLogs.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const stamp = (s) => (s ? `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}` : "");
const clock = (s) => {
    if (!s) return "";
    const h = +s.slice(11, 13);
    return `${((h + 11) % 12) + 1}:${s.slice(14, 16)}:${s.slice(17, 19)} ${h < 12 ? "AM" : "PM"}`;
};
const ACTIONS = [{ value: "", label: "All" }, { value: "INSERT", label: "Insert" }, { value: "UPDATE", label: "Update" }, { value: "DELETE", label: "Delete" }];
const show = (v) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));
/* 1 … 4 5 [6] 7 8 … 20 */
const pageNums = (page, pages) => {
    const out = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i);
        else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
};

export default function UserLogs() {
    const notify = useToast();
    const [f, setF] = useState({ from: daysAgo(6), to: today(), user_id: "", action: "", table: "" });
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");                 // search, applied after typing stops
    const [page, setPage] = useState(1);
    const [per, setPer] = useState(50);
    const [data, setData] = useState({ rows: [], total: 0 });
    const [lookups, setLookups] = useState({ staff: [], tables: [] });
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState(null);         // { id, data, loading, error }
    const [showSql, setShowSql] = useState(false);

    useEffect(() => {
        apiFetch("/admin/user-logs/lookups")
            .then((d) => setLookups({ staff: d.staff || [], tables: d.tables || [] }))
            .catch((e) => notify(`Employee / table lists: ${e.message || "couldn't load"}`, "error"));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once
    // new filter / search / rows-per-page → back to page 1 in the same render (one request, not two)
    useEffect(() => {
        const t = setTimeout(() => { const v = search.trim(); if (v !== q) { setQ(v); setPage(1); } }, 400);
        return () => clearTimeout(t);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const load = useCallback(async () => {
        if (!f.from || !f.to) return;
        setLoading(true);
        try {
            const p = new URLSearchParams({ from: f.from, to: f.to, page, per });
            ["user_id", "action", "table"].forEach((k) => f[k] && p.set(k, f[k]));
            if (q) p.set("q", q);
            setData(await apiFetch(`/admin/user-logs?${p}`));
        } catch (e) {
            notify(e.message || "Couldn't load the logs.", "error");
        } finally {
            setLoading(false);
        }
    }, [f, q, page, per]); // eslint-disable-line react-hooks/exhaustive-deps -- notify may change every render
    useEffect(() => { load(); }, [load]);

    const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setPage(1); };
    const pick = (k, v) => { setF((s) => ({ ...s, [k]: v ?? "" })); setPage(1); };
    const staffOpts = useMemo(() => [{ value: "", label: "All employees" },
    ...lookups.staff.map((s) => ({ value: String(s.id), label: s.name || s.username || `#${s.id}`, hint: s.name ? s.username : "" }))], [lookups.staff]);
    const tableOpts = useMemo(() => [{ value: "", label: "All tables" }, ...lookups.tables.map((t) => ({ value: t, label: t }))], [lookups.tables]);
    const pages = Math.max(1, Math.ceil(data.total / per));

    const open = async (id) => {
        setShowSql(false);
        setView({ id, data: null, loading: true });
        try {
            const d = await apiFetch(`/admin/user-logs/${id}`);
            setView((v) => (v && v.id === id ? { ...v, data: d, loading: false } : v));
        } catch (e) {
            setView((v) => v && { ...v, loading: false, error: e.message || "Couldn't load the log." });
        }
    };
    const close = useCallback(() => setView(null), []);
    const log = view?.data?.log;
    const changeRows = log && log.changes ? (Array.isArray(log.changes) ? log.changes : [log.changes]) : [];
    const changeCols = changeRows.length ? Object.keys(changeRows[0]) : [];

    return (
        <div className="ul">
            <section className="card ul-bar">
                <label className="ul-field">From<input type="date" className="input" value={f.from} max={f.to} onChange={set("from")} /></label>
                <label className="ul-field">To<input type="date" className="input" value={f.to} min={f.from} onChange={set("to")} /></label>
                <div className="ul-field ul-ss">Employee
                    <SearchSelect value={f.user_id} onChange={(v) => pick("user_id", v)} options={staffOpts}
                        placeholder="All employees" searchPlaceholder="Search employee…" aria-label="Employee" />
                </div>
                <div className="ul-field ul-ss is-small">Action
                    <SearchSelect value={f.action} onChange={(v) => pick("action", v)} options={ACTIONS}
                        placeholder="All" searchPlaceholder="Search…" aria-label="Action" />
                </div>
                <div className="ul-field ul-ss">Table
                    <SearchSelect value={f.table} onChange={(v) => pick("table", v)} options={tableOpts}
                        placeholder="All tables" searchPlaceholder="Search table…" aria-label="Table" />
                </div>
                <label className="ul-field ul-grow">Search
                    <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Record ID, page, invoice no, value…" />
                </label>
                <button type="button" className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            </section>

            <section className="card ul-body">
                <div className="ul-scroll">
                    <table className="ul-table">
                        <thead>
                            <tr><th aria-label="View" /><th>Date &amp; Time</th><th>Employee</th><th>Action</th><th>Table</th><th>Record ID</th><th>Page</th><th>IP</th></tr>
                        </thead>
                        <tbody>
                            {data.rows.map((r) => (
                                <tr key={r.id} onDoubleClick={() => open(r.id)}>
                                    <td>
                                        <button type="button" className="ul-view" onClick={() => open(r.id)} aria-label={`View log ${r.id}`} title="View">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </button>
                                    </td>
                                    <td><div className="ul-two"><b>{stamp(r.created_at)}</b><small>{clock(r.created_at)}</small></div></td>
                                    <td><div className="ul-two"><b>{r.employee_name || r.username || `#${r.user_staff_id}`}</b>{r.employee_name && <small>{r.username}</small>}</div></td>
                                    <td><span className={`ul-act is-${(r.action || "").toLowerCase()}`}>{r.action}</span></td>
                                    <td className="ul-mono">{r.table_name}</td>
                                    <td className="ul-mono">{r.record_id || "—"}</td>
                                    <td><div className="ul-two"><b>{r.route_action || "—"}</b><small>{r.method} /{r.path}</small></div></td>
                                    <td className="ul-mono">{r.ip}</td>
                                </tr>
                            ))}
                            {!data.rows.length && (
                                <tr><td colSpan={8} className="ul-empty">{loading ? "Loading…" : "No activity for these filters."}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <footer className="ul-pager">
                    <span className="ul-muted">{data.total ? `${(page - 1) * per + 1}–${Math.min(data.total, page * per)} of ${data.total.toLocaleString()}` : "0"} record(s)</span>
                    <nav className="ul-pager-nav" aria-label="Pagination">
                        <label className="ul-pager-per">
                            Rows
                            <select className="input" value={per} onChange={(e) => { setPer(+e.target.value); setPage(1); }} aria-label="Rows per page">
                                {[15, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <button type="button" className="ul-pg" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
                        {pageNums(page, pages).map((n, i) => (n === "…"
                            ? <span key={`g${i}`} className="ul-pg-gap">…</span>
                            : <button type="button" key={n} className={`ul-pg${n === page ? " is-on" : ""}`} onClick={() => setPage(n)}
                                aria-current={n === page ? "page" : undefined}>{n}</button>))}
                        <button type="button" className="ul-pg" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Next page">›</button>
                    </nav>
                </footer>
            </section>

            {view && (
                <Modal size="lg" onClose={close} title={log ? `${log.action} · ${log.table_name}` : "User log"}
                    footer={<div className="ul-foot"><button type="button" className="btn" onClick={close}>Close</button></div>}>
                    {view.error && <div className="alert-error" role="alert">{view.error}</div>}
                    {view.loading && <div className="ul-empty">Loading…</div>}
                    {log && (
                        <div className="ul-pop">
                            <dl className="ul-meta">
                                <div><dt>Employee</dt><dd>{log.employee_name || "—"} <small>{log.username}</small></dd></div>
                                <div><dt>Date &amp; Time</dt><dd>{stamp(log.created_at)} {clock(log.created_at)}</dd></div>
                                <div><dt>Action</dt><dd><span className={`ul-act is-${log.action.toLowerCase()}`}>{log.action}</span></dd></div>
                                <div><dt>Table</dt><dd className="ul-mono">{log.table_name}</dd></div>
                                <div><dt>Record ID</dt><dd className="ul-mono">{log.record_id || "—"}</dd></div>
                                <div><dt>Page</dt><dd>{log.route_action || "—"} <small>{log.method} /{log.path}</small></dd></div>
                                <div><dt>IP</dt><dd className="ul-mono">{log.ip}</dd></div>
                                <div className="is-wide"><dt>Browser</dt><dd className="ul-small">{log.user_agent || "—"}</dd></div>
                            </dl>

                            {log.where_clause && (
                                <section className="ul-sec">
                                    <h4>{log.action === "DELETE" ? "Deleted rows where" : "Changed rows where"}</h4>
                                    <code className="ul-code">{log.where_clause}</code>
                                </section>
                            )}

                            {changeRows.length > 0 && (
                                <section className="ul-sec">
                                    <h4>{log.action === "INSERT" ? `Values saved${changeRows.length > 1 ? ` (${changeRows.length} rows)` : ""}` : "New values"}</h4>
                                    {changeRows.length === 1 ? (
                                        <div className="ul-kv">
                                            <table>
                                                <thead><tr><th>Column</th><th>Value</th></tr></thead>
                                                <tbody>{changeCols.map((c) => <tr key={c}><td className="ul-mono">{c}</td><td>{show(changeRows[0][c])}</td></tr>)}</tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="ul-kv is-wide">
                                            <table>
                                                <thead><tr><th>#</th>{changeCols.map((c) => <th key={c} className="ul-mono">{c}</th>)}</tr></thead>
                                                <tbody>{changeRows.map((row, i) => <tr key={i}><td>{i + 1}</td>{changeCols.map((c) => <td key={c}>{show(row[c])}</td>)}</tr>)}</tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            )}

                            {view.data.same_request.length > 0 && (
                                <section className="ul-sec">
                                    <h4>Same click also did ({view.data.same_request.length})</h4>
                                    <ul className="ul-same">
                                        {view.data.same_request.map((s) => (
                                            <li key={s.id}>
                                                <button type="button" onClick={() => open(s.id)}>
                                                    <span className={`ul-act is-${s.action.toLowerCase()}`}>{s.action}</span>
                                                    <span className="ul-mono">{s.table_name}</span>
                                                    {s.record_id && <small>#{s.record_id}</small>}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {log.sql_text && (
                                <section className="ul-sec">
                                    <button type="button" className="ul-link" onClick={() => setShowSql(!showSql)}>{showSql ? "Hide SQL" : "Show SQL"}</button>
                                    {showSql && <code className="ul-code">{log.sql_text}</code>}
                                </section>
                            )}
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
}