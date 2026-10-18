// Monitoring → Audit Monitoring (old pages/Monitoring/Audit_Monitoring)
// Audits per client per day of the month. Click a day count → that day's Expenses / Purchases / Sales per trade name.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { apiFetch } from "../../context/AuthContext";
import "./AuditMonitoring.css";

const now = new Date();
const THIS_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (ym) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "");
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

export default function AuditMonitoring() {
    const [lk, setLk] = useState(null); // { statuses, auditors, can_pick_auditor }
    const [month, setMonth] = useState(THIS_MONTH);
    const [statusId, setStatusId] = useState("0");
    const [auditorId, setAuditorId] = useState("0");
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
            const p = new URLSearchParams({ month, status_id: statusId, auditor_id: auditorId });
            const res = await apiFetch(`/monitoring/audit?${p}`);
            if (id === reqId.current) setData(res);
        } catch (e) {
            if (id === reqId.current) { setError(e.message || "Couldn't load the audit monitoring."); setData(null); }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [month, statusId, auditorId]);

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
                    <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
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
                <DayDetail row={detail.row} day={detail.day} auditorId={auditorId} onClose={() => setDetail(null)} />
            )}
        </div>
    );
}

function Names({ list }) {
    if (!list?.length) return null;
    return <ul className="aum-names">{list.map((n) => <li key={n}>{n}</li>)}</ul>;
}

/* the day's audits per trade name (old modal_Day_Summary) */
function DayDetail({ row, day, auditorId, onClose }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let alive = true;
        const p = new URLSearchParams({ date: day, client_num: row.client_num, auditor_id: auditorId });
        apiFetch(`/monitoring/audit/detail?${p}`)
            .then((r) => alive && setItems(r.rows))
            .catch((e) => alive && setError(e.message || "Couldn't load the day summary."));
        return () => { alive = false; };
    }, [day, row.client_num, auditorId]);

    return (
        <Modal title={`${row.name} - ${dayLabel(day)}`} onClose={onClose} size="lg"
            footer={<button className="btn" onClick={onClose}>Close</button>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!items && !error && <div className="aum-detail-empty">Loading…</div>}
            {items && !items.length && <div className="aum-detail-empty">No trade names found.</div>}
            {items && items.map((t) => {
                const total = t.sales + t.purchases + t.expenses;
                return (
                    <div key={t.trade_name} className="aum-trade">
                        <div className="aum-trade-head">
                            <span className="aum-avatar" aria-hidden="true">{t.trade_name.replace(/^[^:]*:\s*/, "").slice(0, 2).toUpperCase()}</span>
                            <div>
                                <div className="aum-trade-name">{t.trade_name}</div>
                                <small className="aum-trade-num">#{row.client_num}</small>
                            </div>
                        </div>
                        <div className="aum-tiles">
                            <Tile label="Expenses" tone="is-red" n={t.expenses} total={total} status={t.expenses_status} />
                            <Tile label="Purchases" tone="is-blue" n={t.purchases} total={total} status={t.purchases_status} />
                            <Tile label="Sales" tone="is-green" n={t.sales} total={total} status={t.sales_status} />
                        </div>
                    </div>
                );
            })}
        </Modal>
    );
}

function Tile({ label, tone, n, total, status }) {
    const pct = total ? Math.round((n / total) * 100) : 0;
    return (
        <div className={`aum-tile ${tone}`}>
            <small>{label}</small>
            <b>{n}</b>
            <div className="aum-bar-track"><div className="aum-bar-fill" style={{ width: `${pct}%` }} /></div>
            {status?.length ? status.map((s) => (
                <div key={s.status} className="aum-status-line"><span>{s.status}</span><b>{s.count}</b></div>
            )) : <small className="aum-muted">No data</small>}
        </div>
    );
}