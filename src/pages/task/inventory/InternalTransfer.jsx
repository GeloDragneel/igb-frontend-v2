// Task → Inventory → Internal Transfer (old Inventory_And_Services/Internal_Transfer.php)
// List: Transfer Date · Transfer No · Document No · Remarks. Click a row to see its items (From → To, Qty).
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Modal from "../../../components/Modal";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { INVENTORY_TABS } from "./inventoryMeta";

const TABLE_HEIGHT = "calc(100vh - 375px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso) => {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InternalTransfer() {
    const { user } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRows(await apiFetch("/inventory/transfers"));
        } catch (e) {
            setError(e.message || "Couldn't load transfers.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load, user?.id, user?.caid]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => [r.transfer_no, r.document_no, r.remarks, r.date].join(" ").toLowerCase().includes(q));
    }, [rows, query]);

    const columns = [
        { key: "date", label: "Transfer Date", render: (r) => fmtDay(r.date) },
        { key: "transfer_no", label: "Transfer No", render: (r) => <span className="mono strong">{r.transfer_no}</span> },
        { key: "document_no", label: "Document No", render: (r) => r.document_no || "—" },
        { key: "remarks", label: "Remarks", render: (r) => r.remarks || "—" },
        { key: "lines_count", label: "Items", align: "right", value: (r) => Number(r.lines_count) },
        { key: "total_qty", label: "Total Qty", align: "right", value: (r) => Number(r.total_qty), render: (r) => <span className="mono">{n2(r.total_qty)}</span> },
    ];

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder="Search transfer no, document no or remarks..."
                navTabs={INVENTORY_TABS}
                actions={[{ label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading }]}
                sticky
            />

            {error && (
                <div className="alert-error" role="alert">
                    {error} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}

            <div className="sales-table">
                <DataTable
                    bodyHeight={TABLE_HEIGHT}
                    columns={columns}
                    rows={loading ? [] : filtered}
                    rowKey="id"
                    exportName="internal-transfers"
                    showToolbar={false}
                    emptyText={loading ? "Loading…" : "No internal transfers yet."}
                    onRowClick={setOpen}
                    rowActions={(r) => [{ label: "View items", onClick: () => setOpen(r) }]}
                />
            </div>

            {open && <TransferModal transfer={open} onClose={() => setOpen(null)} />}
        </>
    );
}

/* ---------- items of one transfer (old row details: Item ID · Description · From · To · Qty) ---------- */
function TransferModal({ transfer, onClose }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        apiFetch(`/inventory/transfers/${encodeURIComponent(transfer.transfer_no)}`)
            .then(setRows)
            .catch((e) => setError(e.message || "Couldn't load the items."));
    }, [transfer.transfer_no]);

    const total = (rows || []).reduce((n, r) => n + Number(r.qty || 0), 0);

    return (
        <Modal title={`Transfer ${transfer.transfer_no}`} onClose={onClose} size="lg">
            <p className="muted small" style={{ marginTop: 0 }}>
                {fmtDay(transfer.date)}{transfer.document_no ? ` · Doc # ${transfer.document_no}` : ""}{transfer.remarks ? ` · ${transfer.remarks}` : ""}
            </p>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="table-scroll">
                <table className="table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item ID</th>
                            <th>Description</th>
                            <th>From</th>
                            <th>To</th>
                            <th className="ta-right">Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!rows && !error && <tr><td colSpan={6}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
                        {rows?.length === 0 && <tr><td colSpan={6} className="empty">No items.</td></tr>}
                        {rows?.map((r, i) => (
                            <tr key={r.id}>
                                <td className="muted">{i + 1}</td>
                                <td className="mono">{r.item_code || "—"}</td>
                                <td>{r.description || "—"}</td>
                                <td>{r.from_name}</td>
                                <td>{r.to_name}</td>
                                <td className="ta-right mono">{n2(r.qty)}</td>
                            </tr>
                        ))}
                    </tbody>
                    {rows?.length > 0 && (
                        <tfoot>
                            <tr><td colSpan={5} className="strong">Total</td><td className="ta-right mono strong">{n2(total)}</td></tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </Modal>
    );
}