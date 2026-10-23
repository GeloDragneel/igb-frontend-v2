// Administration → Ticket (old pages/Administration/List.php)
// Tickets from Sales / Purchases / Expenses (EDIT · VOID · CANCEL): view the requested change, Approve or Decline.
import { useCallback, useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiBlob, apiFetch } from "../../context/AuthContext";
import "./Ticket.css";

const STATUS = { 0: "Pending", 1: "Approved", 2: "Declined" };
const TABS = [["0", "Pending"], ["1", "Approved"], ["2", "Declined"], ["all", "All"]];
const TITLE = { sales: "Sales / Invoicing", purchase: "Purchases / Invoice", expense: "Expenses / Transaction", importation: "Importation / Purchase Order", exportation: "Exportation / Sales" };
const DISCOUNT = { 1: "Senior Citizen", 2: "PWD", 3: "Others" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n4 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const monthLabel = (ym) => (ym ? `${MON[+String(ym).slice(5, 7) - 1]} ${String(ym).slice(0, 4)}` : "");
const dateLabel = (d) => (d ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}` : "");
const stamp = (d) => (d ? `${dateLabel(d)} ${d.slice(11, 16)}` : "");
/* 1 … 4 5 [6] 7 8 … 20 */
const pageNums = (page, pages) => {
    const out = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i);
        else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
};

export default function AdminTicket() {
    const notify = useToast();
    const [rows, setRows] = useState([]);         // this page only (paged on the server)
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ all: 0, 0: 0, 1: 0, 2: 0 });
    const [tab, setTab] = useState("0");          // default: Pending
    const [query, setQuery] = useState("");
    const [q, setQ] = useState("");               // search sent to the server, after typing stops
    const [per, setPer] = useState(15);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState(null);       // { row, data, loading, error, side }
    const [confirm, setConfirm] = useState(null); // "approve" | "decline"
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams({ status: tab, page: page + 1, per });
            if (q) p.set("q", q);
            const res = await apiFetch(`/admin/tickets?${p}`);
            setRows(res.rows || []);
            setTotal(res.total || 0);
            setCounts(res.counts || { all: 0, 0: 0, 1: 0, 2: 0 });
            if (res.page && res.page - 1 !== page) setPage(res.page - 1); // page no longer exists (e.g. after approving the last row)
        } catch (e) {
            notify(e.message || "Couldn't load the tickets.", "error");
        } finally {
            setLoading(false);
        }
    }, [tab, q, page, per]); // eslint-disable-line react-hooks/exhaustive-deps -- notify may change every render
    useEffect(() => { load(); }, [load]);
    // new search / tab / rows-per-page → back to page 1 (in the same render, so only one request is sent)
    useEffect(() => {
        const id = setTimeout(() => { const v = query.trim(); if (v !== q) { setQ(v); setPage(0); } }, 400);
        return () => clearTimeout(id);
    }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

    const pages = Math.max(1, Math.ceil(total / per));
    const shown = rows;

    const open = async (row) => {
        setView({ row, data: null, loading: true, side: "requested" });
        try {
            const data = await apiFetch(`/admin/tickets/${encodeURIComponent(row.ticket_no)}`);
            setView((v) => (v && v.row === row ? { ...v, data, loading: false } : v));
        } catch (e) {
            setView((v) => v && { ...v, loading: false, error: e.message || "Couldn't load the ticket." });
        }
    };
    const closeView = useCallback(() => setView(null), []);
    const closeConfirm = useCallback(() => setConfirm(null), []);

    const submit = async () => {
        const what = confirm;
        setBusy(true);
        try {
            const res = await apiFetch(`/admin/tickets/${encodeURIComponent(view.row.ticket_no)}/${what}`, { method: "POST", body: "{}" });
            notify(res.message || (what === "approve" ? "Ticket Successfully Approved" : "Ticket Successfully Declined"), "success");
            setConfirm(null);
            setView(null);
            load();
        } catch (e) {
            notify(e.message || "Error while processing data", "error");
        } finally {
            setBusy(false);
        }
    };

    const data = view?.data;
    const t = data?.ticket;
    const pending = t && t.status === 0;
    const inv = data && (view.side === "before" && data.before ? data.before : data.requested);

    return (
        <div className="at">
            <section className="card at-bar">
                <div className="at-tabs" role="tablist">
                    {TABS.map(([k, label]) => (
                        <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => { setTab(k); setPage(0); }}>
                            {label} <span className={`at-count${k === "0" && counts[0] ? " is-hot" : ""}`}>{counts[k] || 0}</span>
                        </button>
                    ))}
                </div>
                <input className="input at-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ticket, reference, remarks, user…" aria-label="Search" />
                <button type="button" className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            </section>

            <section className="card at-body">
                <div className="at-scroll">
                    <table className="at-table">
                        <thead>
                            <tr>
                                <th aria-label="View" /><th>Ticket No</th><th>Reference No</th><th>Module</th><th>Remarks</th>
                                <th>Action</th><th>Requested By</th><th>Date Added</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r) => (
                                <tr key={r.id}>
                                    <td>
                                        <button type="button" className="at-view" onClick={() => open(r)} aria-label={`Open ${r.ticket_no}`} title="View">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </button>
                                    </td>
                                    <td className="at-mono">{r.ticket_no}</td>
                                    <td className="at-mono">{r.reference_no}</td>
                                    <td>{r.module}</td>
                                    <td className="at-remarks" title={r.remarks}>{r.remarks}</td>
                                    <td><span className={`at-act is-${(r.action || "").toLowerCase()}`}>{r.action}</span></td>
                                    <td><div className="at-who"><b>{r.requested_by || "—"}</b>{r.trade_name && <small>{r.trade_name}</small>}</div></td>
                                    <td>{stamp(r.date_added)}</td>
                                    <td><span className={`at-status is-${r.status}`}>{STATUS[r.status] || r.status}</span></td>
                                </tr>
                            ))}
                            {!shown.length && (
                                <tr><td colSpan={9} className="at-empty">{loading ? "Loading…" : query ? "Nothing matches your search." : "No tickets."}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <footer className="at-pager">
                    <span className="at-muted">{total ? `${page * per + 1}–${Math.min(total, page * per + per)} of ${total.toLocaleString()}` : "0"} record(s)</span>
                    <nav className="at-pager-nav" aria-label="Pagination">
                        <label className="at-pager-per">
                            Rows
                            <select className="input" value={per} onChange={(e) => { setPer(+e.target.value); setPage(0); }} aria-label="Rows per page">
                                {[15, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <button type="button" className="at-pg" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
                        {pageNums(page + 1, pages).map((n, i) => (n === "…"
                            ? <span key={`g${i}`} className="at-pg-gap">…</span>
                            : <button type="button" key={n} className={`at-pg${n === page + 1 ? " is-on" : ""}`} onClick={() => setPage(n - 1)}
                                aria-current={n === page + 1 ? "page" : undefined}>{n}</button>))}
                        <button type="button" className="at-pg" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
                    </nav>
                </footer>
            </section>

            {view && (
                <Modal size="xl" onClose={closeView}
                    title={(
                        <span className="at-mtitle">
                            {data ? TITLE[data.type] : view.row.module}
                            <span className={`at-tag is-${t ? t.status : view.row.status}`}>{STATUS[t ? t.status : view.row.status]}</span>
                        </span>
                    )}
                    footer={(
                        <div className="at-foot">
                            <button type="button" className="btn" onClick={closeView}>Close</button>
                            {pending && <button type="button" className="btn at-decline" onClick={() => setConfirm("decline")}>Decline</button>}
                            {pending && <button type="button" className="btn btn-primary" onClick={() => setConfirm("approve")}>Approve</button>}
                        </div>
                    )}>
                    {view.error && <div className="alert-error" role="alert">{view.error}</div>}
                    {view.loading && <div className="at-empty">Loading the ticket…</div>}
                    {data && (
                        <div className="at-iv">
                            <div className="at-ticket">
                                <div className="at-ticket-info">
                                    <span className={`at-act is-${t.action.toLowerCase()}`}>{t.action}</span>
                                    <span className="at-mono">{t.ticket_no}</span>
                                    <span>by <b>{t.requested_by || "—"}</b>{t.trade_name ? ` · ${t.trade_name}` : ""}</span>
                                    <span>{stamp(t.date_added)}</span>
                                </div>
                                <div className="at-reason"><b>Reason</b><span>{t.remarks || "—"}</span></div>
                            </div>

                            {data.before && t.action !== "UNDECLARED" && (
                                <div className="at-switch" role="tablist" aria-label="Show">
                                    <button type="button" role="tab" aria-selected={view.side === "requested"} className={view.side === "requested" ? "is-on" : ""}
                                        onClick={() => setView({ ...view, side: "requested" })}>Requested change</button>
                                    <button type="button" role="tab" aria-selected={view.side === "before"} className={view.side === "before" ? "is-on" : ""}
                                        onClick={() => setView({ ...view, side: "before" })}>{t.status === 1 ? "Before approval" : "Current invoice"}</button>
                                    {view.side === "requested" && <span className="at-legend"><i /> changed</span>}
                                </div>
                            )}

                            {data.type === "importation" || data.type === "exportation" ? (
                                <TradeView key={view.side} type={data.type} inv={inv} ticketNo={t.ticket_no} which={view.side}
                                    compare={view.side === "requested" ? data.before : null} />
                            ) : (
                                <InvoiceView key={view.side} type={data.type} inv={inv} ticketNo={t.ticket_no} which={view.side}
                                    compare={view.side === "requested" && t.action !== "UNDECLARED" ? data.before : null} />
                            )}
                        </div>
                    )}
                </Modal>
            )}

            {confirm && (
                <Modal title={confirm === "approve" ? "Approve ticket" : "Decline ticket"} onClose={closeConfirm}
                    footer={(
                        <div className="at-foot">
                            <button type="button" className="btn" onClick={closeConfirm} disabled={busy}>No</button>
                            <button type="button" className={`btn ${confirm === "approve" ? "btn-primary" : "at-decline"}`} onClick={submit} disabled={busy}>
                                {busy ? "Processing…" : "Yes"}
                            </button>
                        </div>
                    )}>
                    <p className="at-confirm">Are you sure you want to {confirm} this transaction?
                        {confirm === "approve" && t?.action === "VOID" && <><br /><small>The invoice will be VOID and its lines removed.</small></>}
                    </p>
                </Modal>
            )}
        </div>
    );
}

/* ---------- popup body: read-only form · attachment viewer · items · footer totals ---------- */

function Field({ label, children, changed }) {
    return (
        <div className={`at-f${changed ? " is-changed" : ""}`}>
            <span className="at-f-label">{label}</span>
            <div className="at-f-box" title={typeof children === "string" ? children : undefined}>{children || <span className="at-f-empty">—</span>}</div>
        </div>
    );
}

function AttachmentViewer({ ticketNo, which, file }) {
    const [state, setState] = useState({ loading: !!file });
    useEffect(() => {
        if (!file) return undefined;
        let alive = true;
        let objectUrl = "";
        (async () => {
            try {
                const blob = await apiBlob(`/admin/tickets/${encodeURIComponent(ticketNo)}/attachment?which=${which}`);
                if (!alive) return;
                if (blob.type === "application/json") { // { url } = link attachment · { missing } = not on S3
                    const j = JSON.parse(await blob.text());
                    setState(j.url ? { url: j.url, kind: "link" } : { error: j.message || "File not found.", tried: j.tried });
                    return;
                }
                objectUrl = URL.createObjectURL(blob);
                setState({ url: objectUrl, kind: blob.type.startsWith("image/") ? "image" : "pdf" });
            } catch (e) {
                if (!alive) return;
                const msg = e.message || "Couldn't load the attachment.";
                setState({ error: /404/.test(msg) ? "Attachment route not found — add the /attachment route and run php artisan route:clear." : msg });
            }
        })();
        return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [ticketNo, which, file]);

    if (!file) return <div className="at-viewer is-empty"><span>📄</span><b>No attachment</b><small>This invoice has no file uploaded.</small></div>;
    if (state.loading) return <div className="at-viewer is-empty"><span className="at-spin" /><small>Loading {file}…</small></div>;
    if (state.error) {
        return (
            <div className="at-viewer is-empty">
                <span>⚠️</span><b>{state.error}</b><small>{file}</small>
                {state.tried && <ul className="at-tried">{state.tried.map((k) => <li key={k}>{k}</li>)}</ul>}
            </div>
        );
    }
    if (state.kind === "link") {
        return <div className="at-viewer is-empty"><span>🔗</span><b>Linked attachment</b><a href={state.url} target="_blank" rel="noreferrer">Open link</a></div>;
    }
    return (
        <div className="at-viewer">
            {state.kind === "image"
                ? <div className="at-viewer-img"><img src={state.url} alt={file} /></div>
                : <iframe src={state.url} title={file} />}
        </div>
    );
}

function InvoiceView({ type, inv, compare, ticketNo, which }) {
    const lines = inv.lines || [];
    const vatLabel = type === "sales" ? "Output VAT" : "Input VAT";
    const party = type === "sales" ? "Customer" : "Vendor";
    const diff = (k) => !!compare && String(compare[k] ?? "") !== String(inv[k] ?? "");
    const linesChanged = !!compare && JSON.stringify(compare.lines) !== JSON.stringify(inv.lines);
    return (
        <div className="at-inv">
            <div className="at-iv-top">
                <div className="at-form-ro">
                    <Field label={party} changed={diff("party")}>{inv.party}</Field>
                    {(inv.party_address || []).map((a, i) => <Field key={i} label="">{a}</Field>)}
                    <Field label="TIN">{inv.party_tin}</Field>
                    <Field label="Branch Code">{inv.party_branch}</Field>
                    <Field label="Invoice Date" changed={diff("date")}>{dateLabel(inv.date)}</Field>
                    <Field label="Currency" changed={diff("currency")}>{inv.currency}</Field>
                    <Field label="Exchange Rate" changed={diff("ex_rate")}><span className="at-f-num">{inv.ex_rate}</span></Field>
                    <Field label="Invoice Status" changed={diff("invoice_status")}>{inv.invoice_status}</Field>
                    <Field label="Remarks" changed={diff("remarks")}>{inv.remarks}</Field>
                    <Field label="Declared Month" changed={diff("declared_month")}>{monthLabel(inv.declared_month)}</Field>
                    <Field label="Invoice No">{inv.invoice_no}</Field>
                    <Field label="Document #" changed={diff("document_no")}>{inv.document_no}</Field>
                    <Field label="Document Type" changed={diff("document_type")}>{inv.document_type}</Field>
                    <Field label="Accounts" changed={diff("account")}>{inv.account}</Field>
                    <Field label="Attachment" changed={diff("attachment")}>
                        {inv.attachment ? <span className="at-f-file" title={inv.attachment}>{inv.attachment}</span> : ""}
                    </Field>
                </div>
                <AttachmentViewer ticketNo={ticketNo} which={which} file={inv.attachment} />
            </div>

            <div className={`at-items${linesChanged ? " is-changed" : ""}`}>
                <table>
                    <thead>
                        <tr>
                            <th className="at-c-no">#</th><th>Description</th><th>Accounts</th><th>Unit Type</th>
                            <th className="at-num">Qty</th><th className="at-num">Price</th><th className="at-num">Total</th>
                            <th className="at-num">{vatLabel}</th><th className="at-num">Net of VAT</th>
                            <th className="at-num">VAT Exempt</th><th className="at-num">Non VAT</th><th className="at-num">Zero Rated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => (
                            <tr key={i}>
                                <td className="at-c-no">{i + 1}</td>
                                <td title={l.description}>{l.description || "—"}</td>
                                <td title={l.account}>{l.account || "—"}</td>
                                <td>{l.unit_type}</td>
                                <td className="at-num">{n2(l.quantity)}</td>
                                <td className="at-num">{n4(l.price)}</td>
                                <td className="at-num">{n2(l.total)}</td>
                                <td className="at-num">{n4(l.vat)}</td>
                                <td className="at-num">{n4(l.net_of_vat)}</td>
                                <td className="at-num">{n4(l.vat_exempt)}</td>
                                <td className="at-num">{n4(l.non_vat)}</td>
                                <td className="at-num">{n4(l.zero_rated)}</td>
                            </tr>
                        ))}
                        {!lines.length && <tr><td colSpan={12} className="at-empty">No items.</td></tr>}
                    </tbody>
                </table>
            </div>

            <div className="at-foot-sum">
                <Field label="Sub Total" changed={diff("sub_total")}><span className="at-f-num">{n4(inv.sub_total)}</span></Field>
                <Field label="ATC (VT/PT)" changed={diff("atc_vt")}>{inv.atc_vt}</Field>
                <Field label="2307 (VT/PT)" changed={diff("vt_2307")}><span className="at-f-num">{n4(inv.vt_2307)}</span></Field>
                <Field label="2307 (VT/PT) Declared Month" changed={diff("vt_month")}>{monthLabel(inv.vt_month)}</Field>
                <Field label="ATC (IT)" changed={diff("atc_it")}>{inv.atc_it}</Field>
                <Field label="2307 (IT)" changed={diff("it_2307")}><span className="at-f-num">{n4(inv.it_2307)}</span></Field>
                <Field label="2307 (IT) Declared Month" changed={diff("it_month")}>{monthLabel(inv.it_month)}</Field>
                <Field label="Discount Type" changed={diff("discount_type_id")}>{DISCOUNT[inv.discount_type_id] || ""}</Field>
                <Field label="Discount Amt" changed={diff("discount")}><span className="at-f-num">{n4(inv.discount)}</span></Field>
                <Field label="Total" changed={diff("total")}><span className="at-f-num is-total">{n4(inv.total)}</span></Field>
            </div>
        </div>
    );
}

/* Importation / Exportation ticket: their own fields and lines */
function TradeView({ type, inv, compare, ticketNo, which }) {
    const imp = type === "importation";
    const lines = inv.lines || [];
    const tot = inv.totals || {};
    const diff = (k) => !!compare && String(compare[k] ?? "") !== String(inv[k] ?? "");
    const diffTot = (k) => !!compare && String(compare.totals?.[k] ?? "") !== String(tot[k] ?? "");
    const linesChanged = !!compare && JSON.stringify(compare.lines) !== JSON.stringify(inv.lines);
    const cols = imp
        ? [["total_landed_cost", "Total Landed Cost"], ["charges_from_custom", "Charges from Customs"], ["dutiable_value", "Dutiable Value"],
        ["amount_of_vat", "VAT"], ["taxable_imports", "Taxable Imports"], ["exempt_imports", "Exempt Imports"]]
        : [["quantity", "Qty"], ["fob_amount", `FOB (${inv.currency || ""})`], ["peso_amount", "Peso Amount"]];
    const totals = imp
        ? [["total_landed_cost", "Total Landed Cost"], ["total_charge_before", "Charges from Customs"], ["total_dutiable_value", "Dutiable Value"],
        ["total_vat", "Total VAT"], ["total_taxable_imports", "Taxable Imports"], ["total_exempt_imports", "Exempt Imports"]]
        : [["total_fob_amount", `Total FOB (${inv.currency || ""})`], ["total_peso_amount", "Total Peso Amount"]];
    return (
        <div className="at-inv">
            <div className="at-iv-top">
                <div className="at-form-ro">
                    <Field label={imp ? "Seller" : "Buyer"} changed={diff("party")}>{inv.party}</Field>
                    {(inv.party_address || []).map((a, i) => <Field key={i} label="">{a}</Field>)}
                    <Field label={imp ? "Release Date" : "Export Date"} changed={diff("date")}>{dateLabel(inv.date)}</Field>
                    <Field label="Invoice No" changed={diff("invoice_no")}>{inv.invoice_no}</Field>
                    <Field label={imp ? "Import Entry No" : "Export Entry No"} changed={diff("entry_no")}>{inv.entry_no}</Field>
                    <Field label={imp ? "Origin Country" : "Destination Country"} changed={diff("country")}>{inv.country}</Field>
                    <Field label={imp ? "VAT Payment Date" : "Payment Date"} changed={diff("pay_date")}>{dateLabel(inv.pay_date)}</Field>
                    <Field label="Currency" changed={diff("currency")}>{inv.currency}</Field>
                    <Field label="Exchange Rate" changed={diff("ex_rate")}><span className="at-f-num">{inv.ex_rate}</span></Field>
                    <Field label="Status" changed={diff("invoice_status_id")}>{inv.invoice_status || (inv.invoice_status_id === 5 ? "VOID" : "ACTIVE")}</Field>
                    <Field label="Declared Month" changed={diff("declared_month")}>{monthLabel(inv.declared_month)}</Field>
                    <Field label="Document Type" changed={diff("document_type")}>{inv.document_type}</Field>
                    <Field label="Accounts" changed={diff("account")}>{inv.account}</Field>
                    <Field label="Remarks" changed={diff("remarks")}>{inv.remarks}</Field>
                    <Field label="Attachment" changed={diff("attachment")}>
                        {inv.attachment ? <span className="at-f-file" title={inv.attachment}>{inv.attachment}</span> : ""}
                    </Field>
                </div>
                <AttachmentViewer ticketNo={ticketNo} which={which} file={inv.attachment} />
            </div>

            <div className={`at-items${linesChanged ? " is-changed" : ""}`}>
                <table>
                    <thead>
                        <tr>
                            <th className="at-c-no">#</th><th>Description</th><th>Accounts</th>
                            {cols.map(([k, l]) => <th key={k} className="at-num">{l}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => (
                            <tr key={i}>
                                <td className="at-c-no">{i + 1}</td>
                                <td title={l.description}>{[l.item_code, l.description].filter(Boolean).join(" - ") || "—"}</td>
                                <td title={l.account}>{l.account || "—"}</td>
                                {cols.map(([k]) => <td key={k} className="at-num">{n4(l[k])}</td>)}
                            </tr>
                        ))}
                        {!lines.length && <tr><td colSpan={3 + cols.length} className="at-empty">No items.</td></tr>}
                    </tbody>
                </table>
            </div>

            <div className="at-foot-sum">
                {totals.map(([k, l], i) => (
                    <Field key={k} label={l} changed={diffTot(k)}>
                        <span className={`at-f-num${i === totals.length - 1 || k === "total_landed_cost" ? " is-total" : ""}`}>{n4(tot[k])}</span>
                    </Field>
                ))}
            </div>
        </div>
    );
}