// Monitoring → Scan Monitoring (old pages/Monitoring/Scan_Monitoring)
// Scanned receipts (t_mobile_transaction) per day — BY CLIENT or BY DA. Click a count → that day per trade name.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { apiFetch } from "../../context/AuthContext";
import "./AuditMonitoring.css";

const now = new Date();
const THIS_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
const n0 = (v) => Number(v || 0).toLocaleString("en-PH");

export default function ScanMonitoring() {
    const [tab, setTab] = useState("client");
    const [lk, setLk] = useState(null); // { statuses, analysts }
    const [detail, setDetail] = useState(null); // { title, day, params }

    useEffect(() => {
        apiFetch("/monitoring/scan/lookups").then(setLk).catch(() => setLk({ statuses: [], analysts: [] }));
    }, []);

    return (
        <div className="aum">
            <section className="card aum-tabs" role="tablist" aria-label="Scan monitoring">
                {[["client", "By client"], ["da", "By DA"]].map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{l}</button>
                ))}
            </section>

            {tab === "client"
                ? <ScanGrid key="client" byDa={false} lk={lk} onOpen={setDetail} />
                : <ScanGrid key="da" byDa lk={lk} onOpen={setDetail} />}

            {detail && <ScanDetail {...detail} onClose={() => setDetail(null)} />}
        </div>
    );
}

