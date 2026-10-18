// Task → Inventory → Variance (old Inventory_And_Services/Variance.php)
// List of inventory adjustments: Account · Item · Transaction Date · Declared Month · Qty · Reason
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Modal, { Field } from "../../../components/Modal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import SearchSelect from "../../../components/SearchSelect";
import { useToast } from "../../../components/Toast";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { INVENTORY_TABS } from "./inventoryMeta";

const API = "/inventory/stocks";
const TABLE_HEIGHT = "calc(100vh - 375px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const today = () => new Date().toISOString().slice(0, 10);
const fmtDay = (iso) => {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const fmtMonth = (ym) => {
    if (!ym || !/^\d{4}-\d{2}/.test(ym)) return ym || "—";
    const [y, m] = ym.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
};
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventoryVariance() {
    const { user } = useAuth();
    const notify = useToast();

    const [rows, setRows] = useState([]);
    const [lk, setLk] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [edit, setEdit] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRows(await apiFetch(`${API}/adjustments`));
        } catch (e) {
            setError(e.message || "Couldn't load adjustments.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load, user?.id, user?.caid]);
    useEffect(() => {
        apiFetch(`${API}/lookups`).then(setLk).catch(() => setLk({ items: [], reasons: [] }));
    }, [user?.id, user?.caid]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [r.account_code, r.account_name, r.item, r.item_code, r.transaction_date, r.declared_month, r.reason].join(" ").toLowerCase().includes(q)
        );
    }, [rows, query]);

    const columns = [
        { key: "account", label: "Account", value: (r) => `${r.account_code} - ${r.account_name}`, render: (r) => (r.account_code ? `${r.account_code} - ${r.account_name}` : "—") },
        { key: "item", label: "Item", render: (r) => <span className="strong">{r.item || "—"}</span> },
        { key: "transaction_date", label: "Transaction Date", render: (r) => fmtDay(r.transaction_date) },
        { key: "declared_month", label: "Declared Month", render: (r) => fmtMonth(r.declared_month) },
        { key: "qty", label: "Qty", align: "right", value: (r) => Number(r.qty), render: (r) => <span className="mono">{n2(r.qty)}</span> },
        { key: "reason", label: "Reason", render: (r) => r.reason || "—" },
    ];

    const openRow = (r) => setEdit({
        id: r.id, transaction_date: r.transaction_date, declared_month: (r.declared_month || "").slice(0, 7),
        item_id: String(r.item_id), qty: r.qty, reason_id: String(r.reason_id || ""),
    });
    const openNew = () => setEdit({ id: null, transaction_date: today(), declared_month: today().slice(0, 7), item_id: "", qty: "", reason_id: "" });

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder="Search account, item, date or reason..."
                navTabs={INVENTORY_TABS}
                actions={[
                    { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
                    { label: "Add New", icon: "plus", variant: "primary", onClick: openNew, disabled: !lk },
                ]}
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
                    exportName="inventory-variance"
                    showToolbar={false}
                    emptyText={loading ? "Loading…" : "No inventory adjustments yet."}
                    onRowClick={openRow}
                    rowActions={(r) => [{ label: "Edit", onClick: () => openRow(r) }]}
                />
            </div>

            {edit && lk && (
                <AdjustmentModal
                    initial={edit}
                    lookups={lk}
                    onClose={() => setEdit(null)}
                    onSaved={(msg) => { setEdit(null); notify(msg); load(); }}
                />
            )}
        </>
    );
}

/* ---------- Inventory Adjustment (old modal_Inventory_Adjustment) ---------- */
function AdjustmentModal({ initial, lookups, onClose, onSaved }) {
    const [f, setF] = useState(initial);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    const itemOpts = [{ value: "", label: "— None —" }, ...lookups.items.map((i) => ({ value: String(i.id), label: i.description || i.item_code, hint: i.item_code }))];
    const reasonOpts = [{ value: "", label: "— None —" }, ...lookups.reasons.map((r) => ({ value: String(r.id), label: r.name }))];
    const item = lookups.items.find((i) => String(i.id) === String(f.item_id));

    const submit = async () => {
        if (!f.declared_month) return setError("Declared Month is required.");
        if (!f.item_id) return setError("Item is required.");
        if (!item?.inventory_account || item.inventory_account === "0") return setError("The selected item has no inventory account (GL Inventory Account).");
        if (f.qty === "" || Number(f.qty) === 0) return setError("Qty is required.");
        if (!f.reason_id) return setError("Reason is required.");
        setSaving(true);
        setError("");
        try {
            const res = await apiFetch(f.id ? `${API}/adjustments/${f.id}` : `${API}/adjustments`, {
                method: f.id ? "PUT" : "POST",
                body: JSON.stringify({ ...f, item_id: Number(f.item_id), qty: Number(f.qty), reason_id: Number(f.reason_id) }),
            });
            onSaved(res.message || "Record successfully saved");
        } catch (e) {
            setError(e.message || "Couldn't save.");
            setSaving(false);
        }
    };

    const remove = async () => {
        try {
            const res = await apiFetch(`${API}/adjustments/${f.id}`, { method: "DELETE" });
            onSaved(res.message || "Adjustment deleted");
        } catch (e) {
            setError(e.message || "Couldn't delete.");
            setConfirmDelete(false);
        }
    };

    return (
        <Modal
            title={f.id ? "Edit Inventory Adjustment" : "Inventory Adjustment"}
            onClose={onClose}
            size="sm"
            footer={
                <>
                    {f.id && <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setConfirmDelete(true)} disabled={saving}>Delete</button>}
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Submit"}</button>
                </>
            }
        >
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Field label="Date"><input type="date" className="input" value={f.transaction_date} onChange={(e) => set("transaction_date", e.target.value)} /></Field>
                <Field label="Declared Month"><input type="month" className="input" value={f.declared_month} onChange={(e) => set("declared_month", e.target.value)} /></Field>
                <div className="field">
                    <span className="field-label">Item</span>
                    <SearchSelect value={String(f.item_id || "")} onChange={(v) => set("item_id", v)} options={itemOpts} searchPlaceholder="Search item..." aria-label="Item" />
                </div>
                <Field label="Qty (use minus to remove)">
                    <input className="input ta-right" inputMode="decimal" value={f.qty} onChange={(e) => set("qty", e.target.value.replace(/[^\d.-]/g, ""))} placeholder="e.g. 5 or -2" />
                </Field>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
                <span className="field-label">Remarks</span>
                <SearchSelect value={String(f.reason_id || "")} onChange={(v) => set("reason_id", v)} options={reasonOpts} searchPlaceholder="Search reason..." aria-label="Reason" />
            </div>
            {confirmDelete && (
                <ConfirmDialog
                    title="Delete this adjustment?"
                    message={`${n2(f.qty)} on ${f.transaction_date} will be removed from stock.`}
                    confirmLabel="Delete"
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={remove}
                />
            )}
        </Modal>
    );
}