// Monitoring → Collection (old pages/Monitoring/Collection_Monitoring_PF_And_Return)
// Payments by payment date — PF / Return / EO. Paged on the server; every column has an Excel-style filter.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SearchSelect from "../../components/SearchSelect";
import { apiFetch } from "../../context/AuthContext";
import { exportCsv } from "../../utils/exportRows";
import "./CollectionMonitoring.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const back = new Date(d.getFullYear(), d.getMonth() - 2, 1);
const FROM = `${back.getFullYear()}-${pad(back.getMonth() + 1)}-01`;

// key = the server column key
const COLS = [
    { key: "client", label: "Client name", cls: "cmo-wide" },
    { key: "trade", label: "Trade name", cls: "cmo-wide" },
    { key: "date", label: "Payment date" },
    { key: "period", label: "Period" },
    { key: "amount", label: "Amount received", cls: "n" },
    { key: "col_type", label: "Col type", cls: "c" },
    { key: "service", label: "Service", cls: "c" },
    { key: "details", label: "Details", cls: "cmo-wide" },
    { key: "or_number", label: "OR#" },
    { key: "ar_number", label: "AR#" },
    { key: "remarks", label: "Remarks", cls: "cmo-wide" },
    { key: "deposited", label: "Deposited", cls: "c" },
    { key: "status", label: "Status", cls: "c" },
];

