// Reports → Percentage Tax Summary 2551-Q (old pages/Reports/Percentage_Tax_Summary.php)
// Non-VAT clients: sales, 3% PT due, 2307 (PT), tax paid on the quarter's earlier months, tax paid · branch rows · CSV
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./VATSummary.css";
import "./PercentageTax.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const today = new Date();
const THIS_MONTH = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
const QUARTER_START = `${today.getFullYear()}-${pad(Math.floor(today.getMonth() / 3) * 3 + 1)}`;
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "-" : n2(v));
const monthLabel = (ym) => (ym ? `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "");
const rangeLabel = (a, b) => (a === b ? monthLabel(a) : `${monthLabel(a)} to ${monthLabel(b)}`);
const quarterEnd = (ym) => [3, 6, 9, 12].includes(+String(ym).slice(5, 7));

const COLS = [
    { key: "sales", label: "Sales" },
    { key: "rate", label: "PT Rate", rate: true },
    { key: "pt_due", label: "PT Due", strong: true },
    { key: "creditable_pt", label: "2307 (PT)" },
    { key: "tax_paid_prev_filed", label: "Tax Paid Prev. Filed" },
    { key: "tax_paid", label: "Tax Paid", tone: "net" },
];
const MONEY = COLS.filter((c) => !c.rate);

function download(name, rows) {
    const q = (v) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const url = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PercentageTax() {
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
            const r = await apiFetch(`/reports/pt-clients?${new URLSearchParams({ from: f, to: t, status_id: st, da_id: da })}`);
            if (my !== seq.current) return;
            setRows(r.rows || []);
            setUsed({ from: f, to: t });
            setBranches({});
        } catch (e) {
            if (my === seq.current) setError(e.message || "Couldn't load the percentage tax summary.");
        } finally {
            if (my === seq.current) setLoading(false);
        }
    }, [from, to, statusId, daId, notify]);

    useEffect(() => { load(from, to, statusId, daId); }, [statusId, daId]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((r) => `${r.client_name} ${r.client_num} ${r.status} ${r.da_assigned.join(" ")}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);

    const totals = useMemo(() => {
        const t = {};
        MONEY.forEach((c) => { t[c.key] = shown.reduce((s, r) => s + Math.round((Number(r[c.key]) || 0) * 100) / 100, 0); });
        return t;
    }, [shown]);

    const toggleBranches = async (r) => {
        if (branches[r.client_num]) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            return;
        }
        setBranches((b) => ({ ...b, [r.client_num]: "loading" }));
        try {
            const res = await apiFetch(`/reports/pt-clients/branches?${new URLSearchParams({ from: used.from, to: used.to, client_num: r.client_num })}`);
            setBranches((b) => ({ ...b, [r.client_num]: res.rows || [] }));
        } catch (e) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            notify(e.message || "Couldn't load the branch accounts.", "error");
        }
    };

    const exportCSV = () => {
        const out = [["#", "Client", ...COLS.map((c) => c.label), "Status", "DA Assigned", "Auditor Assigned"]];
        shown.forEach((r, i) => out.push([i + 1, r.client_name,
        ...COLS.map((c) => (c.rate ? (Number(r.sales) ? "3%" : "") : (Number(r[c.key]) || 0).toFixed(2))),
        r.status, r.da_assigned.join("; "), r.auditor_assigned.join("; ")]));
        out.push(["", "TOTAL", ...COLS.map((c) => (c.rate ? "3%" : totals[c.key].toFixed(2))), "", "", ""]);
        download(`Percentage-Tax-2551Q-${used.from}-to-${used.to}.csv`, out);
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
            <td className="vs-f2" title={r.client_name}>{r.client_name}</td>
            {COLS.map((c) => {
                if (c.rate) return <td key={c.key} className="is-rate">{Number(r.sales) ? "3%" : "-"}</td>;
                const v = Number(r[c.key]) || 0;
                return <td key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}${c.strong ? " is-strong" : ""}${v < 0 ? " is-neg" : ""}`}>{dash(v)}</td>;
            })}
            <td className="vs-status">{r.status && <span className="vs-pill">{r.status}</span>}</td>
            <td className="vs-people">{(r.da_assigned || []).map((n) => <div key={n}>{n}</div>)}</td>
            <td className="vs-people">{(r.auditor_assigned || []).map((n) => <div key={n}>{n}</div>)}</td>
        </tr>
    );

    return (
        <div className="vs is-pt">
            <section className="card vs-bar">
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
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, status or DA" /></label>
                <div className="vs-actions">
                    <button type="button" className="btn btn-primary" onClick={() => load()} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
                    <button type="button" className="btn" onClick={exportCSV} disabled={!shown.length}>Export CSV</button>
                </div>
            </section>

            {error && <div className="alert-error vs-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}

            <section className="card vs-body">
                <div className="vs-scroll">
                    <table className="vs-table">
                        <colgroup>
                            <col className="vs-w0" /><col className="vs-w1" /><col className="vs-w2" />
                            {COLS.map((c) => <col key={c.key} className={c.rate ? "is-wr" : "is-wn"} />)}
                            <col className="vs-ws" /><col className="vs-wp" /><col className="vs-wp" />
                        </colgroup>
                        <thead>
                            <tr className="is-head">
                                <th className="vs-f0" /><th className="vs-f1">#</th><th className="vs-f2 vs-left">Client name</th>
                                {COLS.map((c) => <th key={c.key} className={c.rate ? "" : `vs-num${c.tone ? ` is-${c.tone}` : ""}`}>{c.label}</th>)}
                                <th className="vs-left">Status</th><th className="vs-left">DA Assigned</th><th className="vs-left">Auditor Assigned</th>
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
                                <tr><td colSpan={COLS.length + 6} className="vs-empty">
                                    {loading ? "Loading…" : used ? "No Non-VAT client found for this period." : "Pick a period and press Search."}
                                </td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th className="vs-f0" /><th className="vs-f1" /><th className="vs-f2 vs-left">Total · {shown.length} client{shown.length === 1 ? "" : "s"}</th>
                                {COLS.map((c) => <th key={c.key} className={c.rate ? "" : `vs-num${c.tone ? ` is-${c.tone}` : ""}`}>{c.rate ? "3%" : n2(totals[c.key])}</th>)}
                                <th colSpan={3} />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>
        </div>
    );
}