// Task → Inventory → Adjustment list (old Inventory_And_Services/Adjustment.php; same look as Sales.jsx)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Modal, { Field } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { INVENTORY_TABS } from "./inventoryMeta";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { usePeriod } from "../../../context/PeriodContext";

import Icon from "../../../components/Icons";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TABLE_HEIGHT = "calc(100vh - 375px)";

// "2026-09-19" -> "Sep 19 2026"
const fmtDay = (iso) => {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};

// 2,142.8571
const fmt4 = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

// 153,025.00 (blank when 0)
const fmt2 = (n) =>
    Number(n) ? Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

const statusTone = (s) => {
    const v = String(s).toUpperCase();
    if (v.includes("UNPAID")) return "red";
    if (v.includes("PARTIAL")) return "orange";
    if (v.includes("PAID")) return "green";
    if (v.includes("VOID") || v.includes("CANCEL")) return "gray";
    return "blue";
};

const auditTone = (s) => {
    const v = String(s).toUpperCase();
    if (v.includes("PENDING")) return "orange";
    if (v.includes("APPROVED") || v.includes("DONE") || v.includes("AUDITED")) return "green";
    if (v.includes("REJECT") || v.includes("RETURN")) return "red";
    return "blue";
};

export default function Adjustment() {
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
    const [showMonth, setShowMonth] = useState(false);
    const [journalFor, setJournalFor] = useState(null);
    const [ticketFor, setTicketFor] = useState(null);
    const fromMonth = from.slice(0, 7);
    const toMonth = to.slice(0, 7);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRows(await apiFetch(`/inventory/adjustment?from=${fromMonth}&to=${toMonth}`));
        } catch (e) {
            setError(e.message || "Couldn't load adjustments.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [fromMonth, toMonth]);

    // reload when the period or the account (branch switch) changes
    useEffect(() => { load(); }, [load, user?.id, user?.caid]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [r.customer_name, r.invoice_no, r.document_no, r.status, r.audit_status].join(" ").toLowerCase().includes(q)
        );
    }, [rows, query]);

    const columns = [
        { key: "customer_name", label: "Customer Name", render: (r) => <Trunc text={r.customer_name} className="strong" max={240} /> },
        {
            key: "invoice_no",
            label: "Invoice No",
            render: (r) => (
                <div className="inv-no-cell">
                    <span className="mono">{r.invoice_no}</span>
                    {r.ticket_no && (
                        <button
                            type="button"
                            className="ticket-icon"
                            onClick={() => setTicketFor(r.ticket_no)}
                            data-tip={`Ticket pending: ${r.ticket_no}`}
                            aria-label={`View pending ticket ${r.ticket_no}`}
                        >
                            <Icon name="fileText" size={14} />
                        </button>
                    )}
                </div>
            ),
        },
        { key: "document_no", label: "Document No", render: (r) => <Trunc text={r.document_no} max={160} /> },
        { key: "transaction_date", label: "Transaction Date", render: (r) => fmtDay(r.transaction_date) },
        { key: "declared_month", label: "Declared Month" },
        { key: "total", label: "Total", align: "right", value: (r) => Number(r.total), render: (r) => <span className="mono">{fmt4(r.total)}</span> },
        { key: "status", label: "Status", render: (r) => (r.status ? <Badge tone={statusTone(r.status)}>{r.status}</Badge> : "—") },
        { key: "audit_status", label: "Audit Status", render: (r) => (r.audit_status ? <Badge tone={auditTone(r.audit_status)}>{r.audit_status}</Badge> : "—") },
    ];

    const openInvoice = (r) =>
        navigate(`/task/inventory/adjustment/${encodeURIComponent(r.invoice_no)}`, { state: { from: location.pathname } });

    // ⋮ menu for each row
    const rowActions = (r) => [
        { label: "Journal", onClick: () => setJournalFor(r.invoice_no) },
        { label: "Adjustment", onClick: () => openInvoice(r) },
    ];

    // "Update Declared Month" only when something is ticked
    const actions = [
        { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
        { label: "Add New", icon: "plus", variant: "primary", onClick: () => navigate("/task/inventory/adjustment/new", { state: { from: location.pathname } }) },
    ];

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder="Search customer, invoice or document no..."
                navTabs={INVENTORY_TABS}
                actions={actions}
                sticky
            />

            {error && (
                <div className="alert-error" role="alert">
                    {error} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}

            {loading ? (
                <SalesTableSkeleton columns={columns} bodyHeight={TABLE_HEIGHT} />
            ) : (
                <div className="sales-table">
                    <DataTable
                        bodyHeight={TABLE_HEIGHT}
                        columns={columns}
                        rows={filtered}
                        rowKey="id"
                        exportName={`inventory-adjustment-${fromMonth}-to-${toMonth}`}
                        showToolbar={false}
                        emptyText="No adjustments for this period."
                        onRowClick={openInvoice}
                        rowActions={rowActions}
                    />
                </div>
            )}

            {journalFor && <JournalModal invoiceNo={journalFor} onClose={() => setJournalFor(null)} />}
        </>
    );
}

