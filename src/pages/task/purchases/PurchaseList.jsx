// Purchases lists (old Vendor_Invoices.php tabs)
//   MAIN · Scanned Receipts · Invalid / Partially Invalid / Cancel · For Payment
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Modal, { Field } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { usePeriod } from "../../../context/PeriodContext";
import { statusTone, auditTone } from "../Sales";

export const PURCHASE_PATH = "/task/purchases"; // change if your sidebar path is different

export const PURCHASE_TABS = [
    { to: PURCHASE_PATH, label: "MAIN", end: true },
    { to: `${PURCHASE_PATH}/scanned-receipts`, label: "Scanned Receipts" },
    { to: `${PURCHASE_PATH}/invalid`, label: "Invalid / Partially Invalid / Cancel" },
    { to: `${PURCHASE_PATH}/for-payment`, label: "For Payment" },
];

const TABLE_HEIGHT = "calc(100vh - 400px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtDay = (iso) => {
    if (!iso) return "\u2014";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const fmt4 = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmt2 = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// receipt status on the Invalid tab (same labels and colours as the old page)
const SCAN_STATUS = {
    2: { label: "Invalid", tone: "red" },
    3: { label: "Partially Invalid", tone: "blue" },
    4: { label: "For Payment", tone: "blue" },
    5: { label: "Cancel", tone: "dark" },
};

const VIEWS = {
    main: { title: "purchases", empty: "No purchases for this period." },
    payment: { title: "for-payment", empty: "Nothing for payment in this period." },
    invalid: { title: "invalid-purchases", empty: "No invalid, partially invalid or cancelled receipts." },
};

/* =========================================================
   Shared list
   ========================================================= */
