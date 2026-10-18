// Monitoring → Retainers Fee Monthly Monitoring (old pages/Monitoring/Retainers_Fee_Monthly_Monitoring)
// BILLED: every PF / Return / EO service billed in the period range, with the forwarding balance, collections and balance.
// NON-BILLED: accounts with a recurring PF that have no PF bill for a month.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "../../context/AuthContext";
import { exportCsv } from "../../utils/exportRows";
import "./CollectionMonitoring.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTH_LABEL = { PF: "Monthly PF", Return: "Return", EO: "EO" };

const BILLED_COLS = [
    { key: "client_name", label: "Tax payer name / Corp. name", cls: "cmo-wide" },
    { key: "trade_name", label: "Trade name", cls: "cmo-wide" },
    { key: "forwarding", label: "For. balance", cls: "n", money: true },
    { key: "period", label: "Period", cls: "c" },
    { key: "monthly", label: "Monthly PF", cls: "n", money: true },
    { key: "total", label: "Total", cls: "n", money: true },
    { key: "collected", label: "Coll. amount", cls: "n", money: true },
    { key: "collected_date", label: "Coll. date", cls: "c" },
    { key: "balance", label: "Balance", cls: "n", money: true },
    { key: "trans_number", label: "PF/EO/Return #" },
    { key: "status", label: "Status", cls: "c" },
    { key: "mode", label: "Mode", cls: "c" },
    { key: "service", label: "Service", cls: "c" },
    { key: "date_billed", label: "Date billed", cls: "c" },
];
const NB_COLS = [
    { key: "client_name", label: "Tax payer name / Corp. name", cls: "cmo-wide" },
    { key: "trade_name", label: "Trade name", cls: "cmo-wide" },
    { key: "forwarding", label: "For. balance", cls: "n", money: true },
    { key: "period", label: "Period" },
    { key: "monthly", label: "Monthly PF", cls: "n", money: true },
    { key: "total", label: "Total", cls: "n", money: true },
];
const SUMS = ["forwarding", "monthly", "total", "collected", "balance"];
const cellText = (r, c) => (c.money ? n2(r[c.key]) : String(r[c.key] ?? ""));

export default function RetainersFee() {
    const [tab, setTab] = useState("billed");
    const [lk, setLk] = useState(null); // { months, eo, current, current_eo }

    useEffect(() => {
        apiFetch("/monitoring/retainers-fee/lookups").then(setLk).catch(() => setLk({ months: [], eo: [], current: "", current_eo: "" }));
    }, []);

    return (
        <div className="cmo">
            <section className="card cmo-tabs" role="tablist" aria-label="Retainers fee">
                {[["billed", "Billed"], ["non", "Non-billed"]].map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{l}</button>
                ))}
            </section>
            {lk && (tab === "billed" ? <Billed lk={lk} /> : <NonBilled lk={lk} />)}
        </div>
    );
}

