// Monitoring → Audit Monitoring (old pages/Monitoring/Audit_Monitoring)
// Audits per client per day of the month. Click a day count → that day's Expenses / Purchases / Sales per trade name.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "../../components/Modal";
import { apiFetch, useAuth } from "../../context/AuthContext";
import "./AuditMonitoring.css";
import "./AuditMonitoringTabs.css";

const now = new Date();
const THIS_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (ym) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "");
const shiftMonth = (ym, n) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const AUDIT_TABS = [["", "All", "all"], ["pending", "Pending", "pending"], ["audited", "Audited", "audited"], ["reverted", "Reverted", "reverted"]];
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

export default function AuditMonitoring() {
    const [lk, setLk] = useState(null); // { statuses, auditors, can_pick_auditor }
    const [month, setMonth] = useState(THIS_MONTH);
    const [statusId, setStatusId] = useState("0");
    const [auditorId, setAuditorId] = useState("0");
    const [auditStatus, setAuditStatus] = useState("");   // "" all · pending · audited · reverted
    const [data, setData] = useState(null); // { month, days, rows }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [detail, setDetail] = useState(null); // { row, day }
    const reqId = useRef(0);

    useEffect(() => {
        apiFetch("/monitoring/audit/lookups").then(setLk).catch((e) => setError(e.message || "Couldn't load the filters."));
    }, []);

    const load = useCallback(async () => {
        if (!month) return;
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        try {
            const p = new URLSearchParams({ month, status_id: statusId, auditor_id: auditorId, audit_status: auditStatus });
            const res = await apiFetch(`/monitoring/audit?${p}`);
            if (id === reqId.current) setData(res);
        } catch (e) {
            if (id === reqId.current) { setError(e.message || "Couldn't load the audit monitoring."); setData(null); }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [month, statusId, auditorId, auditStatus]);

    useEffect(() => { load(); }, [load]);

    const days = data?.days || [];
    const rows = data?.rows || [];

    const totals = useMemo(() => {
        const perDay = {};
        let grand = 0;
        rows.forEach((r) => {
            days.forEach((d) => { perDay[d] = (perDay[d] || 0) + (r.days[d] || 0); });
            grand += r.total;
        });
        return { perDay, grand };
    }, [rows, days]);

    const cols = days.length + 6;

    return (
        <div className="aum">
            <section className="card aum-bar">
                <div className="aum-title">
                    <h4>Audit Monitoring</h4>
                    <span>Reporting Period : {monthLabel(data?.month || month)}</span>
                </div>
                <label className="aum-field">
                    <span className="field-label">Date</span>
                    <div className="aum-month">
                        <button type="button" className="btn aum-mbtn" onClick={() => setMonth((m) => shiftMonth(m || THIS_MONTH, -1))} aria-label="Previous month">‹</button>
                        <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
                        <button type="button" className="btn aum-mbtn" onClick={() => setMonth((m) => shiftMonth(m || THIS_MONTH, 1))} aria-label="Next month">›</button>
                    </div>
                </label>
                <label className="aum-field">
                    <span className="field-label">Status</span>
                    <select className="input" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                        <option value="0">-- All Status --</option>
                        {(lk?.statuses || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                {lk?.can_pick_auditor && (
                    <label className="aum-field">
                        <span className="field-label">Auditor</span>
                        <select className="input" value={auditorId} onChange={(e) => setAuditorId(e.target.value)}>
                            <option value="0">-- All List --</option>
                            {lk.auditors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </label>
                )}
                <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
                <div className="aum-seg" role="tablist" aria-label="Audit status">
                    {AUDIT_TABS.map(([v, l, k]) => (
                        <button key={k} type="button" role="tab" aria-selected={auditStatus === v} className={auditStatus === v ? "is-on" : ""} onClick={() => setAuditStatus(v)}>
                            {l} <span className="aum-n">{data?.audit_counts?.[k] ?? 0}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="card aum-body">
                {error && <div className="alert-error" role="alert">{error}</div>}
                <div className="aum-scroll">
                    <table className="aum-table">
                        <thead>
                            <tr>
                                <th className="aum-f0">#</th>
                                <th className="aum-f1">Client</th>
                                {days.map((d) => <th key={d} className="c">{d.slice(8)}</th>)}
                                <th className="c">Total</th>
                                <th className="c">Status</th>
                                <th>DA Assigned</th>
                                <th>Auditor Assigned</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: 8 }, (_, k) => (
                                <tr key={`sk${k}`} className="aum-sk">
                                    <td className="aum-f0"><span className="sk" /></td>
                                    <td className="aum-f1"><span className="sk" /></td>
                                    {Array.from({ length: Math.max(days.length, 30) + 4 }, (_, j) => <td key={j}><span className="sk" /></td>)}
                                </tr>
                            ))}
                            {!loading && !rows.length && <tr><td className="aum-empty" colSpan={cols}>No audits for this month.</td></tr>}
                            {!loading && rows.map((r, i) => (
                                <tr key={r.client_num}>
                                    <td className="aum-f0 c">{i + 1}</td>
                                    <td className="aum-f1" title={r.name}>{r.name}</td>
                                    {days.map((d) => {
                                        const n = r.days[d] || 0;
                                        return (
                                            <td key={d} className="c">
                                                {n > 0 && (
                                                    <button type="button" className="aum-count" onClick={() => setDetail({ row: r, day: d })}
                                                        aria-label={`${r.name}, ${dayLabel(d)}: ${n} audit(s)`}>{n}</button>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="c strong">{r.total}</td>
                                    <td className="c">{r.status || "—"}</td>
                                    <td><Names list={r.da} /></td>
                                    <td><Names list={r.auditors} /></td>
                                </tr>
                            ))}
                        </tbody>
                        {!loading && rows.length > 0 && (
                            <tfoot>
                                <tr>
                                    <th className="aum-f0" />
                                    <th className="aum-f1">Total</th>
                                    {days.map((d) => <th key={d} className="c">{totals.perDay[d] || ""}</th>)}
                                    <th className="c">{totals.grand}</th>
                                    <th /><th /><th />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </section>

            {detail && (
                <DayDetail row={detail.row} day={detail.day} auditorId={auditorId} auditStatus={auditStatus} onClose={() => setDetail(null)} />
            )}
        </div>
    );
}

function Names({ list }) {
    if (!list?.length) return null;
    return <ul className="aum-names">{list.map((n) => <li key={n}>{n}</li>)}</ul>;
}

/* the day's work per trade name (old modal_Day_Summary): summary on top + one compact table */
const TYPES = [["sales", "Sales"], ["purchases", "Purchases"], ["expenses", "Expenses"]];
const ST_TONE = { Pending: "is-pend", Confirmed: "is-pend", Audited: "is-ok", Reverted: "is-bad" };

function DayDetail({ row, day, auditorId, auditStatus, onClose }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState("");
    const [showEmpty, setShowEmpty] = useState(false);
    const [invoices, setInvoices] = useState([]);
    const [opening, setOpening] = useState("");
    const [frame, setFrame] = useState(null);   // invoice shown in the popup frame
    const { user, selectBranch } = useAuth();

    useEffect(() => {
        let alive = true;
        const p = new URLSearchParams({ date: day, client_num: row.client_num, auditor_id: auditorId, audit_status: auditStatus });
        apiFetch(`/monitoring/audit/detail?${p}`)
            .then((r) => { if (alive) { setItems(r.rows); setInvoices(r.invoices || []); } })
            .catch((e) => alive && setError(e.message || "Couldn't load the day summary."));
        return () => { alive = false; };
    }, [day, row.client_num, auditorId, auditStatus]);

    const rows = (items || []).map((t) => ({ ...t, total: t.sales + t.purchases + t.expenses }));
    const withWork = rows.filter((t) => t.total > 0);
    const shown = showEmpty ? rows : withWork;

    // day totals by status (all trade names, all types)
    const sum = { total: 0, Pending: 0, Audited: 0, Reverted: 0 };
    rows.forEach((t) => TYPES.forEach(([k]) => (t[`${k}_status`] || []).forEach((s) => {
        const key = s.status === "Confirmed" ? "Pending" : s.status;
        if (key in sum) sum[key] += s.count;
        sum.total += s.count;
    })));
    const typeTotal = (k) => rows.reduce((a, t) => a + (t[k] || 0), 0);

    // open the invoice in a popup frame: switch to its client account first (detail pages load by the selected account)
    const openInvoice = async (v) => {
        if (opening) return;
        setOpening(v.invoice_no);
        try {
            if (v.caid && Number(user?.caid) !== Number(v.caid)) await selectBranch(v.caid);
            setFrame(v);
        } catch (e) {
            setError(e.message || "Couldn't open the invoice.");
        } finally {
            setOpening("");
        }
    };

    return (
        <Modal title={<span className="add-title"><b>{row.name}</b><small>{dayLabel(day)} · #{row.client_num}</small></span>} onClose={onClose} size="lg"
            footer={<button className="btn" onClick={onClose}>Close</button>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!items && !error && <div className="aum-detail-empty">Loading…</div>}
            {items && (
                <>
                    <div className="add-sum">
                        <div><span>Total</span><b>{sum.total}</b></div>
                        <div className="is-pend"><span>Pending</span><b>{sum.Pending}</b></div>
                        <div className="is-ok"><span>Audited</span><b>{sum.Audited}</b></div>
                        <div className="is-bad"><span>Reverted</span><b>{sum.Reverted}</b></div>
                    </div>

                    <div className="add-scroll">
                        <table className="add-table">
                            <thead>
                                <tr>
                                    <th>Trade name</th>
                                    {TYPES.map(([k, l]) => <th key={k} className="c">{l}</th>)}
                                    <th className="c">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!shown.length && <tr><td colSpan={5} className="aum-detail-empty">Nothing on this day.</td></tr>}
                                {shown.map((t) => (
                                    <tr key={t.trade_name} className={t.total ? "" : "is-zero"}>
                                        <td className="add-name" title={t.trade_name}>{t.trade_name}</td>
                                        {TYPES.map(([k]) => (
                                            <td key={k} className="c">
                                                {t[k] ? (
                                                    <>
                                                        <b className="add-n">{t[k]}</b>
                                                        <span className="add-chips">
                                                            {(t[`${k}_status`] || []).map((s) => (
                                                                <span key={s.status} className={`add-chip ${ST_TONE[s.status] || ""}`} title={s.status}>{s.status} {s.count}</span>
                                                            ))}
                                                        </span>
                                                    </>
                                                ) : <span className="aum-muted">–</span>}
                                            </td>
                                        ))}
                                        <td className="c"><b>{t.total || "–"}</b></td>
                                    </tr>
                                ))}
                            </tbody>
                            {withWork.length > 1 && (
                                <tfoot>
                                    <tr>
                                        <th>Total</th>
                                        {TYPES.map(([k]) => <th key={k} className="c">{typeTotal(k)}</th>)}
                                        <th className="c">{sum.total}</th>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {rows.length > withWork.length && (
                        <button type="button" className="add-toggle" onClick={() => setShowEmpty((v) => !v)}>
                            {showEmpty ? "Hide" : "Show"} {rows.length - withWork.length} trade name{rows.length - withWork.length === 1 ? "" : "s"} with nothing this day
                        </button>
                    )}

                    {invoices.length > 0 && (
                        <div className="add-scroll add-inv">
                            <table className="add-table">
                                <thead>
                                    <tr>
                                        <th>Branch Code - Trade Name</th>
                                        <th className="c">Declared Month</th>
                                        <th>Document No</th>
                                        <th className="c">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map((v, i) => (
                                        <tr key={`${v.invoice_no}-${v.status}-${i}`} className="add-click" tabIndex={0} title={`Open ${v.invoice_no}`}
                                            onClick={() => openInvoice(v)} onKeyDown={(e) => e.key === "Enter" && openInvoice(v)}>
                                            <td className="add-name" title={v.trade_name}>{v.trade_name}</td>
                                            <td className="c">{v.declared_month || "—"}</td>
                                            <td>{opening === v.invoice_no ? "Opening…" : (v.document_no || v.invoice_no)}</td>
                                            <td className="c"><span className={`add-chip ${ST_TONE[v.status] || ""}`}>{v.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            {frame && <InvoiceFrame inv={frame} onClose={() => setFrame(null)} />}
        </Modal>
    );
}

/* the invoice details page inside a popup frame */
function InvoiceFrame({ inv, onClose }) {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    const src = `/view/${inv.type}/${encodeURIComponent(inv.invoice_no)}`;
    // portal to <body> so the frame is not squeezed inside the day popup
    return createPortal(
        <div className="add-frame-bg" onClick={onClose}>
            <div className="add-frame" role="dialog" aria-label={`Invoice ${inv.invoice_no}`} onClick={(e) => e.stopPropagation()}>
                <div className="add-frame-head">
                    <span><b>{inv.document_no || inv.invoice_no}</b><small>{inv.trade_name} · {inv.declared_month} · {inv.status}</small></span>
                    <button type="button" className="btn" onClick={onClose}>Close</button>
                </div>
                {!loaded && <div className="aum-detail-empty">Loading…</div>}
                <iframe title={`Invoice ${inv.invoice_no}`} src={src} onLoad={() => setLoaded(true)} style={loaded ? undefined : { visibility: "hidden" }} />
            </div>
        </div>,
        document.body
    );
}