/* ---------- Loading placeholder for the table ---------- */
function SalesTableSkeleton({ columns, bodyHeight, rows = 10 }) {
    // bar widths per column so it looks like real data
    const widths = ["70%", "85%", "60%", "55%", "65%", "70%", "45%", "60%"];

    return (
        <section className="card table-card" aria-busy="true" aria-label="Loading adjustments">
            <div className="table-scroll scroll-body" style={{ maxHeight: bodyHeight }}>
                <table className="table">
                    <thead>
                        <tr>
                            {columns.map((c) => (
                                <th key={c.key} className={c.align ? `ta-${c.align}` : ""}>{c.label}</th>
                            ))}
                            <th className="ta-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rows }).map((_, r) => (
                            <tr key={r}>
                                {columns.map((c, i) => (
                                    <td key={c.key} className={c.align ? `ta-${c.align}` : ""}>
                                        <span
                                            className={`sk sk-cell ${c.key === "status" || c.key === "audit_status" ? "sk-pill" : ""}`}
                                            style={{ width: widths[i % widths.length] }}
                                        />
                                    </td>
                                ))}
                                <td className="ta-center"><span className="sk sk-dots" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="table-foot">
                <span className="sk sk-foot" />
                <span className="sk sk-foot sk-foot-sm" />
            </div>
        </section>
    );
}

/* ---------- Journal popup ---------- */
function JournalModal({ invoiceNo, onClose }) {
    const [data, setData] = useState(null); // { journal: [], collection: [] }
    const [error, setError] = useState("");

    useEffect(() => {
        apiFetch(`/inventory/adjustment/invoice/${encodeURIComponent(invoiceNo)}/journal`)
            .then((res) => setData(Array.isArray(res) ? { journal: res, collection: [] } : res))
            .catch((e) => setError(e.message || "Couldn't load the journal."));
    }, [invoiceNo]);

    const journal = data?.journal || [];
    const collection = data?.collection || [];

    // totals = invoice journal only (collection is shown, not added)
    const totalDr = journal.reduce((n, r) => n + Number(r.debit || 0), 0);
    const totalCr = journal.reduce((n, r) => n + Number(r.credit || 0), 0);

    const Row = ({ r }) => (
        <tr>
            <td>{r.account_code} - {r.account_name}</td>
            <td className="ta-right mono">{fmt2(r.debit)}</td>
            <td className="ta-right mono">{fmt2(r.credit)}</td>
        </tr>
    );

    return (
        <Modal title="Journal" onClose={onClose} size="lg">
            <p className="muted small" style={{ marginTop: 0 }}>{invoiceNo}</p>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="table-scroll">
                <table className="table journal-table">
                    <thead>
                        <tr>
                            <th>Account No</th>
                            <th className="ta-right">Debit</th>
                            <th className="ta-right">Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!data && !error &&
                            Array.from({ length: 4 }).map((_, i) => (
                                <tr key={i}>
                                    <td><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                </tr>
                            ))}
                        {data && journal.length === 0 && (
                            <tr><td colSpan={3} className="empty">No journal entries.</td></tr>
                        )}

                        {journal.map((r, i) => <Row key={`j${i}`} r={r} />)}

                        {collection.length > 0 && (
                            <>
                                <tr className="journal-section">
                                    <td colSpan={3}>COLLECTION</td>
                                </tr>
                                {collection.map((r, i) => <Row key={`c${i}`} r={r} />)}
                            </>
                        )}
                    </tbody>
                    {journal.length > 0 && (
                        <tfoot>
                            <tr>
                                <td />
                                <td className="ta-right mono strong">{fmt2(totalDr) || "0.00"}</td>
                                <td className="ta-right mono strong">{fmt2(totalCr) || "0.00"}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
            {journal.length > 0 && Math.abs(totalDr - totalCr) > 0.01 && (
                <div className="alert-error" style={{ marginTop: 12 }}>
                    Not balanced: difference of {fmt2(Math.abs(totalDr - totalCr))}
                </div>
            )}
        </Modal>
    );
}

/* ---------- Update Declared Month popup ---------- */
function DeclaredMonthModal({ count, onClose, onSave }) {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [saving, setSaving] = useState(false);

    return (
        <Modal
            title="Update Declared Month"
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    <button
                        className="btn btn-primary"
                        disabled={saving || !month}
                        onClick={async () => { setSaving(true); await onSave(month); setSaving(false); }}
                    >
                        {saving ? "Saving…" : `Update ${count} invoice(s)`}
                    </button>
                </>
            }
        >
            <Field label="New declared month">
                <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
        </Modal>
    );
}
/* ---------- Text cut with "…"; tooltip only when it's actually cut ---------- */
function Trunc({ text, className = "", max }) {
    const ref = useRef(null);
    const [cut, setCut] = useState(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const check = () => setCut(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [text]);

    return (
        <span
            ref={ref}
            className={`cell-trunc ${className}`}
            style={max ? { maxWidth: max } : undefined}
            title={cut ? text : undefined}
        >
            {text || "—"}
        </span>
    );
}
/* ---------- Supervisor override (Update Declared Month) ---------- */
function OverrideModal({ count, onClose, onSubmit }) {
    const [f, setF] = useState({ declared_month: "", remarks: "", username: "", password: "" });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    const submit = async () => {
        if (!f.declared_month) return setError("Declared Month is required");
        if (!f.username.trim()) return setError("Username is required");
        if (!f.password) return setError("Password is required");
        setError("");
        setSaving(true);
        try {
            await onSubmit({ ...f, username: f.username.trim() });
        } catch (e) {
            setError(e.message || "Couldn't update the invoices.");
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
                        {saving ? "Submitting…" : `Submit (${count})`}
                    </button>
                </>
            }
        >
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <Field label="Declared Month">
                    <input type="month" className="input" value={f.declared_month} onChange={(e) => set("declared_month", e.target.value)} />
                </Field>
                <Field label="Remarks / Reason">
                    <textarea className="input" rows={3} maxLength={1000} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
                <Field label="Username">
                    <input className="input" autoComplete="off" value={f.username} onChange={(e) => set("username", e.target.value)} />
                </Field>
                <Field label="Password">
                    <input
                        type="password"
                        className="input"
                        autoComplete="new-password"
                        value={f.password}
                        onChange={(e) => set("password", e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                    />
                </Field>
            </div>
        </Modal>
    );
}