/* ---------------- BILLED ---------------- */
function Billed({ lk }) {
    const [type, setType] = useState("PF");
    const [from, setFrom] = useState(lk.current);
    const [to, setTo] = useState(lk.current);
    const [eoFrom, setEoFrom] = useState(lk.current_eo);
    const [eoTo, setEoTo] = useState(lk.current_eo);
    const [sort, setSort] = useState("latest");
    const [order, setOrder] = useState("desc");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [open, setOpen] = useState({}); // row id → forwarding detail rows | "loading"
    const reqId = useRef(0);
    const exportRef = useRef(null);

    const eo = type === "EO";
    const pFrom = eo ? eoFrom : from;
    const pTo = eo ? eoTo : to;

    const load = useCallback(async () => {
        if (!pFrom || !pTo) return;
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        setOpen({});
        try {
            const p = new URLSearchParams({ type, from: pFrom, to: pTo, sort, order });
            const res = await apiFetch(`/monitoring/retainers-fee?${p}`);
            if (id === reqId.current) setData(res);
        } catch (e) {
            if (id === reqId.current) { setError(e.message || "Couldn't load the retainers fee monitoring."); setData(null); }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [type, pFrom, pTo, sort, order]);

    useEffect(() => { load(); }, [load]);

    const cols = useMemo(() => BILLED_COLS.map((c) => (c.key === "monthly" ? { ...c, label: MONTH_LABEL[type] } : c)), [type]);

    const toggle = async (r) => {
        if (open[r.id]) { setOpen((o) => { const n = { ...o }; delete n[r.id]; return n; }); return; }
        setOpen((o) => ({ ...o, [r.id]: "loading" }));
        try {
            const p = new URLSearchParams({ ca_id: r.ca_id, type: data.type, before: data.from });
            const res = await apiFetch(`/monitoring/retainers-fee/forwarding?${p}`);
            setOpen((o) => ({ ...o, [r.id]: res.rows }));
        } catch {
            setOpen((o) => { const n = { ...o }; delete n[r.id]; return n; });
        }
    };

    const periodOpts = eo ? lk.eo : lk.months;
    return (
        <>
            <section className="card cmo-bar">
                <div className="cmo-title">
                    <h4>Retainers Fee Monitoring · Billed</h4>
                    <span>Forwarding balance = unpaid {type} bills before {pFrom || "the range"}</span>
                </div>
                <label className="cmo-field">
                    <span className="field-label">Type</span>
                    <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                        {["PF", "Return", "EO"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <label className="cmo-field">
                    <span className="field-label">From</span>
                    <select className="input" value={pFrom} onChange={(e) => (eo ? setEoFrom : setFrom)(e.target.value)}>
                        {periodOpts.map((p) => <option key={p} value={p}>{eo ? p.replace("EO-", "") : p}</option>)}
                    </select>
                </label>
                <label className="cmo-field">
                    <span className="field-label">To</span>
                    <select className="input" value={pTo} onChange={(e) => (eo ? setEoTo : setTo)(e.target.value)}>
                        {periodOpts.map((p) => <option key={p} value={p}>{eo ? p.replace("EO-", "") : p}</option>)}
                    </select>
                </label>
                <label className="cmo-field">
                    <span className="field-label">Sort by</span>
                    <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="latest">Latest entry</option>
                        <option value="client">Client name</option>
                    </select>
                </label>
                <label className="cmo-field">
                    <span className="field-label">Order</span>
                    <select className="input" value={order} onChange={(e) => setOrder(e.target.value)}>
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                    </select>
                </label>
                <div className="cmo-actions">
                    <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
                    <button type="button" className="btn" onClick={() => exportRef.current?.()} disabled={loading || !data?.rows?.length}>CSV</button>
                </div>
            </section>

            <Grid cols={cols} rows={data?.rows || []} loading={loading} error={error} expandable
                exportRef={exportRef}
                fileName={`Retainers-Fee-Billed-${type}-${pFrom}-to-${pTo}`}
                renderExpand={(r) => (open[r.id] ? <ForwardingDetail rows={open[r.id]} /> : null)}
                isOpen={(r) => !!open[r.id]} onToggle={toggle} />
        </>
    );
}

function ForwardingDetail({ rows }) {
    if (rows === "loading") return <div className="rf-detail-empty">Loading…</div>;
    if (!rows.length) return <div className="rf-detail-empty">No unpaid bills.</div>;
    return (
        <table className="rf-detail">
            <thead>
                <tr><th>#</th><th>Service</th><th>Period</th><th>SOA #</th><th className="n">Amount</th><th className="n">Paid</th><th className="n">Balance</th></tr>
            </thead>
            <tbody>
                {rows.map((x, i) => (
                    <tr key={x.id}>
                        <td>{i + 1}</td><td>{x.service}</td><td>{x.period}</td><td className="mono">{x.trans_number}</td>
                        <td className="n">{n2(x.amount)}</td><td className="n">{n2(x.paid)}</td><td className="n strong">{n2(x.balance)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/* ---------------- NON-BILLED ---------------- */
function NonBilled({ lk }) {
    const [from, setFrom] = useState(lk.current);
    const [to, setTo] = useState(lk.current);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const reqId = useRef(0);
    const exportRef = useRef(null);

    const load = useCallback(async () => {
        if (!from || !to) return;
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        try {
            const res = await apiFetch(`/monitoring/retainers-fee/non-billed?${new URLSearchParams({ from, to })}`);
            if (id === reqId.current) setData(res);
        } catch (e) {
            if (id === reqId.current) { setError(e.message || "Couldn't load the non-billed clients."); setData(null); }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [from, to]);

    useEffect(() => { load(); }, [load]);

    return (
        <>
            <section className="card cmo-bar">
                <div className="cmo-title">
                    <h4>Retainers Fee Monitoring · Non-billed</h4>
                    <span>Recurring PF accounts without a PF bill for the month</span>
                </div>
                <label className="cmo-field">
                    <span className="field-label">From</span>
                    <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                        {lk.months.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>
                <label className="cmo-field">
                    <span className="field-label">To</span>
                    <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                        {lk.months.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>
                <div className="cmo-actions">
                    <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
                    <button type="button" className="btn" onClick={() => exportRef.current?.()} disabled={loading || !data?.rows?.length}>CSV</button>
                </div>
            </section>
            <Grid cols={NB_COLS} rows={(data?.rows || []).map((r, i) => ({ ...r, id: `${r.ca_id}-${r.period}-${i}` }))} loading={loading} error={error}
                exportRef={exportRef}
                fileName={`Retainers-Fee-Non-Billed-${from}-to-${to}`} />
        </>
    );
}

/* ---------------- shared grid: Excel-style column filters, paging, totals of the filtered rows ---------------- */
function Grid({ cols, rows, loading, error, fileName, exportRef, expandable = false, renderExpand, isOpen, onToggle }) {
    const [filters, setFilters] = useState({}); // key → Set of shown values
    const [panel, setPanel] = useState(null);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(50);

    useEffect(() => { setFilters({}); }, [rows]);
    useEffect(() => { setPage(1); }, [rows, filters, perPage]);

    const filtered = useMemo(() => rows.filter((r) => Object.entries(filters).every(([k, set]) => {
        const c = cols.find((x) => x.key === k);
        return !c || set.has(cellText(r, c));
    })), [rows, filters, cols]);

    const totals = useMemo(() => {
        const t = {};
        SUMS.forEach((k) => { t[k] = filtered.reduce((s, r) => s + (Number(r[k]) || 0), 0); });
        return t;
    }, [filtered]);

    const doExport = () => {
        const columns = cols.map((c) => ({ label: c.label, money: c.money, value: (r) => r[c.key] }));
        const t = { client_name: `TOTAL (${filtered.length})` };
        cols.forEach((c) => { if (SUMS.includes(c.key)) t[c.key] = totals[c.key]; });
        exportCsv(fileName, columns, filtered, t);
    };

    useEffect(() => { if (exportRef) exportRef.current = doExport; });

    const pages = Math.max(1, Math.ceil(filtered.length / perPage));
    const shown = filtered.slice((page - 1) * perPage, page * perPage);
    const start = filtered.length ? (page - 1) * perPage + 1 : 0;
    const width = cols.length + 1 + (expandable ? 1 : 0);

    const valuesFor = (c) => {
        // values left by the OTHER filters (like Excel)
        const others = rows.filter((r) => Object.entries(filters).every(([k, set]) => {
            if (k === c.key) return true;
            const oc = cols.find((x) => x.key === k);
            return !oc || set.has(cellText(r, oc));
        }));
        return [...new Set(others.map((r) => cellText(r, c)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    };

    return (
        <section className="card cmo-body">
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="cmo-scroll">
                <table className="cmo-table">
                    <thead>
                        <tr>
                            {expandable && <th className="rf-x" />}
                            <th className="c">#</th>
                            {cols.map((c) => <th key={c.key} className={c.cls}>{c.label}</th>)}
                        </tr>
                        <tr className="cmo-filter-row">
                            {expandable && <th />}
                            <th />
                            {cols.map((c) => {
                                const on = filters[c.key];
                                return (
                                    <th key={c.key}>
                                        <button type="button" className={`cmo-filter-btn${on ? " is-on" : ""}`}
                                            onClick={(e) => { const el = e.currentTarget; setPanel((p) => (p?.key === c.key ? null : { key: c.key, col: c, anchor: el })); }}
                                            aria-label={`Filter ${c.label}`}>
                                            <span>{on ? `${on.size} selected` : "All"}</span><span aria-hidden="true">▾</span>
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && Array.from({ length: 12 }, (_, k) => (
                            <tr key={`sk${k}`} className="cmo-sk">{Array.from({ length: width }, (_, j) => <td key={j}><span className="sk" /></td>)}</tr>
                        ))}
                        {!loading && !filtered.length && <tr><td className="cmo-empty" colSpan={width}>No record found.</td></tr>}
                        {!loading && shown.map((r, i) => {
                            const canOpen = expandable && r.has_forwarding && r.forwarding > 0;
                            return (
                                <Fragment key={r.id}>
                                    <tr className={r.period === "Forwarded only" ? "rf-fwd-only" : ""}>
                                        {expandable && (
                                            <td className="rf-x">
                                                {canOpen && (
                                                    <button type="button" className={`rf-expand${isOpen(r) ? " is-open" : ""}`} onClick={() => onToggle(r)}
                                                        aria-label={isOpen(r) ? "Hide forwarded bills" : "Show forwarded bills"}>▸</button>
                                                )}
                                            </td>
                                        )}
                                        <td className="c">{start + i}</td>
                                        {cols.map((c) => {
                                            if (c.key === "status" && r.status !== "N/A") {
                                                return <td key={c.key} className="c"><span className={`cmo-badge ${r.status === "Paid" ? "is-paid" : "is-unpaid"}`}>{r.status}</span></td>;
                                            }
                                            const v = cellText(r, c);
                                            return <td key={c.key} className={c.cls} title={c.cls === "cmo-wide" ? v : undefined}>{v || "—"}</td>;
                                        })}
                                    </tr>
                                    {expandable && isOpen(r) && (
                                        <tr className="rf-detail-row"><td colSpan={width}>{renderExpand(r)}</td></tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr>
                            {expandable && <th />}
                            <th />
                            {cols.map((c) => (
                                <th key={c.key} className={c.cls}>
                                    {c.key === "client_name" ? `Total (${filtered.length})` : SUMS.includes(c.key) && !loading ? n2(totals[c.key]) : ""}
                                </th>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>
            <footer className="cmo-foot">
                <span>{loading ? "Loading…" : `${start ? `${start}–${Math.min(start + perPage - 1, filtered.length)}` : 0} of ${filtered.length}${filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ""}`}</span>
                {Object.keys(filters).length > 0 && <button type="button" className="btn btn-sm" onClick={() => setFilters({})}>Clear filters</button>}
                <Pager page={page} pages={pages} onPage={setPage} perPage={perPage} onPerPage={setPerPage} disabled={loading} />
            </footer>

            {panel && (
                <FilterPanel key={panel.key} anchor={panel.anchor} values={valuesFor(panel.col)} selected={filters[panel.key]}
                    onClose={() => setPanel(null)}
                    onApply={(set) => {
                        setFilters((f) => { const n = { ...f }; if (set) n[panel.key] = set; else delete n[panel.key]; return n; });
                        setPanel(null);
                    }} />
            )}
        </section>
    );
}

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

function FilterPanel({ anchor, values, selected, onClose, onApply }) {
    const [term, setTerm] = useState("");
    const [checked, setChecked] = useState(() => new Set(selected ? values.filter((v) => selected.has(v)) : values));
    const [pos, setPos] = useState(null);
    const panel = useRef(null);

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
    }, [anchor]);

    useEffect(() => {
        const down = (e) => { if (!panel.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
        const key = (e) => e.key === "Escape" && onClose();
        document.addEventListener("mousedown", down);
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
    }, [anchor, onClose]);

    const shown = values.filter((v) => v.toLowerCase().includes(term.trim().toLowerCase()));
    const flip = (v) => setChecked((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
    const setShown = (on) => setChecked((s) => { const n = new Set(s); shown.forEach((v) => (on ? n.add(v) : n.delete(v))); return n; });

    return createPortal(
        <div className="cmo-filter-panel" ref={panel} role="dialog" aria-label="Column filter" style={pos || { visibility: "hidden" }}>
            <input className="input" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search..." />
            <div className="cmo-filter-links">
                <button type="button" onClick={() => setShown(true)}>Select all</button>
                <button type="button" onClick={() => setShown(false)}>Clear</button>
            </div>
            <div className="cmo-filter-list">
                {shown.length === 0 && <p className="cmo-filter-none">No values</p>}
                {shown.map((v) => (
                    <label key={v}><input type="checkbox" checked={checked.has(v)} onChange={() => flip(v)} /> <span>{v || "(blank)"}</span></label>
                ))}
            </div>
            <div className="cmo-filter-foot">
                <button type="button" className="btn btn-sm" onClick={() => onApply(null)}>Clear filter</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onApply(checked.size === values.length ? null : new Set(checked))} disabled={checked.size === 0}>Apply</button>
            </div>
        </div>,
        document.body,
    );
}