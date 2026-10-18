import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Modal, { Field } from "../../../components/Modal";
import Icon from "../../../components/Icons";
import { useToast } from "../../../components/Toast";
import { SALES_TABS } from "../../../components/routesMeta";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { usePeriod } from "../../../context/PeriodContext";
import { statusTone, auditTone } from "../Sales";
import { TicketViewModal } from "./SalesDetail";

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

export default function ForCollection() {
    const { user } = useAuth();
    const { from, to } = usePeriod();
    const navigate = useNavigate();
    const notify = useToast();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState([]);
    const [clearTicks, setClearTicks] = useState(0);
    const [journalFor, setJournalFor] = useState(null);
    const [ticketFor, setTicketFor] = useState(null);
    const fromMonth = from.slice(0, 7);
    const toMonth = to.slice(0, 7);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRows(await apiFetch(`/sales?from=${fromMonth}&to=${toMonth}&trans_type=billing`));
        } catch (e) {
            setError(e.message || "Couldn't load sales.");
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

    const openInvoice = (r) => navigate(`/task/sales/${encodeURIComponent(r.invoice_no)}`);

    // ⋮ menu for each row
    const rowActions = (r) => [
        { label: "Journal", onClick: () => setJournalFor(r.invoice_no) },
        { label: "2307", onClick: () => alert(`2307 for ${r.invoice_no}`) },
        { label: "Logs", onClick: () => alert(`Logs for ${r.invoice_no}`) },
        { label: "Sales Invoice", onClick: () => openInvoice(r) },
        { label: "Voucher", onClick: () => alert(`Voucher for ${r.invoice_no}`) },
    ];

    // "Update Declared Month" only when something is ticked (no Add Sale here)
    const actions = [
        { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
    ];

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder="Search customer, invoice or document no..."
                navTabs={SALES_TABS}
                actions={actions}
                actionsLead={
                    selected.length > 0 && (
                        <div className="sel-chip">
                            <span>{selected.length} selected</span>
                            <button type="button" className="btn btn-sm" onClick={() => setClearTicks((n) => n + 1)}>
                                Clear
                            </button>
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

            {loading ? (
                <TableSkeleton columns={columns} bodyHeight={TABLE_HEIGHT} />
            ) : (
                <div className="sales-table">
                    <DataTable
                        bodyHeight={TABLE_HEIGHT}
                        columns={columns}
                        rows={filtered}
                        rowKey="id"
                        exportName={`for-collection-${fromMonth}-to-${toMonth}`}
                        showToolbar={false}
                        emptyText="No records for this period."
                        selectable
                        onSelectionChange={setSelected}
                        resetSelection={clearTicks}
                        onRowClick={openInvoice}
                    />
                </div>
            )}
            {journalFor && <JournalModal invoiceNo={journalFor} onClose={() => setJournalFor(null)} />}
            {ticketFor && <TicketViewModal ticketNo={ticketFor} onClose={() => setTicketFor(null)} />}
        </>
    );
}

/* ---------- Loading placeholder for the table ---------- */
function TableSkeleton({ columns, bodyHeight, rows = 10 }) {
    const widths = ["70%", "85%", "60%", "55%", "65%", "70%", "45%", "60%"];

    return (
        <section className="card table-card" aria-busy="true" aria-label="Loading">
            <div className="table-scroll scroll-body" style={{ maxHeight: bodyHeight }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th className="col-check"><span className="sk sk-check" /></th>
                            {columns.map((c) => (
                                <th key={c.key} className={c.align ? `ta-${c.align}` : ""}>{c.label}</th>
                            ))}
                            <th className="ta-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rows }).map((_, r) => (
                            <tr key={r}>
                                <td className="col-check"><span className="sk sk-check" /></td>
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
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        apiFetch(`/sales/invoice/${encodeURIComponent(invoiceNo)}/journal`)
            .then(setRows)
            .catch((e) => setError(e.message || "Couldn't load the journal."));
    }, [invoiceNo]);

    const totalDr = (rows || []).reduce((n, r) => n + Number(r.debit || 0), 0);
    const totalCr = (rows || []).reduce((n, r) => n + Number(r.credit || 0), 0);

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
                        {!rows && !error &&
                            Array.from({ length: 4 }).map((_, i) => (
                                <tr key={i}>
                                    <td><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                </tr>
                            ))}
                        {rows && rows.length === 0 && (
                            <tr><td colSpan={3} className="empty">No journal entries.</td></tr>
                        )}
                        {rows?.map((r, i) => (
                            <tr key={i}>
                                <td>{r.account_code} - {r.account_name}</td>
                                <td className="ta-right mono">{fmt2(r.debit)}</td>
                                <td className="ta-right mono">{fmt2(r.credit)}</td>
                            </tr>
                        ))}
                    </tbody>
                    {rows && rows.length > 0 && (
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
            {rows && rows.length > 0 && Math.abs(totalDr - totalCr) > 0.01 && (
                <div className="alert-error" style={{ marginTop: 12 }}>
                    Not balanced: difference of {fmt2(Math.abs(totalDr - totalCr))}
                </div>
            )}
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