export default function CollectionMonitoring() {
    const [services, setServices] = useState([]);
    const [from, setFrom] = useState(FROM);
    const [to, setTo] = useState(TODAY);
    const [type, setType] = useState("All");
    const [serviceId, setServiceId] = useState("0");
    const [filters, setFilters] = useState({});       // { key: [values] }
    const [pg, setPg] = useState({ key: "", n: 1 });
    const [perPage, setPerPage] = useState(15);
    const [data, setData] = useState(null);           // { rows, total, sum, page, last_page }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [panel, setPanel] = useState(null);         // { key, anchor }
    const [exporting, setExporting] = useState(false);
    const reqId = useRef(0);

    useEffect(() => {
        apiFetch("/monitoring/collection/lookups").then((r) => setServices(r.services || [])).catch(() => { });
    }, []);

    const params = useCallback((extra = {}) => {
        const p = new URLSearchParams({ from, to, type, service_id: serviceId, ...extra });
        if (Object.keys(filters).length) p.set("filters", JSON.stringify(filters));
        return p;
    }, [from, to, type, serviceId, filters]);

    // the page belongs to the current filters: any change → page 1 (same render, no extra request)
    const listKey = JSON.stringify([from, to, type, serviceId, filters, perPage]);
    const page = pg.key === listKey ? pg.n : 1;
    const setPage = useCallback((n) => setPg({ key: listKey, n }), [listKey]);

    const load = useCallback(async () => {
        if (!from || !to) return;
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        try {
            const res = await apiFetch(`/monitoring/collection?${params({ page: String(page), per_page: String(perPage) })}`);
            if (id !== reqId.current) return;
            setData(res);
            if (res.page !== page) setPage(res.page);
        } catch (e) {
            if (id === reqId.current) { setError(e.message || "Couldn't load the collection monitoring."); setData(null); }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [params, page, perPage, from, to, setPage]);

    useEffect(() => { load(); }, [load]);

    const serviceOpts = useMemo(() => [{ value: "0", label: "All" }, ...services.map((s) => ({ value: String(s.id), label: s.name }))], [services]);
    const rows = data?.rows || [];
    const total = data?.total || 0;
    const pages = data?.last_page || 1;
    const start = total ? (page - 1) * perPage + 1 : 0;
    const activeFilters = Object.keys(filters).length;

    const applyFilter = (key, values) => {
        setFilters((f) => {
            const n = { ...f };
            if (values) n[key] = values; else delete n[key];
            return n;
        });
        setPanel(null);
    };
    const doExport = async () => {
        setExporting(true);
        setError("");
        try {
            const res = await apiFetch(`/monitoring/collection?${params({ export: "1" })}`);
            const columns = COLS.map((c) => ({ label: c.label, money: c.money, value: (r) => r[c.key] }));
            const totals = { client: `TOTAL (${res.total})`, amount: res.sum };
            exportCsv(`Collection-Monitoring-${type}-${from}-to-${to}`, columns, res.rows || [], totals);
        } catch (e) {
            setError(e.message || "Couldn't export the collection monitoring.");
        } finally {
            setExporting(false);
        }
    };
    return (
        <div className="cmo">
            <section className="card cmo-bar">
                <div className="cmo-title">
                    <h4>Collection Monitoring</h4>
                    <span>PF · Return · EO payments</span>
                </div>
                <label className="cmo-field">
                    <span className="field-label">From</span>
                    <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="cmo-field">
                    <span className="field-label">To</span>
                    <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </label>
                <label className="cmo-field">
                    <span className="field-label">Type</span>
                    <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                        {["All", "PF", "Return", "EO"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <div className="cmo-field cmo-service">
                    <span className="field-label">Service</span>
                    <SearchSelect value={serviceId} onChange={(v) => setServiceId(String(v || "0"))} options={serviceOpts} searchPlaceholder="Search service..." aria-label="Service" />
                </div>
                <div className="cmo-actions">
                    {activeFilters > 0 && <button type="button" className="btn" onClick={() => setFilters({})}>Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}</button>}
                    <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
                    <button type="button" className="btn" onClick={doExport} disabled={loading || exporting || !total}>{exporting ? "Exporting…" : "CSV"}</button>
                </div>
            </section>

            <section className="card cmo-body">
                {error && <div className="alert-error" role="alert">{error}</div>}
                <div className="cmo-scroll">
                    <table className="cmo-table">
                        <thead>
                            <tr>
                                <th className="c">#</th>
                                {COLS.map((c) => <th key={c.key} className={c.cls}>{c.label}</th>)}
                            </tr>
                            <tr className="cmo-filter-row">
                                <th />
                                {COLS.map((c) => {
                                    const on = filters[c.key];
                                    return (
                                        <th key={c.key}>
                                            <button type="button" className={`cmo-filter-btn${on ? " is-on" : ""}`}
                                                onClick={(e) => { const el = e.currentTarget; setPanel((p) => (p?.key === c.key ? null : { key: c.key, anchor: el })); }}
                                                aria-label={`Filter ${c.label}`}>
                                                <span>{on ? `${on.length} selected` : "All"}</span><span aria-hidden="true">▾</span>
                                            </button>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: Math.min(perPage, 12) }, (_, k) => (
                                <tr key={`sk${k}`} className="cmo-sk">
                                    {Array.from({ length: COLS.length + 1 }, (_, j) => <td key={j}><span className="sk" /></td>)}
                                </tr>
                            ))}
                            {!loading && !rows.length && <tr><td className="cmo-empty" colSpan={COLS.length + 1}>No record found.</td></tr>}
                            {!loading && rows.map((r) => (
                                <tr key={r.id}>
                                    <td className="c mono">{r.id}</td>
                                    {COLS.map((c) => {
                                        if (c.key === "amount") return <td key={c.key} className="n">{n2(r.amount)}</td>;
                                        if (c.key === "status") {
                                            return <td key={c.key} className="c">{r.status === "N/A" ? "N/A" : <span className={`cmo-badge ${r.status === "PAID" ? "is-paid" : "is-unpaid"}`}>{r.status}</span>}</td>;
                                        }
                                        const v = r[c.key] ?? "";
                                        return <td key={c.key} className={c.cls} title={c.cls === "cmo-wide" ? v : undefined}>{v || "—"}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th />
                                {COLS.map((c) => (
                                    <th key={c.key} className={c.cls}>
                                        {c.key === "client" ? "Total (all pages)" : c.key === "amount" ? (loading ? "" : n2(data?.sum)) : ""}
                                    </th>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <footer className="cmo-foot">
                    <span>{loading ? "Loading…" : `${start ? `${start}–${Math.min(start + perPage - 1, total)}` : 0} of ${total} payment(s)`}</span>
                    <Pager page={page} pages={pages} onPage={setPage} perPage={perPage} onPerPage={setPerPage} disabled={loading} />
                </footer>
            </section>

            {panel && (
                <FilterPanel key={panel.key} anchor={panel.anchor} url={`/monitoring/collection/values?${params({ col: panel.key })}`}
                    selected={filters[panel.key]} onClose={() => setPanel(null)} onApply={(v) => applyFilter(panel.key, v)} />
            )}
        </div>
    );
}

/* 1 … 4 5 [6] 7 8 … 20 */
function Pager({ page, pages, onPage, perPage, onPerPage, disabled }) {
    const nums = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
        else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return (
        <nav className="cmo-pager" aria-label="Pagination">
            <label className="cmo-per">
                Rows
                <select className="input" value={perPage} onChange={(e) => onPerPage(Number(e.target.value))} aria-label="Rows per page">
                    {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
            </label>
            <button type="button" className="cmo-pg" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} aria-label="Previous page">‹</button>
            {nums.map((n, i) => n === "…"
                ? <span key={`g${i}`} className="cmo-pg-gap">…</span>
                : <button type="button" key={n} className={`cmo-pg${n === page ? " is-on" : ""}`} disabled={disabled} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>{n}</button>)}
            <button type="button" className="cmo-pg" onClick={() => onPage(page + 1)} disabled={disabled || page >= pages} aria-label="Next page">›</button>
        </nav>
    );
}

/* Excel-style filter: the column's values come from the server (all pages, other filters applied) */
function FilterPanel({ anchor, url, selected, onClose, onApply }) {
    const [values, setValues] = useState(null);
    const [checked, setChecked] = useState(new Set());
    const [term, setTerm] = useState("");
    const [pos, setPos] = useState(null);
    const panel = useRef(null);

    useEffect(() => {
        let alive = true;
        apiFetch(url).then((r) => {
            if (!alive) return;
            setValues(r.values);
            setChecked(new Set(selected ? selected.filter((v) => r.values.includes(v)) : r.values));
        }).catch(() => alive && setValues([]));
        return () => { alive = false; };
    }, [url, selected]);

    useLayoutEffect(() => {
        const place = () => {
            const r = anchor.getBoundingClientRect();
            const w = 260;
            const h = panel.current?.offsetHeight || 340;
            const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
            let top = r.bottom + 4;
            if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
            setPos({ left, top, width: w });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
    }, [anchor, values]);

    useEffect(() => {
        const down = (e) => { if (!panel.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
        const key = (e) => e.key === "Escape" && onClose();
        document.addEventListener("mousedown", down);
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
    }, [anchor, onClose]);

    const list = values || [];
    const shown = list.filter((v) => v.toLowerCase().includes(term.trim().toLowerCase()));
    const flip = (v) => setChecked((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
    const setShown = (on) => setChecked((s) => { const n = new Set(s); shown.forEach((v) => (on ? n.add(v) : n.delete(v))); return n; });
    const apply = () => onApply(checked.size === list.length ? null : [...checked]);

    return createPortal(
        <div className="cmo-filter-panel" ref={panel} role="dialog" aria-label="Column filter" style={pos || { visibility: "hidden" }}>
            <input className="input" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search..." />
            <div className="cmo-filter-links">
                <button type="button" onClick={() => setShown(true)}>Select all</button>
                <button type="button" onClick={() => setShown(false)}>Clear</button>
            </div>
            <div className="cmo-filter-list">
                {!values && <p className="cmo-filter-none">Loading…</p>}
                {values && shown.length === 0 && <p className="cmo-filter-none">No values</p>}
                {shown.map((v) => (
                    <label key={v}><input type="checkbox" checked={checked.has(v)} onChange={() => flip(v)} /> <span>{v || "(blank)"}</span></label>
                ))}
            </div>
            <div className="cmo-filter-foot">
                <button type="button" className="btn btn-sm" onClick={() => onApply(null)}>Clear filter</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={apply} disabled={!values || checked.size === 0}>Apply</button>
            </div>
        </div>,
        document.body,
    );
}