function ScanGrid({ byDa, lk, onOpen }) {
    const [from, setFrom] = useState(THIS_MONTH);
    const [to, setTo] = useState(THIS_MONTH);
    const [statusId, setStatusId] = useState("0");
    const [daId, setDaId] = useState("0");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const reqId = useRef(0);

    const load = useCallback(async () => {
        if (!from || !to) return;
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        try {
            const p = new URLSearchParams({ from, to });
            if (!byDa) { p.set("status_id", statusId); p.set("da_id", daId); }
            const res = await apiFetch(`/monitoring/scan${byDa ? "/by-da" : ""}?${p}`);
            if (id === reqId.current) setData(res);
        } catch (e) {
            if (id === reqId.current) { setError(e.message || "Couldn't load the scan monitoring."); setData(null); }
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [byDa, from, to, statusId, daId]);

    useEffect(() => { load(); }, [load]);

    const days = data?.days || [];
    const rows = data?.rows || [];
    const multiMonth = days.length > 0 && days[0].slice(0, 7) !== days[days.length - 1].slice(0, 7);

    const totals = useMemo(() => {
        const perDay = {};
        let grand = 0;
        rows.forEach((r) => {
            days.forEach((d) => { perDay[d] = (perDay[d] || 0) + (r.days[d] || 0); });
            grand += r.total;
        });
        return { perDay, grand };
    }, [rows, days]);

    const extra = byDa ? 1 : 4;   // Total (+ Status, DA, Auditor)

    const open = (r, d) => onOpen(byDa
        ? { title: r.name, day: d, params: { da_id: r.emp_id } }
        : { title: r.name, day: d, params: { client_num: r.client_num } });

    return (
        <>
            <section className="card aum-bar">
                <div className="aum-title">
                    <h4>Scan Monitoring · {byDa ? "By data analyst" : "By client"}</h4>
                    <span>{rows.length} {byDa ? "data analyst(s)" : "client(s)"}</span>
                </div>
                <label className="aum-field">
                    <span className="field-label">From</span>
                    <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="aum-field">
                    <span className="field-label">To</span>
                    <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
                {!byDa && (
                    <>
                        <label className="aum-field">
                            <span className="field-label">Status</span>
                            <select className="input" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                                <option value="0">-- All Status --</option>
                                {(lk?.statuses || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </label>
                        <label className="aum-field">
                            <span className="field-label">Data analyst</span>
                            <select className="input" value={daId} onChange={(e) => setDaId(e.target.value)}>
                                <option value="0">-- All List --</option>
                                {(lk?.analysts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </label>
                    </>
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
                                <th className="aum-f1">{byDa ? "Data analyst" : "Client"}</th>
                                {days.map((d) => <th key={d} className="c" title={dayLabel(d)}>{multiMonth ? d.slice(5).replace("-", "/") : d.slice(8)}</th>)}
                                <th className="c">Total</th>
                                {!byDa && <><th className="c">Status</th><th>DA Assigned</th><th>Auditor Assigned</th></>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: 8 }, (_, k) => (
                                <tr key={`sk${k}`} className="aum-sk">
                                    <td className="aum-f0"><span className="sk" /></td>
                                    <td className="aum-f1"><span className="sk" /></td>
                                    {Array.from({ length: Math.max(days.length, 30) + extra }, (_, j) => <td key={j}><span className="sk" /></td>)}
                                </tr>
                            ))}
                            {!loading && !rows.length && <tr><td className="aum-empty" colSpan={days.length + 2 + extra}>Nothing to show for this period.</td></tr>}
                            {!loading && rows.map((r, i) => (
                                <tr key={byDa ? r.emp_id : r.client_num}>
                                    <td className="aum-f0 c">{i + 1}</td>
                                    <td className="aum-f1" title={r.name}>{r.name}</td>
                                    {days.map((d) => {
                                        const n = r.days[d] || 0;
                                        return (
                                            <td key={d} className="c">
                                                {n > 0 && (
                                                    <button type="button" className="aum-count" onClick={() => open(r, d)}
                                                        aria-label={`${r.name}, ${dayLabel(d)}: ${n} scan(s)`}>{n0(n)}</button>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="c strong">{n0(r.total)}</td>
                                    {!byDa && (
                                        <>
                                            <td className="c">{r.status || "—"}</td>
                                            <td>{r.da?.length > 0 && <ul className="aum-names">{r.da.map((n) => <li key={n}>{n}</li>)}</ul>}</td>
                                            <td>{r.auditors?.length > 0 && <ul className="aum-names">{r.auditors.map((n) => <li key={n}>{n}</li>)}</ul>}</td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        {!loading && rows.length > 0 && (
                            <tfoot>
                                <tr>
                                    <th className="aum-f0" />
                                    <th className="aum-f1">Total</th>
                                    {days.map((d) => <th key={d} className="c">{totals.perDay[d] ? n0(totals.perDay[d]) : ""}</th>)}
                                    <th className="c">{n0(totals.grand)}</th>
                                    {!byDa && <><th /><th /><th /></>}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </section>
        </>
    );
}

/* the day's scans per trade name (old modal_Day_Summary) */
function ScanDetail({ title, day, params, onClose }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState("");
    const key = JSON.stringify(params);

    useEffect(() => {
        let alive = true;
        const p = new URLSearchParams({ date: day, ...JSON.parse(key) });
        apiFetch(`/monitoring/scan/detail?${p}`)
            .then((r) => alive && setItems(r.rows))
            .catch((e) => alive && setError(e.message || "Couldn't load the day summary."));
        return () => { alive = false; };
    }, [day, key]);

    return (
        <Modal title={`${title} - ${dayLabel(day)}`} onClose={onClose} size="lg"
            footer={<button className="btn" onClick={onClose}>Close</button>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!items && !error && <div className="aum-detail-empty">Loading…</div>}
            {items && !items.length && <div className="aum-detail-empty">No trade names found.</div>}
            {items && items.map((t) => {
                const total = t.sales + t.purchases + t.expenses;
                return (
                    <div key={`${t.client_num}-${t.trade_name}`} className="aum-trade">
                        <div className="aum-trade-head">
                            <span className="aum-avatar" aria-hidden="true">{t.trade_name.replace(/^[^:]*:\s*/, "").slice(0, 2).toUpperCase()}</span>
                            <div>
                                <div className="aum-trade-name">{t.trade_name}</div>
                                <small className="aum-trade-num">#{t.client_num}</small>
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