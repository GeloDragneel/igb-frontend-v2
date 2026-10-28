// Reports → Income Summary (old pages/Reports/Income_Summary_Report.php)
// Every client: sales, cost of goods sold, gross, expenses, income subject to income tax · branch rows
// Client name → Income Statement (month by month) with 2550-M/Q and 0619-E/1601-EQ figures · print · CSV.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import IncomeTaxSummary from "../bir/IncomeTaxSummary";
import "./VATSummary.css";
import "./IncomeSummary.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const today = new Date();
const THIS_MONTH = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
const QUARTER_START = `${today.getFullYear()}-${pad(Math.floor(today.getMonth() / 3) * 3 + 1)}`;

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "-" : n2(v));
const monthLabel = (ym) => (ym ? `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "");
const rangeLabel = (a, b) => (a === b ? monthLabel(a) : `${monthLabel(a)} to ${monthLabel(b)}`);

const COLS = [
    { key: "total_sales", label: "Total Sales" },
    { key: "cogs", label: "Total Cost of Goods Sold" },
    { key: "gross_amount", label: "Gross Amount", strong: true },
    { key: "gross_profit_rate", label: "Gross Profit Rate", pct: true },
    { key: "expenses", label: "Total Expenses" },
    { key: "income_subject", label: "Income Subject to Income Tax", tone: "net" },
];

function download(name, rows) {
    const q = (v) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const text = rows.map((r) => r.map(q).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function IncomeSummary() {
    const notify = useToast();
    const [from, setFrom] = useState(QUARTER_START);
    const [to, setTo] = useState(THIS_MONTH);
    const [statusId, setStatusId] = useState("0");
    const [daId, setDaId] = useState("0");
    const [query, setQuery] = useState("");
    const [lookups, setLookups] = useState({ statuses: [], analysts: [] });
    const [rows, setRows] = useState([]);
    const [used, setUsed] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [branches, setBranches] = useState({});
    const [stmt, setStmt] = useState(null); // { row, data, loading, error }
    const seq = useRef(0);

    useEffect(() => {
        apiFetch("/reports/vat-clients/lookups").then(setLookups).catch(() => { });
    }, []);

    const load = useCallback(async (f = from, t = to, st = statusId, da = daId) => {
        if (!f || !t) return notify("Pick the From and To months.", "error");
        if (f > t) return notify("From must be on or before To.", "error");
        const my = ++seq.current;
        setLoading(true);
        setError("");
        try {
            const r = await apiFetch(`/reports/income-clients?${new URLSearchParams({ from: f, to: t, status_id: st, da_id: da })}`);
            if (my !== seq.current) return;
            setRows(r.rows || []);
            setUsed({ from: f, to: t });
            setBranches({});
        } catch (e) {
            if (my === seq.current) setError(e.message || "Couldn't load the income summary.");
        } finally {
            if (my === seq.current) setLoading(false);
        }
    }, [from, to, statusId, daId, notify]);

    useEffect(() => { load(from, to, statusId, daId); }, [statusId, daId]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((r) => `${r.client_name} ${r.client_num} ${r.status}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);

    const totals = useMemo(() => {
        const t = {};
        COLS.forEach((c) => { t[c.key] = shown.reduce((s, r) => s + (Number(r[c.key]) || 0), 0); });
        return t;
    }, [shown]);

    const toggleBranches = async (r) => {
        if (branches[r.client_num]) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            return;
        }
        setBranches((b) => ({ ...b, [r.client_num]: "loading" }));
        try {
            const res = await apiFetch(`/reports/income-clients/branches?${new URLSearchParams({ from: used.from, to: used.to, client_num: r.client_num })}`);
            setBranches((b) => ({ ...b, [r.client_num]: res.rows || [] }));
        } catch (e) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            notify(e.message || "Couldn't load the branch accounts.", "error");
        }
    };

    // the popup loads its own statement (IncomeTaxSummary embedded)
    const openStatement = (row) => setStmt({ row });
    const closeStmt = useCallback(() => setStmt(null), []);


    const exportList = () => {
        const out = [["#", "Client", ...COLS.map((c) => c.label)]];
        shown.forEach((r, i) => out.push([i + 1, r.client_name, ...COLS.map((c) => (Number(r[c.key]) || 0).toFixed(2))]));
        out.push(["", "TOTAL", ...COLS.map((c) => (c.pct ? "" : totals[c.key].toFixed(2)))]);
        download(`Income-Summary-${used.from}-to-${used.to}.csv`, out);
    };

    const renderRow = (r, num, child) => (
        <tr key={child ? `b${r.user_ids}` : `c${r.client_num}`} className={child ? "vs-child" : ""}>
            <td className="vs-f0">
                {!child && r.count_acc > 1 && (
                    <button type="button" className={`vs-expand${branches[r.client_num] ? " is-open" : ""}`} onClick={() => toggleBranches(r)}
                        aria-label={branches[r.client_num] ? "Hide branch accounts" : "Show branch accounts"}>
                        {branches[r.client_num] === "loading" ? "…" : "▸"}
                    </button>
                )}
            </td>
            <td className="vs-f1">{num}</td>
            <td className="vs-f2">
                <button type="button" className="vs-client" title={`${r.client_name} — open Income Statement`} onClick={() => openStatement(r)}>
                    {r.client_name}
                </button>
            </td>
            {COLS.map((c) => {
                const v = Number(r[c.key]) || 0;
                return (
                    <td key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}${c.strong ? " is-strong" : ""}${v < 0 ? " is-neg" : ""}`}>
                        {c.pct ? (Math.abs(v) < 0.005 ? "-" : `${n2(v)}%`) : dash(v)}
                    </td>
                );
            })}
            <td className="vs-status">{r.status && <span className="vs-pill">{r.status}</span>}</td>
        </tr>
    );

    return (
        <div className="vs is-page">
            <section className="card vs-bar">
                <div className="vs-period">
                    <span>Reporting period</span>
                    <b>{used ? rangeLabel(used.from, used.to) : "—"}</b>
                </div>
                <label className="vs-field"><span>From</span>
                    <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="vs-field"><span>To</span>
                    <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                <label className="vs-field"><span>Status</span>
                    <select className="input" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                        <option value="0">All status</option>
                        {lookups.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></label>
                <label className="vs-field"><span>Data analyst</span>
                    <select className="input" value={daId} onChange={(e) => setDaId(e.target.value)}>
                        <option value="0">All</option>
                        {lookups.analysts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select></label>
                <label className="vs-field vs-grow"><span>Find</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client or status" /></label>
                <div className="vs-actions">
                    <button type="button" className="btn btn-primary" onClick={() => load()} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
                    <button type="button" className="btn" onClick={exportList} disabled={!shown.length}>Export CSV</button>
                </div>
            </section>

            {error && <div className="alert-error vs-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}

            <section className="card vs-body">
                <div className="vs-scroll">
                    <table className="vs-table">
                        <colgroup>
                            <col className="vs-w0" /><col className="vs-w1" /><col className="vs-w2" />
                            {COLS.map((c) => <col key={c.key} className="is-wn" />)}
                            <col className="vs-ws" />
                        </colgroup>
                        <thead>
                            <tr className="is-head">
                                <th className="vs-f0" /><th className="vs-f1">#</th><th className="vs-f2 vs-left">Client</th>
                                {COLS.map((c) => <th key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}`}>{c.label}</th>)}
                                <th className="vs-left">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r, i) => (
                                <Fragment key={r.client_num}>
                                    {renderRow(r, i + 1, false)}
                                    {Array.isArray(branches[r.client_num]) && branches[r.client_num].map((b, k) => renderRow(b, `${i + 1}.${k + 1}`, true))}
                                </Fragment>
                            ))}
                            {!shown.length && (
                                <tr><td colSpan={COLS.length + 4} className="vs-empty">
                                    {loading ? "Loading…" : used ? "No client found for this period." : "Pick a period and press Search."}
                                </td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th className="vs-f0" /><th className="vs-f1" /><th className="vs-f2 vs-left">Total · {shown.length} client{shown.length === 1 ? "" : "s"}</th>
                                {COLS.map((c) => <th key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}`}>{c.pct ? "" : n2(totals[c.key])}</th>)}
                                <th />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>

            {stmt && (
                <Modal title={`Income Statement : ${stmt.row.client_name}`} onClose={closeStmt} size="xxlg">
                    {/* the same statement as BIR & Tax → Income Tax Summary, for this client */}
                    <IncomeTaxSummary embedded key={`${stmt.row.user_ids}|${used.from}|${used.to}`}
                        userIds={stmt.row.user_ids} from={used.from} to={used.to} />
                </Modal>
            )}

        </div>
    );
}