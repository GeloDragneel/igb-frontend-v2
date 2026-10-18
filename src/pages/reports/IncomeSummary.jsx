// Reports → Income Summary (old pages/Reports/Income_Summary_Report.php)
// Every client: sales, cost of goods sold, gross, expenses, income subject to income tax · branch rows
// Client name → Income Statement (month by month) with 2550-M/Q and 0619-E/1601-EQ figures · print · CSV.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
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

/** the statement as ordered lines (screen, print and CSV all use this) */
function statementLines(s) {
    const L = [];
    const row = (label, cell, kind = "row", fmt = n2) => L.push({ label, cell, kind, fmt });
    const head = (label) => L.push({ label, kind: "head" });
    const gap = () => L.push({ kind: "gap" });
    head("SALES");
    s.sales.forEach((a) => row(a.name || a.code, a));
    row("TOTAL SALES", s.total_sales, "total");
    head("COST OF SALES");
    row("Merchandise Inventory, Beginning", s.beginning);
    s.cogs.forEach((a) => row(a.name || a.code, a));
    row("Total cost of goods available for sale", s.cogs_available, "sub");
    row("Merchandise Inventory, Ending", s.ending);
    row("TOTAL COST OF GOODS SOLD", s.total_cogs, "total");
    gap();
    row("GROSS AMOUNT", s.gross_amount, "total");
    row("Gross Profit Rate", s.gross_profit_rate, "row", (v) => (Number(v) || 0).toFixed(2));
    head("EXPENSES");
    s.expenses.forEach((a) => row(a.name || a.code, a));
    row("TOTAL EXPENSES", s.total_expenses, "total");
    row("INCOME SUBJECT TO INCOME TAX", s.income_subject, "grand");
    head("2550-M / 2550-Q");
    row("Output VAT (Sales)", s.output_vat);
    row("Input VAT (Purchases)", s.input_vat_purchases);
    row("Input VAT (Expenses)", s.input_vat_expenses);
    row("Total Input VAT", s.total_input_vat, "sub");
    row("Payable / (Excess)", s.vat_payable, "total");
    head("0619-E / 1601-EQ");
    row("EWT (Purchases)", s.ewt_purchases);
    row("EWT (Expenses)", s.ewt_expenses);
    row("Total EWT", s.total_ewt, "total");
    return L;
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
    const [printing, setPrinting] = useState(false);
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

    const openStatement = async (row) => {
        setStmt({ row, data: null, loading: true });
        try {
            const data = await apiFetch(`/reports/income-clients/statement?${new URLSearchParams({ user_ids: row.user_ids, from: used.from, to: used.to })}`);
            setStmt((s) => s && s.row === row ? { ...s, data, loading: false } : s);
        } catch (e) {
            setStmt((s) => s && { ...s, loading: false, error: e.message || "Couldn't load the income statement." });
        }
    };
    const closeStmt = useCallback(() => setStmt(null), []);

    useEffect(() => {
        if (!printing) return undefined;
        const done = () => setPrinting(false);
        window.addEventListener("afterprint", done);
        const t = setTimeout(() => window.print(), 50);
        return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
    }, [printing]);

    const exportList = () => {
        const out = [["#", "Client", ...COLS.map((c) => c.label)]];
        shown.forEach((r, i) => out.push([i + 1, r.client_name, ...COLS.map((c) => (Number(r[c.key]) || 0).toFixed(2))]));
        out.push(["", "TOTAL", ...COLS.map((c) => (c.pct ? "" : totals[c.key].toFixed(2)))]);
        download(`Income-Summary-${used.from}-to-${used.to}.csv`, out);
    };
    const exportStatement = () => {
        const d = stmt.data;
        const out = [[stmt.row.client_name], [rangeLabel(used.from, used.to)], [], ["", ...d.months.map(monthLabel), "Total"]];
        statementLines(d).forEach((l) => {
            if (l.kind === "gap") out.push([]);
            else if (l.kind === "head") out.push([l.label]);
            else out.push([l.label, ...d.months.map((m) => (Number(l.cell.values[m]) || 0).toFixed(2)), (Number(l.cell.total) || 0).toFixed(2)]);
        });
        download(`Income-Statement-${stmt.row.client_num}-${used.from}-to-${used.to}.csv`, out);
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
                <Modal title={`Income Statement : ${stmt.row.client_name}`} onClose={closeStmt} size="xlg">
                    <div className="vs-ebir">
                        <div className="vs-ebir-bar">
                            <span className="vs-range">{used ? rangeLabel(used.from, used.to) : ""}</span>
                            <div className="vs-ebir-actions">
                                <button type="button" className="btn" onClick={exportStatement} disabled={!stmt.data}>Export CSV</button>
                                <button type="button" className="btn btn-primary" onClick={() => setPrinting(true)} disabled={!stmt.data}>Print</button>
                            </div>
                        </div>
                        {stmt.error && <div className="alert-error" role="alert">{stmt.error}</div>}
                        {!stmt.data && <div className="vs-empty vs-ebir-empty">{stmt.loading ? "Loading the income statement…" : ""}</div>}
                        {stmt.data && <StatementTable data={stmt.data} />}
                    </div>
                </Modal>
            )}

            {printing && stmt?.data && createPortal(
                <div className="vs-print-root">
                    <h2>{stmt.row.client_name}</h2>
                    <div className="vp-meta"><span>Income Statement</span><span>{rangeLabel(used.from, used.to)}</span></div>
                    <StatementTable data={stmt.data} print />
                </div>, document.body)}
        </div>
    );
}

function StatementTable({ data, print = false }) {
    const months = data.months;
    const lines = statementLines(data);
    return (
        <div className={print ? "" : "vs-ebir-scroll"}>
            <table className={print ? "vp-table" : "vs-ebir-table is-stmt"}>
                <thead>
                    <tr><th className="is-label">&nbsp;</th>{months.map((m) => <th key={m} className="vs-num vp-num">{MON[+m.slice(5, 7) - 1]} {m.slice(2, 4)}</th>)}<th className="vs-num vp-num">Total</th></tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => {
                        if (l.kind === "gap") return <tr key={i} className="vs-gap"><td colSpan={months.length + 2} /></tr>;
                        if (l.kind === "head") return <tr key={i} className="is-sec"><td colSpan={months.length + 2}>{l.label}</td></tr>;
                        return (
                            <tr key={i} className={`is-${l.kind}${l.kind === "total" || l.kind === "grand" ? " vp-sub" : ""}`}>
                                <td className="is-label">{l.label}</td>
                                {months.map((m) => {
                                    const v = Number(l.cell.values[m]) || 0;
                                    return <td key={m} className={`vs-num vp-num${v < 0 ? " is-neg" : ""}`}>{l.fmt(v)}</td>;
                                })}
                                <td className={`vs-num vp-num vs-total${(Number(l.cell.total) || 0) < 0 ? " is-neg" : ""}`}>{l.fmt(l.cell.total)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}