function PurchaseList({ view }) {
    const { user } = useAuth();
    const { from, to } = usePeriod();
    const navigate = useNavigate();
    const location = useLocation();
    const notify = useToast();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState([]);
    const [clearTicks, setClearTicks] = useState(0);
    const [showOverride, setShowOverride] = useState(false);
    const [journalFor, setJournalFor] = useState(null);

    const fromMonth = from.slice(0, 7);
    const toMonth = to.slice(0, 7);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRows(await apiFetch(`/purchases?from=${fromMonth}&to=${toMonth}&view=${view}`));
        } catch (e) {
            setError(e.message || "Couldn't load purchases.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [fromMonth, toMonth, view]);

    useEffect(() => { load(); }, [load, user?.id, user?.caid]);
    useEffect(() => { setClearTicks((n) => n + 1); }, [view]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [r.vendor_name, r.invoice_no, r.document_no, r.status, r.audit_status, r.reason, SCAN_STATUS[r.scan_status]?.label]
                .join(" ").toLowerCase().includes(q)
        );
    }, [rows, query]);

    // Invalid tab footer: totals per status (old footerCallback)
    const breakdown = useMemo(() => {
        if (view !== "invalid") return [];
        const by = {};
        filtered.forEach((r) => {
            const k = SCAN_STATUS[r.scan_status]?.label || "Other";
            by[k] = (by[k] || 0) + Number(r.total || 0);
        });
        return Object.entries(by).filter(([, v]) => v > 0);
    }, [filtered, view]);
    const grandTotal = filtered.reduce((n, r) => n + Number(r.total || 0), 0);

    const openInvoice = (r) =>
        navigate(`${PURCHASE_PATH}/${encodeURIComponent(r.invoice_no)}`, { state: { from: location.pathname } });

    const invoiceCell = (r) => (
        <span className="pu-inv">
            <span className="mono">{r.invoice_no}</span>
            {r.ticket_no && <Badge tone="orange" title={`Ticket ${r.ticket_no} waiting for approval`}>Ticket</Badge>}
        </span>
    );

    const columns =
        view === "invalid"
            ? [
                { key: "vendor_name", label: "Vendor Name", render: (r) => <span className="strong">{r.vendor_name || "\u2014"}</span> },
                { key: "invoice_no", label: "AP Invoice No", render: invoiceCell },
                { key: "document_no", label: "Document No" },
                { key: "transaction_date", label: "Transaction Date", render: (r) => fmtDay(r.transaction_date) },
                { key: "declared_month", label: "Declared Month" },
                { key: "total", label: "Total", align: "right", value: (r) => Number(r.total), render: (r) => <span className="mono">{fmt4(r.total)}</span> },
                { key: "reason", label: "Reason", render: (r) => (r.reason ? <span className="pu-reason" title={r.reason}>{r.reason}</span> : "") },
                {
                    key: "scan_status",
                    label: "Status",
                    value: (r) => SCAN_STATUS[r.scan_status]?.label || "",
                    render: (r) => {
                        const s = SCAN_STATUS[r.scan_status];
                        return s ? <Badge tone={s.tone}>{s.label}</Badge> : "";
                    },
                },
            ]
            : [
                { key: "vendor_name", label: "Vendor", render: (r) => <span className="strong">{r.vendor_name || "\u2014"}</span> },
                { key: "document_no", label: "Document #" },
                { key: "invoice_no", label: "Generated #", render: invoiceCell },
                { key: "transaction_date", label: "Transaction Date", render: (r) => fmtDay(r.transaction_date) },
                { key: "declared_month", label: "Declared Month" },
                { key: "total", label: "Total", align: "right", value: (r) => Number(r.total), render: (r) => <span className="mono">{fmt4(r.total)}</span> },
                { key: "status", label: "Status", render: (r) => (r.status ? <Badge tone={statusTone(r.status)}>{r.status}</Badge> : "\u2014") },
                { key: "audit_status", label: "Audit Status", render: (r) => (r.audit_status ? <Badge tone={auditTone(r.audit_status)}>{r.audit_status}</Badge> : "\u2014") },
            ];

    const rowActions = (r) => [
        { label: "Journal", onClick: () => setJournalFor(r.invoice_no) },
        { label: "Vendor Invoice", onClick: () => openInvoice(r) },
    ];

    const actions = [
        ...(view === "main" && selected.length > 0
            ? [{ label: `Update Declared Month (${selected.length})`, icon: "calendar", onClick: () => setShowOverride(true) }]
            : []),
        { label: loading ? "Loading\u2026" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
        ...(view === "main"
            ? [{ label: "Add New", icon: "plus", variant: "primary", onClick: () => navigate(`${PURCHASE_PATH}/new`, { state: { from: location.pathname } }) }]
            : []),
    ];

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder="Search vendor, invoice or document no..."
                navTabs={PURCHASE_TABS}
                actions={actions}
                actionsLead={
                    view === "main" && selected.length > 0 && (
                        <div className="sel-chip">
                            <span>{selected.length} selected</span>
                            <button type="button" className="btn btn-sm" onClick={() => setClearTicks((n) => n + 1)}>Clear</button>
                        </div>
                    )
                }
                sticky
            />

            {error && (
                <div className="alert-error" role="alert">
                    {error} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}

            <DataTable
                bodyHeight={TABLE_HEIGHT}
                columns={columns}
                rows={loading ? [] : filtered}
                rowKey="id"
                exportName={`${VIEWS[view].title}-${fromMonth}-to-${toMonth}`}
                showToolbar={false}
                emptyText={loading ? "Loading\u2026" : VIEWS[view].empty}
                selectable={view === "main"}
                onSelectionChange={setSelected}
                resetSelection={clearTicks}
                onRowClick={openInvoice}
                rowActions={rowActions}
            />

            {!loading && filtered.length > 0 && (
                <div className="card pu-totals" aria-label="Totals">
                    {breakdown.map(([label, v]) => (
                        <span key={label}><b>{label}:</b> {fmt2(v)}</span>
                    ))}
                    <span className="pu-grand"><b>{view === "invalid" ? "Grand Total" : "Total"}:</b> {fmt2(grandTotal)}</span>
                    <span className="muted">{filtered.length} record{filtered.length === 1 ? "" : "s"}</span>
                </div>
            )}

            {showOverride && (
                <OverrideModal
                    ids={selected}
                    onClose={() => setShowOverride(false)}
                    onDone={(res) => {
                        notify(`${res.updated} invoice(s) updated (${res.ticket_no})`);
                        setShowOverride(false);
                        setClearTicks((n) => n + 1);
                        load();
                    }}
                />
            )}

            {journalFor && <JournalModal invoiceNo={journalFor} onClose={() => setJournalFor(null)} />}
        </>
    );
}

