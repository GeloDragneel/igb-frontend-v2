// Reports → Expanded Withholding Tax (old pages/Reports/Expanded_Withholding_Tax.php)
// Clients with 2307 IT withheld (AP invoices + receive inventory) · branch rows
// Client name → per ATC (amount, rate, tax withheld) with its documents · print · CSV.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./VATSummary.css";
import "./ExpandedWithholdingTax.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const today = new Date();
const THIS_MONTH = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
const QUARTER_START = `${today.getFullYear()}-${pad(Math.floor(today.getMonth() / 3) * 3 + 1)}`;
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "-" : n2(v));
const monthLabel = (ym) => (ym ? `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "");
const rangeLabel = (a, b) => (a === b ? monthLabel(a) : `${monthLabel(a)} to ${monthLabel(b)}`);

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

export default function ExpandedWithholdingTax() {
    const notify = useToast();
    const [from, setFrom] = useState(QUARTER_START);
    const [to, setTo] = useState(THIS_MONTH);
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState([]);
    const [used, setUsed] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [branches, setBranches] = useState({});
    const [atc, setAtc] = useState(null); // { row, data, open: {}, loading, error }
    const [printing, setPrinting] = useState(false);
    const seq = useRef(0);

    const load = useCallback(async (f = from, t = to) => {
        if (!f || !t) return notify("Pick the From and To months.", "error");
        if (f > t) return notify("From must be on or before To.", "error");
        const my = ++seq.current;
        setLoading(true);
        setError("");
        try {
            const r = await apiFetch(`/reports/ewt-clients?${new URLSearchParams({ from: f, to: t })}`);
            if (my !== seq.current) return;
            setRows(r.rows || []);
            setUsed({ from: f, to: t });
            setBranches({});
        } catch (e) {
            if (my === seq.current) setError(e.message || "Couldn't load the expanded withholding tax.");
        } finally {
            if (my === seq.current) setLoading(false);
        }
    }, [from, to, notify]);

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((r) => `${r.client_name} ${r.client_num}`.toLowerCase().includes(q)) : rows;
    }, [rows, query]);
    const totals = useMemo(() => ({
        amount: shown.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        tax: shown.reduce((s, r) => s + (Number(r.tax_withheld) || 0), 0),
    }), [shown]);

    const toggleBranches = async (r) => {
        if (branches[r.client_num]) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            return;
        }
        setBranches((b) => ({ ...b, [r.client_num]: "loading" }));
        try {
            const res = await apiFetch(`/reports/ewt-clients/branches?${new URLSearchParams({ from: used.from, to: used.to, client_num: r.client_num })}`);
            setBranches((b) => ({ ...b, [r.client_num]: res.rows || [] }));
        } catch (e) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            notify(e.message || "Couldn't load the branch accounts.", "error");
        }
    };

    const openAtc = async (row) => {
        setAtc({ row, data: null, open: {}, loading: true });
        try {
            const data = await apiFetch(`/reports/ewt-clients/atc?${new URLSearchParams({ user_ids: row.user_ids, from: used.from, to: used.to, client_num: row.client_num })}`);
            setAtc((a) => a && a.row === row ? { ...a, data, loading: false } : a);
        } catch (e) {
            setAtc((a) => a && { ...a, loading: false, error: e.message || "Couldn't load the ATC details." });
        }
    };
    const closeAtc = useCallback(() => setAtc(null), []);

    useEffect(() => {
        if (!printing) return undefined;
        const done = () => setPrinting(false);
        window.addEventListener("afterprint", done);
        const t = setTimeout(() => window.print(), 50);
        return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
    }, [printing]);

    const exportList = () => {
        const out = [["#", "Client", "Amount", "Tax Withheld"]];
        shown.forEach((r, i) => out.push([i + 1, r.client_name, r.amount.toFixed(2), r.tax_withheld.toFixed(2)]));
        out.push(["", "TOTAL", totals.amount.toFixed(2), totals.tax.toFixed(2)]);
        download(`Expanded-Withholding-Tax-${used.from}-to-${used.to}.csv`, out);
    };
    const exportAtc = () => {
        const out = [[atc.row.client_name], [rangeLabel(used.from, used.to)], [],
        ["ATC", "TIN", "Document No", "Branch Code", "Registered Name", "Amount", "Tax Rate", "Tax Withheld"]];
        atc.data.atcs.forEach((a) => {
            a.documents.forEach((d) => out.push([a.atc, d.tin, d.document_no, d.branch_code, d.vendor_name, d.amount.toFixed(2), d.rate, d.tax_withheld.toFixed(2)]));
            out.push([`${a.atc} total`, "", "", "", "", a.amount.toFixed(2), a.rate, a.tax_withheld.toFixed(2)]);
        });
        download(`EWT-${atc.row.client_num}-${used.from}-to-${used.to}.csv`, out);
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
                <button type="button" className="vs-client" title={`${r.client_name} — per ATC`} onClick={() => openAtc(r)}>{r.client_name}</button>
            </td>
            <td className="vs-num">{dash(r.amount)}</td>
            <td className="vs-num is-net">{dash(r.tax_withheld)}</td>
        </tr>
    );

    const atcTotals = atc?.data ? {
        amount: atc.data.atcs.reduce((s, a) => s + a.amount, 0),
        tax: atc.data.atcs.reduce((s, a) => s + a.tax_withheld, 0),
    } : null;
    const client = atc?.data?.client;

    return (
        <div className="vs is-ewt">
            <section className="card vs-bar">
                <div className="vs-period">
                    <span>Expanded withholding tax</span>
                    <b>{used ? rangeLabel(used.from, used.to) : "—"}</b>
                </div>
                <label className="vs-field"><span>From</span>
                    <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="vs-field"><span>To</span>
                    <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                <label className="vs-field vs-grow"><span>Find</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client name or number" /></label>
                <div className="vs-actions">
                    <button type="button" className="btn btn-primary" onClick={() => load()} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
                    <button type="button" className="btn" onClick={exportList} disabled={!shown.length}>Export CSV</button>
                </div>
            </section>

            {error && <div className="alert-error vs-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}

            <section className="card vs-body">
                <div className="vs-scroll">
                    <table className="vs-table">
                        <colgroup><col className="vs-w0" /><col className="vs-w1" /><col className="vs-w2" /><col className="is-wn" /><col className="is-wn" /></colgroup>
                        <thead>
                            <tr className="is-head">
                                <th className="vs-f0" /><th className="vs-f1">#</th><th className="vs-f2 vs-left">Client</th>
                                <th className="vs-num">Amount</th><th className="vs-num is-net">Tax Withheld</th>
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
                                <tr><td colSpan={5} className="vs-empty">
                                    {loading ? "Loading…" : used ? "No tax withheld in this period." : "Pick a period and press Search."}
                                </td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th className="vs-f0" /><th className="vs-f1" /><th className="vs-f2 vs-left">Total · {shown.length} client{shown.length === 1 ? "" : "s"}</th>
                                <th className="vs-num">{n2(totals.amount)}</th><th className="vs-num is-net">{n2(totals.tax)}</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>

            {atc && (
                <Modal title={`Details : ${atc.row.client_name}`} onClose={closeAtc} size="xlg">
                    <div className="vs-ebir ewt-atc">
                        <div className="vs-ebir-bar">
                            <div className="ewt-head">
                                <span>Period <b>{used ? rangeLabel(used.from, used.to) : ""}</b></span>
                                {client?.tin && <span>TIN <b>{client.tin}{client.branch_code ? `-${client.branch_code}` : ""}</b></span>}
                            </div>
                            <div className="vs-ebir-actions">
                                <button type="button" className="btn" onClick={exportAtc} disabled={!atc.data?.atcs?.length}>Export CSV</button>
                                <button type="button" className="btn btn-primary" onClick={() => setPrinting(true)} disabled={!atc.data?.atcs?.length}>Print</button>
                            </div>
                        </div>
                        {atc.error && <div className="alert-error" role="alert">{atc.error}</div>}
                        <div className="vs-docs-scroll">
                            <table className="vs-mini">
                                <thead><tr><th /><th>ATC</th><th className="vs-num">Amount</th><th className="vs-num">Rate</th><th className="vs-num">Tax Withheld</th></tr></thead>
                                <tbody>
                                    {atc.loading && <tr><td colSpan={5} className="vs-empty">Loading…</td></tr>}
                                    {!atc.loading && !atc.data?.atcs?.length && <tr><td colSpan={5} className="vs-empty">No tax withheld.</td></tr>}
                                    {(atc.data?.atcs || []).map((a) => {
                                        const open = !!atc.open[a.atc];
                                        return (
                                            <Fragment key={a.atc || "none"}>
                                                <tr className={open ? "is-open" : ""}>
                                                    <td className="is-toggle">
                                                        <button type="button" className={`vs-expand${open ? " is-open" : ""}`} aria-label={open ? "Hide documents" : "Show documents"}
                                                            onClick={() => setAtc((x) => ({ ...x, open: { ...x.open, [a.atc]: !open } }))}>▸</button>
                                                    </td>
                                                    <td>{a.atc || "—"}</td>
                                                    <td className="vs-num">{n2(a.amount)}</td>
                                                    <td className="vs-num">{n2(a.rate)}</td>
                                                    <td className="vs-num">{n2(a.tax_withheld)}</td>
                                                </tr>
                                                {open && (
                                                    <tr><td colSpan={5} className="ewt-docs-cell"><DocTable docs={a.documents} /></td></tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                                {atcTotals && (
                                    <tfoot><tr><th /><th>Total</th><th className="vs-num">{n2(atcTotals.amount)}</th><th /><th className="vs-num">{n2(atcTotals.tax)}</th></tr></tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </Modal>
            )}

            {printing && atc?.data && createPortal(
                <div className="vs-print-root">
                    <h2>{client?.client_name || atc.row.client_name}</h2>
                    <div className="vp-meta">
                        <span>Expanded Withholding Tax</span><span>{rangeLabel(used.from, used.to)}</span>
                        {client?.tin && <span>TIN : {client.tin}{client.branch_code ? `-${client.branch_code}` : ""}</span>}
                    </div>
                    <table className="vp-table">
                        <thead><tr><th>#</th><th>TIN</th><th>Document No</th><th>Branch Code</th><th>Registered Name</th><th>ATC</th>
                            <th className="vp-num">Amount</th><th className="vp-num">Tax Rate</th><th className="vp-num">Tax Withheld</th></tr></thead>
                        <tbody>
                            {atc.data.atcs.map((a) => (
                                <Fragment key={a.atc || "none"}>
                                    {a.documents.map((d, i) => (
                                        <tr key={`${d.reference_no}-${i}`}>
                                            <td>{i + 1}</td><td>{d.tin}</td><td>{d.document_no}</td><td>{d.branch_code}</td><td>{d.vendor_name}</td><td>{d.atc}</td>
                                            <td className="vp-num">{n2(d.amount)}</td><td className="vp-num">{n2(d.rate)}</td><td className="vp-num">{n2(d.tax_withheld)}</td>
                                        </tr>
                                    ))}
                                    <tr className="vp-sub"><td colSpan={6}>{a.atc} total</td><td className="vp-num">{n2(a.amount)}</td><td className="vp-num">{n2(a.rate)}</td><td className="vp-num">{n2(a.tax_withheld)}</td></tr>
                                </Fragment>
                            ))}
                            <tr className="vp-grand"><td colSpan={6}>Total</td><td className="vp-num">{n2(atcTotals.amount)}</td><td /><td className="vp-num">{n2(atcTotals.tax)}</td></tr>
                        </tbody>
                    </table>
                </div>, document.body)}
        </div>
    );
}

function DocTable({ docs }) {
    return (
        <table className="ewt-docs">
            <thead><tr><th>#</th><th>TIN</th><th>Document No</th><th>Branch Code</th><th>Registered Name</th><th>ATC</th>
                <th className="vs-num">Amount</th><th className="vs-num">Tax Rate</th><th className="vs-num">Tax Withheld</th></tr></thead>
            <tbody>
                {docs.map((d, i) => (
                    <tr key={`${d.reference_no}-${i}`}>
                        <td>{i + 1}</td><td>{d.tin}</td><td>{d.document_no}</td><td>{d.branch_code}</td><td>{d.vendor_name}</td><td>{d.atc}</td>
                        <td className="vs-num">{n2(d.amount)}</td><td className="vs-num">{n2(d.rate)}</td><td className="vs-num">{n2(d.tax_withheld)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}