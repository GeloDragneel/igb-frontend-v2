// Reports → Reverted Summary (old pages/Reports/Reverted_Summary.php)
// Invoices the auditor sent back (Reverted): Sales / Purchases / Expenses · view the invoice · AUDITOR → Audited
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiBlob, apiFetch } from "../../context/AuthContext";
import "./RevertedSummary.css";

const TABS = [["sales", "Sales"], ["purchase", "Purchases"], ["expense", "Expenses"]];
const TITLE = { sales: "Sales / Invoicing", purchase: "Purchases / Invoice", expense: "Expenses / Transaction" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (ym) => (ym ? `${MON[+String(ym).slice(5, 7) - 1]} ${String(ym).slice(0, 4)}` : "—");
/* 1 … 4 5 [6] 7 8 … 20 */
const pageNums = (page, pages) => {
    const out = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i);
        else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
};
const dateLabel = (d) => (d ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}` : "—");

export default function RevertedSummary() {
    const notify = useToast();
    const [data, setData] = useState({ sales: [], purchase: [], expense: [], can_audit: false });
    const [tab, setTab] = useState("sales");
    const [query, setQuery] = useState("");
    const [per, setPer] = useState(15);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState(null);   // { row, inv, loading, error }
    const [audit, setAudit] = useState(null); // { remarks }
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await apiFetch("/reports/reverted"));
        } catch (e) {
            notify(e.message || "Couldn't load the reverted invoices.", "error");
        } finally {
            setLoading(false);
        }
    }, [notify]);
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once (notify may change every render)
    useEffect(() => { setPage(0); }, [tab, query, per]);

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        const rows = data[tab] || [];
        return q ? rows.filter((r) => [r.trade_name, r.branch_code, r.invoice_no, r.document_no, r.declared_month, r.audit_remarks, r.da]
            .join(" ").toLowerCase().includes(q)) : rows;
    }, [data, tab, query]);
    const pages = Math.max(1, Math.ceil(list.length / per));
    const shown = list.slice(page * per, page * per + per);

    const open = async (row) => {
        setView({ row, type: tab, inv: null, loading: true });
        try {
            const inv = await apiFetch(`/reports/reverted/${tab}/${encodeURIComponent(row.invoice_no)}`);
            setView((v) => v && v.row === row ? { ...v, inv, loading: false } : v);
        } catch (e) {
            setView((v) => v && { ...v, loading: false, error: e.message || "Couldn't load the invoice." });
        }
    };
    const closeView = useCallback(() => setView(null), []);
    const closeAudit = useCallback(() => setAudit(null), []);

    const submitAudit = async () => {
        setBusy(true);
        try {
            await apiFetch(`/reports/reverted/${view.type}/${encodeURIComponent(view.inv.invoice_no)}/audit`, {
                method: "POST", body: JSON.stringify({ audit_status_id: 2, remarks: audit.remarks }),
            });
            notify("Record successfully updated", "success");
            setAudit(null);
            setView(null);
            load();
        } catch (e) {
            notify(e.message || "Error while processing data", "error");
        } finally {
            setBusy(false);
        }
    };

    const inv = view?.inv;
    return (
        <div className="rv">
            <section className="card rv-bar">
                <div className="rv-tabs" role="tablist">
                    {TABS.map(([k, label]) => (
                        <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
                            {label} <span className="rv-count">{(data[k] || []).length}</span>
                        </button>
                    ))}
                </div>
                <input className="input rv-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trade name, invoice, remarks, DA…" aria-label="Search" />
                <button type="button" className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            </section>

            <section className="card rv-body">
                <div className="rv-scroll">
                    <table className="rv-table">
                        <thead>
                            <tr><th aria-label="View" /><th>Trade Name</th><th>Branch Code</th><th>Invoice No</th><th>Document No</th><th>Declared Month</th><th>Remarks</th><th>DA</th></tr>
                        </thead>
                        <tbody>
                            {shown.map((r) => (
                                <tr key={r.id}>
                                    <td>
                                        <button type="button" className="rv-view" onClick={() => open(r)} aria-label={`Open ${r.invoice_no}`} title="Open">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                    </td>
                                    <td>{r.trade_name}</td>
                                    <td>{r.branch_code}</td>
                                    <td className="rv-mono">{r.invoice_no}</td>
                                    <td className="rv-mono">{r.document_no}</td>
                                    <td>{monthLabel(r.declared_month)}</td>
                                    <td className="rv-remarks" title={r.audit_remarks}>{r.audit_remarks}</td>
                                    <td>{r.da}</td>
                                </tr>
                            ))}
                            {!shown.length && (
                                <tr><td colSpan={8} className="rv-empty">{loading ? "Loading…" : query ? "Nothing matches your search." : "No reverted invoices. 🎉"}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <footer className="rv-pager">
                    <span className="rv-muted">{list.length ? `${page * per + 1}–${Math.min(list.length, page * per + per)} of ${list.length}` : "0"} record(s)</span>
                    <nav className="rv-pager-nav" aria-label="Pagination">
                        <label className="rv-pager-per">
                            Rows
                            <select className="input" value={per} onChange={(e) => setPer(+e.target.value)} aria-label="Rows per page">
                                {[15, 50, 70, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <button type="button" className="rv-pg" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
                        {pageNums(page + 1, pages).map((n, i) => (n === "…"
                            ? <span key={`g${i}`} className="rv-pg-gap">…</span>
                            : <button type="button" key={n} className={`rv-pg${n === page + 1 ? " is-on" : ""}`} onClick={() => setPage(n - 1)}
                                aria-current={n === page + 1 ? "page" : undefined}>{n}</button>))}
                        <button type="button" className="rv-pg" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
                    </nav>
                </footer>
            </section>

            {view && (
                <Modal size="xxlg" onClose={closeView}
                    title={<span className="rv-mtitle">{TITLE[view.type]} <span className="rv-tag">Reverted</span></span>}
                    footer={(
                        <div className="rv-foot">
                            <button type="button" className="btn" onClick={closeView}>Close</button>
                            {data.can_audit && inv && <button type="button" className="btn btn-primary" onClick={() => setAudit({ remarks: "" })}>Auditor</button>}
                        </div>
                    )}>
                    {view.error && <div className="alert-error" role="alert">{view.error}</div>}
                    {view.loading && <div className="rv-empty">Loading the invoice…</div>}
                    {inv && <InvoiceView type={view.type} inv={inv} />}
                </Modal>
            )}

            {audit && (
                <Modal title="Auditor Review" onClose={closeAudit}
                    footer={(
                        <div className="rv-foot">
                            <button type="button" className="btn" onClick={closeAudit}>Close</button>
                            <button type="button" className="btn btn-primary" onClick={submitAudit} disabled={busy}>{busy ? "Saving…" : "Submit"}</button>
                        </div>
                    )}>
                    <div className="rv-form">
                        <label>Audit status
                            <select className="input" value="2" disabled><option value="2">AUDITED</option></select>
                        </label>
                        <label>Remarks / Reason
                            <textarea className="input" value={audit.remarks} onChange={(e) => setAudit({ remarks: e.target.value })} />
                        </label>
                    </div>
                </Modal>
            )}
        </div>
    );
}

/* ---------- invoice popup: read-only form · attachment viewer · items ---------- */
const DISCOUNT = { 1: "Senior Citizen", 2: "PWD", 3: "Others" };
const n4 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function Field({ label, children, wide }) {
    return (
        <div className={`rv-f${wide ? " is-wide" : ""}`}>
            <span className="rv-f-label">{label}</span>
            <div className="rv-f-box">{children || <span className="rv-f-empty">—</span>}</div>
        </div>
    );
}

function AttachmentViewer({ type, invoiceNo, file }) {
    const [state, setState] = useState({ loading: !!file });
    useEffect(() => {
        if (!file) return undefined;
        let alive = true;
        let objectUrl = "";
        (async () => {
            try {
                const blob = await apiBlob(`/reports/reverted/${type}/${encodeURIComponent(invoiceNo)}/attachment`);
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
    }, [type, invoiceNo, file]);

    if (!file) return <div className="rv-viewer is-empty"><span>📄</span><b>No attachment</b><small>This invoice has no file uploaded.</small></div>;
    if (state.loading) return <div className="rv-viewer is-empty"><span className="rv-spin" /><small>Loading {file}…</small></div>;
    if (state.error) {
        return (
            <div className="rv-viewer is-empty">
                <span>⚠️</span><b>{state.error}</b><small>{file}</small>
                {state.tried && <ul className="rv-tried">{state.tried.map((k) => <li key={k}>{k}</li>)}</ul>}
            </div>
        );
    }
    if (state.kind === "link") {
        return <div className="rv-viewer is-empty"><span>🔗</span><b>Linked attachment</b><a href={state.url} target="_blank" rel="noreferrer">Open link</a></div>;
    }
    return (
        <div className="rv-viewer">
            {state.kind === "image"
                ? <div className="rv-viewer-img"><img src={state.url} alt={file} /></div>
                : <iframe src={state.url} title={file} />}
        </div>
    );
}

function InvoiceView({ type, inv }) {
    const lines = inv.lines || [];
    const vatLabel = type === "sales" ? "Output VAT" : "Input VAT";
    const party = type === "sales" ? "Customer" : "Vendor";
    return (
        <div className="rv-iv">
            {inv.audit_remarks && (
                <div className="rv-remark" role="note">
                    <b>Auditor's remarks</b>
                    <span>{inv.audit_remarks}</span>
                </div>
            )}

            <div className="rv-iv-top">
                <div className="rv-form-ro">
                    <Field label={party}>{inv.party}</Field>
                    {(inv.party_address || []).map((a, i) => <Field key={i} label="">{a}</Field>)}
                    <Field label="TIN">{inv.party_tin}</Field>
                    <Field label="Branch Code">{inv.party_branch}</Field>
                    <Field label="Invoice Date">{inv.date ? dateLabel(inv.date) : ""}</Field>
                    <Field label="Currency">{inv.currency}</Field>
                    <Field label="Exchange Rate"><span className="rv-f-num">{inv.ex_rate}</span></Field>
                    <Field label="Invoice Status">{inv.invoice_status}</Field>
                    <Field label="Remarks">{inv.remarks}</Field>
                    <Field label="Declared Month">{inv.declared_month ? monthLabel(inv.declared_month) : ""}</Field>
                    <Field label="Invoice No">{inv.invoice_no}</Field>
                    <Field label="Document #">{inv.document_no}</Field>
                    <Field label="Document Type">{inv.document_type}</Field>
                    <Field label="Accounts">{inv.account}</Field>
                    <Field label="Attachment">
                        {inv.attachment ? <span className="rv-f-file" title={inv.attachment}>{inv.attachment}</span> : ""}
                    </Field>
                </div>
                <AttachmentViewer type={type} invoiceNo={inv.invoice_no} file={inv.attachment} />
            </div>

            <div className="rv-items">
                <table>
                    <thead>
                        <tr>
                            <th className="rv-c-no">#</th><th>Description</th><th>Accounts</th><th>Unit Type</th>
                            <th className="rv-num">Qty</th><th className="rv-num">Price</th><th className="rv-num">Total</th>
                            <th className="rv-num">{vatLabel}</th><th className="rv-num">Net of VAT</th>
                            <th className="rv-num">VAT Exempt</th><th className="rv-num">Non VAT</th><th className="rv-num">Zero Rated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => (
                            <tr key={l.id}>
                                <td className="rv-c-no">{i + 1}</td>
                                <td title={l.description}>{l.description || "—"}</td>
                                <td title={l.account}>{l.account || "—"}</td>
                                <td>{l.unit_type || ""}</td>
                                <td className="rv-num">{n2(l.quantity)}</td>
                                <td className="rv-num">{n4(l.price)}</td>
                                <td className="rv-num">{n2(l.total)}</td>
                                <td className="rv-num">{n4(l.vat)}</td>
                                <td className="rv-num">{n4(l.net_of_vat)}</td>
                                <td className="rv-num">{n4(l.vat_exempt)}</td>
                                <td className="rv-num">{n4(l.non_vat)}</td>
                                <td className="rv-num">{n4(l.zero_rated)}</td>
                            </tr>
                        ))}
                        {!lines.length && <tr><td colSpan={12} className="rv-empty">No items.</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* same footer as the old screen: Sub Total … Total */}
            <div className="rv-foot-sum">
                <Field label="Sub Total"><span className="rv-f-num">{n4(inv.sub_total)}</span></Field>
                <Field label="ATC (VT/PT)">{inv.atc_vt}</Field>
                <Field label="2307 (VT/PT)"><span className="rv-f-num">{n4(inv.vt_2307)}</span></Field>
                <Field label="2307 (VT/PT) Declared Month">{inv.vt_month ? monthLabel(inv.vt_month) : ""}</Field>
                <Field label="ATC (IT)">{inv.atc_it}</Field>
                <Field label="2307 (IT)"><span className="rv-f-num">{n4(inv.it_2307)}</span></Field>
                <Field label="2307 (IT) Declared Month">{inv.it_month ? monthLabel(inv.it_month) : ""}</Field>
                <Field label="Discount Type">{DISCOUNT[inv.discount_type_id] || ""}</Field>
                <Field label="Discount Amt"><span className="rv-f-num">{n4(inv.discount)}</span></Field>
                <Field label="Total"><span className="rv-f-num is-total">{n4(inv.total)}</span></Field>
            </div>
        </div>
    );
}