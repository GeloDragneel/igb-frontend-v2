// Monitoring → Efficiency (old pages/Monitoring/Efficiency_Monitoring — "Reverted Monitoring")
// Reverted invoices per data analyst per day. Click a count → the reverted invoices of that day with the audit remarks.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { apiFetch } from "../../context/AuthContext";
import "./AuditMonitoring.css";

const now = new Date();
const THIS_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (ym) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "");
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

export default function EfficiencyMonitoring() {
    const [month, setMonth] = useState(THIS_MONTH);
    const [data, setData] = useState(null); // { month, days, rows }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [detail, setDetail] = useState(null); // { row, day }
    const reqId = useRef(0);

    const load = useCallback(async () => {
        if (!month) return;
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        try {
            const res = await apiFetch(`/monitoring/efficiency?month=${month}`);
            if (id === reqId.current) setData(res);
        } catch (e) {
            if (id === reqId.current) { setError(e.message || "Couldn't load the reverted monitoring."); setData(null); }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [month]);

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

    return (
        <div className="aum">
            <section className="card aum-bar">
                <div className="aum-title">
                    <h4>Reverted Monitoring</h4>
                    <span>Reporting Period : {monthLabel(data?.month || month)}</span>
                </div>
                <label className="aum-field">
                    <span className="field-label">Date</span>
                    <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
                </label>
                <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
            </section>

            <section className="card aum-body">
                {error && <div className="alert-error" role="alert">{error}</div>}
                <div className="aum-scroll">
                    <table className="aum-table">
                        <thead>
                            <tr>
                                <th className="aum-f0">#</th>
                                <th className="aum-f1">Data analyst</th>
                                {days.map((d) => <th key={d} className="c">{d.slice(8)}</th>)}
                                <th className="c">Total</th>
                                <th>Auditor Assigned</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: 8 }, (_, k) => (
                                <tr key={`sk${k}`} className="aum-sk">
                                    <td className="aum-f0"><span className="sk" /></td>
                                    <td className="aum-f1"><span className="sk" /></td>
                                    {Array.from({ length: Math.max(days.length, 30) + 2 }, (_, j) => <td key={j}><span className="sk" /></td>)}
                                </tr>
                            ))}
                            {!loading && !rows.length && <tr><td className="aum-empty" colSpan={days.length + 4}>No reverted invoices this month.</td></tr>}
                            {!loading && rows.map((r, i) => (
                                <tr key={r.emp_id}>
                                    <td className="aum-f0 c">{i + 1}</td>
                                    <td className="aum-f1" title={r.name}>{r.name}</td>
                                    {days.map((d) => {
                                        const n = r.days[d] || 0;
                                        return (
                                            <td key={d} className="c">
                                                {n > 0 && (
                                                    <button type="button" className="aum-count is-red" onClick={() => setDetail({ row: r, day: d })}
                                                        aria-label={`${r.name}, ${dayLabel(d)}: ${n} reverted`}>{n}</button>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="c strong">{r.total}</td>
                                    <td>{r.auditors?.length > 0 && <ul className="aum-names">{r.auditors.map((n) => <li key={n}>{n}</li>)}</ul>}</td>
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
                                    <th />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </section>

            {detail && <RevertedDetail row={detail.row} day={detail.day} onClose={() => setDetail(null)} />}
        </div>
    );
}

/* the reverted invoices of one analyst on one day (old modal_Day_Summary) */
function RevertedDetail({ row, day, onClose }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");

    useEffect(() => {
        let alive = true;
        apiFetch(`/monitoring/efficiency/detail?emp_id=${row.emp_id}&date=${day}`)
            .then((r) => alive && setItems(r.rows))
            .catch((e) => alive && setError(e.message || "Couldn't load the reverted invoices."));
        return () => { alive = false; };
    }, [row.emp_id, day]);

    const shown = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!items || !t) return items || [];
        return items.filter((x) => [x.branch_code, x.trade_name, x.declared_month, x.ref_no, x.document_no, x.type, ...(x.remarks || [])]
            .join(" ").toLowerCase().includes(t));
    }, [items, q]);

    return (
        <Modal title={`${row.name} - ${dayLabel(day)}`} onClose={onClose} size="xl"
            footer={<button className="btn" onClick={onClose}>Close</button>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <input className="input aum-detail-search" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reverted invoices" />
            <div className="aum-detail-wrap">
                <table className="aum-detail-table">
                    <thead>
                        <tr><th>#</th><th>Branch Code</th><th>Trade Name</th><th>Declared Month</th><th>Reference No</th><th>Document No</th><th>Trans Type</th><th>Remarks</th></tr>
                    </thead>
                    <tbody>
                        {!items && !error && <tr><td colSpan={8} className="aum-detail-empty">Loading…</td></tr>}
                        {items && !shown.length && <tr><td colSpan={8} className="aum-detail-empty">{q ? "Nothing matches the search." : "No reverted invoices."}</td></tr>}
                        {shown.map((x, i) => (
                            <tr key={`${x.type}-${x.ref_no}`}>
                                <td>{i + 1}</td>
                                <td className="mono">{x.branch_code || "—"}</td>
                                <td>{x.trade_name || "—"}</td>
                                <td>{x.declared_month || "—"}</td>
                                <td className="mono">{x.ref_no}</td>
                                <td className="mono">{x.document_no || "—"}</td>
                                <td>{x.type}</td>
                                <td>{x.remarks?.length > 0 && <ul className="aum-names">{x.remarks.map((m, k) => <li key={k}>{m}</li>)}</ul>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
}