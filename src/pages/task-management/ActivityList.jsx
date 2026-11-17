// Staff → Task Management → Activity List
//   the activities an employee picks in a JO (Prepare JO). Add · edit · active / inactive · delete
//   an activity already used in a JO is set to inactive instead of deleted
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import "./TaskManagement.css";

const TABLE_HEIGHT = "calc(100vh - 340px)";
const SHOW = [["active", "Active"], ["inactive", "Inactive"], ["", "All"]];

export default function ActivityList() {
    const { user } = useAuth();
    const notify = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [show, setShow] = useState("active");
    const [edit, setEdit] = useState(null);           // null · {} new · row
    const [del, setDel] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRows((await apiFetch("/jo-activities")).rows || []);
        } catch (e) {
            setError(e.message || "Couldn't load the activities.");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load, user?.id]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows
            .filter((r) => (show === "active" ? r.is_active : show === "inactive" ? !r.is_active : true))
            .filter((r) => !q || [r.name, r.description].join(" ").toLowerCase().includes(q));
    }, [rows, show, query]);
    const count = (k) => rows.filter((r) => (k === "active" ? r.is_active : k === "inactive" ? !r.is_active : true)).length;

    const remove = async () => {
        try {
            const r = await apiFetch(`/jo-activities/${del.id}`, { method: "DELETE" });
            notify(r.message || "Deleted.");
            load();
        } catch (e) {
            notify(e.message || "Couldn't delete.", "error");
        } finally {
            setDel(null);
        }
    };

    const columns = [
        { key: "sort", label: "#", render: (r) => <span className="muted">{r.sort || ""}</span> },
        { key: "name", label: "Activity", render: (r) => <span className="strong">{r.name}</span> },
        { key: "description", label: "Description", render: (r) => <span className="muted small">{r.description || ""}</span> },
        { key: "used", label: "Used in JOs", render: (r) => (r.used ? r.used : <span className="muted">—</span>) },
        { key: "is_active", label: "Status", render: (r) => <Badge tone={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Inactive"}</Badge> },
    ];

    return (
        <>
            <SearchCard query={query} setQuery={setQuery} placeholder="Search activity..."
                actions={[
                    { label: "New activity", icon: "plus", onClick: () => setEdit({}) },
                    { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
                ]} sticky />

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            <div role="tablist" aria-label="Show" className="tm-status">
                {SHOW.map(([k, l]) => (
                    <button key={k || "all"} type="button" role="tab" aria-selected={show === k}
                        className={`btn btn-sm${show === k ? " btn-primary" : ""}`} onClick={() => setShow(k)}>
                        {l} <span style={{ opacity: 0.75, marginLeft: 4 }}>{count(k)}</span>
                    </button>
                ))}
            </div>

            <div className="sales-table">
                <DataTable
                    bodyHeight={TABLE_HEIGHT}
                    columns={columns}
                    rows={loading ? [] : shown}
                    rowKey="id"
                    exportName="jo-activities"
                    showToolbar={false}
                    emptyText={loading ? "Loading…" : "No activities."}
                    onRowClick={(r) => setEdit(r)}
                    rowActions={(r) => [
                        { label: "Edit", onClick: () => setEdit(r) },
                        { label: r.used ? "Set inactive" : "Delete", onClick: () => setDel(r) },
                    ]}
                />
            </div>

            {edit && <ActivityModal row={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={load} />}

            {del && (
                <ConfirmDialog
                    title={del.used ? `Set "${del.name}" inactive?` : `Delete "${del.name}"?`}
                    message={del.used
                        ? `It is used in ${del.used} job order${del.used === 1 ? "" : "s"}, so it can't be deleted. It will no longer show in Prepare JO.`
                        : "It will be removed from the Activity List."}
                    confirmLabel={del.used ? "Set inactive" : "Delete"}
                    onCancel={() => setDel(null)}
                    onConfirm={remove}
                />
            )}
        </>
    );
}

function ActivityModal({ row, onClose, onSaved }) {
    const notify = useToast();
    const [name, setName] = useState(row?.name || "");
    const [description, setDescription] = useState(row?.description || "");
    const [sort, setSort] = useState(row?.sort ?? "");
    const [active, setActive] = useState(row ? row.is_active : true);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const save = async () => {
        if (!name.trim()) return setErr("Enter the activity name.");
        setBusy(true);
        setErr("");
        try {
            await apiFetch(row ? `/jo-activities/${row.id}` : "/jo-activities", {
                method: row ? "PUT" : "POST",
                body: JSON.stringify({ name: name.trim(), description: description.trim() || null, is_active: active, ...(sort !== "" ? { sort: Number(sort) } : {}) }),
            });
            notify("Saved.");
            onSaved();
            onClose();
        } catch (e) {
            setErr(e.message || "Couldn't save.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={row ? "Edit activity" : "New activity"} onClose={onClose} size="md"
            footer={<>
                <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </>}>
            {err && <div className="alert-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
            <div style={{ display: "grid", gap: 12 }}>
                <label className="field"><span className="field-label">Activity</span>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} maxLength={150} placeholder="e.g. COLLECT DOCUMENTS" autoFocus /></label>
                <label className="field"><span className="field-label">Description (optional)</span>
                    <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} /></label>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "end" }}>
                    <label className="field"><span className="field-label">Order</span>
                        <input type="number" className="input" value={sort} min={0} max={9999} onChange={(e) => setSort(e.target.value)} placeholder="Last" /></label>
                    <label className="tm-check" style={{ paddingBottom: 10 }}>
                        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (shows in Prepare JO)
                    </label>
                </div>
            </div>
        </Modal>
    );
}