/* =========================================================
   Pages
   ========================================================= */
export default function Purchases() {
    return <PurchaseList view="main" />;
}
export function PurchaseForPayment() {
    return <PurchaseList view="payment" />;
}
export function PurchaseInvalid() {
    return <PurchaseList view="invalid" />;
}

/* =========================================================
   Update Declared Month (supervisor override, old modal_Supervisor_Override)
   ========================================================= */
function OverrideModal({ ids, onClose, onDone }) {
    const [f, setF] = useState({ declared_month: "", remarks: "", username: "", password: "" });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    const submit = async () => {
        if (!f.declared_month) return setError("Declared Month is required.");
        if (!f.username.trim()) return setError("Username is required.");
        if (!f.password) return setError("Password is required.");
        setSaving(true);
        setError("");
        try {
            onDone(await apiFetch("/purchases/override", { method: "POST", body: JSON.stringify({ ...f, ids }) }));
        } catch (e) {
            setError(e.message || "Couldn't update the declared month.");
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Supervisor override"
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    <button className="btn btn-primary" onClick={submit} disabled={saving}>
                        {saving ? "Updating\u2026" : `Update ${ids.length} invoice(s)`}
                    </button>
                </>
            }
        >
            {error && <div className="alert-error" role="alert">{error}</div>}
            <Field label="Declared Month">
                <input type="month" className="input" value={f.declared_month} onChange={(e) => set("declared_month", e.target.value)} autoFocus />
            </Field>
            <Field label="Remarks / Reason">
                <textarea className="input" rows={3} maxLength={1000} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </Field>
            <Field label="Supervisor username">
                <input className="input" autoComplete="off" value={f.username} onChange={(e) => set("username", e.target.value)} />
            </Field>
            <Field label="Password">
                <input type="password" className="input" autoComplete="new-password" value={f.password}
                    onChange={(e) => set("password", e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </Field>
        </Modal>
    );
}

/* =========================================================
   Journal popup
   ========================================================= */
function JournalModal({ invoiceNo, onClose }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        apiFetch(`/purchases/invoice/${encodeURIComponent(invoiceNo)}/journal`)
            .then(setRows)
            .catch((e) => setError(e.message || "Couldn't load the journal."));
    }, [invoiceNo]);

    const totalDr = (rows || []).reduce((n, r) => n + Number(r.debit || 0), 0);
    const totalCr = (rows || []).reduce((n, r) => n + Number(r.credit || 0), 0);
    const show = (v) => (Number(v) ? fmt2(v) : "");

    return (
        <Modal title="Journal" onClose={onClose} size="lg">
            <p className="muted small" style={{ marginTop: 0 }}>{invoiceNo}</p>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="table-scroll">
                <table className="table journal-table">
                    <thead>
                        <tr>
                            <th>Account</th>
                            <th className="ta-right">Debit</th>
                            <th className="ta-right">Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!rows && !error && Array.from({ length: 4 }).map((_, i) => (
                            <tr key={i}>
                                <td><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                            </tr>
                        ))}
                        {rows && rows.length === 0 && <tr><td colSpan={3} className="empty">No journal entries.</td></tr>}
                        {rows?.map((r, i) => (
                            <tr key={i}>
                                <td>{r.account_code} - {r.account_name}</td>
                                <td className="ta-right mono">{show(r.debit)}</td>
                                <td className="ta-right mono">{show(r.credit)}</td>
                            </tr>
                        ))}
                    </tbody>
                    {rows && rows.length > 0 && (
                        <tfoot>
                            <tr>
                                <td />
                                <td className="ta-right mono strong">{fmt2(totalDr)}</td>
                                <td className="ta-right mono strong">{fmt2(totalCr)}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
            {rows && rows.length > 0 && Math.abs(totalDr - totalCr) > 0.01 && (
                <div className="alert-error" style={{ marginTop: 12 }}>Not balanced: difference of {fmt2(Math.abs(totalDr - totalCr))}</div>
            )}
        </Modal>
    );
}